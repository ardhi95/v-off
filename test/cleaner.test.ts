import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/server/defaults.js';
import { dirSize, scan, scanTargets, tmpTargets } from '../src/server/cleaner.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v-off-clean-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function write(rel: string, bytes: number, ageDays = 0) {
  const p = path.join(dir, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, Buffer.alloc(bytes));
  if (ageDays) {
    const t = new Date(Date.now() - ageDays * 24 * 3600_000);
    await fs.utimes(p, t, t);
  }
}

async function listAll(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(root, { withFileTypes: true, recursive: true })) out.push(path.join(e.parentPath ?? (e as { path: string }).path, e.name));
  return out.sort();
}

describe('cleaner (dry-run)', () => {
  it('sums file sizes recursively and ignores missing folders', async () => {
    await write('proj/node_modules/.cache/a/b.bin', 1000);
    await write('proj/node_modules/.cache/c.bin', 500);
    expect(await dirSize(path.join(dir, 'proj/node_modules/.cache'))).toEqual({ bytes: 1500, partial: false });
    expect(await dirSize(path.join(dir, 'nope'))).toBeNull();
  });

  it('does not follow symlinks', async () => {
    await write('outside/big.bin', 5000);
    await fs.mkdir(path.join(dir, 'cache'));
    await fs.symlink(path.join(dir, 'outside'), path.join(dir, 'cache', 'link'));
    expect((await dirSize(path.join(dir, 'cache')))!.bytes).toBe(0);
  });

  it('marks partial results when the walk limit is hit', async () => {
    for (let i = 0; i < 20; i++) await write(`many/d${i}/f.bin`, 10);
    const r = await dirSize(path.join(dir, 'many'), { maxEntries: 5, maxMs: 10_000 });
    expect(r!.partial).toBe(true);
  });

  it('scans per-agent project caches and old logs only, largest first, without deleting', async () => {
    await write('proj/node_modules/.cache/x.bin', 2000);
    await write('proj/.next/cache/y.bin', 3000);
    await write('logs/old.log', 700, 10);
    await write('logs/new.log', 900, 1);
    await write('logs/old.txt', 800, 10);
    const cfg = defaultConfig();
    const targets = scanTargets([{ agentId: 'raka', cwd: path.join(dir, 'proj') }], cfg.agents, { intervalMin: 15, logPaths: [path.join(dir, 'logs')] })
      .filter((t) => t.path.startsWith(dir));
    const before = await listAll(dir);
    const state = await scan(targets, 123);
    expect(await listAll(dir)).toEqual(before);
    expect(state).toMatchObject({ mode: 'dry-run', totalBytes: 5700, lastScanAt: 123 });
    expect(state.items.map((i) => [i.label, i.bytes, i.agentId])).toEqual([
      ['.next/cache milik Raka', 3000, 'raka'],
      ['node_modules/.cache milik Raka', 2000, 'raka'],
      ['log lama (> 7 hari) di logs', 700, undefined],
    ]);
  });

  it('finds claude-* session temp folders', async () => {
    await fs.mkdir(path.join(dir, 'claude-0'));
    await fs.mkdir(path.join(dir, 'other'));
    expect((await tmpTargets(dir)).map((t) => t.label)).toEqual(['/tmp sesi agent (claude-0)']);
  });
});
