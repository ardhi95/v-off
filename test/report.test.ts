import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/server/defaults.js';
import { loadHistory, saveHistory } from '../src/server/history.js';
import { parseHookPayload } from '../src/server/sources/claudeHook.js';
import { ClaudeTranscriptSource } from '../src/server/sources/claudeTranscriptSource.js';
import { Store } from '../src/server/store.js';

const NOW = new Date('2026-10-02T14:30:00').getTime();
const at = (h: number, m = 0, daysAgo = 0) => {
  const d = new Date(NOW - daysAgo * 24 * 3600_000);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const hook = (sid: string, agent: string, name: string, ts: number, extra: object = {}) =>
  parseHookPayload({ session_id: sid, hook_event_name: name, ...extra }, ts, { V_OFF_AGENT: agent });

describe('report', () => {
  it('counts sessions per hour bucket and per agent by activity in the period', () => {
    const store = new Store(defaultConfig(), () => NOW);
    store.ingest(hook('a', 'raka', 'PreToolUse', at(9, 10), { tool_name: 'Read', tool_input: {} }));
    store.ingest(hook('a', 'raka', 'PreToolUse', at(11, 5), { tool_name: 'Read', tool_input: {} }));
    store.ingest(hook('b', 'dewi', 'PreToolUse', at(11, 30), { tool_name: 'Read', tool_input: {} }));
    store.ingest(hook('old', 'nina', 'PreToolUse', at(10, 0, 3), { tool_name: 'Read', tool_input: {} }));
    const day = store.report('day');
    expect(day.bucketUnit).toBe('hour');
    expect(day.buckets).toHaveLength(24);
    expect(day.buckets[9]!.sessions).toBe(1);
    expect(day.buckets[10]!.sessions).toBe(0);
    expect(day.buckets[11]!.sessions).toBe(2);
    expect(day.totals.sessions).toBe(2);
    expect(day.agents.find((a) => a.agentId === 'nina')).toBeUndefined();
    const week = store.report('week');
    expect(week.bucketUnit).toBe('day');
    expect(week.buckets.map((b) => b.sessions)).toEqual([0, 0, 0, 1, 0, 0, 2]);
    expect(week.totals.sessions).toBe(3);
  });

  it('splits 30 days into 7-day blocks ending today', () => {
    const r = new Store(defaultConfig(), () => NOW).report('month');
    expect(r.bucketUnit).toBe('week');
    expect(r.buckets).toHaveLength(5);
    expect(r.buckets[0]!.start).toBe(r.from);
    expect(r.buckets[4]!.end - r.buckets[4]!.start).toBe(2 * 24 * 3600_000);
  });

  it('keeps persisted blocks and does not double count them on transcript replay', () => {
    const history = { blocks: [{ ts: at(10), agentId: 'yoga', sessionId: 'y1' }] };
    const store = new Store(defaultConfig(), () => NOW, history);
    const added: unknown[] = [];
    store.on('block-added', (b) => added.push(b));
    // Replayed transcript error for the same session must be ignored.
    store.ingest([{ ts: at(10), sessionId: 'y1', source: 'claude-code', channel: 'transcript', signal: 'error', kind: 'error', detail: '3 failed', block: { reason: 'Tes gagal', hint: '' }, ctx: { env: { V_OFF_AGENT: 'yoga' } } }], { historic: true });
    expect(store.report('day').totals.blocks).toBe(1);
    expect(added).toHaveLength(0);
    // A new live block is recorded and announced for persistence.
    store.ingest(hook('y2', 'fajar', 'Notification', at(14), { message: 'Claude needs your permission to use Bash' }));
    expect(store.report('day').totals.blocks).toBe(2);
    expect(added).toEqual([{ ts: at(14), agentId: 'fajar', sessionId: 'y2' }]);
    expect(store.blockHistory()).toHaveLength(2);
  });

  it('history file round-trips and tolerates garbage', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v-off-hist-'));
    const file = path.join(dir, 'history.json');
    expect(await loadHistory(file)).toEqual({ version: 1, blocks: [] });
    await saveHistory({ version: 1, blocks: [{ ts: 1, agentId: 'a', sessionId: 's' }] }, file);
    expect((await loadHistory(file)).blocks).toEqual([{ ts: 1, agentId: 'a', sessionId: 's' }]);
    await fs.writeFile(file, '{"blocks":[{"ts":"x"},{"ts":2,"agentId":"b"}]}');
    expect((await loadHistory(file)).blocks).toEqual([{ ts: 2, agentId: 'b', sessionId: '' }]);
    await fs.rm(dir, { recursive: true });
  });

  it('report tokens match transcript totals exactly (SPEC 12.4)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v-off-acc-'));
    const lines: string[] = [];
    let expected = 0;
    for (let m = 0; m < 40; m++) {
      const usage = { input_tokens: 10 + m, output_tokens: 200 + m, cache_read_input_tokens: 5000 + m, cache_creation_input_tokens: 300 };
      expected += 10 + m + 200 + m + 5000 + m + 300;
      const base = { type: 'assistant', sessionId: 'acc', cwd: '/w/x', timestamp: new Date(at(9) + m * 60_000).toISOString(), requestId: `r${m}` };
      // Claude Code repeats the same usage on each content-block line of one message.
      for (const block of [{ type: 'thinking' }, { type: 'text', text: 'ok' }, { type: 'tool_use', id: `t${m}`, name: 'Read', input: {} }]) {
        lines.push(JSON.stringify({ ...base, message: { id: `msg${m}`, model: 'claude-sonnet-4-5', usage, content: [block] } }));
      }
    }
    // Yesterday's usage must not count toward today.
    lines.push(JSON.stringify({ type: 'assistant', sessionId: 'acc', timestamp: new Date(at(9, 0, 1)).toISOString(), message: { id: 'y', model: 'm', usage: { input_tokens: 999, output_tokens: 1 }, content: [] } }));
    await fs.writeFile(path.join(dir, 'acc.jsonl'), lines.join('\n') + '\n');
    const config = defaultConfig();
    config.pricing = { 'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } };
    const store = new Store(config, () => NOW);
    const src = new ClaudeTranscriptSource({ root: dir, pollMs: 60_000, clock: () => NOW });
    await src.start(store);
    src.stop();
    const r = store.report('day');
    expect(r.totals.tokens).toBe(expected);
    expect(r.buckets.reduce((s, b) => s + b.tokens, 0)).toBe(expected);
    expect(r.totals.cost).toBeGreaterThan(0);
    expect(store.report('week').totals.tokens).toBe(expected + 1000);
    await fs.rm(dir, { recursive: true });
  });
});
