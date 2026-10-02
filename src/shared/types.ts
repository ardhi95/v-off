// Data model shared by the server and (later) the web UI. See docs/SPEC.md §4.

export type Status = 'kerja' | 'macet' | 'bicara' | 'simak' | 'idle' | 'bersih';

export const STATUS_LABELS: Record<Status, string> = {
  kerja: 'Bekerja',
  macet: 'Terblokir',
  bicara: 'Memimpin rapat',
  simak: 'Menyimak',
  idle: 'Istirahat',
  bersih: 'Bersih-bersih',
};

export type Species =
  | 'lion' | 'owl' | 'rabbit' | 'cat' | 'fox' | 'bear' | 'panda' | 'koala' | 'hamster'
  | 'frog' | 'penguin' | 'dog' | 'raccoon' | 'monkey' | 'elephant' | 'wolf' | 'beaver' | 'sheep';

export type MatchRule =
  | { cwdGlob: string }
  | { gitBranch: string }
  | { env: string }
  | { sessionName: string };

export type Seat =
  | { pod: string; side: 'b' | 'f' | 'e'; offset: number }
  | { room: 'ceo' | 'cto' };

export interface Accessories {
  tie?: boolean;
  glasses?: boolean;
  phones?: string;
  beret?: boolean;
  cap?: string;
  hood?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  short: string;
  dept: string;
  animal: Species;
  shirt: string;
  pants?: string;
  shoe?: string;
  accessories?: Accessories;
  /** Walkers (office boy) have no fixed seat. */
  seat?: Seat;
  tool: string;
  match: MatchRule[];
  quips?: string[];
  walker?: boolean;
  hidden?: boolean;
}

export interface Department {
  id: string;
  label: string;
  color: string;
  rug?: string;
  /** Leadership rooms and roaming staff have no shared desk. */
  desk?: { x: number; z: number; w: number; d: number; divider: boolean };
}

export type EventSource = 'claude-code' | 'codex' | 'gemini' | 'webhook';

export type EventKind =
  | 'read' | 'edit' | 'run' | 'search' | 'error' | 'message' | 'stop' | 'notify' | 'prompt';

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  model?: string;
}

export interface AgentEvent {
  ts: number;
  agentId: string;
  sessionId: string;
  source: EventSource;
  kind: EventKind;
  /** Short summary: file path, command, or error message (max 160 chars). */
  detail: string;
  usage?: Usage;
}

export interface Block {
  /** 'notify' = waiting for permission/input, 'error' = failure pattern, 'external' = webhook. */
  kind: 'notify' | 'error' | 'external';
  reason: string;
  hint: string;
  at: number;
}

/** Live, derived state of an agent. Never persisted to config. */
export interface AgentRuntime {
  status: Status;
  sessionId?: string;
  repo?: string;
  cwd?: string;
  gitBranch?: string;
  block?: { reason: string; hint: string; at: number };
  lastAction?: string;
  lastActivityAt?: number;
  sessionStartedAt?: number;
  manualIdle: boolean;
  tokensToday: number;
  /** Estimated cost in USD, or null when no price is configured for the model. */
  costToday: number | null;
}

export type AgentWithRuntime = Agent & { guest?: boolean; runtime: AgentRuntime };

export interface ModelPrice {
  /** USD per 1 million tokens. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface SourceSettings {
  enabled: boolean;
  path?: string;
}

export interface StatusRules {
  /** Activity within this window counts as working. */
  workWindowSec: number;
  /** No activity for this long means idle (break). */
  idleAfterSec: number;
}

export interface Config {
  version: 1;
  agents: Agent[];
  departments: Department[];
  pricing: Record<string, ModelPrice>;
  sources: {
    claudeCode: SourceSettings;
    codex: SourceSettings;
    gemini: SourceSettings;
    webhook: SourceSettings;
  };
  rules: StatusRules;
  ambience: { socialEvents: boolean; animations: boolean; blockedSound: boolean };
}

export interface CleanerState {
  mode: 'dry-run';
  items: { path: string; label: string; bytes: number }[];
  totalBytes: number;
  lastScanAt: number | null;
}

export interface StateSnapshot {
  agents: AgentWithRuntime[];
  departments: Department[];
  events: AgentEvent[];
  cleaner: CleanerState;
}
