// 裏（妖怪退治）：売上がダメージ・弱点×2・期限で負け・妨害・倒したら3択・大蛇でクリア
import { describe, expect, it } from 'vitest';
import { URA, YOKAI } from '../src/config.ts';
import { cropPrice, endDay, newCrop, newGame, sell, takeUraReward, nextRand, type GameState } from '../src/game.ts';

function ura(): GameState {
  const s = newGame({ shop: [], charmPool: [], seed: 11, ura: 1 });
  s.day = 1;
  return s;
}
const rng = (s: GameState) => () => nextRand(s);
function ripeRow(s: GameState, kind: 'tomato' | 'strawberry' | 'pumpkin', cells = [0, 1, 2]) {
  cells.forEach((c) => {
    const crop = newCrop(kind);
    crop.growth = 99;
    s.field[c] = crop;
  });
}

describe('裏（妖怪退治）', () => {
  it('最初は狐火（弱点トマト）。市は開かず、お金は増えない', () => {
    const s = ura();
    expect(s.ura?.foe).toBe('kitsune');
    expect(s.ura?.weak).toBe('tomato');
    expect(s.ura?.hp).toBe(YOKAI.kitsune.hp);
    ripeRow(s, 'tomato');
    const before = s.ura!.hp;
    const res = sell(s, 0)!;
    expect(res.total).toBeGreaterThan(0);
    expect(s.gold).toBe(0);
    expect(s.ura!.hp).toBe(Math.max(0, before - res.total));
  });

  it('弱点の作物は売値（ダメージ）が2倍', () => {
    const s = ura();
    const t = newCrop('tomato');
    t.growth = 99;
    const b = newCrop('strawberry');
    b.growth = 99;
    const tomatoBase = cropPrice({ ...s, ura: null } as GameState, t, 0);
    expect(cropPrice(s, t, 0)).toBe(Math.round(tomatoBase * URA.weakMult));
    const berryBase = cropPrice({ ...s, ura: null } as GameState, b, 0);
    expect(cropPrice(s, b, 0)).toBe(berryBase);
  });

  it('期限の回転までに倒せないと負け。2回転ごとに妨害が起きる', () => {
    const s = ura();
    const limit = s.ura!.limit;
    ripeRow(s, 'strawberry', [5, 6, 7]);
    let lost = false;
    for (let k = 0; k < limit; k++) {
      const r = endDay(s, rng(s));
      s.day++;
      if (k === URA.firstHarass - 1) expect(s.ura!.lastHarass?.id).toBe(YOKAI.kitsune.harass[0]);
      if (!r.ok) {
        lost = true;
        expect(k).toBe(limit - 1);
      }
    }
    expect(lost).toBe(true);
    expect(s.over).toBe(true);
  });

  it('倒すと3択が出て、選ぶと次の妖怪（雪女）が来る。1つ目は次の妖怪の弱点の種', () => {
    const s = ura();
    s.ura!.hp = 1;
    ripeRow(s, 'tomato');
    sell(s, 0);
    expect(s.ura!.reward?.length).toBe(3);
    expect(s.ura!.reward![0]).toMatchObject({ kind: 'seed', sym: 'berrySeed' });
    const before = s.bag.berrySeed ?? 0;
    expect(takeUraReward(s, 0)).toBe(true);
    expect(s.bag.berrySeed).toBe(before + 3);
    expect(s.ura!.foe).toBe('yukionna');
    expect(s.ura!.reward).toBeNull();
  });

  it('最後の大蛇を倒すとクリア', () => {
    const s = ura();
    for (let k = 0; k < 3; k++) {
      s.ura!.hp = 1;
      ripeRow(s, 'tomato');
      sell(s, 0);
      takeUraReward(s, 1);
    }
    expect(s.ura!.foe).toBe('orochi');
    s.ura!.hp = 1;
    ripeRow(s, 'tomato');
    sell(s, 0);
    expect(s.ura!.won).toBe(true);
    expect(s.cleared).toBe(true);
  });
});
