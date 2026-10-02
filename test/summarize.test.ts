import { describe, expect, it } from 'vitest';
import { matchBlock } from '../src/server/summarize.js';

describe('matchBlock (SPEC §6 patterns)', () => {
  it.each([
    ['Tests: 3 failed, 45 passed', 'Tes gagal'],
    ['FAIL src/api.test.ts', 'Tes gagal'],
    ['1 failing', 'Tes gagal'],
    ['Error: rate limit exceeded', 'Kena rate limit'],
    ['Claude usage limit reached', 'Batas pemakaian tercapai'],
    ['API Error: 500', 'Galat API'],
    ['BUILD FAILED in 12s', 'Build gagal'],
    ['src/a.ts(3,1): error TS2322: Type', 'Build gagal'],
  ])('%s → %s', (text, reason) => {
    expect(matchBlock(text)?.reason).toBe(reason);
  });

  it.each(['0 failed, 48 passed', 'All tests passed', 'No such file or directory'])('no block for: %s', (text) => {
    expect(matchBlock(text)).toBeNull();
  });
});
