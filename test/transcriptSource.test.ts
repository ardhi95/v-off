import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClaudeTranscriptSource } from '../src/server/sources/claudeTranscriptSource.js';
import type { NormalizedEvent } from '../src/server/sources/types.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v-off-tx-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const line = (o: object) =>
  JSON.stringify({ sessionId: 's1', cwd: '/w/app', timestamp: '2026-10-02T07:00:00Z', ...o }) + '\n';
const prompt = (text: string) => line({ type: 'user', message: { role: 'user', content: text } });

function collector() {
  const batches: { events: NormalizedEvent[]; historic: boolean }[] = [];
  return { batches, sink: { ingest: (events: NormalizedEvent[], o?: { historic?: boolean }) => batches.push({ events, historic: !!o?.historic }) } };
}

describe('ClaudeTranscriptSource', () => {
  it('replays recent files as historic, then tails appended lines', async () => {
    const proj = path.join(dir, '-w-app');
    await fs.mkdir(proj);
    const file = path.join(proj, 's1.jsonl');
    await fs.writeFile(file, prompt('satu'));
    const { batches, sink } = collector();
    const src = new ClaudeTranscriptSource({ root: dir, pollMs: 60_000 });
    await src.start(sink);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ historic: true, events: [{ signal: 'prompt' }] });

    // A line split across writes (including a multi-byte character) is read once complete.
    const next = prompt('dua ✓');
    const bytes = Buffer.from(next);
    const cut = bytes.indexOf(Buffer.from('✓')) + 1;
    await fs.appendFile(file, bytes.subarray(0, cut));
    await src.poll();
    expect(batches).toHaveLength(1);
    await fs.appendFile(file, bytes.subarray(cut));
    await src.poll();
    expect(batches).toHaveLength(2);
    expect(batches[1]).toMatchObject({ historic: false, events: [{ signal: 'prompt', detail: 'Prompt baru (5 karakter)' }] });
    src.stop();
  });

  it('skips old files at startup but picks up new files', async () => {
    const old = path.join(dir, 'old.jsonl');
    await fs.writeFile(old, prompt('lama'));
    const past = new Date(Date.now() - 40 * 24 * 3600_000);
    await fs.utimes(old, past, past);
    const { batches, sink } = collector();
    const src = new ClaudeTranscriptSource({ root: dir, pollMs: 60_000 });
    await src.start(sink);
    expect(batches).toHaveLength(0);
    await fs.writeFile(path.join(dir, 'new.jsonl'), prompt('baru'));
    await src.poll();
    expect(batches).toHaveLength(1);
    src.stop();
  });

  it('tolerates a missing root directory', async () => {
    const { batches, sink } = collector();
    const src = new ClaudeTranscriptSource({ root: path.join(dir, 'nope'), pollMs: 60_000 });
    await src.start(sink);
    await src.poll();
    expect(batches).toHaveLength(0);
    src.stop();
  });
});
