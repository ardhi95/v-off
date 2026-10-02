import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/server/config.js';
import { defaultConfig } from '../src/server/defaults.js';
import type { Config } from '../src/shared/types.js';
import { Store } from '../src/server/store.js';

const edit = (fn: (c: Config) => void) => {
  const c = defaultConfig();
  fn(c);
  return validateConfig(c);
};

describe('validateConfig', () => {
  it('accepts the defaults', () => {
    expect(validateConfig(defaultConfig())).toBeNull();
  });

  it.each([
    ['unknown department', (c: Config) => (c.agents[0]!.dept = 'nope'), /Departemen Hendra tidak ada/],
    ['bad colour', (c: Config) => (c.agents[0]!.shirt = 'red'), /Warna baju/],
    ['unknown animal', (c: Config) => ((c.agents[0] as { animal: string }).animal = 'dragon'), /Hewan/],
    ['bad id', (c: Config) => (c.agents[0]!.id = 'Hendra Besar'), /id/],
    ['duplicate id', (c: Config) => (c.agents[1]!.id = 'hendra'), /ganda/],
    ['empty name', (c: Config) => (c.agents[0]!.name = ' '), /butuh nama/],
    ['bad rule', (c: Config) => (c.agents[0]!.match = [{ env: 'no-equals' }]), /Aturan pemetaan/],
    ['two keys in a rule', (c: Config) => (c.agents[0]!.match = [{ cwdGlob: 'a', gitBranch: 'b' } as never]), /Aturan pemetaan/],
    ['long quip', (c: Config) => (c.agents[0]!.quips = ['x'.repeat(81)]), /Celetukan/],
    ['negative price', (c: Config) => (c.pricing = { m: { input: -1, output: 1, cacheRead: 0, cacheWrite: 0 } }), /Harga m/],
    ['idle shorter than work', (c: Config) => (c.rules = { workWindowSec: 600, idleAfterSec: 300 }), /lebih lama/],
    ['scan interval', (c: Config) => (c.cleaner.intervalMin = 0), /Interval/],
    ['dept colour', (c: Config) => (c.departments[0]!.color = '#fff'), /Warna departemen/],
  ])('rejects %s', (_name, fn, msg) => {
    expect(edit(fn)).toMatch(msg);
  });
});

describe('Store config updates', () => {
  it('emits config-updated and re-matches guests to new rules', () => {
    const store = new Store(defaultConfig());
    store.ingest([{ ts: 1, sessionId: 'abcdef99', source: 'claude-code', channel: 'hook', signal: 'start', kind: 'message', detail: 'x', ctx: { cwd: '/w/new-repo' } }]);
    expect(store.snapshot().agents.some((a) => a.id === 'tamu-abcdef99')).toBe(true);
    const seen: unknown[] = [];
    store.on('config-updated', (c) => seen.push(c));
    const c = defaultConfig();
    c.agents.find((a) => a.id === 'raka')!.match.push({ cwdGlob: '/w/new-repo/**' });
    store.setConfig(c);
    expect(seen).toHaveLength(1);
    expect(store.snapshot().agents.find((a) => a.id === 'raka')!.runtime.sessionId).toBe('abcdef99');
    expect(store.snapshot().agents.some((a) => a.id === 'tamu-abcdef99')).toBe(false);
  });

  it('lists models seen with pricing status', () => {
    const store = new Store(defaultConfig());
    store.ingest([{ ts: 1, sessionId: 's', source: 'claude-code', channel: 'transcript', signal: 'usage', usage: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0, model: 'claude-x' } }]);
    expect(store.modelsSeen()).toEqual([{ model: 'claude-x', tokens: 10, priced: false }]);
  });
});
