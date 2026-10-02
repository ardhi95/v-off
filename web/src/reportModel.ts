import type { AgentWithRuntime, Department, Period, Report } from '../../src/shared/types.js';

// Pure view model for the Report page (tested in web/test/report.test.ts).

export type SortKey = 'sesi' | 'sukses' | 'biaya';

export interface ScoreRow {
  id: string;
  name: string;
  role: string;
  shirt: string;
  sessions: number;
  /** 0..1, null without sessions. */
  successRate: number | null;
  cost: number | null;
  tokens: number;
  blocks: number;
  /** 0..100 share bar: cost when every row is priced, else tokens. */
  bar: number;
}

/** Every visible roster agent (zeros included) plus guests with data. */
export function scoreRows(report: Report, agents: AgentWithRuntime[], sort: SortKey): { rows: ScoreRow[]; byCost: boolean } {
  const byId = new Map(report.agents.map((a) => [a.agentId, a]));
  const list = agents.filter((a) => !a.hidden && (!a.guest || byId.has(a.id)));
  for (const r of report.agents) if (!list.some((a) => a.id === r.agentId)) list.push({ id: r.agentId, name: r.name, role: 'Tamu', shirt: '#8a90a0' } as AgentWithRuntime);
  const raw = list.map((a) => {
    const r = byId.get(a.id);
    const sessions = r?.sessions ?? 0;
    return {
      id: a.id, name: a.name, role: a.role, shirt: a.shirt, sessions,
      successRate: sessions ? (r?.success ?? 0) / sessions : null,
      cost: r ? r.cost : 0, tokens: r?.tokens ?? 0, blocks: r?.blocks ?? 0,
    };
  });
  const byCost = raw.every((r) => r.cost !== null);
  const max = Math.max(1e-9, ...raw.map((r) => (byCost ? r.cost ?? 0 : r.tokens)));
  const rows: ScoreRow[] = raw.map((r) => ({ ...r, bar: Math.round((((byCost ? r.cost : r.tokens) ?? 0) / max) * 100) }));
  const val = (r: ScoreRow) => (sort === 'sesi' ? r.sessions : sort === 'sukses' ? r.successRate ?? -1 : byCost ? r.cost ?? 0 : r.tokens);
  rows.sort((a, b) => val(b) - val(a) || b.tokens - a.tokens || a.name.localeCompare(b.name));
  return { rows, byCost };
}

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export interface Bar {
  label: string;
  /** Full label for tooltip and table. */
  title: string;
  sessions: number;
  tokens: number;
  current: boolean;
}

/** Chart bars. The day view shows 08:00 (or the first active hour, if earlier) up to now. */
export function chartBars(report: Report): Bar[] {
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  let buckets = report.buckets.filter((b) => b.start <= report.to);
  if (report.bucketUnit === 'hour') {
    const firstActive = buckets.findIndex((b) => b.sessions > 0 || b.tokens > 0);
    const start = Math.min(8, firstActive === -1 ? 8 : firstActive);
    buckets = buckets.slice(start);
  }
  return buckets.map((b, i) => {
    const d = new Date(b.start);
    const current = b.start <= report.to && report.to < b.end;
    if (report.bucketUnit === 'hour') {
      const h = String(d.getHours()).padStart(2, '0');
      return { label: h, title: `${h}:00–${h}:59`, sessions: b.sessions, tokens: b.tokens, current };
    }
    if (report.bucketUnit === 'day') {
      return { label: DAYS[d.getDay()]!, title: `${DAYS[d.getDay()]}, ${fmtDate(b.start)}`, sessions: b.sessions, tokens: b.tokens, current };
    }
    return { label: `Mg ${i + 1}`, title: `${fmtDate(b.start)} – ${fmtDate(b.end - 1)}`, sessions: b.sessions, tokens: b.tokens, current };
  });
}

export const CHART_TITLE: Record<Report['bucketUnit'], string> = {
  hour: 'Aktivitas per jam',
  day: 'Aktivitas per hari',
  week: 'Aktivitas per minggu',
};

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Hari ini' },
  { key: 'week', label: '7 hari' },
  { key: 'month', label: '30 hari' },
];

export function periodDescription(report: Report): string {
  const long = (ts: number) => new Date(ts).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const short = (ts: number) => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = (ts: number) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
  if (report.period === 'day') return `${long(report.to)} · 00:00–${time(report.to)}`;
  return `${short(report.from)} – ${short(report.to)}`;
}

export interface DeptRow {
  id: string;
  label: string;
  color: string;
  sessions: number;
  cost: number | null;
  tokens: number;
  pct: number;
}

/** Department bars: share of cost when priced, else share of tokens. */
export function deptRows(report: Report, departments: Department[]): DeptRow[] {
  const byCost = report.departments.every((d) => d.cost !== null);
  const total = report.departments.reduce((s, d) => s + (byCost ? d.cost ?? 0 : d.tokens), 0);
  return report.departments.map((d) => ({
    id: d.id,
    label: d.label,
    color: departments.find((x) => x.id === d.id)?.color ?? '#8a90a0',
    sessions: d.sessions,
    cost: d.cost,
    tokens: d.tokens,
    pct: total ? Math.round(((byCost ? d.cost ?? 0 : d.tokens) / total) * 100) : 0,
  }));
}

export interface Postcard {
  date: string;
  line1: string;
  line2: string;
  line3: string;
  people: { initial: string; color: string }[];
}

export function postcard(report: Report, rows: ScoreRow[], formatCost: (n: number | null) => string): Postcard {
  const t = report.totals;
  const rate = t.successRate === null ? '—' : `${Math.round(t.successRate * 100)}%`;
  const busiest = [...rows].sort((a, b) => b.sessions - a.sessions)[0];
  return {
    date: new Date(report.to).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    line1: `${t.sessions.toLocaleString('id-ID')} sesi · ${rate} sukses`,
    line2: busiest && busiest.sessions > 0 ? `Paling sibuk: ${busiest.name} (${busiest.sessions.toLocaleString('id-ID')} sesi)` : 'Belum ada sesi hari ini',
    line3: `Hambatan: ${t.blocks.toLocaleString('id-ID')} · Biaya ${formatCost(t.cost)}`,
    people: rows.map((r) => ({ initial: r.name.charAt(0).toUpperCase(), color: r.shirt })),
  };
}
