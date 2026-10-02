import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../src/server/sources/types.js';
import { applyEvent, computeStatus, newSession, type SessionState } from '../src/server/status.js';

const rules = { workWindowSec: 90, idleAfterSec: 600 };
const T0 = 1_000_000_000_000;
const sec = (n: number) => T0 + n * 1000;

function ev(signal: NormalizedEvent['signal'], at: number, extra: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return { ts: at, sessionId: 's', source: 'claude-code', channel: 'hook', signal, ...extra };
}
function run(events: NormalizedEvent[]): SessionState {
  const s = newSession('s', 'raka', events[0]?.ts ?? T0);
  for (const e of events) applyEvent(s, e);
  return s;
}

describe('computeStatus', () => {
  it('no session or ended session → idle', () => {
    expect(computeStatus(undefined, {}, T0, rules)).toBe('idle');
    expect(computeStatus(run([ev('start', sec(0)), ev('end', sec(5))]), {}, sec(6), rules)).toBe('idle');
  });

  it('walker is always bersih', () => {
    expect(computeStatus(undefined, { walker: true }, T0, rules)).toBe('bersih');
  });

  it('activity within 90 s → kerja; later without Stop → simak', () => {
    const s = run([ev('prompt', sec(0)), ev('tool-pre', sec(10)), ev('tool-post', sec(12))]);
    expect(computeStatus(s, {}, sec(100), rules)).toBe('kerja');
    expect(computeStatus(s, {}, sec(103), rules)).toBe('simak');
  });

  it('a long-running tool keeps kerja past 90 s', () => {
    const s = run([ev('tool-pre', sec(0))]);
    expect(computeStatus(s, {}, sec(300), rules)).toBe('kerja');
  });

  it('Stop → simak, then idle after 10 minutes', () => {
    const s = run([ev('tool-pre', sec(0)), ev('tool-post', sec(1)), ev('stop', sec(2))]);
    expect(computeStatus(s, {}, sec(3), rules)).toBe('simak');
    expect(computeStatus(s, {}, sec(601), rules)).toBe('simak');
    expect(computeStatus(s, {}, sec(602), rules)).toBe('idle');
  });

  it('new activity after idle → back to kerja', () => {
    const s = run([ev('stop', sec(0))]);
    expect(computeStatus(s, {}, sec(700), rules)).toBe('idle');
    applyEvent(s, ev('prompt', sec(700)));
    expect(computeStatus(s, {}, sec(701), rules)).toBe('kerja');
  });

  it('permission notification → macet; tool running afterwards clears it', () => {
    const s = run([ev('tool-pre', sec(0)), ev('notify', sec(1), { block: { reason: 'Menunggu izin: Bash', hint: 'h' } })]);
    expect(computeStatus(s, {}, sec(2), rules)).toBe('macet');
    expect(s.block?.reason).toBe('Menunggu izin: Bash');
    applyEvent(s, ev('tool-post', sec(5)));
    expect(computeStatus(s, {}, sec(6), rules)).toBe('kerja');
  });

  it('blocking error stays macet past idle timeout until the user prompts', () => {
    const s = run([ev('error', sec(0), { block: { reason: 'Tes gagal', hint: 'h' } })]);
    expect(computeStatus(s, {}, sec(5000), rules)).toBe('macet');
    expect(s.blockCount).toBe(1);
    expect(s.hadUnresolvedError).toBe(true);
    applyEvent(s, ev('prompt', sec(5001)));
    expect(computeStatus(s, {}, sec(5002), rules)).toBe('kerja');
    expect(s.hadUnresolvedError).toBe(false);
  });

  it('non-blocking errors do not block', () => {
    const s = run([ev('error', sec(0))]);
    expect(computeStatus(s, {}, sec(1), rules)).toBe('kerja');
  });

  it('active subagent (Task) → bicara; stays bicara 90 s after SubagentStop', () => {
    const s = run([ev('tool-pre', sec(0), { subagent: true })]);
    expect(computeStatus(s, {}, sec(200), rules)).toBe('bicara');
    // Real order: PreToolUse(Task) → SubagentStop → PostToolUse(Task).
    applyEvent(s, ev('subagent-stop', sec(200)));
    applyEvent(s, ev('tool-post', sec(200), { subagent: true }));
    expect(computeStatus(s, {}, sec(250), rules)).toBe('bicara');
    expect(computeStatus(s, {}, sec(291), rules)).toBe('simak');
  });

  it('manual idle overrides everything except walker', () => {
    const s = run([ev('error', sec(0), { block: { reason: 'x', hint: 'y' } })]);
    expect(computeStatus(s, { manualIdle: true }, sec(1), rules)).toBe('idle');
  });

  it('external status wins only when newer than session activity', () => {
    const s = run([ev('prompt', sec(10))]);
    expect(computeStatus(s, { external: { status: 'macet', at: sec(20) } }, sec(21), rules)).toBe('macet');
    expect(computeStatus(s, { external: { status: 'macet', at: sec(5) } }, sec(21), rules)).toBe('kerja');
  });

  it('block count increases only on transitions', () => {
    const b = { reason: 'Tes gagal', hint: 'h' };
    const s = run([ev('error', sec(0), { block: b }), ev('error', sec(1), { block: b })]);
    expect(s.blockCount).toBe(1);
    applyEvent(s, ev('prompt', sec(2)));
    applyEvent(s, ev('error', sec(3), { block: b }));
    expect(s.blockCount).toBe(2);
  });
});

describe('out-of-order async hooks', () => {
  it('pairs tool start and end by id even when the end arrives first', () => {
    const s = run([ev('prompt', sec(0))]);
    applyEvent(s, ev('tool-post', sec(2), { toolId: 'a' }));
    applyEvent(s, ev('tool-pre', sec(1), { toolId: 'a' }));
    expect(s.toolsInFlight).toBe(0);
    expect(computeStatus(s, {}, sec(200), rules)).toBe('simak');
    applyEvent(s, ev('tool-pre', sec(201), { toolId: 'b' }));
    applyEvent(s, ev('tool-pre', sec(201), { toolId: 'b' }));
    expect(s.toolsInFlight).toBe(1);
    applyEvent(s, ev('tool-post', sec(202), { toolId: 'b' }));
    expect(s.toolsInFlight).toBe(0);
  });
});
