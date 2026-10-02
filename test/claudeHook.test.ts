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
