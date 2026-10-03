import type { Block, Status, StatusRules } from '../shared/types.js';
import type { RoleHint, RoleKey } from './roleGuess.js';
import type { NormalizedEvent } from './sources/types.js';

/** Per-session facts the status rules work on (SPEC §6). */
export interface SessionState {
  sessionId: string;
  agentId: string;
  startedAt: number;
  /** Last tool call, message, or prompt. Stop/notify do not count as activity. */
  lastActivityAt: number;
  /** Last Stop (main agent waiting for a prompt). */
  lastStopAt?: number;
  endedAt?: number;
  toolsInFlight: number;
  subagentsActive: number;
  lastSubagentAt?: number;
  block?: Block;
  /** Hooks deliver this session; transcript events become usage-only to avoid duplicates. */
  hookSeenAt?: number;
  lastAction?: string;
  cwd?: string;
  gitBranch?: string;
  /** Number of transitions into a blocked state (report: "hambatan"). */
  blockCount: number;
  hadUnresolvedError: boolean;
  /** Newest event time ingested; replays of older events are skipped. */
  maxTs: number;
  /** Tool calls in flight by tool_use_id, and ids whose end arrived before their start. */
  openTools: Set<string>;
  earlyEnds: Set<string>;
  /** Role classification (roleGuess.ts): evidence points, the last explicitly named role, and how it was mapped. */
  roleScores?: Map<RoleKey, number>;
  roleExplicit?: RoleHint['explicit'];
  autoRole?: 'explicit' | 'evidence' | 'fallback';
  /** "Tandai sudah ditangani" time: no guessed wait again until new activity. */
  waitHandledAt?: number;
  /** The session touched code; picks the fallback role while there is no evidence. */
  codeTouched?: boolean;
}

export function newSession(sessionId: string, agentId: string, ts: number): SessionState {
  return {
    sessionId, agentId, startedAt: ts, lastActivityAt: ts,
    toolsInFlight: 0, subagentsActive: 0, blockCount: 0, hadUnresolvedError: false, maxTs: 0,
    openTools: new Set(), earlyEnds: new Set(),
  };
}

/** Start a tool call. Returns false when its end already arrived (out-of-order async hooks). */
function openTool(s: SessionState, id: string | undefined): boolean {
  if (!id) {
    s.toolsInFlight++;
    return true;
  }
  if (s.earlyEnds.delete(id)) return false;
  if (!s.openTools.has(id)) {
    s.openTools.add(id);
    s.toolsInFlight++;
  }
  return true;
}

/** End a tool call; remembers ends that arrive before their start. */
function closeTool(s: SessionState, id: string | undefined): void {
  if (!id) {
    s.toolsInFlight = Math.max(0, s.toolsInFlight - 1);
    return;
  }
  if (s.openTools.delete(id)) {
    s.toolsInFlight = Math.max(0, s.toolsInFlight - 1);
    return;
  }
  s.earlyEnds.add(id);
  if (s.earlyEnds.size > 200) s.earlyEnds.delete(s.earlyEnds.values().next().value!);
}

function resetTools(s: SessionState): void {
  s.toolsInFlight = 0;
  s.subagentsActive = 0;
  s.openTools.clear();
}

function setBlock(s: SessionState, block: Block): void {
  if (!s.block) s.blockCount++;
  s.block = block;
}

/** Apply one normalized event to the session. Mutates and returns the session. */
export function applyEvent(s: SessionState, ev: NormalizedEvent): SessionState {
  const ts = ev.ts;
  if (ev.ctx?.cwd) s.cwd = ev.ctx.cwd;
  if (ev.ctx?.gitBranch) s.gitBranch = ev.ctx.gitBranch;
  if (ev.kind && ev.detail) s.lastAction = ev.detail;
  const touch = () => {
    s.lastActivityAt = Math.max(s.lastActivityAt, ts);
    s.endedAt = undefined;
  };

  switch (ev.signal) {
    case 'start':
      touch();
      break;
    case 'end':
      s.endedAt = ts;
      resetTools(s);
      break;
    case 'prompt':
      // The user answered: whatever blocked the agent is handled.
      touch();
      s.lastStopAt = undefined;
      s.block = undefined;
      s.hadUnresolvedError = false;
      break;
    case 'tool-pre':
      touch();
      if (!openTool(s, ev.toolId)) break;
      if (ev.subagent) {
        s.subagentsActive++;
        s.lastSubagentAt = ts;
      }
      // A tool running means a pending permission request was answered.
      if (s.block?.kind === 'notify') s.block = undefined;
      break;
    case 'tool-post':
      touch();
      closeTool(s, ev.toolId);
      if (ev.subagent) {
        s.subagentsActive = Math.max(0, s.subagentsActive - 1);
        s.lastSubagentAt = ts;
      }
      if (s.block?.kind === 'notify') s.block = undefined;
      break;
    case 'activity':
      touch();
      break;
    case 'error':
      touch();
      if (ev.endsTool) closeTool(s, ev.toolId);
      if (ev.subagent) s.subagentsActive = Math.max(0, s.subagentsActive - 1);
      if (ev.block) {
        setBlock(s, { kind: 'error', reason: ev.block.reason, hint: ev.block.hint, at: ts });
        s.hadUnresolvedError = true;
      }
      break;
    case 'notify':
      if (ev.block) setBlock(s, { kind: 'notify', reason: ev.block.reason, hint: ev.block.hint, at: ts });
      break;
    case 'stop':
      s.lastStopAt = ts;
      resetTools(s);
      break;
    case 'subagent-stop':
      touch();
      s.subagentsActive = Math.max(0, s.subagentsActive - 1);
      s.lastSubagentAt = ts;
      break;
    case 'usage':
      break;
  }
  return s;
}

export interface AgentFlags {
  walker?: boolean;
  /** "Istirahat & main" override. */
  manualIdle?: boolean;
  /** Status pushed through the generic webhook (POST /api/status). */
  external?: { status: Status; at: number };
}

/** Derive an agent's status from its most recent session. Pure; order follows SPEC §6. */
export function computeStatus(
  s: SessionState | undefined,
  flags: AgentFlags,
  now: number,
  rules: StatusRules,
): Status {
  if (flags.walker) return 'bersih';
  if (flags.manualIdle) return 'idle';
  if (flags.external && (!s || flags.external.at >= s.lastActivityAt)) return flags.external.status;
  if (!s || s.endedAt !== undefined) return 'idle';
  if (s.block) return 'macet';

  const workMs = rules.workWindowSec * 1000;
  const idleMs = rules.idleAfterSec * 1000;
  const lastSeen = Math.max(s.lastActivityAt, s.lastStopAt ?? 0);
  if (now - lastSeen >= idleMs) return 'idle';

  const waiting = s.lastStopAt !== undefined && s.lastStopAt >= s.lastActivityAt;
  if (waiting) return 'simak';
  if (s.subagentsActive > 0) return 'bicara';
  if (s.lastSubagentAt !== undefined && now - s.lastSubagentAt <= workMs) return 'bicara';
  if (s.toolsInFlight > 0 || now - s.lastActivityAt <= workMs) return 'kerja';
  return 'simak';
}
