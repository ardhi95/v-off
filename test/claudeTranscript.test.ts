import { describe, expect, it } from 'vitest';
import { TranscriptParser } from '../src/server/sources/claudeTranscript.js';

const meta = { sessionId: 's1', cwd: '/w/pmo-portal', gitBranch: 'feat/timesheet-v2', timestamp: '2026-10-02T07:30:00.000Z' };
const line = (o: object) => JSON.stringify({ ...meta, ...o });
const usage = (input: number, output: number) => ({
  input_tokens: input, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 10,
});

describe('TranscriptParser', () => {
  it('skips blank, invalid, and irrelevant lines', () => {
    const p = new TranscriptParser();
    expect(p.parseLine('')).toEqual([]);
    expect(p.parseLine('{not json')).toEqual([]);
    expect(p.parseLine(JSON.stringify({ type: 'summary', summary: 'x' }))).toEqual([]);
  });

  it('parses user prompts without their text', () => {
    const [ev] = new TranscriptParser().parseLine(line({ type: 'user', message: { role: 'user', content: 'halo rahasia' } }));
    expect(ev).toMatchObject({
      signal: 'prompt', kind: 'prompt', detail: 'Prompt baru (12 karakter)', sessionId: 's1', channel: 'transcript',
      ts: Date.parse(meta.timestamp), ctx: { cwd: '/w/pmo-portal', gitBranch: 'feat/timesheet-v2' },
    });
  });

  it('parses tool use and usage from assistant lines', () => {
    const evs = new TranscriptParser().parseLine(line({
      type: 'assistant',
      message: {
        id: 'msg_1', model: 'claude-sonnet-4-5', usage: usage(5, 20),
        content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'src/db/schema.sql' } }],
      },
    }));
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ signal: 'usage', usage: { input: 5, output: 20, cacheRead: 100, cacheWrite: 10, model: 'claude-sonnet-4-5' } });
    expect(evs[1]).toMatchObject({ signal: 'tool-pre', kind: 'read', detail: 'src/db/schema.sql' });
  });

  it('counts usage repeated across content-block lines once (delta per message id)', () => {
    const p = new TranscriptParser();
    const mk = (out: number, content: object[]) => line({
      type: 'assistant', message: { id: 'msg_x', model: 'm', usage: usage(5, out), content },
    });
    const a = p.parseLine(mk(20, [{ type: 'text', text: 'a' }]));
    const b = p.parseLine(mk(20, [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }]));
    const c = p.parseLine(mk(35, [{ type: 'text', text: 'b' }]));
    const totals = [...a, ...b, ...c].filter((e) => e.usage).map((e) => e.usage!);
    expect(totals.reduce((t, u) => t + u.output, 0)).toBe(35);
    expect(totals.reduce((t, u) => t + u.input + u.cacheRead + u.cacheWrite, 0)).toBe(115);
  });

  it('pairs tool results with their call and detects blocking errors', () => {
    const p = new TranscriptParser();
    p.parseLine(line({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'task1', name: 'Task', input: { description: 'Audit' } }] } }));
    p.parseLine(line({ type: 'assistant', message: { id: 'm2', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] } }));
    const [ok] = p.parseLine(line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'task1', content: 'done' }] } }));
    expect(ok).toMatchObject({ signal: 'tool-post', subagent: true });
    const [err] = p.parseLine(line({
      type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', is_error: true, content: [{ type: 'text', text: 'FAIL e2e/timesheet.spec.ts\n3 failed' }] }] },
    }));
    expect(err).toMatchObject({ signal: 'error', kind: 'error', endsTool: true, block: { reason: 'Tes gagal' } });
  });

  it('marks API error messages as blocking', () => {
    const [ev] = new TranscriptParser().parseLine(line({
      type: 'assistant', isApiErrorMessage: true, message: { id: 'e', model: '<synthetic>', content: [{ type: 'text', text: 'API Error: 529 overloaded' }] },
    }));
    expect(ev).toMatchObject({ signal: 'error', block: { reason: 'Galat API' } });
  });

  it('keeps sidechain (subagent) lines out of the feed but counts tokens', () => {
    const evs = new TranscriptParser().parseLine(line({
      type: 'assistant', isSidechain: true,
      message: { id: 'sc', model: 'm', usage: usage(1, 2), content: [{ type: 'tool_use', id: 'x', name: 'Read', input: {} }] },
    }));
    expect(evs.map((e) => e.signal)).toEqual(['usage']);
  });
});
