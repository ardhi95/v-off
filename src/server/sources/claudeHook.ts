import { apiFailureBlock, clip, isSubagentTool, matchBlock, notifyBlock, summarizeTool, toolKind } from '../summarize.js';
import type { NormalizedEvent, SessionContext } from './types.js';

// Claude Code hook payloads arrive on stdin of the hook command as JSON and are
// forwarded to POST /api/hook (see https://code.claude.com/docs/en/hooks).
// Common fields: session_id, transcript_path, cwd, hook_event_name.
// Event-specific: tool_name, tool_input, tool_use_id, tool_result (older
// versions: tool_response), error, error_type, message, notification_type,
// source, reason.

type Payload = Record<string, unknown>;

function s(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function responseText(resp: unknown): string {
  if (Array.isArray(resp)) return resp.map((x) => (x && typeof x === 'object' ? String((x as { text?: unknown }).text ?? '') : String(x))).join('\n');
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
  const toolId = s(p.tool_use_id);
  const result = p.tool_result ?? p.tool_response;

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
        subagent: isSubagentTool(tool), toolId,
      }];
    case 'PostToolUse': {
      if (responseIsError(result)) {
        const text = responseText(result) || `${tool} gagal`;
        return [{
          ...base, signal: 'error', kind: 'error', detail: clip(text),
          block: matchBlock(text) ?? undefined, subagent: isSubagentTool(tool), endsTool: true, toolId,
        }];
      }
      // Feed already shows the PreToolUse entry; this only closes the call.
      return [{ ...base, signal: 'tool-post', subagent: isSubagentTool(tool), toolId }];
    }
    case 'PostToolUseFailure': {
      const text = s(p.error) ?? (responseText(result) || `${tool} gagal`);
      return [{
        ...base, signal: 'error', kind: 'error', detail: clip(text),
        block: matchBlock(text) ?? undefined, subagent: isSubagentTool(tool), endsTool: true, toolId,
      }];
    }
    case 'PermissionRequest':
      return [{
        ...base, signal: 'notify', kind: 'notify', detail: clip(`Minta izin: ${summarizeTool(tool, p.tool_input)}`),
        block: {
          reason: tool ? `Menunggu izin: ${tool}` : 'Menunggu izin',
          hint: 'Agent meminta izin sebelum melanjutkan. Buka terminal sesi untuk menyetujui atau menolak.',
        },
      }];
    case 'StopFailure': {
      const msg = s(p.message) ?? s(p.error) ?? 'API Error';
      return [{
        ...base, signal: 'error', kind: 'error', detail: clip(msg),
        block: apiFailureBlock(s(p.error_type), msg),
      }];
    }
    case 'Notification': {
      const msg = s(p.message) ?? '';
      const block = notifyBlock(msg, s(p.notification_type));
      return [{
        ...base, signal: block ? 'notify' : 'activity', kind: 'notify', detail: clip(msg || 'Notifikasi'),
        block: block ?? undefined,
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
