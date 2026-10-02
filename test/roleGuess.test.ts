import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/server/defaults.js';
import {
  agentForRole, closestRole, evidenceFromTool, explicitRole, explicitRoleFromSkill, fallbackAgent, roleFromText, touchesCode,
  type RoleKey,
} from '../src/server/roleGuess.js';
import { roleHintFor, TranscriptParser } from '../src/server/sources/claudeTranscript.js';
import { parseHookPayload } from '../src/server/sources/claudeHook.js';
import type { NormalizedEvent } from '../src/server/sources/types.js';
import { Store } from '../src/server/store.js';

describe('roleFromText', () => {
  it('reads the default agent roles', () => {
    const roles = Object.fromEntries(defaultConfig().agents.map((a) => [a.id, roleFromText(a.role)]));
    expect(roles).toMatchObject({
      hendra: 'ceo', rina: 'cto', wulan: 'pm', dimas: 'po', ayu: 'scrum', laras: 'ba', sari: 'uiux',
      andi: 'techlead', bima: 'architect', raka: 'backend', dewi: 'web', agus: 'android', nina: 'ios',
      dodi: 'dataeng', mega: 'dataanalyst', yoga: 'qa', fajar: 'devsecops',
    });
    expect(roles.udin).toBeUndefined();
  });

  it('matches whole words only', () => {
    expect(roleFromText('aqua radios')).toBeUndefined();
    expect(roleFromText('Senior iOS dev')).toBe('ios');
  });
});

describe('explicitRole', () => {
  it('finds the v-off-roles skill argument as a role or an agent id', () => {
    expect(explicitRole('/v-off-roles backend tolong buat endpoint')).toEqual({ role: 'backend' });
    expect(explicitRole('/v-off-roles raka')).toEqual({ agentId: 'raka' });
    expect(explicitRole('<command-name>/v-off-roles</command-name>\n<command-args>CTO</command-args>')).toEqual({ role: 'cto' });
    expect(explicitRoleFromSkill({ skill: 'v-off-roles', args: 'yoga' })).toEqual({ agentId: 'yoga' });
    expect(explicitRoleFromSkill({ skill: 'other', args: 'yoga' })).toBeUndefined();
  });

  it('finds "sebagai <peran>" but not the filler word "jadi"', () => {
    expect(explicitRole('Tolong kerjakan sebagai QA Engineer ya')).toEqual({ role: 'qa' });
    expect(explicitRole('act as a solution architect')).toEqual({ role: 'architect' });
    expect(explicitRole('jadi backend nya error')).toBeUndefined();
    expect(explicitRole('sebagai contoh, lihat file ini')).toBeUndefined();
  });
});

describe('evidenceFromTool', () => {
  it('points file paths and commands at roles', () => {
    expect(evidenceFromTool('Edit', { file_path: '/p/app/src/main/MainActivity.kt' })).toEqual(['android']);
    expect(evidenceFromTool('Write', { file_path: '/p/ios/App/ContentView.swift' })).toEqual(['ios']);
    expect(evidenceFromTool('Edit', { file_path: '/p/web/src/App.tsx' })).toContain('web');
    expect(evidenceFromTool('Edit', { file_path: '/p/src/server/routes/user.ts' })).toEqual(['backend']);
    expect(evidenceFromTool('Edit', { file_path: '/p/test/user.test.ts' })).toEqual(['qa']);
    expect(evidenceFromTool('Edit', { file_path: '/p/.github/workflows/ci.yml' })).toEqual(['devsecops']);
    expect(evidenceFromTool('Write', { file_path: '/p/docs/WBS-CR-MVP5.md' })).toEqual(['pm']);
    expect(evidenceFromTool('Bash', { command: 'npx vitest run' })).toEqual(['qa']);
    expect(evidenceFromTool('Bash', { command: 'ls -la' })).toEqual([]);
    expect(evidenceFromTool('Grep', { pattern: 'x', path: '/p/test' })).toEqual([]);
  });
});

describe('closestRole / fallbackAgent', () => {
  const all = new Set<RoleKey>(['web', 'backend', 'qa']);
  it('takes the highest score among roles in the roster', () => {
    expect(closestRole(new Map<RoleKey, number>([['web', 1]]), all)).toBe('web');
    expect(closestRole(new Map<RoleKey, number>([['android', 9], ['web', 1]]), all)).toBe('web');
    expect(closestRole(new Map<RoleKey, number>([['android', 9]]), all)).toBeUndefined();
  });

  it('keeps the current role until another scores 1.5x more', () => {
    expect(closestRole(new Map<RoleKey, number>([['web', 4], ['backend', 5]]), all, 'web')).toBe('web');
    expect(closestRole(new Map<RoleKey, number>([['web', 4], ['backend', 7]]), all, 'web')).toBe('backend');
  });

  it('falls back to Tech Lead for code, Project Manager otherwise, then anyone', () => {
    const agents = defaultConfig().agents;
    expect(fallbackAgent(agents, true)?.id).toBe('andi');
    expect(fallbackAgent(agents, false)?.id).toBe('wulan');
    expect(fallbackAgent(agents.filter((a) => !['andi', 'wulan'].includes(a.id)), true)?.id).toBe('hendra');
    expect(fallbackAgent(agents.filter((a) => a.walker), true)).toBeUndefined();
    expect(touchesCode('Edit', { file_path: '/p/src/util.ts' })).toBe(true);
    expect(touchesCode('Write', { file_path: '/p/notes.md' })).toBe(false);
  });

  it('agentForRole returns nothing for a role missing from the roster', () => {
    const agents = defaultConfig().agents.filter((a) => a.id !== 'agus');
    expect(agentForRole(agents, 'android')).toBeUndefined();
    expect(agentForRole(agents, 'ios')?.id).toBe('nina');
  });
});

