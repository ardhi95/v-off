import { EventEmitter } from 'node:events';
import path from 'node:path';
import type {
  Agent, AgentEvent, AgentRuntime, AgentWithRuntime, BlockRecord, CleanerState, Config, LimitState, ModelPrice, Period, Report, ReportRow,
  SessionSummary, StateSnapshot, Status, Usage,
} from '../shared/types.js';
import { clip } from './summarize.js';
import { matchAgent } from './matcher.js';
import { agentForRole, closestRole, fallbackAgent, roleFromText, type RoleHint, type RoleKey } from './roleGuess.js';
import type { NormalizedEvent, SessionContext, Sink } from './sources/types.js';
import { applyEvent, computeStatus, newSession, type SessionState } from './status.js';

const FEED_LIMIT = 500;
const SNAPSHOT_EVENTS = 50;
const USAGE_RETENTION_MS = 31 * 24 * 3600_000;
export const SESSION_LOG_LIMIT = 300;
const SESSION_LOGS_KEPT = 200;
/** Transcript-only sessions: a tool still open after this long probably waits for approval. */
export const PENDING_TOOL_MS = 90_000;
/** Guessed (auto) waits older than this are dropped: the session was left, not waiting. */
export const AUTO_BLOCK_STALE_MS = 30 * 60_000;
/** Office stays off this long when a limit message names no reset time (Claude's session window). */
export const LIMIT_FALLBACK_MS = 5 * 3600_000;

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
  /** Transcript history (re)loaded in the background. Clients reload /api/state. */
  'state-reloaded': [];
  /** Office went off (usage limit) or back on (null). */
  'limit-updated': [LimitState | null];
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
  private oldestUsageTs = Infinity;
  private blockLog: BlockRecord[] = [];
  /** Sessions whose blocks came from persisted history; replayed transcripts must not count them twice. */
  private persistedBlockSessions = new Set<string>();
  /** Per-session newest event time when a source restart began (see beginReplay). */
  private replayMarks: Map<string, number> | undefined;
  /** Cumulative usage per transcript message, so re-reading a transcript never double counts. */
  private usageByMessage = new Map<string, Usage>();
  /** Hours (ms / 3600000) in which each session had activity. */
  private activeHours = new Map<string, Set<number>>();
  private lastStatus = new Map<string, Status>();
  private cleaner: CleanerState = { mode: 'dry-run', items: [], totalBytes: 0, lastScanAt: null };
  private limit: LimitState | null = null;
  /**
   * Limit messages at or before this time are stale: the API answered later, or
   * the office was reopened. Guards against replays and out-of-order transcripts.
   */
  private limitFloor = 0;

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
      if (!this.agentById(s.agentId) || s.agentId.startsWith('tamu-') || s.autoRole) {
        const before = s.agentId;
        this.assign(s, {});
        this.autoMap(s);
        if (s.agentId !== before) this.moveSession(s, before, s.agentId, false);
      }
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

  /**
   * Call before a data source re-reads transcripts it already delivered
   * (restart after a settings change). Older replayed events are skipped
   * until endReplay(); token usage is deduplicated separately per message.
   */
  beginReplay(): void {
    this.replayMarks = new Map([...this.sessions.values()].map((s) => [s.sessionId, s.maxTs]));
  }

  endReplay(): void {
    this.replayMarks = undefined;
  }

  /** History finished loading: refresh statuses and tell clients to reload. */
  announceReload(): void {
    this.refreshAll(false, true);
    this.emit('state-reloaded');
  }

  ingest(events: NormalizedEvent[], opts: { historic?: boolean } = {}): void {
    const touched = new Set<string>();
    for (const ev of events) {
      const s = this.session(ev);
      if (ev.channel === 'hook') s.hookSeenAt = ev.ts;
      // Before the hook/transcript dedupe: the limit text often only reaches the transcript.
      this.trackLimit(ev, s, !!opts.historic);
      // Hooks already report this session live; transcripts only add token usage.
      if (ev.channel === 'transcript' && s.hookSeenAt !== undefined && ev.signal !== 'usage') continue;
      // A source restarted (Pengaturan changed) re-reads transcripts: skip what was already applied.
      const mark = this.replayMarks?.get(s.sessionId);
      if (opts.historic && mark !== undefined && ev.ts <= mark && ev.signal !== 'usage') continue;
      if (ev.signal !== 'usage') s.maxTs = Math.max(s.maxTs, ev.ts);
      if (ev.roleHint) this.applyRoleHint(s, ev.roleHint, !opts.historic);

      const hadBlock = !!s.block;
      applyEvent(s, ev);
      if (ev.channel === 'transcript' && ev.signal === 'notify' && s.block) s.block.auto = true;
      if (!hadBlock && s.block) this.recordBlock({ ts: ev.ts, agentId: s.agentId, sessionId: s.sessionId }, !!opts.historic);
      let hours = this.activeHours.get(s.sessionId);
      if (!hours) this.activeHours.set(s.sessionId, (hours = new Set()));
      hours.add(Math.floor(ev.ts / HOUR));

      const flags = this.flags.get(s.agentId);
      if (flags?.manualIdleAt !== undefined && ev.signal !== 'usage' && ev.ts > flags.manualIdleAt) {
        flags.manualIdleAt = undefined; // new activity ends the manual break
      }
      const usage = this.countableUsage(ev);
      if (usage) {
        this.usage.push({ ...usage, ts: ev.ts, agentId: s.agentId, sessionId: s.sessionId });
        this.oldestUsageTs = Math.min(this.oldestUsageTs, ev.ts);
      }
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
      s.waitHandledAt = now;
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

  /** Office state: non-null while the usage limit keeps everyone asleep. */
  limitState(): LimitState | null {
    return this.limit;
  }

  /** "Buka kantor": reopen the office before the limit resets. */
  clearLimit(): boolean {
    if (!this.limit) return false;
    this.endLimit(this.clock(), 'Kantor dibuka manual', true);
    return true;
  }

  private trackLimit(ev: NormalizedEvent, s: SessionState, historic: boolean): void {
    if (ev.limit) {
      const until = ev.limit.resetsAt ?? ev.ts + LIMIT_FALLBACK_MS;
      if (ev.ts <= this.limitFloor || until <= this.clock()) return;
      if (this.limit && this.limit.since >= ev.ts) return;
      this.limit = {
        since: ev.ts, resetsAt: ev.limit.resetsAt, until,
        reason: ev.detail ?? 'Batas pemakaian tercapai', agentId: s.agentId,
      };
      if (!historic) this.emit('limit-updated', this.limit);
      return;
    }
    // A model reply (tool call, tokens) after the limit proves the quota is back.
    const apiAnswered = ev.signal === 'tool-pre' || ev.signal === 'usage' || ev.signal === 'subagent-stop';
    if (!ev.limitEnd && !apiAnswered) return;
    this.limitFloor = Math.max(this.limitFloor, ev.ts);
    if (this.limit && ev.ts > this.limit.since) {
      this.endLimit(ev.ts, ev.limitEnd ? 'Kuota pulih, sesi dilanjutkan' : 'Limit pulih, agent kembali bekerja', !historic);
    }
  }

  private endLimit(ts: number, why: string, notify: boolean): void {
    const agentId = this.limit?.agentId ?? '';
    this.limit = null;
    this.limitFloor = Math.max(this.limitFloor, ts);
    if (!notify) return;
    this.pushFeed({ ts, agentId, sessionId: '', source: 'webhook', kind: 'message', detail: `Kantor buka lagi: ${why}` }, true);
    this.emit('limit-updated', null);
  }

  /** Re-evaluate time-based transitions (kerja → simak → idle). Call periodically. */
  tick(): void {
    if (this.limit && this.clock() >= this.limit.until) this.endLimit(this.limit.until, 'waktu reset limit tercapai', true);
    const cutoff = this.clock() - USAGE_RETENTION_MS;
    // Replayed usage arrives out of time order, so track the oldest record instead of trusting usage[0].
    if (this.oldestUsageTs < cutoff) {
      this.usage = this.usage.filter((u) => u.ts >= cutoff);
      this.oldestUsageTs = this.usage.reduce((m, u) => Math.min(m, u.ts), Infinity);
    }
    for (const s of this.sessions.values()) this.guessWait(s);
    this.refreshAll(true, false);
  }

  /**
   * Sessions without hooks never report permission prompts. Like virtual-agents-office, a tool
   * call that stays open with a silent transcript is shown as a likely wait for approval. It is
   * not counted as a block in reports (a long build looks the same), and every guessed wait is
   * dropped once the session has been quiet for 30 minutes.
   */
  private guessWait(s: SessionState): void {
    if (s.hookSeenAt !== undefined || s.endedAt !== undefined) return;
    const quiet = this.clock() - s.lastActivityAt;
    if (s.block?.auto && quiet >= AUTO_BLOCK_STALE_MS) {
      s.block = undefined;
      return;
    }
    if (s.block || quiet < PENDING_TOOL_MS || quiet >= AUTO_BLOCK_STALE_MS) return;
    const stopped = s.lastStopAt !== undefined && s.lastStopAt >= s.lastActivityAt;
    const handled = s.waitHandledAt !== undefined && s.waitHandledAt >= s.lastActivityAt;
    if (stopped || handled || s.toolsInFlight === 0 || s.subagentsActive > 0) return;
    s.block = {
      kind: 'notify', auto: true, at: s.lastActivityAt + PENDING_TOOL_MS,
      reason: 'Mungkin menunggu izin',
      hint: `${s.lastAction ? `"${s.lastAction}" belum` : 'Tool belum'} selesai lebih dari 90 detik. Setujui di terminal sesi jika diminta, atau tunggu jika perintahnya memang lama.`,
    };
  }

  // ---- read ---------------------------------------------------------------

  agents(): Agent[] {
    return [...this.config.agents, ...this.guests.values()];
  }

  /**
   * The roster is a catalog: an agent shows in the office only while a session (last 30 days)
   * is classified into it or a webhook reports its status. The office boy always walks.
   */
  isVisible(agent: Agent): boolean {
    if (agent.walker || this.guests.has(agent.id) || this.flags.get(agent.id)?.external) return true;
    for (const s of this.sessions.values()) if (s.agentId === agent.id) return true;
    return false;
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
      agents: this.agents().filter((a) => this.isVisible(a)).map((a) => this.agentView(a)),
      departments: this.config.departments,
      events: this.feed.slice(-SNAPSHOT_EVENTS).reverse(),
      cleaner: this.cleaner,
      ambience: this.config.ambience,
      limit: this.limit,
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
    } else if (ev.ctx?.env && (s.agentId.startsWith('tamu-') || s.autoRole)) {
      // A hook can carry V_OFF_AGENT after a transcript created the session as a guest.
      const before = s.agentId;
      this.assign(s, ev.ctx);
      this.autoMap(s);
      if (s.agentId !== before) this.moveSession(s, before, s.agentId, false);
    }
    return s;
  }

  private assign(s: SessionState, ctx: SessionContext): void {
    const full: SessionContext = { cwd: s.cwd, gitBranch: s.gitBranch, ...stripUndefined(ctx) };
    const agent = matchAgent(this.config.agents, full);
    if (agent) {
      s.agentId = agent.id;
      s.autoRole = undefined;
      return;
    }
    // Unmatched sessions take the closest role in the roster (roleGuess.ts). Only an
    // office without any working agent still gets an "Agent tanpa nama" guest.
    const id = `tamu-${s.sessionId.slice(0, 8)}`;
    s.agentId = id;
    this.autoMap(s);
    if (s.agentId !== id) return;
    if (!this.guests.has(id)) {
      this.guests.set(id, {
        id, name: 'Agent tanpa nama', role: 'Tamu', short: 'Tamu', dept: 'tamu', animal: 'dog',
        shirt: '#8a90a0', tool: 'Claude Code', match: [],
      });
    }
    s.agentId = id;
  }

  /** Collect a role hint for a session not claimed by a match rule and re-classify it. */
  private applyRoleHint(s: SessionState, hint: RoleHint, notify: boolean): void {
    if (!s.agentId.startsWith('tamu-') && !s.autoRole) return; // a match rule chose this agent
    if (hint.explicit) s.roleExplicit = hint.explicit;
    if (hint.code) s.codeTouched = true;
    if (hint.evidence) {
      s.roleScores ??= new Map();
      for (const r of hint.evidence) s.roleScores.set(r, (s.roleScores.get(r) ?? 0) + 1);
    }
    const before = s.agentId;
    this.autoMap(s);
    if (s.agentId !== before) this.moveSession(s, before, s.agentId, notify);
  }

  /**
   * Classify a session into the closest role in the roster: an explicitly named role first,
   * then the highest evidence score, then the fallback (Tech Lead for code, PM otherwise).
   */
  private autoMap(s: SessionState): void {
    if (!s.agentId.startsWith('tamu-') && !s.autoRole) return;
    // Agents switched off in Pengaturan ("Tampil") are not offered as roles.
    const agents = this.config.agents.filter((a) => !a.walker && !a.hidden);
    const ex = s.roleExplicit;
    let agent = ex?.agentId ? agents.find((a) => a.id === ex.agentId) : ex?.role ? agentForRole(agents, ex.role) : undefined;
    let how: SessionState['autoRole'] = 'explicit';
    if (!agent && s.roleScores?.size) {
      const available = new Set(agents.map((a) => roleFromText(a.role)).filter((r): r is RoleKey => !!r));
      const current = s.autoRole === 'evidence' ? roleFromText(this.agentById(s.agentId)?.role ?? '') : undefined;
      const role = closestRole(s.roleScores, available, current);
      agent = role ? agentForRole(agents, role) : undefined;
      how = 'evidence';
    }
    if (!agent) {
      agent = fallbackAgent(agents, !!s.codeTouched);
      how = 'fallback';
    }
    if (!agent) return;
    s.autoRole = how;
    s.agentId = agent.id;
  }

  /** A session changed agent: its tokens, blocks and feed move with it, and orphaned guests go. */
  private moveSession(s: SessionState, from: string, to: string, notify: boolean): void {
    for (const u of this.usage) if (u.sessionId === s.sessionId) u.agentId = to;
    for (const b of this.blockLog) if (b.sessionId === s.sessionId) b.agentId = to;
    for (const e of this.feed) if (e.sessionId === s.sessionId) e.agentId = to;
    this.pruneGuests();
    this.lastStatus.delete(from);
    // The guest desk disappeared: clients reload /api/state.
    if (notify) this.emit('state-reloaded');
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
    if (!agent || !this.isVisible(agent)) return;
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
