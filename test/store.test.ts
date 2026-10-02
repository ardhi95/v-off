import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/server/defaults.js';
import { parseHookPayload } from '../src/server/sources/claudeHook.js';
import type { NormalizedEvent } from '../src/server/sources/types.js';
import { Store } from '../src/server/store.js';

function setup() {
  let now = new Date('2026-10-02T09:00:00').getTime();
  const config = defaultConfig();
  config.agents.find((a) => a.id === 'raka')!.match.push({ cwdGlob: '/w/pmo-portal/**' });
  config.pricing = { 'claude-sonnet': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } };
  const store = new Store(config, () => now);
  return { store, advance: (ms: number) => (now += ms), now: () => now };
}

const hook = (name: string, extra: object, ts: number) =>
  parseHookPayload({ session_id: 'sess-raka', cwd: '/w/pmo-portal', hook_event_name: name, ...extra }, ts);

const usageEv = (ts: number, sessionId = 'sess-raka'): NormalizedEvent => ({
  ts, sessionId, source: 'claude-code', channel: 'transcript', signal: 'usage', ctx: { cwd: '/w/pmo-portal' },
  usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, model: 'claude-sonnet-4-5' },
});

describe('Store', () => {
  it('maps a session to an agent and shows it working', () => {
    const { store, now } = setup();
    const updates: string[] = [];
    store.on('agent-updated', (a) => updates.push(`${a.id}:${a.runtime.status}`));
    store.ingest(hook('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'src/api/timesheet.ts' } }, now()));
    const raka = store.snapshot().agents.find((a) => a.id === 'raka')!;
    expect(raka.runtime).toMatchObject({ status: 'kerja', repo: 'pmo-portal', lastAction: 'src/api/timesheet.ts' });
    expect(updates).toContain('raka:kerja');
    expect(store.snapshot().events[0]).toMatchObject({ agentId: 'raka', kind: 'edit' });
  });

  it('unmatched sessions take a role, never a guest; V_OFF_AGENT from a hook re-assigns them', () => {
    const { store, now } = setup();
    store.ingest([{ ...usageEv(now(), 'abcdef123456'), ctx: { cwd: '/elsewhere' } }]);
    expect(store.snapshot().agents.some((a) => a.guest)).toBe(false);
    expect(store.snapshot().agents.find((a) => a.id === 'wulan')!.runtime.sessionId).toBe('abcdef123456');
    store.ingest(parseHookPayload({ session_id: 'abcdef123456', hook_event_name: 'Stop' }, now(), { V_OFF_AGENT: 'nina' }));
    expect(store.snapshot().agents.find((a) => a.id === 'nina')!.runtime.status).toBe('simak');
  });

  it('permission request blocks the agent and resolve clears it', () => {
    const { store, now } = setup();
    store.ingest(hook('Notification', { message: 'Claude needs your permission to use Bash' }, now()));
    let raka = store.snapshot().agents.find((a) => a.id === 'raka')!;
    expect(raka.runtime.status).toBe('macet');
    expect(raka.runtime.block?.reason).toBe('Menunggu izin: Bash');
    expect(store.resolve('raka')).toBe(true);
    raka = store.snapshot().agents.find((a) => a.id === 'raka')!;
    expect(raka.runtime.status).toBe('kerja');
    expect(raka.runtime.block).toBeUndefined();
  });

  it('goes idle after 10 minutes and returns on new activity (tick emits the change)', () => {
    const { store, now, advance } = setup();
    store.ingest(hook('Stop', {}, now()));
    const statuses: string[] = [];
    store.on('agent-updated', (a) => a.id === 'raka' && statuses.push(a.runtime.status));
    advance(601_000);
    store.tick();
    expect(statuses).toEqual(['idle']);
    store.ingest(hook('UserPromptSubmit', { prompt: 'lanjut' }, now()));
    expect(statuses.at(-1)).toBe('kerja');
  });

  it('manual idle holds until new activity', () => {
    const { store, now, advance } = setup();
    store.ingest(hook('PreToolUse', { tool_name: 'Read', tool_input: {} }, now()));
    store.setIdle('raka', true);
    expect(store.snapshot().agents.find((a) => a.id === 'raka')!.runtime).toMatchObject({ status: 'idle', manualIdle: true });
    advance(1000);
    store.ingest(hook('PostToolUse', { tool_name: 'Read', tool_response: {} }, now()));
    expect(store.snapshot().agents.find((a) => a.id === 'raka')!.runtime.status).toBe('kerja');
  });

  it('transcript events are dropped for hook-reported sessions, except usage', () => {
    const { store, now } = setup();
    store.ingest(hook('SessionStart', { source: 'startup' }, now()));
    const before = store.snapshot().events.length;
    store.ingest([
      { ts: now(), sessionId: 'sess-raka', source: 'claude-code', channel: 'transcript', signal: 'tool-pre', kind: 'read', detail: 'dup' },
      usageEv(now()),
    ]);
    expect(store.snapshot().events.length).toBe(before);
    expect(store.snapshot().agents.find((a) => a.id === 'raka')!.runtime.tokensToday).toBe(1500);
  });

  it('estimates cost from the configured price table; null when unpriced', () => {
    const { store, now } = setup();
    store.ingest([usageEv(now())]);
    const raka = store.snapshot().agents.find((a) => a.id === 'raka')!;
    expect(raka.runtime.costToday).toBeCloseTo((1000 * 3 + 500 * 15) / 1e6, 10);
    store.ingest([{ ...usageEv(now()), usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, model: 'unknown' } }]);
    expect(store.snapshot().agents.find((a) => a.id === 'raka')!.runtime.costToday).toBeNull();
  });

  it('generic webhook sets status and records blocks', () => {
    const { store } = setup();
    expect(store.setExternalStatus('yoga', 'macet', 'Tes gagal: 3 dari 48', 'Perbaiki atau ubah ekspektasi')).toBe(true);
    const yoga = store.snapshot().agents.find((a) => a.id === 'yoga')!;
    expect(yoga.runtime.status).toBe('macet');
    expect(yoga.runtime.block?.reason).toBe('Tes gagal: 3 dari 48');
    expect(store.setExternalStatus('nobody', 'kerja')).toBe(false);
    expect(store.report('day').totals.blocks).toBe(1);
  });

  it('report aggregates tokens, sessions, success, and buckets', () => {
    const { store, now } = setup();
    store.ingest([usageEv(now())]);
    store.ingest(hook('PostToolUseFailure', { tool_name: 'Bash', error: '3 failed' }, now()));
    const r = store.report('day');
    expect(r.totals).toMatchObject({ tokens: 1500, sessions: 1, success: 0, blocks: 1, successRate: 0 });
    expect(r.agents[0]).toMatchObject({ agentId: 'raka', dept: 'eng' });
    expect(r.departments.map((d) => d.id)).toEqual(['eng']);
    expect(r.buckets).toHaveLength(24);
    expect(r.buckets.reduce((t, b) => t + b.tokens, 0)).toBe(1500);
    expect(store.report('week').buckets).toHaveLength(7);
  });

  it('udin the office boy is always bersih', () => {
    const { store } = setup();
    expect(store.snapshot().agents.find((a) => a.id === 'udin')!.runtime.status).toBe('bersih');
  });
});

describe('Store.sessionSummary', () => {
  it('returns a privacy-safe history and token total for one session', () => {
    const { store, now } = setup();
    store.ingest(hook('UserPromptSubmit', { prompt: 'rahasia sekali' }, now()));
    store.ingest(hook('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'a.ts' } }, now()));
    store.ingest([usageEv(now())]);
    const s = store.sessionSummary('sess-raka')!;
    expect(s).toMatchObject({ agentId: 'raka', agentName: 'Raka', cwd: '/w/pmo-portal', tokens: 1500, truncated: false });
    expect(s.events.map((e) => e.kind)).toEqual(['prompt', 'edit']);
    expect(JSON.stringify(s)).not.toContain('rahasia');
    expect(store.sessionSummary('nope')).toBeUndefined();
  });

  it('caps each session log and marks it truncated', () => {
    const { store, now } = setup();
    for (let i = 0; i < 320; i++) store.ingest(hook('PreToolUse', { tool_name: 'Read', tool_input: { file_path: `f${i}` } }, now() + i));
    const s = store.sessionSummary('sess-raka')!;
    expect(s.events).toHaveLength(300);
    expect(s.truncated).toBe(true);
    expect(s.events[0]!.detail).toBe('f20');
  });
});

describe('Store.sessionDirs', () => {
  it('lists each session cwd once with its agent', () => {
    const { store, now } = setup();
    store.ingest(hook('Stop', {}, now()));
    store.ingest(parseHookPayload({ session_id: 'other', cwd: '/w/pmo-portal', hook_event_name: 'Stop' }, now()));
    expect(store.sessionDirs()).toEqual([{ agentId: 'raka', cwd: '/w/pmo-portal' }]);
  });
});
