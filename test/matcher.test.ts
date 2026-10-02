import os from 'node:os';
import { describe, expect, it } from 'vitest';
import type { Agent } from '../src/shared/types.js';
import { globToRegExp, matchAgent } from '../src/server/matcher.js';

const agent = (id: string, match: Agent['match'], walker = false): Agent => ({
  id, name: id, role: '', short: '', dept: 'eng', animal: 'panda', shirt: '#000', tool: 'Claude Code', match, walker,
});

describe('globToRegExp', () => {
  it('handles *, **, and ?', () => {
    expect(globToRegExp('feat/timesheet-*').test('feat/timesheet-v2')).toBe(true);
    expect(globToRegExp('feat/*').test('feat/a/b')).toBe(false);
    expect(globToRegExp('/w/**').test('/w/a/b')).toBe(true);
    expect(globToRegExp('/w/**').test('/w')).toBe(true);
    expect(globToRegExp('/w/**').test('/wx')).toBe(false);
    expect(globToRegExp('v?').test('v2')).toBe(true);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
  });
});

describe('matchAgent', () => {
  const agents = [
    agent('udin', [{ env: 'V_OFF_AGENT=udin' }], true),
    agent('raka', [{ cwdGlob: '~/work/pmo-portal/**' }]),
    agent('dewi', [{ gitBranch: 'feat/dashboard-*' }]),
    agent('nina', [{ env: 'V_OFF_AGENT=nina' }, { sessionName: 'ios' }]),
  ];

  it('matches cwd globs with ~ expansion', () => {
    expect(matchAgent(agents, { cwd: `${os.homedir()}/work/pmo-portal/api` })?.id).toBe('raka');
    expect(matchAgent(agents, { cwd: `${os.homedir()}/work/pmo-portal/` })?.id).toBe('raka');
  });

  it('matches Windows-style folders against "/" rules', () => {
    const win = [agent('raka', [{ cwdGlob: 'C:/work/pmo-portal/**' }])];
    expect(matchAgent(win, { cwd: 'C:\\work\\pmo-portal\\api' })?.id).toBe('raka');
  });

  it('matches git branch, env, and session name', () => {
    expect(matchAgent(agents, { gitBranch: 'feat/dashboard-q4' })?.id).toBe('dewi');
    expect(matchAgent(agents, { env: { V_OFF_AGENT: 'nina' } })?.id).toBe('nina');
    expect(matchAgent(agents, { sessionName: 'ios' })?.id).toBe('nina');
  });

  it('uses the first matching agent in order', () => {
    expect(matchAgent(agents, { cwd: `${os.homedir()}/work/pmo-portal`, gitBranch: 'feat/dashboard-x' })?.id).toBe('raka');
  });

  it('never maps sessions to the office boy, and returns undefined when nothing matches', () => {
    expect(matchAgent(agents, { env: { V_OFF_AGENT: 'udin' } })).toBeUndefined();
    expect(matchAgent(agents, { cwd: '/tmp/x' })).toBeUndefined();
  });
});
