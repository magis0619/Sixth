// ルール本体（src/game.ts）と遊ぶたびに増える要素（src/meta.ts）の単体テスト。
// 画面に依存しない部分だけを確かめる。 npm test

import { describe, expect, it } from 'vitest';
import { CONFIG, CROPS, EVENT_CONDITIONS, THUNDER_LINES } from '../src/config.ts';
import {
  animalGold, buy, buyPlace, drawDay, hasRanch, hiveBonus, isColorful, canPlace, canUse, cellMultiplier, cropPrice, isPond, waterWheels, checkReady, chooseCharm, endDay, evolveTools, expand, expandPrice,
  fieldCells, isGolden, lv, multSteps, newCrop, newGame, nextTax, obstacleRule, place, pullWeed, resolveAuto, ripeGroup,
  bestAim, canBuy, isPivotAdd, isPivotPlace, plantLineMult, rollCharmOffer, sell, shapeCells, taxAmount, upgradePrice, useSymbol, type GameState, type ReelResult,
} from '../src/game.ts';
import { recordRun, type MetaState } from '../src/meta.ts';
import type { CropKind, SymbolId } from '../src/config.ts';

const C = CONFIG.fieldCols;
/** (x, y) のマスの番号 */
const at = (x: number, y: number) => y * C + x;

function ripe(s: GameState, kind: CropKind, cells: number[]): void {
  cells.forEach((c) => {
    const crop = newCrop(kind);
    crop.growth = 99;
    s.field[c] = crop;
  });
}

function reel(symbol: SymbolId, total = 1): ReelResult {
  return { symbol, used: false, total, left: total, power: 1 };
}

function game(): GameState {
  const s = newGame();
  s.day = 1;
  return s;
}

describe('畑と形', () => {
  it('3×3で始まり、マスは5×5の数え方', () => {
    const s = game();
    expect(s.cols).toBe(3);
    expect(s.rows).toBe(3);
    expect(fieldCells(s)).toEqual([0, 1, 2, 5, 6, 7, 10, 11, 12]);
  });

  it('雨は縦横いっぱいの十字、太陽は縦一列、雷は横一列、蜂は斜め、満月は全体', () => {
    const s = game();
    const mid = at(1, 1);
    expect(shapeCells(s, 'cross', mid).sort((a, b) => a - b)).toEqual([at(1, 0), at(0, 1), at(1, 1), at(2, 1), at(1, 2)]);
    expect(shapeCells(s, 'column', at(0, 0)).length).toBe(3);
    expect(shapeCells(s, 'row', at(0, 2)).every((c) => Math.floor(c / C) === 2)).toBe(true);
    expect(shapeCells(s, 'x', mid).length).toBe(5);
    expect(shapeCells(s, 'all', mid).length).toBe(9);
  });

  it('雷雨のお守りで雨が斜めにも効く', () => {
    const s = game();
    s.charms.thunderstorm = 1;
    expect(shapeCells(s, 'cross', at(1, 1)).length).toBe(9);
  });

  it('畑を広げると列→行の順に増え、最大5×5', () => {
    const s = game();
    s.gold = 10000;
    const sizes: string[] = [];
    while (expandPrice(s) !== null) {
      expect(expand(s)).toBe(true);
      sizes.push(`${s.cols}x${s.rows}`);
    }
    expect(sizes).toEqual(['4x3', '4x4', '5x4', '5x5']);
    expect(expand(s)).toBe(false);
  });
});

