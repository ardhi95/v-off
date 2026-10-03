import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/server/defaults.js';
import { parseHookPayload } from '../src/server/sources/claudeHook.js';
import { TranscriptParser } from '../src/server/sources/claudeTranscript.js';
import { AUTO_BLOCK_STALE_MS, PENDING_TOOL_MS, Store } from '../src/server/store.js';

// Status from transcripts alone (no hooks), ported from virtual-agents-office:
// end_turn = done and waiting, AskUserQuestion = question, a tool open > 90 s = likely approval.

const T0 = new Date('2026-10-03T09:00:00').getTime();

function setup() {
  let now = T0;
  const config = defaultConfig();
  config.agents.find((a) => a.id === 'raka')!.match.push({ cwdGlob: '/w/api/**' });
  const store = new Store(config, () => now);
  const parser = new TranscriptParser();
  const feed = (o: object, at = now) =>
    store.ingest(parser.parseLine(JSON.stringify({ sessionId: 's1', cwd: '/w/api', timestamp: new Date(at).toISOString(), ...o })));
  const raka = () => store.snapshot().agents.find((a) => a.id === 'raka')!.runtime;
  return { store, feed, raka, advance: (ms: number) => { now += ms; store.tick(); } };
}

const assistant = (id: string, content: object[], stop_reason: string) =>
  ({ type: 'assistant', message: { id, model: 'claude-x', content, stop_reason } });
const toolUse = (id: string, name: string, input: object = {}) => ({ type: 'tool_use', id, name, input });
const toolResult = (id: string) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });

describe('TranscriptParser: turn end and questions', () => {
  it('emits one stop per end_turn message, none for tool turns', () => {
    const p = new TranscriptParser();
    const line = (o: object) => JSON.stringify({ sessionId: 's', timestamp: new Date(T0).toISOString(), ...o });
    const signals = [
      assistant('m1', [{ type: 'thinking', thinking: '' }], 'tool_use'),
      assistant('m1', [toolUse('t1', 'Bash', { command: 'ls' })], 'tool_use'),
      assistant('m2', [{ type: 'thinking', thinking: '' }], 'end_turn'),
      assistant('m2', [{ type: 'text', text: 'Selesai.' }], 'end_turn'),
    ].flatMap((o) => p.parseLine(line(o)).map((e) => e.signal));
    expect(signals).toEqual(['tool-pre', 'stop']);
  });

  it('AskUserQuestion opens the tool and blocks with a question', () => {
    const p = new TranscriptParser();
    const evs = p.parseLine(JSON.stringify({ sessionId: 's', timestamp: new Date(T0).toISOString(), ...assistant('m', [toolUse('q', 'AskUserQuestion')], 'tool_use') }));
    expect(evs.map((e) => e.signal)).toEqual(['tool-pre', 'notify']);
    expect(evs[1]!.block?.reason).toBe('Ada pertanyaan untuk Anda');
  });
});

describe('Store: transcript-only status', () => {
  it('end_turn makes the agent listen right away, then rest after the idle window', () => {
    const { feed, raka, advance } = setup();
    feed(assistant('m1', [toolUse('t1', 'Edit', { file_path: '/w/api/a.ts' })], 'tool_use'));
    feed(toolResult('t1'));
    expect(raka().status).toBe('kerja');
    feed(assistant('m2', [{ type: 'text', text: 'Beres.' }], 'end_turn'));
    expect(raka().status).toBe('simak');
    advance(600_000);
    expect(raka().status).toBe('idle');
  });

  it('a question blocks until the answer arrives', () => {
    const { feed, raka } = setup();
    feed(assistant('m1', [toolUse('q1', 'AskUserQuestion')], 'tool_use'));
    expect(raka()).toMatchObject({ status: 'macet', block: { reason: 'Ada pertanyaan untuk Anda' } });
    feed(toolResult('q1'));
    expect(raka().status).toBe('kerja');
  });

  it('a tool open for 90 s looks like a wait for approval; finishing clears it; not counted as a block', () => {
    const { store, feed, raka, advance } = setup();
    feed(assistant('m1', [toolUse('t1', 'Bash', { command: 'rm -rf build' })], 'tool_use'));
    advance(PENDING_TOOL_MS - 1000);
    expect(raka().status).toBe('kerja');
    advance(2000);
    expect(raka()).toMatchObject({ status: 'macet', block: { reason: 'Mungkin menunggu izin' } });
    expect(raka().block?.hint).toContain('rm -rf build');
    feed(toolResult('t1'));
    expect(raka().status).toBe('kerja');
    expect(store.report('day').totals.blocks).toBe(0);
  });

  it('"Tandai sudah ditangani" sticks until new activity', () => {
    const { store, feed, raka, advance } = setup();
    feed(assistant('m1', [toolUse('t1', 'Bash', { command: 'npm run build' })], 'tool_use'));
    advance(PENDING_TOOL_MS + 1000);
    expect(raka().status).toBe('macet');
    store.resolve('raka');
    advance(PENDING_TOOL_MS + 1000);
    expect(raka().status).not.toBe('macet');
  });

  it('guessed waits fade after 30 quiet minutes (abandoned sessions do not stay blocked)', () => {
    const { feed, raka, advance } = setup();
    feed(assistant('m1', [toolUse('q1', 'AskUserQuestion')], 'tool_use'));
    expect(raka().status).toBe('macet');
    advance(AUTO_BLOCK_STALE_MS);
    expect(raka().status).toBe('idle');
  });

  it('sessions with hooks are left to the hooks', () => {
    const { store, raka, advance } = setup();
    store.ingest(parseHookPayload({ session_id: 's1', cwd: '/w/api', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'make' }, tool_use_id: 'h1' }, T0));
    advance(PENDING_TOOL_MS + 1000);
    expect(raka().status).toBe('kerja');
  });
});
