import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/server/defaults.js';
import { createServer, listen } from '../src/server/http.js';
import { Store } from '../src/server/store.js';
import type { Config, StateSnapshot } from '../src/shared/types.js';

let server: http.Server;
let base: string;
let store: Store;
let saved: Config | undefined;

beforeEach(async () => {
  saved = undefined;
  store = new Store(defaultConfig());
  server = createServer(store, { saveConfig: async (c) => { saved = c; } });
  const addr = await listen(server, '127.0.0.1', 0);
  base = `http://127.0.0.1:${addr.port}`;
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('HTTP API', () => {
  it('GET /api/state returns agents, departments, events, cleaner', async () => {
    const res = await fetch(`${base}/api/state`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as StateSnapshot;
    expect(body.agents).toHaveLength(18);
    expect(body.departments.length).toBeGreaterThan(0);
    expect(body.cleaner.mode).toBe('dry-run');
  });

  it('POST /api/hook ingests a hook payload, agent chosen via ?agent=', async () => {
    const res = await post('/api/hook?agent=fajar', {
      session_id: 's9', hook_event_name: 'Notification', cwd: '/w/infra-ci', message: 'Claude needs your permission to use Bash',
    });
    expect(res.status).toBe(200);
    const state = (await (await fetch(`${base}/api/state`)).json()) as StateSnapshot;
    const fajar = state.agents.find((a) => a.id === 'fajar')!;
    expect(fajar.runtime.status).toBe('macet');
    expect(state.events[0]).toMatchObject({ agentId: 'fajar', kind: 'notify' });
  });

  it('x-v-off-env header forwards V_OFF_* only', async () => {
    await post('/api/hook', { session_id: 's10', hook_event_name: 'Stop' }, { 'x-v-off-env': 'V_OFF_AGENT=mega; HOME=/root' });
    const state = (await (await fetch(`${base}/api/state`)).json()) as StateSnapshot;
    expect(state.agents.find((a) => a.id === 'mega')!.runtime.status).toBe('simak');
  });

  it('resolve and idle actions', async () => {
    await post('/api/status', { agentId: 'yoga', status: 'macet', task: 'Tes gagal' });
    expect((await post('/api/agents/yoga/resolve', {})).status).toBe(200);
    expect((await post('/api/agents/yoga/idle', { idle: true })).status).toBe(200);
    expect((await post('/api/agents/yoga/idle', {})).status).toBe(400);
    expect((await post('/api/agents/nobody/resolve', {})).status).toBe(404);
    const log = (await (await fetch(`${base}/api/agents/yoga/log`)).json()) as unknown[];
    expect(log.length).toBe(2);
  });

  it('validates the generic webhook', async () => {
    expect((await post('/api/status', { agentId: 'yoga', status: 'nope' })).status).toBe(400);
    expect((await post('/api/status', { agentId: 'nobody', status: 'kerja' })).status).toBe(404);
  });

  it('GET /api/report validates period', async () => {
    expect((await fetch(`${base}/api/report?period=week`)).status).toBe(200);
    expect((await fetch(`${base}/api/report?period=year`)).status).toBe(400);
  });

  it('PUT /api/config validates, saves, and applies', async () => {
    const config = defaultConfig();
    config.agents[0]!.name = 'Hendra Baru';
    const res = await fetch(`${base}/api/config`, { method: 'PUT', body: JSON.stringify(config) });
    expect(res.status).toBe(200);
    expect(saved?.agents[0]!.name).toBe('Hendra Baru');
    expect(store.getConfig().agents[0]!.name).toBe('Hendra Baru');
    const bad = await fetch(`${base}/api/config`, { method: 'PUT', body: JSON.stringify({ agents: 'x' }) });
    expect(bad.status).toBe(400);
  });

  it('cleaner stays dry-run', async () => {
    expect((await post('/api/cleaner/clean', { paths: ['/tmp'], confirm: true })).status).toBe(501);
  });

  it('rejects foreign origins and hosts', async () => {
    expect((await post('/api/status', { agentId: 'yoga', status: 'kerja' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await fetch(`${base}/api/state`, { headers: { origin: 'http://localhost:5173' } })).status).toBe(200);
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve) => {
      const req = request(`${base}/api/state`, { headers: { host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.end();
    });
    expect(status).toBe(403);
  });

  it('rejects invalid JSON and unknown routes', async () => {
    const res = await fetch(`${base}/api/hook`, { method: 'POST', body: '{nope' });
    expect(res.status).toBe(400);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });

  it('GET /api/stream pushes agent-updated and event-added', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    await reader.read(); // retry line
    await post('/api/hook?agent=raka', { session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } });
    let text = '';
    while (!(text.includes('event: agent-updated') && text.includes('event: event-added'))) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    expect(text).toContain('"id":"raka"');
    expect(text).toContain('"detail":"npm test"');
    ctrl.abort();
  });
});

describe('config file', () => {
  it('saveConfig/loadConfig round-trip under V_OFF_HOME', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v-off-'));
    const { loadConfig, saveConfig } = await import('../src/server/config.js');
    const file = path.join(dir, 'nested', 'config.json');
    expect((await loadConfig(file)).agents).toHaveLength(18);
    const c = defaultConfig();
    c.rules.idleAfterSec = 300;
    await saveConfig(c, file);
    expect((await loadConfig(file)).rules.idleAfterSec).toBe(300);
    await fs.writeFile(file, JSON.stringify({ agents: [] }));
    const merged = await loadConfig(file);
    expect(merged.agents).toEqual([]);
    expect(merged.rules.workWindowSec).toBe(90);
    await fs.rm(dir, { recursive: true });
  });
});
