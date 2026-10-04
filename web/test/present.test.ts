import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/server/defaults.js';
import type { AgentEvent, AgentWithRuntime, Status } from '../../src/shared/types.js';
import { PLAY_SPOTS } from '../src/office/layout.js';
import {
  defaultSelection, feedLine, filterCounts, formatCost, formatDuration, formatTokens, locationOf, logKind, matchesFilter, mergeLog, resumeCommand,
  liveChat, presenceText, sessionColor, sessionEvents, sessionTabLabels, toChat, type ChatItem,
} from '../src/present.js';

const config = defaultConfig();
const agents = (status: (id: string) => Status, extra: Partial<AgentWithRuntime['runtime']> = {}): AgentWithRuntime[] =>
  config.agents.map((a) => ({ ...a, runtime: { status: a.walker ? 'bersih' : status(a.id), manualIdle: false, tokensToday: 0, costToday: 0, ...extra } }));
const ev = (ts: number, agentId: string, kind: AgentEvent['kind'], detail: string): AgentEvent => ({ ts, agentId, sessionId: 's', source: 'claude-code', kind, detail });

describe('filters', () => {
  it('follow the mockup grouping', () => {
    expect(matchesFilter('kerja', 'bersih')).toBe(true);
    expect(matchesFilter('lain', 'simak')).toBe(true);
    expect(matchesFilter('lain', 'bicara')).toBe(true);
    expect(matchesFilter('macet', 'kerja')).toBe(false);
    expect(matchesFilter('semua', 'idle')).toBe(true);
  });

  it('count visible agents per filter', () => {
    const list = agents((id) => (id === 'yoga' || id === 'fajar' ? 'macet' : id === 'ayu' ? 'bicara' : 'idle'));
    list[0] = { ...list[0]!, hidden: true };
    expect(filterCounts(list)).toEqual({ semua: 17, kerja: 1, macet: 2, lain: 1, idle: 13 });
  });

  it('select the first blocked agent by default', () => {
    expect(defaultSelection(agents((id) => (id === 'fajar' ? 'macet' : 'kerja')))).toBe('fajar');
    expect(defaultSelection(agents(() => 'kerja'))).toBe('hendra');
    expect(defaultSelection([])).toBeNull();
  });
});

describe('formatting', () => {
  it('formats tokens, cost, and duration in Indonesian style', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(196_400)).toBe('196 rb');
    expect(formatTokens(2_500_000)).toBe('2,5 jt');
    expect(formatCost(3.02)).toBe('US$ 3,02');
    expect(formatCost(null)).toBe('—');
    expect(formatDuration(35 * 60_000)).toBe('35m');
    expect(formatDuration(72 * 60_000)).toBe('1j 12m');
  });

  it('labels log kinds like the mockup', () => {
    expect(logKind({ kind: 'read', detail: 'x' }).label).toBe('Baca');
    expect(logKind({ kind: 'run', detail: 'x' }).label).toBe('Jalankan');
    expect(logKind({ kind: 'error', detail: 'x' }).label).toBe('Galat');
    expect(logKind({ kind: 'message', detail: 'Subagent: audit' }).label).toBe('Rapat');
    expect(logKind({ kind: 'prompt', detail: 'Prompt baru' }).label).toBe('Info');
  });

  it('builds the resume command', () => {
    expect(resumeCommand('abc-123')).toBe('claude --resume abc-123');
    expect(resumeCommand('abc-123', '/Users/me/Application Support/x')).toBe(
      "cd '/Users/me/Application Support/x' && claude --resume abc-123",
    );
    expect(resumeCommand('abc-123', '/w/v-off', "  tolong cek tes yang merah, ya. Jangan push dulu'  ")).toBe(
      "cd /w/v-off && claude --resume abc-123 'tolong cek tes yang merah, ya. Jangan push dulu'\\'''",
    );
    expect(resumeCommand('abc-123', undefined, '   ')).toBe('claude --resume abc-123');
  });
});

describe('feed and location', () => {
  const list = agents(() => 'kerja');
  it('writes feed lines with department and verb', () => {
    expect(feedLine(ev(1, 'raka', 'edit', 'src/api/timesheet.ts'), list, config.departments)).toEqual({
      who: 'Raka · Tim Engineering', what: 'mengedit src/api/timesheet.ts', dot: '#35b87a',
    });
    expect(feedLine(ev(1, 'raka', 'stop', 'Selesai, menunggu prompt'), list, config.departments).what).toBe('selesai, menunggu prompt');
    expect(feedLine(ev(1, 'ghost', 'error', 'x'), list, config.departments).who).toBe('ghost');
  });

  it('describes where the agent is', () => {
    const find = (id: string, l = list) => l.find((a) => a.id === id)!;
    expect(locationOf(find('hendra'), config.departments)).toBe('Ruang CEO');
    expect(locationOf(find('raka'), config.departments)).toBe('Meja Tim Engineering');
    expect(locationOf(find('udin'), config.departments)).toBe('Berkeliling kantor');
    expect(locationOf(find('raka'), config.departments, PLAY_SPOTS[0])).toBe('Ruang santai · main pingpong');
    const idle = agents(() => 'idle');
    expect(locationOf(find('raka', idle), config.departments)).toBe('Meja Tim Engineering (semua tempat main penuh)');
  });

  it('merges fetched and live log entries without duplicates', () => {
    const fetched = [ev(2, 'raka', 'edit', 'b'), ev(1, 'raka', 'read', 'a')];
    const live = [ev(3, 'raka', 'run', 'c'), ev(2, 'raka', 'edit', 'b'), ev(4, 'nina', 'run', 'x')];
    expect(mergeLog(fetched, live, 'raka').map((e) => e.detail)).toEqual(['c', 'b', 'a']);
    expect(mergeLog(fetched, live, 'raka', 2)).toHaveLength(2);
  });
});

