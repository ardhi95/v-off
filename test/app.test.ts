import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startApp } from '../src/server/app.js';

let dir: string;
const saved = { home: process.env.V_OFF_HOME, claude: process.env.CLAUDE_CONFIG_DIR };
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v-off-app-'));
  process.env.V_OFF_HOME = path.join(dir, 'voff');
  process.env.CLAUDE_CONFIG_DIR = path.join(dir, 'claude');
});
afterEach(async () => {
  process.env.V_OFF_HOME = saved.home;
  process.env.CLAUDE_CONFIG_DIR = saved.claude;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('startApp', () => {
  it('serves immediately and loads transcript history in the background', async () => {
    const proj = path.join(dir, 'claude', 'projects', 'p');
    await fs.mkdir(proj, { recursive: true });
    const line = JSON.stringify({ type: 'user', sessionId: 'hist-1', cwd: '/w/x', timestamp: new Date().toISOString(), message: { role: 'user', content: 'hai' } });
    await fs.writeFile(path.join(proj, 'hist-1.jsonl'), line + '\n');

    const app = await startApp({ port: 0 });
    const reloaded = new Promise<void>((r) => app.store.once('state-reloaded', () => r()));
    const res = await fetch(`${app.url}/api/state`);
    expect(res.status).toBe(200);
    await reloaded;
    const state = (await (await fetch(`${app.url}/api/state`)).json()) as { agents: { id: string }[] };
    // Classified (fallback role), not a guest.
    expect(state.agents.some((a) => a.id === 'wulan')).toBe(true);
    expect(state.agents.some((a) => a.id.startsWith('tamu-'))).toBe(false);
    const t0 = Date.now();
    await app.close();
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