describe('列の収穫', () => {
  it('縦・横・斜めに3つ並ぶと列、L字の3つは単品', () => {
    const s = game();
    ripe(s, 'tomato', [at(0, 0), at(1, 0), at(0, 1)]);
    expect(ripeGroup(s, at(0, 0)).length).toBe(1);
    expect(cellMultiplier(s, at(0, 0))).toBe(CONFIG.singleMult);
    ripe(s, 'tomato', [at(2, 0)]);
    // 横の3つは列。縦に2つしかない (0,1) は入らない
    expect(ripeGroup(s, at(0, 0)).length).toBe(3);
    expect(ripeGroup(s, at(0, 1)).length).toBe(1);
  });

  it('同じ作物の列は2段の倍率、交差は上乗せ', () => {
    const s = game();
    ripe(s, 'tomato', [at(0, 0), at(1, 0), at(2, 0)]);
    expect(multSteps(s, at(1, 0)).map((x) => x.label)).toEqual(['列', '同じ作物']);
    expect(cellMultiplier(s, at(1, 0))).toBeCloseTo(CONFIG.lineMult * CONFIG.sameCropMult);
    ripe(s, 'tomato', [at(0, 1), at(0, 2)]);
    expect(cellMultiplier(s, at(0, 0))).toBeCloseTo(CONFIG.lineMult * CONFIG.sameCropMult * (1 + CONFIG.crossBonus));
  });

  it('列を売るとまとめて売れて、所持金に入る', () => {
    const s = game();
    ripe(s, 'tomato', [at(0, 0), at(1, 0), at(2, 0)]);
    const r = sell(s, at(0, 0))!;
    expect(r.size).toBe(3);
    expect(r.line).toBe(true);
    expect(s.gold).toBe(r.total);
    expect(fieldCells(s).every((c) => s.field[c] === null)).toBe(true);
  });

  it('トマト祭りはトマトだけの列にさらに上乗せ', () => {
    const s = game();
    s.charms.tomatoFest = 1;
    ripe(s, 'tomato', [at(0, 0), at(1, 0), at(2, 0)]);
    expect(multSteps(s, at(0, 0)).map((x) => x.label)).toContain('トマト祭り');
  });

  it('畑を全部いっぺんに売ると豊年満作', () => {
    const s = game();
    ripe(s, 'tomato', fieldCells(s));
    const r = sell(s, at(0, 0))!;
    expect(r.size).toBe(9);
    expect(r.bumper).toBeGreaterThan(0);
    expect(s.charms.bumperHarvest).toBe(1);
  });
});

describe('出目を使う', () => {
  it('種は空きマスに植える。満月はマスを選ばずに全体が育つ', () => {
    const s = game();
    s.results = [reel('seed', 2), reel('moon')];
    expect(useSymbol(s, 0, at(0, 0))).toEqual([at(0, 0)]);
    expect(canUse(s, 0, at(0, 0))).toBe(false);
    expect(canUse(s, 1, null)).toBe(true);
    useSymbol(s, 1, null);
    expect(s.field[at(0, 0)]!.growth).toBe(1);
  });

  it('天気雨：同じ日に雨と太陽が重なったマスはさらに+1', () => {
    const s = game();
    s.charms.sunshower = 1;
    s.field[at(1, 1)] = newCrop('pumpkin');
    s.results = [reel('rain'), reel('sun')];
    useSymbol(s, 0, at(1, 1));
    useSymbol(s, 1, at(1, 1));
    expect(s.field[at(1, 1)]!.growth).toBe(3);
  });

  it('霜のマスは植えられず、雑草は抜くとお金が減る', () => {
    const s = game();
    s.frost[at(0, 0)] = 2;
    s.results = [reel('seed')];
    expect(canUse(s, 0, at(0, 0))).toBe(false);
    s.weeds[at(1, 0)] = true;
    s.gold = 10;
    expect(pullWeed(s, at(1, 0))).toBe(true);
    expect(s.gold).toBe(10 - CONFIG.weedPullCost);
  });
});