describe('inkOn', () => {
  it('picks dark text on light shirts and white on dark ones', async () => {
    const { inkOn } = await import('../src/present.js');
    expect(inkOn('#e9e9ee')).toBe('#000000');
    expect(inkOn('#2c3550')).toBe('#ffffff');
    // Every default shirt colour gets readable initials (WCAG 4.5:1).
    const lum = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    for (const a of config.agents) {
      const [x, y] = [lum(a.shirt), lum(inkOn(a.shirt))];
      expect((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05), a.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('chat view of a session', () => {
  const ev = (ts: number, kind: AgentEvent['kind'], detail: string, sessionId = 's1'): AgentEvent =>
    ({ ts, agentId: 'a', sessionId, source: 'claude-code', kind, detail });

  it('groups tool calls between prompts into agent bubbles and keeps the newest actions', () => {
    const chat = toChat([
      ev(1, 'prompt', 'Prompt baru (80 karakter)'),
      ...[2, 3, 4, 5, 6, 7].map((t) => ev(t, 'edit', `f${t}.ts`)),
      ev(8, 'stop', 'Selesai, menunggu prompt'),
      ev(9, 'prompt', 'Prompt baru (12 karakter)'),
      ev(10, 'run', 'npm test'),
    ]);
    expect(chat.map((c) => c.kind)).toEqual(['user', 'agent', 'status', 'user', 'agent']);
    const first = chat[1] as Extract<ChatItem, { kind: 'agent' }>;
    expect(first.actions.map((a) => a.detail)).toEqual(['f4.ts', 'f5.ts', 'f6.ts', 'f7.ts']);
    expect(first.more).toBe(2);
    expect(chat[2]).toMatchObject({ tone: 'done' });
  });

  it('turns questions and failures into status bubbles that end the agent bubble', () => {
    const chat = toChat([ev(1, 'run', 'ls'), ev(2, 'notify', 'Bertanya ke pengguna'), ev(3, 'error', 'API Error'), ev(4, 'read', 'a.ts')]);
    expect(chat.map((c) => (c.kind === 'status' ? c.tone : c.kind))).toEqual(['agent', 'wait', 'error', 'agent']);
  });

  it('merges fetched and live events of one session, oldest first, without duplicates', () => {
    const a = ev(1, 'run', 'ls'), b = ev(2, 'edit', 'x.ts');
    const merged = sessionEvents([a], [b, a, ev(3, 'run', 'other session', 's2')], 's1');
    expect(merged.map((e) => e.detail)).toEqual(['ls', 'x.ts']);
  });

  it('labels tabs by repo and adds the session id only for duplicates', () => {
    expect(sessionTabLabels([{ sessionId: 'abcd1', repo: 'planora' }, { sessionId: 'efgh2', repo: 'planora' }, { sessionId: 'ijkl3', repo: 'v-off' }]))
      .toEqual(['planora · abcd', 'planora · efgh', 'v-off']);
    expect(sessionTabLabels([{ sessionId: 'x' }])).toEqual(['sesi']);
  });
});

describe('live chat across sessions', () => {
  const ev = (ts: number, kind: AgentEvent['kind'], detail: string, sessionId: string, agentId = 'a'): AgentEvent =>
    ({ ts, agentId, sessionId, source: 'claude-code', kind, detail });

  it('merges sessions by time without mixing their actions', () => {
    const fetched = new Map([
      ['s1', [ev(1, 'prompt', 'P1', 's1'), ev(3, 'edit', 'a.ts', 's1')]],
      ['s2', [ev(2, 'prompt', 'P2', 's2')]],
    ]);
    const live = [ev(4, 'run', 'npm test', 's2'), ev(5, 'edit', 'new.ts', 's3'), ev(6, 'edit', 'other agent', 's9', 'b')];
    const chat = liveChat(fetched, live, 'a');
    expect(chat.map((c) => `${c.sessionId}:${c.kind}`)).toEqual(['s1:user', 's2:user', 's1:agent', 's2:agent', 's3:agent']);
    const s2 = chat[3] as Extract<ChatItem, { kind: 'agent' }>;
    expect(s2.actions.map((a) => a.detail)).toEqual(['npm test']);
  });

  it('gives each session a stable colour and a presence line per status', () => {
    expect(sessionColor('abc')).toBe(sessionColor('abc'));
    expect(presenceText('kerja')).toBe('sedang bekerja');
    expect(presenceText('idle')).toBeNull();
  });
});
