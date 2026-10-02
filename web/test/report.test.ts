import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/server/defaults.js';
import type { AgentWithRuntime, Report } from '../../src/shared/types.js';
import { formatCost } from '../src/present.js';
import { chartBars, deptRows, periodDescription, postcard, scoreRows } from '../src/reportModel.js';

const config = defaultConfig();
const agents: AgentWithRuntime[] = config.agents.map((a) => ({ ...a, runtime: { status: 'kerja', manualIdle: false, tokensToday: 0, costToday: 0 } }));
const TO = new Date('2026-10-02T14:32:00').getTime();
const FROM = new Date('2026-10-02T00:00:00').getTime();
const HOUR = 3600_000;

function report(over: Partial<Report> = {}): Report {
  return {
    period: 'day', from: FROM, to: TO, estimate: true,
    totals: { sessions: 3, success: 2, tokens: 3000, cost: 0.9, blocks: 1, successRate: 2 / 3 },
    agents: [
      { agentId: 'raka', name: 'Raka', dept: 'eng', sessions: 2, success: 2, tokens: 2000, cost: 0.6, blocks: 0 },
      { agentId: 'yoga', name: 'Yoga', dept: 'qa', sessions: 1, success: 0, tokens: 1000, cost: 0.3, blocks: 1 },
    ],
    departments: [
      { id: 'eng', label: 'Tim Engineering', sessions: 2, success: 2, tokens: 2000, cost: 0.6, blocks: 0 },
      { id: 'qa', label: 'Tim Kualitas & Keamanan · SOC', sessions: 1, success: 0, tokens: 1000, cost: 0.3, blocks: 1 },
    ],
    bucketUnit: 'hour',
    buckets: Array.from({ length: 24 }, (_, i) => ({ start: FROM + i * HOUR, end: FROM + (i + 1) * HOUR, sessions: i === 6 ? 1 : i === 14 ? 2 : 0, tokens: 0, cost: 0 })),
    ...over,
  };
}

describe('scoreRows', () => {
  it('lists every roster agent, sorted, with cost share bars', () => {
    const { rows, byCost } = scoreRows(report(), agents, 'biaya');
    expect(byCost).toBe(true);
    expect(rows).toHaveLength(18);
    expect(rows[0]).toMatchObject({ id: 'raka', sessions: 2, successRate: 1, bar: 100 });
    expect(rows[1]).toMatchObject({ id: 'yoga', successRate: 0, bar: 50, blocks: 1 });
    expect(rows[2]!.successRate).toBeNull();
    expect(scoreRows(report(), agents, 'sukses').rows[0]!.id).toBe('raka');
  });

  it('falls back to token shares when a price is missing, and adds guests with data', () => {
    const r = report({ agents: [...report().agents, { agentId: 'tamu-1', name: 'Agent tanpa nama', dept: 'tamu', sessions: 1, success: 1, tokens: 4000, cost: null, blocks: 0 }] });
    const { rows, byCost } = scoreRows(r, agents, 'biaya');
    expect(byCost).toBe(false);
    expect(rows[0]).toMatchObject({ id: 'tamu-1', bar: 100 });
    expect(rows).toHaveLength(19);
  });
});

describe('chartBars', () => {
  it('shows the day from 08:00 (or earlier activity) up to the current hour', () => {
    const bars = chartBars(report());
    expect(bars[0]!.label).toBe('06');
    expect(bars[bars.length - 1]).toMatchObject({ label: '14', sessions: 2, current: true });
    expect(bars).toHaveLength(9);
  });

  it('labels weekdays and week blocks', () => {
    const day = 24 * HOUR;
    const weekFrom = FROM - 6 * day;
    const week = chartBars(report({ period: 'week', from: weekFrom, bucketUnit: 'day', buckets: Array.from({ length: 7 }, (_, i) => ({ start: weekFrom + i * day, end: weekFrom + (i + 1) * day, sessions: 0, tokens: 0, cost: 0 })) }));
    expect(week.map((b) => b.label)).toEqual(['Sab', 'Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum']);
    expect(week[6]!.current).toBe(true);
    const mFrom = FROM - 29 * day;
    const month = chartBars(report({ period: 'month', from: mFrom, bucketUnit: 'week', buckets: Array.from({ length: 5 }, (_, i) => ({ start: mFrom + i * 7 * day, end: Math.min(mFrom + 30 * day, mFrom + (i + 1) * 7 * day), sessions: 0, tokens: 0, cost: 0 })) }));
    expect(month.map((b) => b.label)).toEqual(['Mg 1', 'Mg 2', 'Mg 3', 'Mg 4', 'Mg 5']);
  });
});

describe('departments, period text, postcard', () => {
  it('computes department shares with config colours', () => {
    expect(deptRows(report(), config.departments)).toEqual([
      expect.objectContaining({ id: 'eng', pct: 67, color: '#5b8def' }),
      expect.objectContaining({ id: 'qa', pct: 33, color: '#ef6a3c' }),
    ]);
  });

  it('describes the period', () => {
    expect(periodDescription(report())).toBe('Jumat, 2 Oktober 2026 · 00:00–14:32');
    expect(periodDescription(report({ period: 'week', from: FROM - 6 * 24 * HOUR }))).toBe('26 September 2026 – 2 Oktober 2026');
  });

  it('writes postcard lines from real totals', () => {
    const { rows } = scoreRows(report(), agents, 'biaya');
    const pc = postcard(report(), rows, formatCost);
    expect(pc).toMatchObject({
      date: 'Jumat, 2 Oktober 2026',
      line1: '3 sesi · 67% sukses',
      line2: 'Paling sibuk: Raka (2 sesi)',
      line3: 'Hambatan: 1 · Biaya US$ 0,90',
    });
    expect(pc.people).toHaveLength(18);
  });
});