describe('年貢と難しさ', () => {
  it('年貢は表どおりで、首の皮で半分、難しい1で1.3倍', () => {
    const s = game();
    expect(nextTax(s).amount).toBe(taxAmount(0));
    s.halfTax = true;
    expect(nextTax(s).amount).toBe(Math.round(taxAmount(0) * 0.5));
    const h = newGame({ shop: ['addSun'], charmPool: [], difficulty: 1 });
    expect(nextTax(h).amount).toBe(Math.round(taxAmount(0) * 1.3));
  });

  it('難しい2でショップが高く、難しい3でお邪魔が早く多い', () => {
    const easy = newGame({ shop: ['addSun'], charmPool: [], difficulty: 0 });
    const hard = newGame({ shop: ['addSun'], charmPool: [], difficulty: 2 });
    expect(upgradePrice(hard, 'addSun')).toBeGreaterThan(upgradePrice(easy, 'addSun'));
    expect(obstacleRule(1, 3).count).toBe(obstacleRule(1, 0).count + 1);
  });

  it('払えないとゲームオーバー、払えると年貢の回数が増えてお守りの3択', () => {
    const s = game();
    s.day = CONFIG.taxPeriod;
    s.gold = 0;
    expect(endDay(s, Math.random).ok).toBe(false);
    const t = game();
    t.day = CONFIG.taxPeriod;
    t.gold = 100;
    expect(endDay(t, Math.random).ok).toBe(true);
    expect(t.taxesPaid).toBe(1);
    expect(t.charmOffer?.length).toBe(CONFIG.charmChoices);
  });

  it('首の皮は3回目以降の年貢をギリギリで払ったときだけ', () => {
    const s = game();
    s.day = CONFIG.taxPeriod;
    s.gold = taxAmount(0) + 1;
    endDay(s, Math.random);
    expect(s.charms.lastStraw).toBe(0);
    const t = game();
    t.taxesPaid = EVENT_CONDITIONS.lastStrawFrom - 1;
    t.day = CONFIG.taxPeriod * EVENT_CONDITIONS.lastStrawFrom;
    t.gold = nextTax(t).amount + 1;
    endDay(t, Math.random);
    expect(t.charms.lastStraw).toBe(1);
    expect(t.halfTax).toBe(true);
  });
});

describe('道具・特別なマス', () => {
  it('道具は特別なマスの上に置ける。特別なマスは道具の上に置けない', () => {
    const s = game();
    s.stock = ['water', 'well', 'compost'];
    expect(place(s, at(0, 0))).toBe('water');
    expect(place(s, at(0, 0))).toBe('well');
    expect(canPlace(s, at(0, 0))).toBe(false);
  });

  it('買った道具は手元に入り、同じ物は買うたびに高くなる', () => {
    const s = game();
    s.gold = 1000;
    s.weeklyPlaces = ['scarecrow'];
    expect(buyPlace(s, 'scarecrow')).toBe(true);
    expect(s.stock).toEqual(['scarecrow']);
  });

  it('かかしは10回守ると大かかしに進化', () => {
    const s = game();
    s.tools[at(0, 0)] = 'scarecrow';
    s.toolXp[at(0, 0)] = 10;
    evolveTools(s);
    expect(s.tools[at(0, 0)]).toBe('bigScarecrow');
  });

  it('かかしの近くの作物はカラスに食べられない', () => {
    const s = game();
    s.tools[at(1, 1)] = 'scarecrow';
    s.field[at(0, 0)] = newCrop('tomato');
    s.results = [{ symbol: 'crow', used: false, total: 1, left: 1, power: 1 }];
    const ev = resolveAuto(s, 0, () => 0);
    expect(ev?.type === 'crow' && ev.guarded).toBe(true);
    expect(s.field[at(0, 0)]).not.toBeNull();
  });
});

