// 種と挑戦状・週替わりの種・エンドレスの自己ベスト
import { describe, expect, it } from 'vitest';
import { newGame, nextRand, weeklySeed, spinDay, beginDay, type GameState } from '../src/game.ts';
import { recordRun, endlessKey, type MetaState } from '../src/meta.ts';

const rngOf = (s: GameState) => () => nextRand(s);

describe('種', () => {
  it('同じ種なら、同じ乱数の流れになる。違う種なら違う', () => {
    const a = newGame({ shop: [], charmPool: [], seed: 12345 });
    const b = newGame({ shop: [], charmPool: [], seed: 12345 });
    const c = newGame({ shop: [], charmPool: [], seed: 999 });
    const ra = Array.from({ length: 20 }, () => nextRand(a));
    const rb = Array.from({ length: 20 }, () => nextRand(b));
    const rc = Array.from({ length: 20 }, () => nextRand(c));
    expect(ra).toEqual(rb);
    expect(ra).not.toEqual(rc);
    ra.forEach((v) => expect(v >= 0 && v < 1).toBe(true));
  });

  it('同じ種なら、最初の日の出目が同じ', () => {
    const play = (seed: number) => {
      const s = newGame({ shop: [], charmPool: [], seed });
      beginDay(s, rngOf(s));
      spinDay(s, rngOf(s));
      return s.results.map((r) => r.symbol);
    };
    expect(play(42)).toEqual(play(42));
  });

  it('保存して読み直しても、続きの流れは同じ（位置を state に持つ）', () => {
    const a = newGame({ shop: [], charmPool: [], seed: 7 });
    nextRand(a);
    nextRand(a);
    const copy = JSON.parse(JSON.stringify(a)) as GameState;
    expect(nextRand(copy)).toBe(nextRand(a));
  });

  it('種のない古い保存でも動く（その場で種を決める）', () => {
    const a = newGame({ shop: [], charmPool: [] });
    delete a.seed;
    delete a.rngState;
    const v = nextRand(a);
    expect(v >= 0 && v < 1).toBe(true);
    expect(typeof a.seed).toBe('number');
  });
});

describe('週替わりの種', () => {
  it('同じ週（日本時間の月曜〜日曜）は同じ種、次の週は違う', () => {
    const mon = weeklySeed(new Date('2026-11-22T15:30:00Z')); // 日本時間 11/23（月）0:30
    const sun = weeklySeed(new Date('2026-11-29T14:00:00Z')); // 日本時間 11/29（日）23:00
    const next = weeklySeed(new Date('2026-11-29T15:30:00Z')); // 日本時間 11/30（月）0:30
    expect(mon.seed).toBe(sun.seed);
    expect(mon.week).toBe(sun.week);
    expect(next.seed).not.toBe(mon.seed);
  });
});

describe('エンドレスの自己ベスト', () => {
  const meta = () => ({ lines: 0, clears: 0, discovered: [], unlockedAdds: [], maxCleared: 9, lordCleared: 3, skins: ['gold'] }) as unknown as MetaState;
  it('クリアしたプレイだけ、難しさごとに日数の長い方を残す', () => {
    const m = meta();
    const s = newGame({ shop: [], charmPool: [], difficulty: 3, seed: 1 });
    s.cleared = true;
    s.day = 60;
    recordRun(m, s, true);
    expect(m.endlessBest?.[endlessKey(s)]?.day).toBe(60);
    s.day = 55;
    recordRun(m, s, true);
    expect(m.endlessBest?.d3.day).toBe(60);
    const f = newGame({ shop: [], charmPool: [], difficulty: 4 });
    f.day = 30;
    recordRun(m, f, true);
    expect(m.endlessBest?.d4).toBeUndefined();
  });
});
