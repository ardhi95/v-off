import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/server/cli.js';
import { addHooks, HOOK_EVENTS, hookCommand, hookScript, removeHooks, runSetup } from '../src/server/setup.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v-off-setup-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const other = { matcher: 'Bash', hooks: [{ type: 'command', command: '/usr/local/bin/guard.sh' }] };

describe('addHooks / removeHooks', () => {
  it('adds async command hooks for every event and keeps other hooks', () => {
    const s = addHooks({ model: 'x', hooks: { PreToolUse: [other] } }, hookCommand('/h/hook.mjs'));
    expect(s.model).toBe('x');
    expect(Object.keys(s.hooks!).sort()).toEqual([...HOOK_EVENTS].sort());
    expect(s.hooks!.PreToolUse).toEqual([other, { matcher: '*', hooks: [{ type: 'command', command: 'node "/h/hook.mjs" --v-off-hook', async: true }] }]);
    expect(s.hooks!.Stop).toEqual([{ hooks: [{ type: 'command', command: 'node "/h/hook.mjs" --v-off-hook', async: true }] }]);
  });

  it('is idempotent and removal restores the original', () => {
    const orig = { hooks: { PreToolUse: [other] }, permissions: { allow: ['Bash(ls)'] } };
    const once = addHooks(orig, hookCommand('/h/hook.mjs'));
    expect(addHooks(once, hookCommand('/h/hook.mjs'))).toEqual(once);
    expect(removeHooks(once)).toEqual({ settings: orig, removed: HOOK_EVENTS.length });
    expect(removeHooks({})).toEqual({ settings: {}, removed: 0 });
  });
});

describe('runSetup', () => {
  it('backs up, writes settings and the hook script, and removes cleanly', async () => {
    const settingsFile = path.join(dir, 'claude', 'settings.json');
    const scriptFile = path.join(dir, 'v-off', 'hook.mjs');
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    const original = JSON.stringify({ hooks: { PreToolUse: [other] } }, null, 2);
    await fs.writeFile(settingsFile, original);
    const now = new Date('2026-10-02T09:05:07');
    const r = await runSetup({ settingsFile, scriptFile, port: 4800, now });
    expect(r.changed).toBe(true);
    expect(r.backupFile).toBe(`${settingsFile}.v-off-backup-20261002-090507`);
    expect(await fs.readFile(r.backupFile!, 'utf8')).toBe(original);
    expect(await fs.readFile(scriptFile, 'utf8')).toContain('|| 4800');
    // Second run changes nothing.
    expect((await runSetup({ settingsFile, scriptFile, port: 4800 })).changed).toBe(false);
    const rm = await runSetup({ settingsFile, scriptFile, remove: true, now: new Date('2026-10-02T09:06:00') });
    expect(rm.removed).toBe(HOOK_EVENTS.length);
    expect(JSON.parse(await fs.readFile(settingsFile, 'utf8'))).toEqual({ hooks: { PreToolUse: [other] } });
    await expect(fs.stat(scriptFile)).rejects.toThrow();
  });

  it('creates settings.json when missing and never writes on invalid JSON', async () => {
    const settingsFile = path.join(dir, 'new', 'settings.json');
    const scriptFile = path.join(dir, 'hook.mjs');
    const r = await runSetup({ settingsFile, scriptFile });
    expect(r.backupFile).toBeUndefined();
    expect(Object.keys(JSON.parse(await fs.readFile(settingsFile, 'utf8')).hooks)).toHaveLength(HOOK_EVENTS.length);
    await fs.writeFile(settingsFile, '{ broken');
    await expect(runSetup({ settingsFile, scriptFile })).rejects.toThrow(/bukan JSON yang valid/);
    expect(await fs.readFile(settingsFile, 'utf8')).toBe('{ broken');
  });

  it('dry-run writes nothing', async () => {
    const settingsFile = path.join(dir, 'settings.json');
    const r = await runSetup({ settingsFile, scriptFile: path.join(dir, 'h.mjs'), dryRun: true });
    expect(r.settings.hooks).toBeDefined();
    await expect(fs.stat(settingsFile)).rejects.toThrow();
  });
});

describe('hook script', () => {
  it('forwards stdin with time and V_OFF_* headers, prints nothing, exits 0', async () => {
    const got: { body: string; headers: http.IncomingHttpHeaders }[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        got.push({ body, headers: req.headers });
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const script = path.join(dir, 'hook.mjs');
    await fs.writeFile(script, hookScript(port));
    const run = (input: string, env: Record<string, string> = {}) =>
      new Promise<{ code: number | null; stdout: string }>((resolve) => {
        const child = execFile(process.execPath, [script, '--v-off-hook'], { env: { ...process.env, V_OFF_PORT: '', ...env } }, (err, stdout) =>
          resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, stdout }));
        child.stdin!.end(input);
      });
    const r = await run('{"session_id":"s","hook_event_name":"Stop"}', { V_OFF_AGENT: 'raka', V_OFF_HOME: '/x' });
    expect(r).toEqual({ code: 0, stdout: '' });
    expect(got[0]!.body).toBe('{"session_id":"s","hook_event_name":"Stop"}');
    expect(got[0]!.headers['x-v-off-env']).toBe('V_OFF_AGENT=raka');
    expect(Number(got[0]!.headers['x-v-off-ts'])).toBeGreaterThan(Date.now() - 10_000);
    await new Promise<void>((r2) => server.close(() => r2()));
    // Server down: still silent and exit 0, quickly.
    const t0 = Date.now();
    expect(await run('{}')).toEqual({ code: 0, stdout: '' });
    expect(Date.now() - t0).toBeLessThan(2600);
  });
});

describe('parseArgs', () => {
  it('parses commands and flags', () => {
    expect(parseArgs([], {})).toMatchObject({ command: 'start', port: 4747, open: true });
    expect(parseArgs(['setup', '--remove', '--port', '5000'], {})).toMatchObject({ command: 'setup', remove: true, port: 5000 });
    expect(parseArgs(['--port=6000', '--no-open'], {})).toMatchObject({ port: 6000, open: false });
    expect(parseArgs([], { V_OFF_PORT: '4800', V_OFF_NO_OPEN: '1' })).toMatchObject({ port: 4800, open: false });
    expect(parseArgs(['--port', 'abc'], {})).toMatch(/Port tidak valid/);
    expect(parseArgs(['--bogus'], {})).toMatch(/tidak dikenal/);
    expect(parseArgs(['-v'], {})).toMatchObject({ command: 'version' });
  });
});