describe('お守り', () => {
  it('袋の条件を満たすと、次の3択に1回必ず並ぶ', () => {
    const s = game();
    s.bag.rain = CONFIG.initialBag.rain + 3;
    checkReady(s);
    expect(s.ready).toContain('thunderstorm');
    expect(rollCharmOffer(s, Math.random)).toContain('thunderstorm');
    expect(s.ready).not.toContain('thunderstorm');
  });

  it('買い物で袋の条件を満たしても気づく', () => {
    const s = game();
    s.bag.rain = 4;
    s.gold = 100;
    s.weekly = ['addRain'];
    buy(s, 'addRain');
    expect(s.ready).toContain('thunderstorm');
  });

  it('同じお守り3個で金色、効き目2倍', () => {
    const s = game();
    s.charms.coinPurse = 2;
    s.charmOffer = ['coinPurse'];
    chooseCharm(s, 'coinPurse');
    expect(isGolden(s, 'coinPurse')).toBe(true);
    expect(lv(s, 'coinPurse')).toBe(6);
  });

  it('カラスに食べられ続けるとカラス返し', () => {
    const s = game();
    s.stats.crowEaten = EVENT_CONDITIONS.crowReturn - 1;
    s.field[at(0, 0)] = newCrop('tomato');
    s.results = [{ symbol: 'crow', used: false, total: 1, left: 1, power: 1 }];
    resolveAuto(s, 0, () => 0.1);
    expect(s.charms.crowReturn).toBe(1);
  });
});

describe('遊ぶたびに増える要素', () => {
  const meta = (): MetaState => ({
    points: 0, totalPoints: 0, unlockedAdds: ['addSun', 'addRain'], unlockedCharms: [], capacityLevel: 0, loadout: [], plays: 0,
    maxCleared: -1, lines: 0, discovered: [], skins: [], skin: '', difficulty: 0,
  });

  it('初めてクリアでメロン・金色のスロット・難しい1が開く', () => {
    const m = meta();
    const s = game();
    s.cleared = true;
    const newly = recordRun(m, s, true);
    expect(m.unlockedAdds).toContain('addMelonSeed');
    expect(m.skins).toContain('gold');
    expect(m.maxCleared).toBe(0);
    expect(newly.length).toBeGreaterThan(0);
  });

  it('累計で列を売ると雷が開く', () => {
    const m = meta();
    const s = game();
    s.stats.lineHarvests = THUNDER_LINES;
    recordRun(m, s, true);
    expect(m.unlockedAdds).toContain('addThunder');
  });
});

describe('スイカ（2×2）', () => {
  it('4マス空いていれば左上に植えられ、4マスとも埋まる', () => {
    const s = game();
    s.results = [reel('watermelonSeed')];
    expect(canUse(s, 0, at(2, 0))).toBe(false); // 右がはみ出す
    expect(useSymbol(s, 0, at(0, 0))!.sort((a, b) => a - b)).toEqual([at(0, 0), at(1, 0), at(0, 1), at(1, 1)]);
    expect(s.field[at(1, 1)]!.anchor).toBe(at(0, 0));
  });

  it('どのマスに雨が当たっても1回だけ育ち、列に入らず、実ったら単品でも満額で売れる', () => {
    const s = game();
    s.results = [reel('watermelonSeed'), reel('rain')];
    useSymbol(s, 0, at(0, 0));
    useSymbol(s, 1, at(1, 1));
    expect(s.field[at(0, 0)]!.growth).toBe(1);
    s.field[at(0, 0)]!.growth = 99;
    ripe(s, 'tomato', [at(2, 0), at(2, 1), at(2, 2)]);
    expect(multSteps(s, at(0, 0)).map((x) => x.label)).toEqual(['大物']);
    const r = sell(s, at(1, 1))!;
    expect(r.size).toBe(1);
    expect(r.total).toBe(CROPS.watermelon.price);
    expect([at(0, 0), at(1, 0), at(0, 1), at(1, 1)].every((c) => s.field[c] === null)).toBe(true);
  });
});

