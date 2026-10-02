import { describe, expect, it } from 'vitest';
import { parseHookPayload } from '../src/server/sources/claudeHook.js';

const base = { session_id: 'sess-1', cwd: '/home/u/work/pmo-portal', transcript_path: '/x.jsonl' };

describe('parseHookPayload', () => {
  it('ignores payloads without session or event name', () => {
    expect(parseHookPayload(null, 1)).toEqual([]);
    expect(parseHookPayload({ hook_event_name: 'Stop' }, 1)).toEqual([]);
    expect(parseHookPayload({ ...base, hook_event_name: 'Unknown' }, 1)).toEqual([]);
  });

  it('summarizes PreToolUse without file contents', () => {
    const [ev] = parseHookPayload({
      ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit',
      tool_input: { file_path: 'src/api/timesheet.ts', old_string: 'SECRET', new_string: 'x' },
    }, 1000);
    expect(ev).toMatchObject({ signal: 'tool-pre', kind: 'edit', detail: 'src/api/timesheet.ts', channel: 'hook', ts: 1000 });
    expect(JSON.stringify(ev)).not.toContain('SECRET');
  });

  it('shows only the first line of Bash commands, max 160 chars', () => {
    const [ev] = parseHookPayload({
      ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash',
      tool_input: { command: `npm test -- ${'x'.repeat(300)}\necho hidden` },
    }, 1);
    expect(ev!.kind).toBe('run');
    expect(ev!.detail!.length).toBeLessThanOrEqual(160);
    expect(ev!.detail).not.toContain('hidden');
  });

  it('never forwards prompt text', () => {
    const [ev] = parseHookPayload({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'rahasia perusahaan' }, 1);
    expect(ev).toMatchObject({ signal: 'prompt', kind: 'prompt', detail: 'Prompt baru (18 karakter)' });
  });

  it('turns permission notifications into a block', () => {
    const [ev] = parseHookPayload({
      ...base, hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash',
    }, 1);
    expect(ev!.signal).toBe('notify');
    expect(ev!.block?.reason).toBe('Menunggu izin: Bash');
  });

  it('treats idle notifications as waiting for input', () => {
    const [ev] = parseHookPayload({
      ...base, hook_event_name: 'Notification', message: 'Claude is waiting for your input', notification_type: 'idle_prompt',
    }, 1);
    expect(ev!.block?.reason).toBe('Menunggu input');
  });

  it('detects failed tests in tool failures', () => {
    const [ev] = parseHookPayload({
      ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'Tests: 3 failed, 45 passed',
    }, 1);
    expect(ev).toMatchObject({ signal: 'error', kind: 'error', endsTool: true });
    expect(ev!.block?.reason).toBe('Tes gagal');
  });

  it('keeps non-matching errors unblocked', () => {
    const [ev] = parseHookPayload({
      ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_response: { is_error: true, content: 'File not found' },
    }, 1);
    expect(ev!.signal).toBe('error');
    expect(ev!.block).toBeUndefined();
  });

  it('closes successful tool calls without a feed entry', () => {
    const [ev] = parseHookPayload({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Task', tool_response: { content: 'ok' } }, 1);
    expect(ev).toMatchObject({ signal: 'tool-post', subagent: true });
    expect(ev!.kind).toBeUndefined();
  });

  it('carries forwarded env for agent matching', () => {
    const [ev] = parseHookPayload({ ...base, hook_event_name: 'Stop' }, 1, { V_OFF_AGENT: 'raka' });
    expect(ev!.ctx).toEqual({ cwd: base.cwd, env: { V_OFF_AGENT: 'raka' } });
  });
});

describe('parseHookPayload (current docs)', () => {
  it('reads tool_result and tool_use_id from PostToolUse', () => {
    const [ok] = parseHookPayload({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: 't1', tool_result: 'file text' }, 1);
    expect(ok).toMatchObject({ signal: 'tool-post', toolId: 't1' });
    const [pre] = parseHookPayload({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_use_id: 't1', tool_input: { file_path: 'a' } }, 1);
    expect(pre!.toolId).toBe('t1');
  });

  it('treats informational notifications as activity, not a block', () => {
    for (const type of ['auth_success', 'agent_completed', 'quota_auto_resume_fired']) {
      const [ev] = parseHookPayload({ ...base, hook_event_name: 'Notification', message: 'Claude needs your permission', notification_type: type }, 1);
      expect(ev).toMatchObject({ signal: 'activity' });
      expect(ev!.block).toBeUndefined();
    }
    const [wait] = parseHookPayload({ ...base, hook_event_name: 'Notification', message: 'x', notification_type: 'agent_needs_input' }, 1);
    expect(wait!.block?.reason).toBe('Menunggu input');
  });

  it('blocks on PermissionRequest and StopFailure', () => {
    const [perm] = parseHookPayload({ ...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/build' } }, 1);
    expect(perm).toMatchObject({ signal: 'notify', block: { reason: 'Menunggu izin: Bash' } });
    const [fail] = parseHookPayload({ ...base, hook_event_name: 'StopFailure', error_type: 'rate_limit', message: 'Rate limit exceeded.' }, 1);
    expect(fail).toMatchObject({ signal: 'error', block: { reason: 'Kena rate limit' } });
    const [other] = parseHookPayload({ ...base, hook_event_name: 'StopFailure', error_type: 'unknown', message: 'boom' }, 1);
    expect(other!.block?.reason).toBe('Galat API');
  });
});
