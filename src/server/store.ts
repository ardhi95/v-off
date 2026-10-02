import { EventEmitter } from 'node:events';
import path from 'node:path';
import type {
  Agent, AgentEvent, AgentRuntime, AgentWithRuntime, BlockRecord, CleanerState, Config, ModelPrice, Period, Report, ReportRow,
  SessionSummary, StateSnapshot, Status, Usage,
} from '../shared/types.js';
import { clip } from './summarize.js';
import { matchAgent } from './matcher.js';
import type { NormalizedEvent, SessionContext, Sink } from './sources/types.js';
import { applyEvent, computeStatus, newSession, type SessionState } from './status.js';

const FEED_LIMIT = 500;
const SNAPSHOT_EVENTS = 50;
const USAGE_RETENTION_MS = 31 * 24 * 3600_000;
export const SESSION_LOG_LIMIT = 300;
const SESSION_LOGS_KEPT = 200;

interface UsageRecord extends Usage {
  ts: number;
  agentId: string;
  sessionId: string;
}

interface AgentFlagsState {
  manualIdleAt?: number;
  external?: { status: Status; at: number; task?: string; detail?: string };
}

export type { BlockRecord, Period, Report, ReportRow } from '../shared/types.js';

export interface StoreEvents {
  'agent-updated': [AgentWithRuntime];
  'event-added': [AgentEvent];
  'cleaner-updated': [CleanerState];
  /** A new block was recorded live (for history persistence). */
  'block-added': [BlockRecord];
  /** Config replaced (Pengaturan saved). Clients reload /api/state. */
  'config-updated': [Config];
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function findPrice(pricing: Record<string, ModelPrice>, model?: string): ModelPrice | undefined {
  if (!model) return undefined;
  if (pricing[model]) return pricing[model];
  // Allow a family key ("claude-sonnet-4") to price dated ids ("claude-sonnet-4-20250514").
  const key = Object.keys(pricing).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? pricing[key] : undefined;
}

export function usageCost(u: Usage, price: ModelPrice): number {
  return (u.input * price.input + u.output * price.output + u.cacheRead * price.cacheRead + u.cacheWrite * price.cacheWrite) / 1e6;
}

export function usageTokens(u: Usage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

/** Central in-memory state: sessions, agent status, activity feed, and usage history. */
export class Store extends EventEmitter<StoreEvents> implements Sink {
  private config: Config;
  private sessions = new Map<string, SessionState>();
  private guests = new Map<string, Agent>();
  private flags = new Map<string, AgentFlagsState>();
  private feed: AgentEvent[] = [];
  /** Per-session event history, insertion-ordered so the oldest session is dropped first. */
  private sessionLogs = new Map<string, { events: AgentEvent[]; truncated: boolean }>();
  private usage: UsageRecord[] = [];
  private blockLog: BlockRecord[] = [];
  /** Sessions whose blocks came from persisted history; replayed transcripts must not count them twice. */
  private persistedBlockSessions = new Set<string>();
  /** Cumulative usage per transcript message, so re-reading a transcript never double counts. */
  private usageByMessage = new Map<string, Usage>();
  /** Hours (ms / 3600000) in which each session had activity. */
  private activeHours = new Map<string, Set<number>>();
  private lastStatus = new Map<string, Status>();
  private cleaner: CleanerState = { mode: 'dry-run', items: [], totalBytes: 0, lastScanAt: null };

  constructor(config: Config, private readonly clock: () => number = Date.now, history?: { blocks: BlockRecord[] }) {
    super();
    this.config = config;
    for (const b of history?.blocks ?? []) {
      this.blockLog.push(b);
      if (b.sessionId) this.persistedBlockSessions.add(b.sessionId);
    }
    this.blockLog.sort((a, b) => a.ts - b.ts);
  }

  /** Blocks to persist (last 31 days). */
  blockHistory(): BlockRecord[] {
    const cutoff = this.clock() - USAGE_RETENTION_MS;
    return this.blockLog.filter((b) => b.ts >= cutoff);
  }

  private recordBlock(b: BlockRecord, historic: boolean): void {
    if (historic && this.persistedBlockSessions.has(b.sessionId)) return;
    this.blockLog.push(b);
    if (!historic) this.emit('block-added', b);
  }

  getConfig(): Config {
    return this.config;
  }

  /** Replace config. Sessions of removed agents go back through matching. */
  setConfig(config: Config): void {
    this.config = config;
    for (const s of this.sessions.values()) {
      if (!this.agentById(s.agentId) || s.agentId.startsWith('tamu-')) this.assign(s, {});
    }
    this.pruneGuests();
    this.refreshAll(false, true);
    this.emit('config-updated', config);
  }

  /** Models seen in token usage, most used first, with whether a price is configured. */
  modelsSeen(): { model: string; tokens: number; priced: boolean }[] {
    const by = new Map<string, number>();
    for (const u of this.usage) if (u.model) by.set(u.model, (by.get(u.model) ?? 0) + usageTokens(u));
    return [...by.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([model, tokens]) => ({ model, tokens, priced: !!findPrice(this.config.pricing, model) }));
  }

  // ---- ingest -------------------------------------------------------------

  ingest(events: NormalizedEvent[], opts: { historic?: boolean } = {}): void {
    const touched = new Set<string>();
    for (const ev of events) {
      const s = this.session(ev);
      if (ev.channel === 'hook') s.hookSeenAt = ev.ts;
      // Hooks already report this session live; transcripts only add token usage.
      if (ev.channel === 'transcript' && s.hookSeenAt !== undefined && ev.signal !== 'usage') continue;
      // A transcript read again (source restarted) replays events already applied.
      if (opts.historic && ev.ts <= s.maxTs && ev.signal !== 'usage') continue;
      if (ev.signal !== 'usage') s.maxTs = Math.max(s.maxTs, ev.ts);

      const hadBlock = !!s.block;
      applyEvent(s, ev);
      if (!hadBlock && s.block) this.recordBlock({ ts: ev.ts, agentId: s.agentId, sessionId: s.sessionId }, !!opts.historic);
      let hours = this.activeHours.get(s.sessionId);
      if (!hours) this.activeHours.set(s.sessionId, (hours = new Set()));
      hours.add(Math.floor(ev.ts / HOUR));

      const flags = this.flags.get(s.agentId);
      if (flags?.manualIdleAt !== undefined && ev.signal !== 'usage' && ev.ts > flags.manualIdleAt) {
        flags.manualIdleAt = undefined; // new activity ends the manual break
      }
      const usage = this.countableUsage(ev);
      if (usage) this.usage.push({ ...usage, ts: ev.ts, agentId: s.agentId, sessionId: s.sessionId });
      if (ev.kind && ev.detail) {
        this.pushFeed({
          ts: ev.ts, agentId: s.agentId, sessionId: s.sessionId, source: ev.source,
          kind: ev.kind, detail: ev.detail, usage: ev.usage,
        }, !opts.historic);
      }
      touched.add(s.agentId);
    }
    // Any ingested event can change details (last action, tokens), so always notify.
    for (const id of touched) this.refresh(id, !opts.historic, true);
  }

  /** Generic webhook (SPEC §5.4): set an agent's status directly. */
  setExternalStatus(agentId: string, status: Status, task?: string, detail?: string): boolean {
    if (!this.agentById(agentId)) return false;
    const now = this.clock();
    const flags = this.flagsFor(agentId);
    if (status === 'macet' && flags.external?.status !== 'macet') this.recordBlock({ ts: now, agentId, sessionId: '' }, false);
    flags.external = { status, at: now, task, detail };
    flags.manualIdleAt = undefined;
    const text = clip([task, detail].filter(Boolean).join(' · ') || `Status: ${status}`);
    this.pushFeed({ ts: now, agentId, sessionId: '', source: 'webhook', kind: status === 'macet' ? 'error' : 'notify', detail: text }, true);
    this.refresh(agentId, true, true);
    return true;
  }

  /** "Tandai sudah ditangani": blocked becomes working until the next error. */
  resolve(agentId: string): boolean {
    if (!this.agentById(agentId)) return false;
    const now = this.clock();
    const s = this.currentSession(agentId);
    if (s?.block) {
      s.block = undefined;
      s.hadUnresolvedError = false;
      s.lastActivityAt = now;
      s.lastStopAt = undefined;
    }
    const flags = this.flags.get(agentId);
    if (flags?.external?.status === 'macet') flags.external = { status: 'kerja', at: now };
    this.pushFeed({ ts: now, agentId, sessionId: s?.sessionId ?? '', source: 'webhook', kind: 'message', detail: 'Hambatan ditandai sudah ditangani' }, true);
    this.refresh(agentId, true, true);
    return true;
  }

  /** "Istirahat & main" / "Kembali bekerja". */
  setIdle(agentId: string, idle: boolean): boolean {
    if (!this.agentById(agentId)) return false;
    const flags = this.flagsFor(agentId);
    flags.manualIdleAt = idle ? this.clock() : undefined;
    this.refresh(agentId, true, true);
    return true;
  }

  /** Working directories of known sessions, for per-project cache scanning. */
  sessionDirs(): { agentId: string; cwd: string }[] {
    const seen = new Set<string>();
    const out: { agentId: string; cwd: string }[] = [];
    for (const s of this.sessions.values()) {
      if (!s.cwd || seen.has(s.cwd)) continue;
      seen.add(s.cwd);
      out.push({ agentId: s.agentId, cwd: s.cwd });
    }
    return out;
  }

  setCleaner(state: CleanerState): void {
    this.cleaner = state;
    this.emit('cleaner-updated', state);
  }

  /** Re-evaluate time-based transitions (kerja → simak → idle). Call periodically. */
  tick(): void {
    const cutoff = this.clock() - USAGE_RETENTION_MS;
    if (this.usage.length && this.usage[0]!.ts < cutoff) this.usage = this.usage.filter((u) => u.ts >= cutoff);
    this.refreshAll(true, false);
  }

  // ---- read ---------------------------------------------------------------

  agents(): Agent[] {
    return [...this.config.agents, ...this.guests.values()];
  }

  agentById(id: string): Agent | undefined {
    return this.config.agents.find((a) => a.id === id) ?? this.guests.get(id);
  }

  agentView(agent: Agent): AgentWithRuntime {
    const view: AgentWithRuntime = { ...agent, runtime: this.runtime(agent) };
    if (this.guests.has(agent.id)) view.guest = true;
    return view;
  }

  snapshot(): StateSnapshot {
    return {
      agents: this.agents().map((a) => this.agentView(a)),
      departments: this.config.departments,
      events: this.feed.slice(-SNAPSHOT_EVENTS).reverse(),
      cleaner: this.cleaner,
      ambience: this.config.ambience,
    };
  }

  /** Recent feed entries for one agent, newest first. */
  agentLog(agentId: string, limit = 30): AgentEvent[] {
    const out: AgentEvent[] = [];
    for (let i = this.feed.length - 1; i >= 0 && out.length < limit; i--) {
      if (this.feed[i]!.agentId === agentId) out.push(this.feed[i]!);
    }
    return out;
  }

  sessionSummary(sessionId: string): SessionSummary | undefined {
    const s = this.sessions.get(sessionId);
    if (!s) return undefined;
    const log = this.sessionLogs.get(sessionId);
    let tokens = 0;
    for (const u of this.usage) if (u.sessionId === sessionId) tokens += usageTokens(u);
    return {
      sessionId,
      agentId: s.agentId,
      agentName: this.agentById(s.agentId)?.name ?? s.agentId,
      cwd: s.cwd,
      gitBranch: s.gitBranch,
      startedAt: s.startedAt,
      lastActivityAt: s.lastActivityAt,
      endedAt: s.endedAt,
      tokens,
      events: log?.events ?? [],
      truncated: log?.truncated ?? false,
    };
  }

  /** Sessions with any activity in [from, to). */
  private sessionsActiveIn(from: number, to: number): SessionState[] {
    const h0 = Math.floor(from / HOUR), h1 = Math.ceil(to / HOUR);
    const out: SessionState[] = [];
    for (const s of this.sessions.values()) {
      const hours = this.activeHours.get(s.sessionId);
      if (!hours) continue;
      for (const h of hours) {
        if (h >= h0 && h < h1) {
          out.push(s);
          break;
        }
      }
    }
    return out;
  }

  report(period: Period): Report {
    const to = this.clock();
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const from = startOfDay(to) - (days - 1) * DAY;
    const pricing = this.config.pricing;
    const empty = (): ReportRow => ({ sessions: 0, success: 0, tokens: 0, cost: 0, blocks: 0 });
    const addCost = (row: { cost: number | null }, u: Usage) => {
      const p = findPrice(pricing, u.model);
      row.cost = p && row.cost !== null ? row.cost + usageCost(u, p) : null;
    };

    const byAgent = new Map<string, ReportRow>();
    const rowFor = (id: string) => {
      let r = byAgent.get(id);
      if (!r) byAgent.set(id, (r = empty()));
      return r;
    };
    for (const u of this.usage) {
      if (u.ts < from || u.ts > to) continue;
      const r = rowFor(u.agentId);
      r.tokens += usageTokens(u);
      addCost(r, u);
    }
    for (const s of this.sessionsActiveIn(from, to + 1)) {
      const r = rowFor(s.agentId);
      r.sessions++;
      if (!s.hadUnresolvedError) r.success++;
    }
    for (const b of this.blockLog) if (b.ts >= from && b.ts <= to) rowFor(b.agentId).blocks++;

    const agents = [...byAgent.entries()].map(([agentId, r]) => {
      const a = this.agentById(agentId);
      return { agentId, name: a?.name ?? agentId, dept: a?.dept ?? 'tamu', ...r };
    });
    const sum = (rows: ReportRow[]): ReportRow => rows.reduce((t, r) => ({
      sessions: t.sessions + r.sessions,
      success: t.success + r.success,
      tokens: t.tokens + r.tokens,
      cost: t.cost === null || r.cost === null ? null : t.cost + r.cost,
      blocks: t.blocks + r.blocks,
    }), empty());
    const totals = sum(agents);
    const departments = this.config.departments
      .map((d) => ({ id: d.id, label: d.label, ...sum(agents.filter((a) => a.dept === d.id)) }))
      .filter((d) => d.sessions > 0 || d.tokens > 0 || d.blocks > 0);

    const bucketUnit = period === 'day' ? 'hour' : period === 'week' ? 'day' : 'week';
    const step = bucketUnit === 'hour' ? HOUR : bucketUnit === 'day' ? DAY : 7 * DAY;
    const count = period === 'day' ? 24 : period === 'week' ? 7 : Math.ceil(30 / 7);
    const end = from + days * DAY;
    const buckets = Array.from({ length: count }, (_, i) => {
      const start = from + i * step;
      return { start, end: Math.min(end, start + step), sessions: 0, tokens: 0, cost: 0 as number | null };
    });
    for (const u of this.usage) {
      if (u.ts < from || u.ts > to) continue;
      const b = buckets[Math.floor((u.ts - from) / step)];
      if (!b) continue;
      b.tokens += usageTokens(u);
      addCost(b, u);
    }
    for (const b of buckets) b.sessions = this.sessionsActiveIn(b.start, b.end).length;

    return {
      period, from, to, estimate: true,
      totals: { ...totals, successRate: totals.sessions ? totals.success / totals.sessions : null },
      agents, departments, bucketUnit, buckets,
    };
  }

  // ---- internals ----------------------------------------------------------

  private session(ev: NormalizedEvent): SessionState {
    let s = this.sessions.get(ev.sessionId);
    if (!s) {
      s = newSession(ev.sessionId, '', ev.ts);
      this.sessions.set(ev.sessionId, s);
      this.assign(s, ev.ctx ?? {});
    } else if (ev.ctx?.env && s.agentId.startsWith('tamu-')) {
      // A hook can carry V_OFF_AGENT after a transcript created the session as a guest.
      this.assign(s, ev.ctx);
      this.pruneGuests();
    }
    return s;
  }

  private assign(s: SessionState, ctx: SessionContext): void {
    const full: SessionContext = { cwd: s.cwd, gitBranch: s.gitBranch, ...stripUndefined(ctx) };
    const agent = matchAgent(this.config.agents, full);
    if (agent) {
      s.agentId = agent.id;
      return;
    }
    // SPEC §7: unmatched sessions become "Agent tanpa nama" guests.
    const id = `tamu-${s.sessionId.slice(0, 8)}`;
    if (!this.guests.has(id)) {
      this.guests.set(id, {
        id, name: 'Agent tanpa nama', role: 'Tamu', short: 'Tamu', dept: 'tamu', animal: 'dog',
        shirt: '#8a90a0', tool: 'Claude Code', match: [],
      });
    }
    s.agentId = id;
  }

  /** Usage not yet counted: for keyed transcript messages, only the growth past what was seen. */
  private countableUsage(ev: NormalizedEvent): Usage | null {
    if (!ev.usage) return null;
    if (!ev.usageKey || !ev.usageTotal) return ev.usage;
    const key = `${ev.sessionId}|${ev.usageKey}`;
    const prev = this.usageByMessage.get(key);
    const cur = ev.usageTotal;
    const d: Usage = {
      input: Math.max(0, cur.input - (prev?.input ?? 0)),
      output: Math.max(0, cur.output - (prev?.output ?? 0)),
      cacheRead: Math.max(0, cur.cacheRead - (prev?.cacheRead ?? 0)),
      cacheWrite: Math.max(0, cur.cacheWrite - (prev?.cacheWrite ?? 0)),
      model: cur.model,
    };
    this.usageByMessage.set(key, {
      input: Math.max(cur.input, prev?.input ?? 0),
      output: Math.max(cur.output, prev?.output ?? 0),
      cacheRead: Math.max(cur.cacheRead, prev?.cacheRead ?? 0),
      cacheWrite: Math.max(cur.cacheWrite, prev?.cacheWrite ?? 0),
      model: cur.model,
    });
    return d.input + d.output + d.cacheRead + d.cacheWrite > 0 ? d : null;
  }

  /** Drop guest agents that no longer own any session (after re-matching). */
  private pruneGuests(): void {
    const owners = new Set([...this.sessions.values()].map((s) => s.agentId));
    for (const id of this.guests.keys()) if (!owners.has(id)) this.guests.delete(id);
  }

  private flagsFor(agentId: string): AgentFlagsState {
    let f = this.flags.get(agentId);
    if (!f) this.flags.set(agentId, (f = {}));
    return f;
  }

  /** Most relevant session: open sessions first, then the most recently active. */
  private currentSession(agentId: string): SessionState | undefined {
    let best: SessionState | undefined;
    const score = (s: SessionState) => (s.endedAt === undefined ? 1e15 : 0) + Math.max(s.lastActivityAt, s.lastStopAt ?? 0);
    for (const s of this.sessions.values()) {
      if (s.agentId === agentId && (!best || score(s) > score(best))) best = s;
    }
    return best;
  }

  private runtime(agent: Agent): AgentRuntime {
    const now = this.clock();
    const s = this.currentSession(agent.id);
    const flags = this.flags.get(agent.id);
    const status = computeStatus(s, {
      walker: agent.walker,
      manualIdle: flags?.manualIdleAt !== undefined,
      external: flags?.external,
    }, now, this.config.rules);

    const dayStart = startOfDay(now);
    let tokensToday = 0;
    let costToday: number | null = 0;
    let anyUsage = false;
    for (const u of this.usage) {
      if (u.agentId !== agent.id || u.ts < dayStart) continue;
      anyUsage = true;
      tokensToday += usageTokens(u);
      const p = findPrice(this.config.pricing, u.model);
      costToday = p && costToday !== null ? costToday + usageCost(u, p) : null;
    }

    const ext = flags?.external;
    const extWins = ext && (!s || ext.at >= s.lastActivityAt);
    let block: AgentRuntime['block'];
    if (status === 'macet') {
      if (s?.block && !extWins) block = { reason: s.block.reason, hint: s.block.hint, at: s.block.at };
      else if (ext) block = { reason: ext.task ?? 'Terblokir', hint: ext.detail ?? 'Status dikirim lewat webhook.', at: ext.at };
    }

    return {
      status,
      sessionId: s?.sessionId,
      cwd: s?.cwd,
      repo: s?.cwd ? path.basename(s.cwd) : undefined,
      gitBranch: s?.gitBranch,
      block,
      lastAction: extWins ? ext?.task ?? ext?.detail ?? s?.lastAction : s?.lastAction,
      lastActivityAt: s?.lastActivityAt,
      sessionStartedAt: s?.startedAt,
      manualIdle: flags?.manualIdleAt !== undefined,
      tokensToday,
      costToday: anyUsage ? costToday : 0,
    };
  }

  private refresh(agentId: string, notify: boolean, force: boolean): void {
    const agent = this.agentById(agentId);
    if (!agent) return;
    const view = this.agentView(agent);
    const changed = this.lastStatus.get(agentId) !== view.runtime.status;
    this.lastStatus.set(agentId, view.runtime.status);
    if (notify && (changed || force)) this.emit('agent-updated', view);
  }

  private refreshAll(notify: boolean, force: boolean): void {
    for (const a of this.agents()) this.refresh(a.id, notify, force);
  }

  private pushFeed(ev: AgentEvent, notify: boolean): void {
    this.feed.push(ev);
    if (this.feed.length > FEED_LIMIT) this.feed.splice(0, this.feed.length - FEED_LIMIT);
    if (ev.sessionId) {
      let log = this.sessionLogs.get(ev.sessionId);
      if (!log) {
        log = { events: [], truncated: false };
        this.sessionLogs.set(ev.sessionId, log);
        if (this.sessionLogs.size > SESSION_LOGS_KEPT) this.sessionLogs.delete(this.sessionLogs.keys().next().value!);
      }
      log.events.push(ev);
      if (log.events.length > SESSION_LOG_LIMIT) {
        log.events.splice(0, log.events.length - SESSION_LOG_LIMIT);
        log.truncated = true;
      }
    }
    if (notify) this.emit('event-added', ev);
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
