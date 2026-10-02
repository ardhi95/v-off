import type { Usage } from '../../shared/types.js';
import { clip, isSubagentTool, matchBlock, matchUsageLimit, summarizeTool, toolKind } from '../summarize.js';
import type { NormalizedEvent, SessionContext } from './types.js';

// Claude Code writes one JSONL transcript per session under
// ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl. Relevant line shapes:
//   { type: 'user', sessionId, cwd, gitBranch, timestamp, isSidechain, isMeta,
//     message: { role: 'user', content: string | [{ type: 'text' } | { type: 'tool_result', tool_use_id, is_error, content }] } }
//   { type: 'assistant', sessionId, cwd, gitBranch, timestamp, requestId, isApiErrorMessage,
//     message: { id, model, content: [{ type: 'text' | 'thinking' | 'tool_use', id, name, input }],
//                usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } } }
// Other types (summary, system, file-history-snapshot, …) carry no activity.

type Line = Record<string, unknown>;

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function s(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function contentText(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => s(obj(x)?.text) ?? '').join('\n');
  return '';
}

/**
 * Stateful parser for one transcript file. Claude Code repeats the same
 * message usage on every content-block line of a response, so usage is
 * emitted as a delta per message id: totals stay exact without double counting.
 */
export class TranscriptParser {
  private usageSeen = new Map<string, Usage>();
  private openTools = new Map<string, { subagent: boolean }>();

  parseLine(raw: string): NormalizedEvent[] {
    const text = raw.trim();
    if (!text) return [];
    let line: Line;
    try {
      line = JSON.parse(text) as Line;
    } catch {
      return [];
    }
    const sessionId = s(line.sessionId);
    const type = s(line.type);
    const ts = Date.parse(s(line.timestamp) ?? '');
    if (!sessionId || !Number.isFinite(ts) || (type !== 'user' && type !== 'assistant')) return [];

    const ctx: SessionContext = { cwd: s(line.cwd), gitBranch: s(line.gitBranch) || undefined };
    const base = { ts, sessionId, source: 'claude-code' as const, channel: 'transcript' as const, ctx };
    const message = obj(line.message);
    if (!message) return [];
    // Sidechain lines belong to a subagent: count their tokens, keep them out of the feed.
    const sidechain = line.isSidechain === true;
    const out: NormalizedEvent[] = [];

    if (type === 'assistant') {
      const u = this.usageDelta(message, s(line.requestId));
      if (u) out.push({ ...base, signal: 'usage', usage: u.delta, usageKey: u.key, usageTotal: u.total });
      if (sidechain) return out;
      if (line.isApiErrorMessage === true) {
        const msg = contentText(message.content) || 'API Error';
        out.push({
          ...base, signal: 'error', kind: 'error', detail: clip(msg), block: matchBlock(msg) ?? matchBlock('API Error') ?? undefined,
          limit: matchUsageLimit(msg, ts) ?? undefined,
        });
        return out;
      }
      const blocks = Array.isArray(message.content) ? message.content : [];
      for (const b of blocks) {
        const block = obj(b);
        if (s(block?.type) !== 'tool_use') continue;
        const name = s(block?.name) ?? 'Tool';
        const subagent = isSubagentTool(name);
        const id = s(block?.id);
        if (id) this.openTools.set(id, { subagent });
        out.push({ ...base, signal: 'tool-pre', kind: toolKind(name), detail: summarizeTool(name, block?.input), subagent, toolId: id });
      }
      return out;
    }

    // type === 'user'
    if (sidechain || line.isMeta === true) return out;
    const content = message.content;
    const hasToolResult = Array.isArray(content) && content.some((c) => s(obj(c)?.type) === 'tool_result');
    if (!hasToolResult) {
      // Privacy: only the prompt size, never its text.
      const len = contentText(content).length;
      if (len > 0) out.push({ ...base, signal: 'prompt', kind: 'prompt', detail: `Prompt baru (${len} karakter)` });
      return out;
    }
    if (Array.isArray(content)) {
      for (const c of content) {
        const r = obj(c);
        if (s(r?.type) !== 'tool_result') continue;
        const id = s(r?.tool_use_id);
        const open = id ? this.openTools.get(id) : undefined;
        if (id) this.openTools.delete(id);
        if (r?.is_error === true) {
          const msg = contentText(r.content) || 'Tool gagal';
          out.push({
            ...base, signal: 'error', kind: 'error', detail: clip(msg),
            block: matchBlock(msg) ?? undefined, subagent: open?.subagent, endsTool: true, toolId: id,
          });
        } else {
          out.push({ ...base, signal: 'tool-post', subagent: open?.subagent, toolId: id });
        }
      }
    }
    return out;
  }

  private usageDelta(message: Record<string, unknown>, requestId?: string): { delta: Usage; total: Usage; key?: string } | null {
    const u = obj(message.usage);
    if (!u) return null;
    const cur: Usage = {
      input: n(u.input_tokens),
      output: n(u.output_tokens),
      cacheRead: n(u.cache_read_input_tokens),
      cacheWrite: n(u.cache_creation_input_tokens),
      model: s(message.model),
    };
    const key = s(message.id) ?? requestId;
    const prev = key ? this.usageSeen.get(key) : undefined;
    if (key) this.usageSeen.set(key, cur);
    const delta: Usage = {
      input: Math.max(0, cur.input - (prev?.input ?? 0)),
      output: Math.max(0, cur.output - (prev?.output ?? 0)),
      cacheRead: Math.max(0, cur.cacheRead - (prev?.cacheRead ?? 0)),
      cacheWrite: Math.max(0, cur.cacheWrite - (prev?.cacheWrite ?? 0)),
      model: cur.model,
    };
    const total = delta.input + delta.output + delta.cacheRead + delta.cacheWrite;
    return total > 0 && cur.model !== '<synthetic>' ? { delta, total: cur, key } : null;
  }
}
