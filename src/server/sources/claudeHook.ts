import { clip, isSubagentTool, matchBlock, notifyBlock, summarizeTool, toolKind } from '../summarize.js';
import type { NormalizedEvent, SessionContext } from './types.js';

// Claude Code hook payloads arrive on stdin of the hook command as JSON and are
// forwarded to POST /api/hook. Common fields: session_id, transcript_path, cwd,
// hook_event_name. Event-specific fields: tool_name, tool_input, tool_response,
// message, notification_type, source, reason, error.

type Payload = Record<string, unknown>;

function s(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function responseText(resp: unknown): string {
  if (typeof resp === 'string') return resp;
  if (!resp || typeof resp !== 'object') return '';
  const r = resp as Record<string, unknown>;
  return [r.error, r.stderr, r.stdout, r.content, r.message].filter((x) => typeof x === 'string').join('\n');
}

function responseIsError(resp: unknown): boolean {
  if (!resp || typeof resp !== 'object') return false;
  const r = resp as Record<string, unknown>;
  return r.is_error === true || r.isError === true || r.success === false || r.interrupted === true;
}

/**
 * Normalize one hook payload. `env` carries variables the hook command forwards
 * (e.g. V_OFF_AGENT) so they can be used for agent matching.
 */
export function parseHookPayload(payload: unknown, now: number, env?: Record<string, string>): NormalizedEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Payload;
  const sessionId = s(p.session_id);
  const name = s(p.hook_event_name);
  if (!sessionId || !name) return [];

  const ctx: SessionContext = { cwd: s(p.cwd), env };
  const base = { ts: now, sessionId, source: 'claude-code' as const, channel: 'hook' as const, ctx };
  const tool = s(p.tool_name) ?? '';

  switch (name) {
    case 'SessionStart':
      return [{ ...base, signal: 'start', kind: 'message', detail: `Sesi dimulai (${s(p.source) ?? 'startup'})` }];
    case 'SessionEnd':
      return [{ ...base, signal: 'end', kind: 'stop', detail: `Sesi berakhir${s(p.reason) ? ` (${s(p.reason)})` : ''}` }];
    case 'UserPromptSubmit': {
      // Privacy: never forward the prompt text, only its size.
      const len = s(p.prompt)?.length ?? 0;
      return [{ ...base, signal: 'prompt', kind: 'prompt', detail: `Prompt baru (${len} karakter)` }];
    }
    case 'PreToolUse':
      return [{
        ...base, signal: 'tool-pre', kind: toolKind(tool), detail: summarizeTool(tool, p.tool_input),
        subagent: isSubagentTool(tool),
      }];
    case 'PostToolUse': {
      const resp = p.tool_response;
      if (responseIsError(resp)) {
        const text = responseText(resp) || `${tool} gagal`;
        return [{
          ...base, signal: 'error', kind: 'error', detail: clip(text),
          block: matchBlock(text) ?? undefined, subagent: isSubagentTool(tool), endsTool: true,
        }];
      }
      // Feed already shows the PreToolUse entry; this only closes the call.
      return [{ ...base, signal: 'tool-post', subagent: isSubagentTool(tool) }];
    }
    case 'PostToolUseFailure': {
      const text = s(p.error) ?? (responseText(p.tool_response) || `${tool} gagal`);
      return [{
        ...base, signal: 'error', kind: 'error', detail: clip(text),
        block: matchBlock(text) ?? undefined, subagent: isSubagentTool(tool), endsTool: true,
      }];
    }
    case 'Notification': {
      const msg = s(p.message) ?? '';
      return [{
        ...base, signal: 'notify', kind: 'notify', detail: clip(msg || 'Notifikasi'),
        block: notifyBlock(msg, s(p.notification_type)),
      }];
    }
    case 'Stop':
      return [{ ...base, signal: 'stop', kind: 'stop', detail: 'Selesai, menunggu prompt' }];
    case 'SubagentStop':
      return [{ ...base, signal: 'subagent-stop', kind: 'message', detail: 'Subagent selesai' }];
    default:
      return [];
  }
}