describe('Store: every session takes a role', () => {
  const T = new Date('2026-10-02T09:00:00').getTime();
  const tool = (sessionId: string, file: string, ts: number): NormalizedEvent => ({
    ts, sessionId, source: 'claude-code', channel: 'transcript', signal: 'tool-pre', kind: 'edit', detail: file,
    ctx: { cwd: '/elsewhere' }, roleHint: roleHintFor('Edit', { file_path: file }),
  });
  const ids = (store: Store) => store.snapshot().agents.map((a) => a.id);

  it('starts on the fallback, then moves to the evidence role with its feed', () => {
    const store = new Store(defaultConfig(), () => T);
    store.ingest([{ ...tool('s-1', '/p/notes.md', T), roleHint: undefined }]);
    expect(store.snapshot().agents.find((a) => a.id === 'wulan')!.runtime.sessionId).toBe('s-1');
    store.ingest([tool('s-1', '/p/a/Main.kt', T + 1)]);
    const snap = store.snapshot();
    expect(snap.agents.find((a) => a.id === 'agus')!.runtime).toMatchObject({ status: 'kerja', sessionId: 's-1' });
    expect(snap.events.every((e) => e.agentId === 'agus')).toBe(true);
    // Wulan has no session left: hidden again. Only the office boy and Agus show.
    expect(ids(store).sort()).toEqual(['agus', 'udin']);
  });

  it('a role missing from the roster goes to the closest existing role, or the fallback', () => {
    const config = defaultConfig();
    config.agents = config.agents.filter((a) => a.id !== 'agus');
    const store = new Store(config, () => T);
    store.ingest([1, 2, 3].map((i) => tool('s-2', `/p/a/F${i}.kt`, T + i)));
    // Kotlin only points at Android; without Agus the session is code work -> Tech Lead.
    expect(store.snapshot().agents.find((a) => a.id === 'andi')!.runtime.sessionId).toBe('s-2');
    expect(store.snapshot().agents.some((a) => a.guest)).toBe(false);
  });

  it('an explicit role from the transcript wins, and a match rule is never overridden', () => {
    const config = defaultConfig();
    config.agents.find((a) => a.id === 'raka')!.match.push({ cwdGlob: '/w/api/**' });
    const store = new Store(config, () => T);
    const p = new TranscriptParser();
    const line = (o: object) => JSON.stringify({ sessionId: 's-qa', timestamp: new Date(T).toISOString(), cwd: '/w/docs', ...o });
    store.ingest(p.parseLine(line({ type: 'user', message: { role: 'user', content: 'kerjakan sebagai QA Engineer: uji login' } })));
    store.ingest([tool('s-qa', '/p/web/App.tsx', T + 1)]);
    expect(store.snapshot().agents.find((a) => a.id === 'yoga')!.runtime.sessionId).toBe('s-qa');

    store.ingest([1, 2, 3].map((i) => ({ ...tool('s-api', `/w/api/F${i}.kt`, T + i), ctx: { cwd: '/w/api' } })));
    expect(store.snapshot().agents.find((a) => a.id === 'raka')!.runtime.sessionId).toBe('s-api');
  });

  it('hooks carry hints too (prompt and tool input)', () => {
    const store = new Store(defaultConfig(), () => T);
    store.ingest(parseHookPayload({ session_id: 's-hook', cwd: '/x', hook_event_name: 'UserPromptSubmit', prompt: '/v-off-roles yoga' }, T));
    expect(store.snapshot().agents.find((a) => a.id === 'yoga')!.runtime.sessionId).toBe('s-hook');
  });

  it('skips roles switched off in Pengaturan', () => {
    const config = defaultConfig();
    config.agents.find((a) => a.id === 'agus')!.hidden = true;
    const store = new Store(config, () => T);
    store.ingest([tool('s-off', '/p/a/Main.kt', T)]);
    expect(store.snapshot().agents.find((a) => a.id === 'andi')!.runtime.sessionId).toBe('s-off');
  });

  it('only an office without working agents still shows a guest', () => {
    const config = defaultConfig();
    config.agents = config.agents.filter((a) => a.walker);
    const store = new Store(config, () => T);
    store.ingest([tool('abcdef12-x', '/p/a.ts', T)]);
    expect(store.snapshot().agents.find((a) => a.guest)?.id).toBe('tamu-abcdef12');
  });
});
