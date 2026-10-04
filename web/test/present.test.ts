import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/server/defaults.js';
import type { AgentEvent, AgentWithRuntime, Status } from '../../src/shared/types.js';
import { PLAY_SPOTS } from '../src/office/layout.js';
import {
  defaultSelection, feedLine, filterCounts, formatCost, formatDuration, formatTokens, locationOf, logKind, matchesFilter, resumeCommand,
  mentionsIn, teamChat, presenceText,
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

describe('team chat', () => {
  const ev = (ts: number, agentId: string, kind: AgentEvent['kind'], detail: string, sessionId = 's'): AgentEvent =>
    ({ ts, agentId, sessionId, source: 'claude-code', kind, detail });

  it('turns the feed into group messages, grouping runs of one agent and session', () => {
    const chat = teamChat([
      ev(5, 'raka', 'stop', 'Selesai, menunggu prompt'),
      ev(1, 'wulan', 'prompt', 'Prompt baru (40 karakter)'),
      ev(2, 'wulan', 'edit', 'WBS.md'),
      ev(3, 'raka', 'edit', 'route.ts'),
      ev(4, 'raka', 'run', 'npm test'),
    ]);
    expect(chat.map((c) => `${c.kind}:${c.kind === 'user' ? c.to : c.agentId}`))
      .toEqual(['user:wulan', 'agent:wulan', 'agent:raka', 'status:raka']);
    expect((chat[2] as Extract<typeof chat[number], { kind: 'agent' }>).actions.map((a) => a.detail)).toEqual(['route.ts', 'npm test']);
  });

  it('splits one agent across sessions and keeps the newest actions per bubble', () => {
    const chat = teamChat([ev(1, 'a', 'edit', 'x', 's1'), ev(2, 'a', 'edit', 'y', 's2'), ...[3, 4, 5, 6, 7].map((t) => ev(t, 'a', 'read', `f${t}`, 's2'))]);
    expect(chat).toHaveLength(2);
    expect(chat[1]).toMatchObject({ more: 2 });
  });

  it('finds @mentions of other agents by name', () => {
    const agents = [{ id: 'raka', name: 'Raka' }, { id: 'yoga', name: 'Yoga' }, { id: 'wulan', name: 'Wulan' }];
    expect(mentionsIn('Serah-terima ke Raka: endpoint milestone', agents, 'wulan')).toEqual(['raka']);
    expect(mentionsIn('yogaku', agents, 'wulan')).toEqual([]);
    expect(mentionsIn('Raka cek', agents, 'raka')).toEqual([]);
  });
});

describe('presenceText', () => {
  it('gives a live line per status, none when resting', () => {
    expect(presenceText('kerja')).toBe('sedang bekerja');
    expect(presenceText('idle')).toBeNull();
  });
});
