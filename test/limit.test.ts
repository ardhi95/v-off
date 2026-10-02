import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/server/defaults.js';
import { parseHookPayload } from '../src/server/sources/claudeHook.js';
import { TranscriptParser } from '../src/server/sources/claudeTranscript.js';
import type { NormalizedEvent } from '../src/server/sources/types.js';
import { LIMIT_FALLBACK_MS, Store } from '../src/server/store.js';
import { matchBlock, matchUsageLimit, parseResetAt } from '../src/server/summarize.js';

const at = (s: string) => new Date(s).getTime();

describe('matchUsageLimit', () => {
  const now = at('2026-10-02T13:20:00');

  it('detects quota messages but not a plain rate limit', () => {
    expect(matchUsageLimit('Claude AI usage limit reached|1759420800', now)).toEqual({ resetsAt: 1759420800_000 });
    expect(matchUsageLimit("You've hit your limit · resets 3pm (Asia/Jakarta)", now)).toEqual({ resetsAt: at('2026-10-02T15:00:00') });
    expect(matchUsageLimit('5-hour limit reached ∙ resets 10:30am', now)).toEqual({ resetsAt: at('2026-10-03T10:30:00') });
    expect(matchUsageLimit('Weekly limit reached', now)).toEqual({});
    expect(matchUsageLimit('Rate limit reached for requests', now)).toBeNull();
    expect(matchUsageLimit('API Error: 529 overloaded', now)).toBeNull();
  });

  it('parses dated and 24-hour reset times, ignores bare numbers', () => {
    expect(parseResetAt('Weekly limit reached ∙ resets Oct 9, 10am', now)).toBe(at('2026-10-09T10:00:00'));
    expect(parseResetAt('limit resets 15:00', now)).toBe(at('2026-10-02T15:00:00'));
    expect(parseResetAt('resets 3', now)).toBeUndefined();
    expect(parseResetAt('resets 13pm', now)).toBeUndefined();
  });

  it('reports usage-limit text as the quota block', () => {
    expect(matchBlock('Session limit reached ∙ resets 9pm')?.reason).toBe('Batas pemakaian tercapai');
  });
});

describe('limit sources', () => {
  it('flags transcript API errors and StopFailure messages', () => {
    const line = JSON.stringify({
      type: 'assistant', sessionId: 's1', timestamp: '2026-10-02T06:00:00.000Z', isApiErrorMessage: true,
      message: { id: 'm1', model: '<synthetic>', content: [{ type: 'text', text: 'Claude AI usage limit reached|1759420800' }] },
    });
    const [ev] = new TranscriptParser().parseLine(line);
    expect(ev).toMatchObject({ signal: 'error', limit: { resetsAt: 1759420800_000 } });

    const base = { session_id: 's1', hook_event_name: 'StopFailure', error_type: 'rate_limit' };
    expect(parseHookPayload({ ...base, message: "You've hit your limit" }, 1)[0]!.limit).toEqual({});
    expect(parseHookPayload({ ...base, message: 'Rate limit exceeded.' }, 1)[0]!.limit).toBeUndefined();
    const [resume] = parseHookPayload({ session_id: 's1', hook_event_name: 'Notification', notification_type: 'quota_auto_resume_fired', message: 'Resumed' }, 1);
    expect(resume!.limitEnd).toBe(true);
  });
});

function setup() {
  let now = at('2026-10-02T13:00:00');
  const config = defaultConfig();
  config.agents.find((a) => a.id === 'raka')!.match.push({ cwdGlob: '/w/pmo-portal/**' });
  const store = new Store(config, () => now);
  return { store, advance: (ms: number) => (now += ms), now: () => now };
}

const ev = (ts: number, o: Partial<NormalizedEvent>): NormalizedEvent => ({
  ts, sessionId: 'sess-raka', source: 'claude-code', channel: 'transcript', signal: 'activity', ctx: { cwd: '/w/pmo-portal' }, ...o,
});
const limitEv = (ts: number, resetsAt?: number) =>
  ev(ts, { signal: 'error', kind: 'error', detail: 'usage limit reached', limit: resetsAt ? { resetsAt } : {} });
const usageEv = (ts: number) =>
  ev(ts, { signal: 'usage', usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, model: 'claude-sonnet-4-5' } });

describe('Store limit (kantor off)', () => {
  it('turns the office off until the stated reset time', () => {
    const { store, now, advance } = setup();
    const updates: (number | null)[] = [];
    store.on('limit-updated', (l) => updates.push(l ? l.until : null));
    const reset = now() + 2 * 3600_000;
    store.ingest([limitEv(now(), reset)]);
    expect(store.snapshot().limit).toMatchObject({ since: now(), resetsAt: reset, until: reset, agentId: 'raka' });
    advance(3600_000);
    store.tick();
    expect(store.limitState()).not.toBeNull();
    advance(3600_000);
    store.tick();
    expect(store.limitState()).toBeNull();
    expect(updates).toEqual([reset, null]);
    expect(store.snapshot().events[0]!.detail).toMatch(/^Kantor buka lagi/);
  });

  it('falls back to a fixed window when no reset time is given', () => {
    const { store, now } = setup();
    store.ingest([limitEv(now())]);
    expect(store.limitState()!.until).toBe(now() + LIMIT_FALLBACK_MS);
  });

  it('reopens when the model answers again, but not on a new prompt', () => {
    const { store, now, advance } = setup();
    store.ingest([limitEv(now())]);
    advance(60_000);
    store.ingest([ev(now(), { signal: 'prompt', kind: 'prompt', detail: 'Prompt baru (3 karakter)' })]);
    expect(store.limitState()).not.toBeNull();
    store.ingest([usageEv(now())]);
    expect(store.limitState()).toBeNull();
  });

  it('reopens on quota auto-resume and on the manual button', () => {
    const { store, now, advance } = setup();
    store.ingest([limitEv(now())]);
    advance(1000);
    store.ingest([ev(now(), { channel: 'hook', kind: 'notify', detail: 'Resumed', limitEnd: true })]);
    expect(store.limitState()).toBeNull();
    advance(1000);
    store.ingest([limitEv(now())]);
    expect(store.clearLimit()).toBe(true);
    expect(store.limitState()).toBeNull();
    expect(store.clearLimit()).toBe(false);
  });

  it('ignores stale limit messages from history', () => {
    const { store, now } = setup();
    // Reset already passed.
    store.ingest([limitEv(now() - 3 * 3600_000, now() - 3600_000)], { historic: true });
    expect(store.limitState()).toBeNull();
    // The API answered after the limit (other transcript read first).
    store.ingest([{ ...usageEv(now() - 60_000), sessionId: 'other' }], { historic: true });
    store.ingest([limitEv(now() - 120_000)], { historic: true });
    expect(store.limitState()).toBeNull();
  });

  it('reads the limit from the transcript even when hooks report the session', () => {
    const { store, now } = setup();
    store.ingest([ev(now() - 1000, { channel: 'hook', signal: 'prompt', kind: 'prompt', detail: 'Prompt baru (1 karakter)' })]);
    store.ingest([limitEv(now())]);
    expect(store.limitState()).not.toBeNull();
  });
});
