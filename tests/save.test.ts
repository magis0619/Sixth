import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { newGame } from '../src/game.ts';

// 中断セーブの読み込み：古い形の保存から続きを始められるか、壊れた保存で「続きから」を出さないか
const store = new Map<string, string>();
let save: typeof import('../src/ui/save.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    document: { getElementById: () => null },
  });
  save = await import('../src/ui/save.ts');
});

function started() {
  const s = newGame();
  s.day = 5;
  return s;
}

describe('中断セーブ', () => {
  it('今の形で保存したものはそのまま読める', () => {
    const s = started();
    store.set(save.RUN_KEY, JSON.stringify({ ...s, saveVersion: save.SAVE_VERSION }));
    const got = save.loadRun();
    expect(got?.day).toBe(5);
    expect(got?.gold).toBe(s.gold);
  });

  it('版の番号がない古い保存（3×3の畑・後から足した項目なし）でも続きから遊べる', () => {
    const s = started() as unknown as Record<string, unknown>;
    // 3×3固定のころの形：マスは9個、広さ・道具・地面の項目はない
    const field3 = Array.from({ length: 9 }, () => null);
    s.field = field3;
    s.weeds = field3.map(() => false);
    s.frost = field3.map(() => 0);
    for (const k of ['cols', 'rows', 'tools', 'tiles', 'toolXp', 'toolLv', 'tilled', 'pool', 'weekly', 'weeklyPlaces', 'premium', 'notices', 'log', 'removed', 'saveVersion']) delete s[k];
    store.set(save.RUN_KEY, JSON.stringify(s));
    const got = save.loadRun();
    expect(got).not.toBeNull();
    const size = CONFIG.fieldCols * CONFIG.fieldRows;
    expect(got!.field.length).toBe(size);
    expect(got!.tools.length).toBe(size);
    expect(got!.cols).toBe(CONFIG.startCols);
  });

  it('壊れた保存は読まず、消して新しく始める', () => {
    store.set(save.RUN_KEY, '{"day":3,');
    expect(save.loadRun()).toBeNull();
    expect(store.has(save.RUN_KEY)).toBe(false);

    const s = started() as unknown as Record<string, unknown>;
    s.bag = null;
    store.set(save.RUN_KEY, JSON.stringify(s));
    expect(save.loadRun()).toBeNull();
  });

  it('新しい版で保存されたものは古い画面では読まない', () => {
    store.set(save.RUN_KEY, JSON.stringify({ ...started(), saveVersion: save.SAVE_VERSION + 1 }));
    expect(save.loadRun()).toBeNull();
  });
});