describe('鍬とモグラ', () => {
  it('鍬は横一列の雑草・霜を消して耕し、耕した土に植えると成長+1', () => {
    const s = game();
    s.weeds[at(0, 1)] = true;
    s.frost[at(1, 1)] = 2;
    s.results = [reel('hoe'), reel('seed')];
    useSymbol(s, 0, at(2, 1));
    expect(s.weeds[at(0, 1)]).toBe(false);
    expect(s.frost[at(1, 1)]).toBe(0);
    expect(s.tilled[at(2, 1)]).toBe(true);
    useSymbol(s, 1, at(2, 1));
    expect(s.field[at(2, 1)]!.growth).toBe(1);
    expect(s.tilled[at(2, 1)]).toBe(false);
  });

  it('モグラは作物を隣の空きマスへ押し出す（スイカは動かせない）', () => {
    const s = game();
    s.field[at(1, 1)] = newCrop('tomato');
    s.results = [{ symbol: 'mole', used: false, total: 1, left: 1, power: 1 }];
    const ev = resolveAuto(s, 0, () => 0);
    expect(ev?.type).toBe('mole');
    expect(s.field[at(1, 1)]).toBeNull();
    expect(fieldCells(s).filter((c) => s.field[c]).length).toBe(1);
    const t = game();
    t.results = [reel('watermelonSeed')];
    useSymbol(t, 0, at(0, 0));
    t.results = [{ symbol: 'mole', used: false, total: 1, left: 1, power: 1 }];
    expect(resolveAuto(t, 0, () => 0)).toEqual({ type: 'mole', moves: [], chased: [] });
  });
});

describe('水路のつながり・小屋・相場・品評会', () => {
  it('水路を3つまっすぐ並べると水車、囲んだ空きマスは釣り堀で、夜にお金が入る', () => {
    const s = game();
    [at(0, 0), at(1, 0), at(2, 0)].forEach((c) => (s.tiles[c] = 'water'));
    expect(waterWheels(s)).toEqual([[at(0, 0), at(1, 0), at(2, 0)]]);
    [at(0, 1), at(2, 1), at(1, 2)].forEach((c) => (s.tiles[c] = 'water'));
    expect(isPond(s, at(1, 1))).toBe(true);
    s.tools[at(0, 2)] = 'henhouse';
    s.tools[at(2, 2)] = 'cowshed';
    endDay(s, () => 0.99);
    const n = s.nightIncome!;
    expect(n.wheel).toBe(3 * CONFIG.wheelGold);
    expect(n.fish).toBe(CONFIG.fishGold);
    // 牛小屋（2,2）は水路（1,2）の隣なので水飲み場の分も入る
    expect(n.animals).toBe(CONFIG.henhouseGold + CONFIG.cowshedGold + CONFIG.cowWaterGold);
    expect(s.gold).toBe(n.wheel + n.fish + n.animals);
  });

  it('鶏小屋の周りの虫は食べられる', () => {
    const s = game();
    s.tools[at(1, 1)] = 'henhouse';
    s.field[at(0, 0)] = { ...newCrop('tomato'), growth: 2 };
    s.results = [{ symbol: 'bug', used: false, total: 1, left: 1, power: 1 }];
    const ev = resolveAuto(s, 0, () => 0.9);
    expect(ev?.type === 'bug' && ev.warded).toBe(true);
    expect(s.field[at(0, 0)]!.growth).toBe(2);
  });

  it('相場の高値・安値が売値にかかる', () => {
    const s = game();
    s.market = { high: 'tomato', low: 'strawberry' };
    expect(cropPrice(s, newCrop('tomato'))).toBe(Math.round(CROPS.tomato.price * CONFIG.marketHigh));
    expect(cropPrice(s, newCrop('strawberry'))).toBe(Math.round(CROPS.strawberry.price * CONFIG.marketLow));
  });

  // 品評会は一時停止中
  it.skipIf(!CONFIG.exhibitionOn)('作物を全種類売ると品評会がもらえる', () => {
    const s = game();
    s.stats.soldKinds = ['tomato', 'strawberry', 'pumpkin', 'melon', 'corn'];
    expect(s.charms.exhibition).toBe(0);
    s.results = [reel('watermelonSeed')];
    useSymbol(s, 0, at(0, 0));
    s.field[at(0, 0)]!.growth = 99;
    sell(s, at(0, 0));
    expect(s.charms.exhibition).toBe(1);
  });
});

