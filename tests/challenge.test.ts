// 挑戦状の文字列：書いて読むと同じ。形のおかしい文字列は null
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/game.ts';
import { decodeChallenge, encodeChallenge } from '../src/challenge-code.ts';

describe('挑戦状', () => {
  it('書いて読むと、種・難しさ・農家・結果がそのまま戻る', () => {
    const s = newGame({ shop: [], charmPool: [], seed: 4242, difficulty: 9, farmer: 'berry' });
    s.day = 49;
    s.cleared = true;
    s.stats.totalEarned = 6433;
    const c = decodeChallenge(encodeChallenge(s))!;
    expect(c.seed).toBe(4242);
    expect(c.difficulty).toBe(9);
    expect(c.farmer).toBe('berry');
    expect(c.from.cleared).toBe(true);
    expect(c.from.earned).toBe(6433);
  });
  it('壊れた文字列・知らない農家は読まない', () => {
    expect(decodeChallenge('aaaa')).toBeNull();
    expect(decodeChallenge(btoa(JSON.stringify([1, 1, 0, 0, 'nobody', 1, 0, 0, 0, 'C', 0, 'x'])))).toBeNull();
  });
});
