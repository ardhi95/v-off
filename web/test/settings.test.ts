import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/server/config.js';
import { defaultConfig } from '../../src/server/defaults.js';
import { assignFolder, isDirty, newAgent, newDepartment, rulesToText, seatForDept, slugify, textToRules } from '../src/settingsModel.js';

const config = defaultConfig();
const agent = (id: string) => config.agents.find((a) => a.id === id)!;

describe('slugify', () => {
  it('makes unique ids from names', () => {
    expect(slugify('Tim Keuangan & Pajak', [])).toBe('tim-keuangan-pajak');
    expect(slugify('Raka', ['raka', 'raka-2'])).toBe('raka-3');
    expect(slugify('ÉÈ!!', [])).toBe('ee');
    expect(slugify('***', [])).toBe('agent');
  });
});

describe('match rules text', () => {
  it('round-trips every rule kind', () => {
    const rules = [{ cwdGlob: '~/work/x/**' }, { gitBranch: 'feat/*' }, { env: 'V_OFF_AGENT=raka' }, { sessionName: 'ios' }];
    const text = rulesToText(rules);
    expect(text).toBe('folder: ~/work/x/**\nbranch: feat/*\nenv: V_OFF_AGENT=raka\nsesi: ios');
    expect(textToRules(text)).toEqual({ rules, errors: [] });
  });

  it('accepts aliases and blank lines, reports bad lines', () => {
    expect(textToRules('CWD: /a/**\n\nsession: x').rules).toEqual([{ cwdGlob: '/a/**' }, { sessionName: 'x' }]);
    const r = textToRules('folder /a\nenv: nope\nwarna: biru');
    expect(r.rules).toEqual([]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[1]).toMatch(/NAMA=nilai/);
  });
});

describe('seats', () => {
  it('keeps the seat within the same desk and finds a free chair at a new desk', () => {
    expect(seatForDept(agent('raka'), 'eng', config.agents, config.departments)).toEqual(agent('raka').seat);
    const s = seatForDept(agent('raka'), 'pmo', config.agents, config.departments);
    expect(s).toMatchObject({ pod: 'pmo' });
    expect(s).not.toEqual(agent('wulan').seat);
    expect(seatForDept(agent('raka'), 'ops', config.agents, config.departments)).toBeUndefined();
    expect(seatForDept(agent('hendra'), 'pimpinan', config.agents, config.departments)).toEqual({ room: 'ceo' });
  });
});

describe('new agent, department, folder assignment', () => {
  it('creates a valid config', () => {
    const a = newAgent(config);
    const d = newDepartment('Tim Keuangan', config.departments);
    const next = { ...config, agents: [...config.agents, a], departments: [...config.departments, d] };
    expect(validateConfig(next)).toBeNull();
    expect(a).toMatchObject({ id: 'agent-baru', match: [{ env: 'V_OFF_AGENT=agent-baru' }] });
    expect(d.id).toBe('tim-keuangan');
    expect(isDirty(config, next)).toBe(true);
    expect(isDirty(config, structuredClone(config))).toBe(false);
  });

  it('adds a folder rule once', () => {
    const once = assignFolder(config, 'raka', '/w/new/');
    const twice = assignFolder(once, 'raka', '/w/new');
    expect(twice.agents.find((a) => a.id === 'raka')!.match).toEqual([{ env: 'V_OFF_AGENT=raka' }, { cwdGlob: '/w/new/**' }]);
  });
});