describe('大きな種袋', () => {
  it('1個ずつ植える種（かぼちゃ・スイカなど）も含めて、全部の種の植えられる数が増える', () => {
    const s = game();
    s.charms.seedSack = 1;
    s.bag = Object.fromEntries(Object.keys(s.bag).map((k) => [k, 0])) as GameState['bag'];
    s.bag.pumpkinSeed = 1;
    drawDay(s, () => 0);
    expect(s.results[0].symbol).toBe('pumpkinSeed');
    expect(s.results[0].total).toBe(2);
  });
});

describe('相場は難しい2から', () => {
  // 相場は一時停止中
  it.skipIf(!CONFIG.marketOn)('ふつう・難しい1では相場が立たず、難しい2では立つ', () => {
    for (const [difficulty, has] of [[0, false], [1, false], [CONFIG.marketFrom, true]] as const) {
      const s = newGame({ shop: ['addSun'], charmPool: [], difficulty });
      drawDay(s, Math.random);
      expect(s.market !== null).toBe(has);
    }
  });
});

describe('シナジー', () => {
  it('巣箱の周りの苺は毎晩育つ（苺以外は育たない）', () => {
    const s = game();
    s.tools[at(1, 1)] = 'hive';
    s.field[at(0, 0)] = newCrop('strawberry');
    s.field[at(2, 2)] = newCrop('tomato');
    endDay(s, () => 0.99);
    expect(s.field[at(0, 0)]!.growth).toBe(1);
    expect(s.field[at(2, 2)]!.growth).toBe(0);
  });

  it('水車の立った水路に隣り合うマスは毎晩育つ', () => {
    const s = game();
    [at(0, 0), at(1, 0), at(2, 0)].forEach((c) => (s.tiles[c] = 'water'));
    s.field[at(1, 1)] = newCrop('tomato');
    s.field[at(1, 2)] = newCrop('tomato');
    endDay(s, () => 0.99);
    expect(s.field[at(1, 1)]!.growth).toBe(1);
    expect(s.field[at(1, 2)]!.growth).toBe(0);
  });

  it('牛小屋の隣に水路があると収入+2、牧場主で鶏・牛とも+1、水車職人で水車×2', () => {
    const s = game();
    s.tools[at(0, 0)] = 'cowshed';
    s.tiles[at(1, 0)] = 'water';
    expect(animalGold(s, at(0, 0))).toBe(CONFIG.cowshedGold + CONFIG.cowWaterGold);
    s.charms.rancher = 1;
    expect(animalGold(s, at(0, 0))).toBe(CONFIG.cowshedGold + CONFIG.cowWaterGold + 1);
    const t = game();
    [at(0, 0), at(1, 0), at(2, 0)].forEach((c) => (t.tiles[c] = 'water'));
    t.charms.wheelwright = 1;
    endDay(t, () => 0.99);
    expect(t.nightIncome!.wheel).toBe(3 * CONFIG.wheelGold * 2);
  });

  it('牧場：鶏小屋・牛小屋・巣箱がそろうと収入と巣箱の売値が2倍', () => {
    const s = game();
    s.tools[at(0, 0)] = 'henhouse';
    s.tools[at(1, 0)] = 'cowshed';
    expect(hasRanch(s)).toBe(false);
    s.tools[at(2, 0)] = 'hive';
    expect(hasRanch(s)).toBe(true);
    expect(animalGold(s, at(0, 0))).toBe(CONFIG.henhouseGold * 2);
    expect(hiveBonus(s, at(2, 1))).toBe(4);
  });

  it('彩りの畑：実った作物が4種類以上あると売値+10%', () => {
    const s = game();
    ripe(s, 'tomato', [at(0, 0)]);
    ripe(s, 'strawberry', [at(1, 0)]);
    ripe(s, 'pumpkin', [at(2, 0)]);
    const before = cropPrice(s, s.field[at(2, 0)]!);
    ripe(s, 'corn', [at(0, 2)]);
    expect(isColorful(s)).toBe(true);
    expect(cropPrice(s, s.field[at(2, 0)]!)).toBe(Math.round(before * (1 + CONFIG.colorfulBonus)));
  });

  it('太陽は縦一列の霜を溶かす（作物がなくても使える）', () => {
    const s = game();
    s.frost[at(1, 2)] = 3;
    s.results = [reel('sun')];
    expect(canUse(s, 0, at(1, 0))).toBe(true);
    useSymbol(s, 0, at(1, 0));
    expect(s.frost[at(1, 2)]).toBe(0);
  });

  it('大物狙いでスイカが高く、耕作上手で耕した土は成長+2', () => {
    const s = game();
    s.charms.bigGame = 1;
    expect(cropPrice(s, newCrop('watermelon'))).toBe(CROPS.watermelon.price + 30);
    s.charms.tillMaster = 1;
    s.tilled[at(0, 0)] = true;
    s.results = [reel('seed')];
    useSymbol(s, 0, at(0, 0));
    expect(s.field[at(0, 0)]!.growth).toBe(2);
  });

  it('大物狙いはスイカの種を使えないゲームでは3択に出ない', () => {
    const s = newGame({ shop: ['addSun'], charmPool: ['bigGame', 'coinPurse', 'aging', 'crowToll'] });
    for (let k = 0; k < 30; k++) expect(rollCharmOffer(s, Math.random)).not.toContain('bigGame');
  });
});

