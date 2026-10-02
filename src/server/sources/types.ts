import type { EventKind, EventSource, Usage } from '../../shared/types.js';
import type { BlockMatch } from '../summarize.js';

/** What each normalized event means for the session's status (SPEC §6). */
export type Signal =
  | 'start'          // session started
  | 'end'            // session ended
  | 'prompt'         // user sent a prompt
  | 'tool-pre'       // tool call started (hook)
  | 'tool-post'      // tool call finished (hook)
  | 'activity'       // tool call or message seen in a transcript (no start/finish pairing)
  | 'error'          // tool or API failure
  | 'notify'         // agent asks for permission or input
  | 'stop'           // main agent finished its turn, waiting for the user
  | 'subagent-stop'  // a subagent finished
  | 'usage';         // token usage only, not shown in the feed

export interface SessionContext {
  cwd?: string;
  gitBranch?: string;
  env?: Record<string, string>;
  sessionName?: string;
}

export interface NormalizedEvent {
  ts: number;
  sessionId: string;
  source: EventSource;
  /** How the event arrived. Hooks win over transcripts for the same session. */
  channel: 'hook' | 'transcript' | 'webhook';
  signal: Signal;
  /** Present when the event belongs in the activity feed. */
  kind?: EventKind;
  detail?: string;
  usage?: Usage;
  /**
   * Message id for transcript usage plus its cumulative total. The store
   * counts each message once even when a transcript is read again.
   */
  usageKey?: string;
  usageTotal?: Usage;
  /** Set on 'error' / 'notify' when the event should block the agent. */
  block?: BlockMatch;
  /** The tool call starts or stops a subagent. */
  subagent?: boolean;
  /** The event closes a tool call that a 'tool-pre' opened. */
  endsTool?: boolean;
  ctx?: SessionContext;
}

export interface Sink {
  /** historic = replayed at startup; updates state without pushing live notifications. */
  ingest(events: NormalizedEvent[], opts?: { historic?: boolean }): void;
}

export interface SourceAdapter {
  readonly name: string;
  start(sink: Sink): Promise<void>;
  stop(): void;
}