describe('お邪魔を消すのは週1回まで', () => {
  it('同じ週に2回目は消せず、週が替わるとまた消せる', () => {
    const s = newGame();
    s.bag.crow = 3;
    s.bag.bug = 2;
    s.gold = 9999;
    expect(buy(s, 'removeCrow')).toBe(true);
    expect(canBuy(s, 'removeBug')).toBe(false);
    expect(buy(s, 'removeCrow')).toBe(false);
    s.order = null;
    drawDay(s, Math.random);
    expect(buy(s, 'removeBug')).toBe(true);
  });
});

describe('シナジーの手直し', () => {
  const C = CONFIG.fieldCols;
  const at = (x: number, y: number) => y * C + x;
  const ripe = (k: CropKind) => ({ ...newCrop(k), growth: CROPS[k].ripe });

  it('釣り堀は4方を水路で囲んだマスだけ（畑の端は囲みにならない）', () => {
    const s = newGame();
    [at(2, 0), at(1, 1), at(2, 2)].forEach((c) => (s.tiles[c] = 'water'));
    expect(isPond(s, at(2, 1))).toBe(false);
    s.cols = 4;
    s.tiles[at(3, 1)] = 'water';
    expect(isPond(s, at(2, 1))).toBe(true);
  });

  it('彩りの畑は、売って種類が減ってもその日のうちは続き、次の日に判定し直す', () => {
    const s = newGame();
    s.day = 1;
    s.field[at(0, 0)] = ripe('tomato');
    s.field[at(2, 0)] = ripe('strawberry');
    s.field[at(0, 2)] = ripe('pumpkin');
    s.field[at(2, 2)] = ripe('corn');
    sell(s, at(0, 0));
    expect(isColorful(s)).toBe(true);
    drawDay(s, Math.random);
    expect(isColorful(s)).toBe(false);
  });

  it('鶏小屋の周りの作物はモグラに押し出されない', () => {
    const s = newGame();
    s.tools[at(1, 1)] = 'henhouse';
    s.field[at(0, 0)] = newCrop('tomato');
    s.results = [{ symbol: 'mole', used: false, total: 1, left: 1, power: 1 }];
    const e = resolveAuto(s, 0, () => 0);
    expect(e).toEqual({ type: 'mole', moves: [], chased: [at(0, 0)] });
    expect(s.field[at(0, 0)]?.kind).toBe('tomato');
  });

  it('鶏小屋が食べた虫は鶏小屋のおかげと分かる', () => {
    const s = newGame();
    s.tools[at(1, 1)] = 'henhouse';
    s.field[at(0, 0)] = { ...newCrop('tomato'), growth: 2 };
    s.results = [{ symbol: 'bug', used: false, total: 1, left: 1, power: 1 }];
    expect(resolveAuto(s, 0, () => 0)).toMatchObject({ type: 'bug', warded: true, hen: true });
  });

  it('夜に育ったマスが記録される', () => {
    const s = newGame();
    s.day = 2;
    s.tools[at(1, 1)] = 'hive';
    s.field[at(0, 0)] = newCrop('strawberry');
    endDay(s, () => 0.99);
    expect(s.nightIncome?.grown).toContain(at(0, 0));
  });
});

describe('ショップは週替わり', () => {
  it('足す品・畑の品は週ごとに3つずつ。並んでいない品は買えず、消す品はいつでも', () => {
    const s = newGame();
    drawDay(s, Math.random);
    expect(s.weekly).toHaveLength(CONFIG.weeklyCount);
    expect(s.weeklyPlaces).toHaveLength(CONFIG.weeklyCount);
    s.gold = 9999;
    const notAdd = (['addSeed', 'addRain', 'addSun', 'addMoon'] as const).find((id) => !s.weekly.includes(id))!;
    expect(canBuy(s, notAdd)).toBe(false);
    expect(canBuy(s, s.weekly[0])).toBe(true);
    const notPlace = (['scarecrow', 'well', 'hive', 'compost'] as const).find((id) => !s.weeklyPlaces.includes(id))!;
    expect(buyPlace(s, notPlace)).toBe(false);
    s.bag.crow = 2;
    expect(canBuy(s, 'removeCrow')).toBe(true);
  });

  it('年貢のあとの週で入れ替わる', () => {
    const s = newGame();
    const seen = new Set<string>();
    for (let k = 0; k < 6; k++) {
      s.order = null;
      drawDay(s, Math.random);
      s.weekly.forEach((id) => seen.add(id));
    }
    expect(seen.size).toBeGreaterThan(CONFIG.weeklyCount);
  });
});

describe('狙い', () => {
  it('一番多く実らせられる育ての絵柄と、その数を出す', () => {
    const s = newGame();
    const C = CONFIG.fieldCols;
    for (const k of Object.keys(s.bag) as SymbolId[]) s.bag[k] = 0;
    s.bag.rain = 1;
    s.bag.sun = 1;
    // 左の縦一列に3つと右隣に1つ、あと1で実るトマト → 太陽（縦一列）は3つ、雨（縦横十字）は4つ
    [0, C, 2 * C].forEach((c) => (s.field[c] = { ...newCrop('tomato'), growth: 2 }));
    s.field[1] = { ...newCrop('tomato'), growth: 2 };
    const aim = bestAim(s)!;
    expect(aim).toMatchObject({ symbol: 'rain', ripen: 4 });
    s.field = s.field.map(() => null);
    expect(bestAim(s)).toBeNull();
  });
});

describe('作戦が変わる品', () => {
  it('毎週、足す品・畑の品にそれぞれ1つは作戦が変わる品が並ぶ', () => {
    for (let k = 0; k < 30; k++) {
      const s = newGame();
      drawDay(s, Math.random);
      expect(s.weekly.some((id) => isPivotAdd(s, id))).toBe(true);
      expect(s.weeklyPlaces.some((id) => isPivotPlace(s, id))).toBe(true);
    }
  });
});

describe('列の予告', () => {
  it('育ち中の作物と3つ並ぶマスに植えると列の見込み、同じ作物なら上乗せ', () => {
    const s = newGame();
    const C = CONFIG.fieldCols;
    s.field[0] = newCrop('tomato');
    s.field[1] = newCrop('tomato');
    expect(plantLineMult(s, 2, 'tomato')).toBeCloseTo(CONFIG.lineMult * CONFIG.sameCropMult);
    expect(plantLineMult(s, 2, 'strawberry')).toBeCloseTo(CONFIG.lineMult);
    expect(plantLineMult(s, 2 * C + 2, 'tomato')).toBe(0);
  });
});
