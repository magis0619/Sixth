// ルール本体（src/game.ts）と遊ぶたびに増える要素（src/meta.ts）の単体テスト。
// 画面に依存しない部分だけを確かめる。 npm test

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG, CROPS, CUT, EVENT_CONDITIONS, FARMERS, THUNDER_LINES, UPGRADE_SYMBOL } from '../src/config.ts';
import {
  animalGold, buy, buyPlace, drawDay, hasRanch, hiveBonus, isColorful, canPlace, canUse, cellMultiplier, cropPrice, isPond, waterWheels, checkReady, chooseCharm, endDay, evolveTools, expand, expandPrice,
  fieldCells, isGolden, lv, multSteps, newCrop, newGame as newGameRaw, nextTax, obstacleRule, place, pullWeed, resolveAuto, ripeGroup,
  canBuy, canBuyPlace, canExpand, isMarketDay, rollObstacles, takeOffer, refreshCombos, symbolShape, canPlaceAt, isPivotAdd, isPivotPlace, mustPlace, plantLineMult, rollCharmOffer, sell, shapeCells, taxAmount, upgradePrice, useSymbol, type GameState, type ReelResult, beginDay, takeContract, mergeable, mergeSymbol, mergeCost, bagCount, skipCharm, singleMult, rollOffer, buyPremium, canBuyPremium, premiumPrice, resolveAuto as autoOf, discard, discardPrice, canDiscard, placePrice,
} from '../src/game.ts';
import { CONTRACTS, contractGold } from '../src/contracts.ts';

/** 試しの畑：農家を指定しないときは、ふつうの農家の最初のお守り（日だまり）なしで始める（数え方を変えないため） */
const newGame: typeof newGameRaw = (setup) => {
  const s = newGameRaw(setup);
  if (!setup?.farmer) s.charms.sunBlessing = 0;
  return s;
};
import { farmerUnlocked, recordRun, type MetaState } from '../src/meta.ts';
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
    s.day = CONFIG.marketDays[0];
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

  it('同じ作物の列は2段の倍率（交差のおまけは今はなし）', () => {
    const s = game();
    ripe(s, 'tomato', [at(0, 0), at(1, 0), at(2, 0)]);
    expect(multSteps(s, at(1, 0)).map((x) => x.label)).toEqual(['列', '同じ作物']);
    expect(cellMultiplier(s, at(1, 0))).toBeCloseTo(CONFIG.lineMult * CONFIG.sameCropMult);
    ripe(s, 'tomato', [at(0, 1), at(0, 2)]);
    expect(cellMultiplier(s, at(0, 0))).toBeCloseTo(CONFIG.lineMult * CONFIG.sameCropMult * (1 + CONFIG.crossBonus));
  });

  it('長い列ほど高い：4つで×1.5、5つで×1.8（列×1.3にさらに掛ける）', () => {
    const s = game();
    s.cols = 5;
    ripe(s, 'tomato', [at(0, 0), at(1, 0), at(2, 0), at(3, 0)]);
    ripe(s, 'strawberry', [at(4, 1)]);
    expect(multSteps(s, at(1, 0)).map((x) => x.label)).toEqual(['列', '4つの列', '同じ作物']);
    expect(cellMultiplier(s, at(1, 0)) / CONFIG.sameCropMult).toBeCloseTo(1.3 * 1.15);
    ripe(s, 'strawberry', [at(4, 0)]);
    // 5つ目は別の作物：長さは5、同じ作物ではない
    expect(multSteps(s, at(1, 0)).map((x) => x.label)).toEqual(['列', '5つの列']);
    expect(cellMultiplier(s, at(1, 0))).toBeCloseTo(CONFIG.lineMult * 1.4);
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

  it('畑を全部いっぺんに売ると大豊作（4×4以上・1プレイに1回だけ）', () => {
    const small = game();
    ripe(small, 'tomato', fieldCells(small));
    expect(sell(small, at(0, 0))!.bumper).toBe(0);
    const s = game();
    s.cols = 4;
    s.rows = 4;
    ripe(s, 'tomato', fieldCells(s));
    const r = sell(s, at(0, 0))!;
    expect(r.size).toBe(16);
    expect(r.bumper).toBeGreaterThan(0);
    expect(s.charms.bumperHarvest).toBe(1);
    ripe(s, 'tomato', fieldCells(s));
    expect(sell(s, at(0, 0))!.bumper).toBe(0);
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
    expect(nextTax(h).amount).toBe(Math.round(taxAmount(0) * CONFIG.difficultyTaxMult[1]));
  });

  it('難しい2でショップが高く、難しい3でお邪魔が早く来る', () => {
    const easy = newGame({ shop: ['addSun'], charmPool: [], difficulty: 0 });
    const hard = newGame({ shop: ['addSun'], charmPool: [], difficulty: 2 });
    expect(upgradePrice(hard, 'addSun')).toBeGreaterThan(upgradePrice(easy, 'addSun'));
    // 難しい3は増える表が hardObstacleStep 回分早く進む（4回目で、ふつうの5回目と同じ枚数）
    expect(obstacleRule(5 - CONFIG.hardObstacleStep, 3).count).toBe(obstacleRule(5, 0).count + CONFIG.hardObstacleExtra);
    expect(obstacleRule(5 - CONFIG.hardObstacleStep, 3).count).toBeGreaterThan(obstacleRule(5 - CONFIG.hardObstacleStep, 0).count);
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
    s.day = CONFIG.marketDays[0];
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

  it('かかしがカラスを追い払うとお礼が入る（大かかしは多め）', () => {
    const s = game();
    s.tools[at(1, 1)] = 'scarecrow';
    s.field[at(0, 0)] = newCrop('tomato');
    s.results = [{ symbol: 'crow', used: false, total: 1, left: 1, power: 1 }];
    const g = s.gold;
    const ev = resolveAuto(s, 0, () => 0);
    expect(ev?.type === 'crow' && ev.reward).toBe(CONFIG.repelGold);
    expect(s.gold - g).toBe(CONFIG.repelGold + (ev?.type === 'crow' ? ev.toll : 0));
    const t = game();
    t.tools[at(2, 2)] = 'bigScarecrow';
    t.field[at(0, 0)] = newCrop('tomato');
    t.results = [{ symbol: 'crow', used: false, total: 1, left: 1, power: 1 }];
    const ev2 = resolveAuto(t, 0, () => 0);
    expect(ev2?.type === 'crow' && ev2.reward).toBe(CONFIG.repelBigGold);
  });
});

describe('お守り', () => {
  it('雷雨などの組み合わせは、お守りの3択には出ない', () => {
    const s = game();
    s.bag.rain = 9;
    s.offer = ['addRain'];
    takeOffer(s, 'addRain');
    expect(s.ready).not.toContain('thunderstorm');
  });

  it('同じお守り3個で金色、効き目2倍', () => {
    const s = game();
    s.charms.coinPurse = 2;
    s.charmOffer = ['coinPurse'];
    chooseCharm(s, 'coinPurse');
    expect(isGolden(s, 'coinPurse')).toBe(true);
    expect(lv(s, 'coinPurse')).toBe(6);
  });

  // 一旦減らした要素（CUT）の間は飛ばす
  it.skipIf(CUT.charms.includes('crowReturn'))('カラスに食べられ続けるとカラス返し', () => {
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

  // 一旦減らした要素（CUT）の間は飛ばす
  it.skipIf(CUT.symbols.includes('melonSeed'))('初めてクリアでメロン・金色のスロット・難しい1が開く', () => {
    const m = meta();
    const s = game();
    s.cleared = true;
    const newly = recordRun(m, s, true);
    expect(m.unlockedAdds).toContain('addMelonSeed');
    expect(m.skins).toContain('gold');
    expect(m.maxCleared).toBe(0);
    expect(newly.length).toBeGreaterThan(0);
  });

  it('ふつうをクリアすると苺農家が開き、難しさを上げてクリアするたびに次の農家が開く', () => {
    const m = meta();
    expect(farmerUnlocked(m, 'basic')).toBe(true);
    expect(farmerUnlocked(m, 'berry')).toBe(false);
    const s = game();
    s.cleared = true;
    const newly = recordRun(m, s, true);
    expect(farmerUnlocked(m, 'berry')).toBe(true);
    expect(farmerUnlocked(m, 'pumpkin')).toBe(false);
    expect(newly).toContain(FARMERS.find((f) => f.id === 'berry')!.name);
    s.difficulty = 1;
    recordRun(m, s, true);
    expect(farmerUnlocked(m, 'pumpkin')).toBe(true);
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

  it('鶏小屋・牛小屋は働くほど育ち、毎晩の収入が増える', () => {
    const s = game();
    s.tools[at(0, 0)] = 'henhouse';
    s.tools[at(2, 2)] = 'cowshed';
    for (let k = 0; k < CONFIG.animalLvNeed; k++) endDay(s, () => 0.99);
    expect(s.toolLv[at(0, 0)]).toBe(1);
    expect(s.toolLv[at(2, 2)]).toBe(1);
    expect(animalGold(s, at(0, 0))).toBe(CONFIG.henhouseGold + CONFIG.henhouseLvGold);
    expect(animalGold(s, at(2, 2))).toBe(CONFIG.cowshedGold + CONFIG.cowshedLvGold);
    for (let k = 0; k < CONFIG.animalLvNeed * 3; k++) endDay(s, () => 0.99);
    expect(s.toolLv[at(0, 0)]).toBe(CONFIG.animalLvMax);
    // 虫を食べても経験が入り、お礼も入る
    const t = game();
    t.tools[at(1, 1)] = 'henhouse';
    t.field[at(0, 0)] = { ...newCrop('tomato'), growth: 2 };
    t.results = [{ symbol: 'bug', used: false, total: 1, left: 1, power: 1 }];
    const ev = resolveAuto(t, 0, () => 0.9);
    expect(ev?.type === 'bug' && ev.reward).toBe(CONFIG.henBugGold);
    expect(t.toolXp[at(1, 1)]).toBe(1);
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

  it('牛小屋の隣に水路があると収入+2、牧場主で鶏・牛とも+2、水車職人で水車×2', () => {
    const s = game();
    s.tools[at(0, 0)] = 'cowshed';
    s.tiles[at(1, 0)] = 'water';
    expect(animalGold(s, at(0, 0))).toBe(CONFIG.cowshedGold + CONFIG.cowWaterGold);
    s.charms.rancher = 1;
    expect(animalGold(s, at(0, 0))).toBe(CONFIG.cowshedGold + CONFIG.cowWaterGold + 2);
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
    expect(hiveBonus(s, at(2, 1))).toBeCloseTo(0.4);
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
    expect(cropPrice(s, newCrop("watermelon"))).toBe(CROPS.watermelon.price + 50);
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
  it('1回の市で2回目は消せず、次の市でまた消せる', () => {
    const s = newGame();
    s.day = CONFIG.marketDays[0];
    s.bag.crow = 3;
    s.bag.bug = 2;
    s.gold = 9999;
    expect(buy(s, 'removeCrow')).toBe(true);
    expect(canBuy(s, 'removeBug')).toBe(false);
    expect(buy(s, 'removeCrow')).toBe(false);
    while (s.day < CONFIG.marketDays[1]) drawDay(s, Math.random);
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
  it('市の日だけ仕入れ（3択から1つタダ）と買い物ができる。ショップで絵柄は足せない。畑の品は週ごとに3つ', () => {
    const s = newGame();
    // 市の日でない日は仕入れが空で、何も買えない
    for (let d = 1; d < CONFIG.marketDays[0]; d++) {
      drawDay(s, Math.random);
      expect(s.offer).toEqual([]);
      s.gold = 9999;
      s.bag.crow = 2;
      expect(canBuy(s, 'removeCrow')).toBe(false);
      expect(canExpand(s)).toBe(false);
      s.gold = 0;
    }
    drawDay(s, Math.random);
    expect(isMarketDay(s.day)).toBe(true);
    expect(s.offer).toHaveLength(CONFIG.dailyOfferCount);
    // 満月はレアとしてたまに1つだけ混ざる
    expect(s.offer.filter((id) => id === 'addMoon').length).toBeLessThanOrEqual(1);
    expect(s.weeklyPlaces).toHaveLength(CONFIG.weeklyCount);
    s.gold = 9999;
    expect(canBuy(s, 'addSeed')).toBe(false);
    expect(canBuy(s, 'addMoon')).toBe(false);
    // 仕入れはタダで1つだけ。選んだらその日は終わり
    const id = s.offer[0];
    const sym = UPGRADE_SYMBOL[id]!.symbol;
    const before = s.bag[sym];
    expect(takeOffer(s, id)).toBe(true);
    expect(s.bag[sym]).toBe(before + 1);
    expect(s.gold).toBe(9999);
    expect(s.offer).toEqual([]);
    expect(takeOffer(s, id)).toBe(false);
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

describe('土地と建物', () => {
  it('土地（水路・堆肥）は作物の上にも敷ける。建物は作物があっても置け、作物はどく（雑草・大物の上は不可）', () => {
    const s = newGame();
    s.field[0] = newCrop('tomato');
    expect(canPlaceAt(s, 'water', 0)).toBe(true);
    expect(canPlaceAt(s, 'compost', 0)).toBe(true);
    expect(canPlaceAt(s, 'henhouse', 0)).toBe(true);
    expect(canPlaceAt(s, 'henhouse', 1)).toBe(true);
    s.weeds[1] = true;
    expect(canPlaceAt(s, 'henhouse', 1)).toBe(false);
    s.stock = ['henhouse'];
    place(s, 0);
    expect(s.tools[0]).toBe('henhouse');
    expect(s.field[0]).toBeNull();
  });

  it('建物を置ける空きマスがなければ買えない。土地は敷けるマスが残っていれば買える', () => {
    const s = newGame();
    s.day = CONFIG.marketDays[0];
    s.gold = 9999;
    s.weeklyPlaces = ['henhouse', 'water'];
    fieldCells(s).forEach((c) => (s.field[c] = newCrop('tomato')));
    // 作物で埋まっていても、建物は作物をどけて置けるので買える
    expect(canBuyPlace(s, 'henhouse')).toBe(true);
    expect(canBuyPlace(s, 'water')).toBe(true);
    fieldCells(s).forEach((c) => (s.tiles[c] = 'compost'));
    expect(canBuyPlace(s, 'water')).toBe(false);
    fieldCells(s).forEach((c) => (s.weeds[c] = true));
    expect(canBuyPlace(s, 'henhouse')).toBe(false);
  });

  it('市ではいくつも買えて置き待ちにたまり、置ける場所の数までしか買えない', () => {
    const s = newGame();
    s.day = CONFIG.marketDays[0];
    s.gold = 99999;
    s.weeklyPlaces = ['henhouse', 'water'];
    expect(buyPlace(s, 'henhouse')).toBe(true);
    expect(mustPlace(s)).toBe(true);
    expect(canBuyPlace(s, 'water')).toBe(true);
    expect(buyPlace(s, 'water')).toBe(true);
    expect(s.stock).toEqual(['henhouse', 'water']);
    // 3×3の空き9マスに建物は9つまで（1つ目と合わせて）
    let n = 1;
    while (buyPlace(s, 'henhouse')) n++;
    expect(n).toBe(9);
    expect(canBuyPlace(s, 'henhouse')).toBe(false);
  });

  it('年貢の減免は1つで10%、上限30%', () => {
    const s = newGame();
    const base = nextTax(s).amount;
    s.charms.taxRelief = 1;
    expect(nextTax(s).amount).toBe(Math.round(base * 0.9));
    s.charms.taxRelief = 3;
    // 3つで金色（効果2倍）でも上限は30%
    expect(nextTax(s).amount).toBe(Math.round(base * 0.7));
  });
});

describe('増えるイナゴ（難しい5）', () => {
  it('難しい5だけ、最初から袋にイナゴがいる', () => {
    expect(newGame().bag.locust).toBe(0);
    expect(newGame({ shop: [], charmPool: [], difficulty: 5 }).bag.locust).toBe(CONFIG.locustStart);
  });

  it('出るたびに袋で増える。畑の作物はかじらない', () => {
    const s = game();
    s.bag.locust = 1;
    const crop = newCrop('tomato');
    crop.growth = 2;
    s.field[at(0, 0)] = crop;
    s.results = [reel('locust')];
    const ev = resolveAuto(s, 0, () => 0);
    expect(ev).toEqual({ type: 'locust', cell: null, damage: 0, bred: 1 });
    expect(s.bag.locust).toBe(2);
    expect(crop.growth).toBe(2);
  });

  it('大群なら2匹増える', () => {
    const s = game();
    s.results = [{ ...reel('locust'), power: 2 }];
    expect(resolveAuto(s, 0, () => 0)).toEqual({ type: 'locust', cell: null, damage: 0, bred: 2 });
    expect(s.bag.locust).toBe(2);
  });
});

describe('組み合わせ（同じ日にそろうと自動で起きる）', () => {
  it('雨2つと雷がそろうと雷雨：その日は雨が斜めにも効く。2つだけでは起きない', () => {
    const s = game();
    s.results = [reel('rain'), reel('thunder'), reel('coin')];
    refreshCombos(s);
    expect(s.combos).toEqual([]);
    expect(shapeCells(s, 'cross', at(1, 1))).not.toContain(at(0, 0));
    s.results = [reel('rain'), reel('thunder'), reel('rain')];
    refreshCombos(s);
    expect(s.combos).toContain('thunderstorm');
    expect(shapeCells(s, 'cross', at(1, 1))).toContain(at(0, 0));
  });

  it('トマトの種が2つ出ても組み合わせにはならない（トマト祭りはやめた）。組み合わせは日が変わると消える', () => {
    const s = game();
    s.results = [reel('seed', 3), reel('seed', 2), reel('crow')];
    refreshCombos(s);
    expect(s.combos).toEqual([]);
    s.results = [reel('rain'), reel('sun'), reel('seed', 2)];
    refreshCombos(s);
    expect(s.combos).toEqual(['sunshower']);
    endDay(s, () => 0.9);
    expect(s.combos).toEqual([]);
  });

  it('満月と金の種は仕入れにたまに混ざるレア。ふだんの3択には出ない', () => {
    const s = game();
    let seenRare = 0;
    for (let k = 0; k < 400; ) {
      s.order = { crop: 'tomato', need: 3, have: 0, reward: 1, dueDay: 999, done: false };
      drawDay(s, Math.random);
      if (!s.offer.length) continue;
      k++;
      const rare = s.offer.filter((id) => id === 'addMoon' || id === 'addGoldSeed');
      expect(rare.length).toBeLessThanOrEqual(1);
      seenRare += rare.length;
    }
    expect(seenRare).toBeGreaterThan(10);
    expect(seenRare).toBeLessThan(70);
  });

  it('雷＋太陽2つ＝青天の霹靂：雷が十字に効く', () => {
    const s = game();
    s.results = [reel('thunder'), reel('sun'), reel('sun')];
    refreshCombos(s);
    expect(s.combos).toContain('bolt');
    expect(symbolShape(s, 'thunder')).toBe('cross');
  });

  // 一旦減らした要素（CUT）の間は飛ばす
  it.skipIf(CUT.charms.includes('prosperity'))('商人＋金貨＝商売繁盛：金貨の額×2', () => {
    const s = game();
    s.results = [reel('merchant'), reel('coin'), reel('crow')];
    refreshCombos(s);
    const before = s.gold;
    const ev = resolveAuto(s, 1, () => 0.9);
    expect(ev).toEqual({ type: 'coin', amount: CONFIG.coinAmount * 2 });
    expect(s.gold - before).toBe(CONFIG.coinAmount * 2);
  });

  it('雨＋太陽＋満月＝豊年祭：全部の売値×1.5、かぼちゃの種＋満月＋雨＝秋の月：かぼちゃ×2', () => {
    const s = game();
    const tomato = newCrop('tomato');
    const pumpkin = newCrop('pumpkin');
    const base = [cropPrice(s, tomato), cropPrice(s, pumpkin)];
    s.results = [reel('rain'), reel('sun'), reel('moon')];
    refreshCombos(s);
    expect(s.combos).toContain('festival');
    expect(cropPrice(s, tomato)).toBe(Math.round(base[0] * 1.5));
    s.results = [reel('pumpkinSeed'), reel('moon'), reel('rain')];
    refreshCombos(s);
    expect(cropPrice(s, pumpkin)).toBe(base[1] * 2);
    expect(cropPrice(s, tomato)).toBe(base[0]);
  });

  // 一旦減らした要素（CUT）の間は飛ばす
  it.skipIf(CUT.charms.includes('sowing'))('鍬＋トマトの種＝種まき日和：植えた作物は成長+1から', () => {
    const s = game();
    s.results = [reel('hoe'), reel('seed', 2), reel('crow')];
    refreshCombos(s);
    expect(s.combos).toContain('sowing');
    useSymbol(s, 1, at(0, 0));
    expect(s.field[at(0, 0)]!.growth).toBe(1);
  });

  it('蜂＋苺の種＋太陽＝花畑：苺だけの列×1.5', () => {
    const s = game();
    ripe(s, 'strawberry', [at(0, 0), at(1, 0), at(2, 0)]);
    s.results = [reel('bee'), reel('berrySeed', 3), reel('sun')];
    refreshCombos(s);
    expect(multSteps(s, at(0, 0)).map((x) => x.label)).toContain('花畑');
  });
});


describe('農家（試し中）', () => {
  it('農家ごとに最初の袋・お守り・畑の品が違う', () => {
    const base = newGame({ shop: [], charmPool: [] });
    const berry = newGame({ shop: [], charmPool: [], farmer: 'berry' });
    expect(berry.farmer).toBe('berry');
    expect(berry.bag.berrySeed).toBe(base.bag.berrySeed + 3);
    expect(berry.bag.seed).toBe(base.bag.seed - 2);
    expect(berry.stock).toEqual([]);
    // 苺農家の市には巣箱がいつも並ぶ
    drawDay(berry, Math.random);
    expect(berry.weeklyPlaces).toContain('hive');
    const rain = newGame({ shop: [], charmPool: [], farmer: 'rain' });
    expect(rain.charms.gentleRain).toBe(1);
    expect(rain.bag.sun).toBe(Math.max(0, base.bag.sun - 1));
    expect(base.farmer).toBe('basic');
    expect(base.stock).toEqual([]);
  });
});

describe('タヌキと畑の品', () => {
  it('タヌキは難しい4からしか年貢のあとに増えず、増えるときは1枚だけ', () => {
    for (let n = 1; n <= 10; n++) for (let k = 0; k < 60; k++) expect(rollObstacles(n, Math.random, 0)).not.toContain('tanuki');
    let seen = 0;
    for (let k = 0; k < 400; k++) {
      const got = rollObstacles(7, Math.random, CONFIG.tanukiFrom);
      if (got.includes('tanuki')) {
        seen++;
        expect(got).toEqual(['tanuki']);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('1回の年貢で入る同じお邪魔は2枚まで（3枚以上入るときも）', () => {
    for (let n = 1; n <= 10; n++)
      for (let k = 0; k < 200; k++) {
        const got = rollObstacles(n, Math.random, 3);
        for (const sym of new Set(got)) expect(got.filter((x) => x === sym).length).toBeLessThanOrEqual(CONFIG.sameObstacleMax);
      }
    // いつもカラスを引く乱数でも、3枚目は別のお邪魔になる
    const crowFirst = rollObstacles(7, () => 0.3, 3);
    expect(crowFirst.length).toBe(3 + CONFIG.hardObstacleExtra);
    expect(crowFirst.filter((x) => x === 'crow').length).toBeLessThanOrEqual(2);
  });

  it('市ごとに畑の品が入れ替わり、週が進むと良い品（井戸・スプリンクラー・風車）が並ぶ', () => {
    const s = newGame();
    const seen = (): Set<string> => {
      const out = new Set<string>();
      for (let k = 0; k < 120; k++) {
        drawDay(s, Math.random);
        s.weeklyPlaces.forEach((id) => out.add(id));
      }
      return out;
    };
    const early = seen();
    expect(early.has('water')).toBe(true);
    expect(early.has('well')).toBe(false);
    expect(early.has('sprinkler')).toBe(false);
    s.taxesPaid = 2;
    const mid = seen();
    expect(mid.has('well')).toBe(true);
    expect(mid.has('sprinkler')).toBe(true);
    expect(mid.has('windmill')).toBe(false);
    s.taxesPaid = 4;
    expect(seen().has('windmill')).toBe(true);
  });

  it('スプリンクラーは横一列、ため池は縦一列、風車は縦と横を毎晩育てる', () => {
    const s = game();
    s.tools[at(0, 0)] = 'sprinkler';
    s.tools[at(2, 2)] = 'reservoir';
    const crops = [at(1, 0), at(2, 0), at(2, 1), at(1, 1)];
    crops.forEach((c) => (s.field[c] = newCrop('pumpkin')));
    endDay(s, () => 0.99);
    // (1,0)(2,0) は横一列、(2,0)(2,1) は縦一列。(2,0) は両方で+2。(1,1) はどちらにもない
    expect(s.field[at(1, 0)]!.growth).toBe(1);
    expect(s.field[at(2, 0)]!.growth).toBe(2);
    expect(s.field[at(2, 1)]!.growth).toBe(1);
    expect(s.field[at(1, 1)]!.growth).toBe(0);
  });

  it('追加したお守り：秋の実り・雷さま・月見・大判振る舞い・断捨離・畑仕事の名人', () => {
    const s = game();
    s.day = 3;
    const pumpkin = { ...newCrop('pumpkin'), growth: 5 };
    const tomato = { ...newCrop('tomato'), growth: 3 };
    const p0 = cropPrice(s, pumpkin, 0);
    const t0 = cropPrice(s, tomato, 0);
    s.charms.autumnHarvest = 1;
    expect(cropPrice(s, pumpkin, 0)).toBe(Math.round(p0 * 1.5));
    expect(cropPrice(s, tomato, 0)).toBe(Math.round(t0 * 0.8));
    s.charms.autumnHarvest = 0;
    // 畑仕事の名人：広げる−40%・置き物+40%
    const e0 = expandPrice(s)!;
    const h0 = placePrice(s, 'hive')!;
    s.charms.farmMaster = 1;
    expect(expandPrice(s)).toBe(Math.round(e0 * 0.6));
    expect(placePrice(s, 'hive')).toBe(Math.round(h0 * 1.4));
    // 断捨離：半額で市で2回まで、仕入れは2択
    s.gold = 999;
    s.bag.rain = 6;
    s.charms.declutter = 1;
    expect(discard(s, 'rain')).toBe(true);
    expect(discard(s, 'rain')).toBe(true);
    expect(discard(s, 'rain')).toBe(false);
    expect(rollOffer(s, Math.random).length).toBe(2);
  });

  it('要らない札を捨てる：市で1回、捨てるたびに高くなる。お邪魔は捨てられない', () => {
    const s = game();
    s.day = 3;
    s.gold = 999;
    s.bag.rain = 5;
    const p0 = discardPrice(s);
    expect(canDiscard(s, 'crow')).toBe(false);
    expect(discard(s, 'rain')).toBe(true);
    expect(s.bag.rain).toBe(4);
    expect(discard(s, 'rain')).toBe(false);
    expect(discardPrice(s)).toBeGreaterThan(p0);
  });
});

describe('週契約', () => {
  // 週契約は一旦お休み中なので、確かめる間だけ戻す
  beforeAll(() => ((CONFIG as { contractsOn: boolean }).contractsOn = true));
  afterAll(() => ((CONFIG as { contractsOn: boolean }).contractsOn = false));
  const monday = (difficulty: number, week = 2): GameState => {
    const s = newGame({ shop: [], charmPool: [], difficulty });
    s.day = (week - 1) * CONFIG.taxPeriod;
    s.taxesPaid = week - 1;
    s.gold = 9999;
    return s;
  };
  it('ふつうでは出ない。難しい1は★1だけ、最初の週は出ない', () => {
    const s0 = monday(0);
    beginDay(s0, Math.random);
    expect(s0.contractOffer).toEqual([]);
    const first = monday(1, 1);
    beginDay(first, Math.random);
    expect(first.contractOffer).toEqual([]);
    for (let k = 0; k < 20; k++) {
      const s = monday(1);
      beginDay(s, Math.random);
      expect(s.contractOffer.length).toBe(3);
      expect(s.contractOffer.every((id) => CONTRACTS[id].stars === 1)).toBe(true);
    }
  });
  it('火曜以降は並ばない', () => {
    const s = monday(3);
    s.day += 1;
    beginDay(s, Math.random);
    expect(s.contractOffer).toEqual([]);
  });
  it('曇り続き：太陽は1マスだけ。日曜の年貢を納めると見返りが入り、契約は終わる', () => {
    const s = monday(1);
    beginDay(s, () => 0.5);
    s.contractOffer = ['cloudy'];
    expect(takeContract(s, 'cloudy')).toBe(true);
    s.field[at(0, 0)] = newCrop('tomato');
    s.field[at(0, 1)] = newCrop('tomato');
    s.results = [reel('sun')];
    expect(useSymbol(s, 0, at(0, 0))).toEqual([at(0, 0)]);
    expect(s.field[at(0, 1)]!.growth).toBe(0);
    s.day = 2 * CONFIG.taxPeriod;
    const before = s.gold;
    const tax = nextTax(s).amount;
    endDay(s, () => 0.5);
    expect(s.contract).toBe(null);
    expect(s.contractDone).toBe('cloudy');
    expect(s.gold).toBe(before - tax + contractGold(30, 1));
  });
  it('日照りの誓い：雨が使えない。斜めの風：横の列は列にならない', () => {
    const s = monday(2);
    s.contract = 'drought';
    s.field[at(1, 1)] = newCrop('tomato');
    s.results = [reel('rain')];
    expect(canUse(s, 0, at(1, 1))).toBe(false);
    s.contract = 'diagWind';
    ripe(s, 'tomato', [at(0, 0), at(1, 0), at(2, 0)]);
    expect(ripeGroup(s, at(0, 0))).toEqual([at(0, 0)]);
    ripe(s, 'tomato', [at(1, 1), at(2, 2)]);
    expect(ripeGroup(s, at(0, 0)).length).toBe(3);
  });
  it('目利きの客は単品が売れない。市場休みは平日に売れない', () => {
    const s = monday(2);
    s.day += 1;
    s.contract = 'connoisseur';
    ripe(s, 'tomato', [at(0, 0)]);
    expect(sell(s, at(0, 0))).toBe(null);
    s.contract = 'sellWeekend';
    expect(sell(s, at(0, 0))).toBe(null);
    s.day += 5;
    expect(sell(s, at(0, 0))).not.toBe(null);
  });
  it('市が閉まる：市も仕入れも開かず、見返りで次の年貢が−30%', () => {
    const s = monday(2);
    beginDay(s, () => 0.5);
    takeContract(s, null);
    s.contract = 'marketClosed';
    s.day += 1;
    beginDay(s, () => 0.5);
    expect(s.offer).toEqual([]);
    expect(canExpand(s)).toBe(false);
    s.day = 2 * CONFIG.taxPeriod;
    endDay(s, () => 0.5);
    expect(s.taxCut).toBe(0.3);
    expect(nextTax(s).amount).toBe(Math.round(taxAmount(2) * 0.7 * CONFIG.difficultyTaxMult[2]));
  });
  it('虫の大発生：毎朝虫が入り、日曜に全部いなくなる。壊れたリールは週が終わると戻る', () => {
    const s = monday(3);
    beginDay(s, () => 0.5);
    s.contractOffer = ['bugBloom'];
    const bugs = s.bag.bug;
    takeContract(s, 'bugBloom');
    for (let k = 0; k < 6; k++) beginDay(s, () => 0.5);
    expect(s.bag.bug).toBe(bugs + 7);
    endDay(s, () => 0.5);
    expect(s.bag.bug).toBe(bugs);
    expect(s.stock).toContain('henhouse');
    const r = monday(3);
    r.reels = 4;
    r.contractOffer = ['brokenReel'];
    takeContract(r, 'brokenReel');
    expect(r.reels).toBe(3);
    r.day = 2 * CONFIG.taxPeriod;
    endDay(r, () => 0.5);
    expect(r.reels).toBe(4);
  });
  it('忙しい週：使える出目は1日2つまで。長雨：右端の列に植えられない', () => {
    const s = monday(3);
    s.contract = 'busyWeek';
    s.results = [reel('seed', 2), reel('seed', 2), reel('seed', 2)];
    expect(useSymbol(s, 0, at(0, 0))).not.toBe(null);
    expect(useSymbol(s, 1, at(1, 0))).not.toBe(null);
    expect(canUse(s, 2, at(2, 0))).toBe(false);
    expect(canUse(s, 0, at(0, 1))).toBe(true);
    s.contract = 'longRain';
    s.results = [reel('seed', 1)];
    expect(canUse(s, 0, at(s.cols - 1, 2))).toBe(false);
    expect(canUse(s, 0, at(0, 2))).toBe(true);
  });
});

describe('合体', () => {
  const market = (): GameState => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 3;
    s.gold = 100;
    return s;
  };
  it('合体にはその週の年貢の30%（最低10）かかる。足りないと合体できない', () => {
    const s = market();
    s.bag.rain = 5;
    const cost = mergeCost(s);
    expect(cost).toBe(Math.max(10, Math.round(nextTax(s).amount * 0.3)));
    s.gold = cost - 1;
    expect(mergeSymbol(s, 'rain')).toBe(false);
    s.gold = cost;
    expect(mergeSymbol(s, 'rain')).toBe(true);
    expect(s.gold).toBe(0);
  });
  it('同じ札が4枚で、市の日だけ合体できる。1回の市で1種類まで', () => {
    const s = market();
    s.bag.rain = 4;
    s.bag.seed = 6;
    s.bag.sun = 3;
    expect(mergeable(s)).toEqual(['seed', 'rain']);
    expect(mergeSymbol(s, 'rain')).toBe(true);
    expect(s.bag.rain).toBe(0);
    expect(s.bag.bigRain).toBe(1);
    expect(mergeable(s)).toEqual([]);
    expect(mergeSymbol(s, 'seed')).toBe(false);
    const t = market();
    t.day = 2;
    t.bag.rain = 5;
    expect(mergeable(t)).toEqual([]);
    // お守りの条件では、合体した札は元の枚数（4枚）と数える
    expect(bagCount(s, 'rain')).toBe(CONFIG.mergeNeed);
  });
  it('鬼トマトの種は鬼トマトを植え、トマトと同じ作物の列になる', () => {
    const s = market();
    s.results = [reel('oniSeed', 3)];
    useSymbol(s, 0, at(0, 0));
    expect(s.field[at(0, 0)]!.kind).toBe('oniTomato');
    ripe(s, 'tomato', [at(1, 0), at(2, 0)]);
    s.field[at(0, 0)]!.growth = 99;
    expect(multSteps(s, at(0, 0)).map((x) => x.label)).toContain('同じ作物');
  });
  it('大雨は十字に+1（真ん中+2）、真夏の太陽は縦3列に+1、極上の肥料は十字の5マスに肥料、小判は+12', () => {
    const s = market();
    [at(0, 0), at(1, 0), at(2, 0), at(1, 1)].forEach((c) => (s.field[c] = newCrop('melon')));
    s.results = [reel('bigRain'), reel('bigSun'), reel('superFert')];
    useSymbol(s, 0, at(1, 1));
    expect(s.field[at(1, 0)]!.growth).toBe(1);
    expect(s.field[at(1, 1)]!.growth).toBe(2);
    expect(s.field[at(0, 0)]!.growth).toBe(0);
    useSymbol(s, 1, at(1, 2));
    expect(s.field[at(1, 0)]!.growth).toBe(2);
    expect(s.field[at(0, 0)]!.growth).toBe(1);
    useSymbol(s, 2, at(1, 1));
    expect([at(1, 0), at(1, 1)].every((c) => s.field[c]!.fertilized)).toBe(true);
    expect(s.field[at(0, 0)]!.fertilized).toBe(false);
    s.results = [{ ...reel('koban') }];
    const before = s.gold;
    autoOf(s, 0, () => 0.5);
    expect(s.gold - before).toBe(12);
  });
  it('合体した雨も、雨として組み合わせ（天気雨）に数える', () => {
    const s = market();
    s.results = [reel('bigRain'), reel('sun'), reel('seed', 2)];
    refreshCombos(s);
    expect(s.combos).toContain('sunshower');
  });
});

describe('お邪魔の狙い', () => {
  it('カラスは一番高い実りを狙い、かかしで守っていれば追い払われる', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    ripe(s, 'tomato', [at(0, 0)]);
    ripe(s, 'corn', [at(2, 2)]);
    s.results = [reel('crow')];
    const ev = resolveAuto(s, 0, () => 0.1);
    expect(ev && ev.type === 'crow' && ev.cell).toBe(at(2, 2));
    const t = newGame({ shop: [], charmPool: [] });
    t.day = 2;
    ripe(t, 'tomato', [at(0, 0)]);
    ripe(t, 'corn', [at(2, 2)]);
    t.tools[at(2, 1)] = 'scarecrow';
    t.results = [reel('crow')];
    const ev2 = resolveAuto(t, 0, () => 0.1);
    expect(ev2 && ev2.type === 'crow' && ev2.guarded).toBe(true);
  });
  it('虫はもうすぐ実る作物、雑草は作物に囲まれた空きマスを狙う', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    s.field[at(0, 0)] = { ...newCrop('tomato'), growth: 1 };
    s.field[at(2, 2)] = { ...newCrop('tomato'), growth: 2 };
    s.results = [reel('bug')];
    const ev = resolveAuto(s, 0, () => 0.9);
    expect(ev && ev.type === 'bug' && ev.cell).toBe(at(2, 2));
    const w = newGame({ shop: [], charmPool: [] });
    w.day = 2;
    [at(0, 1), at(2, 1), at(1, 0), at(1, 2)].forEach((c) => (w.field[c] = newCrop('tomato')));
    w.results = [reel('weed')];
    resolveAuto(w, 0, () => 0.9);
    expect(w.weeds[at(1, 1)]).toBe(true);
  });
});

describe('曰く付きのお守り・市の日', () => {
  it('取ると袋にお邪魔が入り、年貢・市の値段・単品が重くなる', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    const crows = s.bag.crow;
    s.charmOffer = ['sunBlessing'];
    chooseCharm(s, 'sunBlessing');
    expect(s.bag.crow).toBe(crows + 2);
    const tax = nextTax(s).amount;
    s.charms.artisan = 1;
    expect(nextTax(s).amount).toBe(Math.round(taxAmount(0) * 1.2));
    expect(tax).toBe(taxAmount(0));
    const single = singleMult(s);
    s.charms.bugWard = 1;
    expect(singleMult(s)).toBe(single * 0.5);
  });
  it('どれも取らないこともできる', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.charmOffer = ['aging', 'bumper', 'artisan'];
    skipCharm(s);
    expect(s.charmOffer).toBe(null);
    expect(s.charms.aging + s.charms.bumper + s.charms.artisan).toBe(0);
  });
  it('市の日（水・土）に売ると×1.25', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    const tue = cropPrice(s, newCrop('melon'));
    s.day = 3;
    expect(cropPrice(s, newCrop('melon'))).toBe(Math.round(tue * 1.25));
  });
});

describe('かかし・余った種・仕入れ', () => {
  it('かかしの周りは虫・雑草からも守られる', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    s.field[at(1, 1)] = { ...newCrop('tomato'), growth: 2 };
    s.tools[at(0, 0)] = 'scarecrow';
    s.results = [reel('bug')];
    const ev = resolveAuto(s, 0, () => 0.9);
    expect(ev && ev.type === 'bug' && ev.warded).toBe(true);
    expect(s.field[at(1, 1)]!.growth).toBe(2);
    const w = newGame({ shop: [], charmPool: [] });
    w.day = 2;
    w.tools[at(1, 1)] = 'scarecrow';
    w.results = [reel('weed')];
    resolveAuto(w, 0, () => 0.9);
    expect(w.weeds.some(Boolean)).toBe(false);
  });
  it('植えきれなかった種は1つ1金、使わなかった雨などの出目も1枚1金', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    s.results = [reel('seed', 3), reel('rain')];
    const before = s.gold;
    const r = endDay(s, () => 0.9);
    expect(r.seedGold).toBe(3 + CONFIG.spareReelGold);
    expect(s.gold - before).toBe(3 + CONFIG.spareReelGold);
  });
  it('市の仕入れには最初からトマトの種が候補に入る', () => {
    const s = newGame({ shop: ['addRain', 'addSun'], charmPool: [] });
    const seen = new Set<string>();
    for (let k = 0; k < 50; k++) rollOffer(s, Math.random).forEach((id) => seen.add(id));
    expect(seen.has('addSeed')).toBe(true);
  });
});

describe('大きな買い物・売値のおまけ', () => {
  it('4週目から市に並び、豊穣の像は売値+10%、からくりリールはリール+1', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 24;
    s.gold = 2000;
    s.taxesPaid = 2;
    expect(canBuyPremium(s, 'statue')).toBe(false);
    s.taxesPaid = 3;
    const before = cropPrice(s, newCrop('melon'));
    expect(buyPremium(s, 'statue')).toBe(true);
    expect(cropPrice(s, newCrop('melon'))).toBe(Math.round(before * 1.1));
    const reels = s.reels;
    expect(buyPremium(s, 'reel')).toBe(true);
    expect(s.reels).toBe(reels + 1);
    expect(premiumPrice(s, 'reel')).toBe(null);
  });
  it('巣箱は元の売値の+20%（安い作物ほど得しない）', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    s.tools[at(1, 1)] = 'hive';
    const c = newCrop('melon');
    expect(cropPrice(s, c, at(0, 0))).toBe(Math.round(CROPS.melon.price * 1.2));
  });
});

describe('月の満ち欠け', () => {
  it('出るたびに満ちて、満月のときだけ使える。使うと新月に戻る', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.bag = Object.fromEntries(Object.keys(s.bag).map((k) => [k, 0])) as typeof s.bag;
    s.bag.moon = 1;
    s.reels = 1;
    s.field[at(0, 0)] = newCrop('tomato');
    const phases: number[] = [];
    for (let k = 0; k < 3; k++) {
      drawDay(s, Math.random);
      phases.push(s.results[0].moon!);
    }
    expect(phases).toEqual([1, 2, 3]);
    expect(canUse(s, 0, null)).toBe(true);
    useSymbol(s, 0, null);
    expect(s.field[at(0, 0)]!.growth).toBe(1);
    expect(s.moonPhase).toBe(0);
    drawDay(s, Math.random);
    expect(s.results[0].moon).toBe(1);
    expect(canUse(s, 0, null)).toBe(false);
  });
});

describe('肥料とつつき', () => {
  it('肥料は×1.5。かぼちゃはカラスに食べられず、つつかれて売値−20%', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    const c = newCrop('pumpkin');
    c.growth = 99;
    const base = cropPrice(s, c);
    c.fertilized = true;
    expect(cropPrice(s, c)).toBe(Math.round(base * 1.5));
    c.fertilized = false;
    s.field[at(1, 1)] = c;
    s.results = [reel('crow')];
    const ev = resolveAuto(s, 0, () => 0.1);
    expect(ev && ev.type === 'crow' && ev.pecked).toBe(true);
    expect(s.field[at(1, 1)]).not.toBe(null);
    expect(cropPrice(s, s.field[at(1, 1)]!)).toBe(Math.round(base * 0.8));
  });
});

describe('じょうろ・卵とツバメ・新しいお守り', () => {
  const g = () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 2;
    return s;
  };
  it('じょうろは1マスに+2', () => {
    const s = g();
    s.field[at(1, 1)] = newCrop('melon');
    s.field[at(0, 1)] = newCrop('melon');
    s.results = [reel('can')];
    useSymbol(s, 0, at(1, 1));
    expect(s.field[at(1, 1)]!.growth).toBe(2);
    expect(s.field[at(0, 1)]!.growth).toBe(0);
  });
  it('卵は3回出ると孵ってツバメに。ツバメは袋の虫を追い出す', () => {
    const s = g();
    s.bag.egg = 1;
    for (let k = 0; k < 3; k++) {
      s.results = [reel('egg')];
      resolveAuto(s, 0, () => 0.5);
    }
    expect(s.bag.egg).toBe(0);
    expect(s.bag.swallow).toBe(1);
    s.bag.bug = 2;
    s.results = [reel('swallow')];
    resolveAuto(s, 0, () => 0.5);
    expect(s.bag.bug).toBe(1);
  });
  it('スーパーレア：豊穣の雨は畑全部+1、天照は縦横の列いっぱい+2、打出の小槌は今日の売値×2', () => {
    const s = g();
    [at(0, 0), at(2, 0), at(1, 1), at(2, 2)].forEach((c) => (s.field[c] = newCrop('melon')));
    s.results = [reel('blessRain'), reel('amaterasu'), reel('mallet')];
    useSymbol(s, 0, null);
    expect([at(0, 0), at(2, 0), at(1, 1), at(2, 2)].map((c) => s.field[c]!.growth)).toEqual([1, 1, 1, 1]);
    useSymbol(s, 1, at(2, 0));
    // (2,0) を中心に：同じ行の (0,0)(2,0) と同じ列の (2,2) が+2、(1,1) はそのまま
    expect([at(0, 0), at(2, 0), at(1, 1), at(2, 2)].map((c) => s.field[c]!.growth)).toEqual([3, 3, 1, 3]);
    const before = s.priceMult;
    resolveAuto(s, 2, () => 0.5);
    expect(s.priceMult).toBe(before + 1);
  });
  it('スーパーレアは解放したものだけ、仕入れにまれに1つ混ざり、年貢を納めるほど出やすい', () => {
    const s = g();
    // 解放していなければ出ない
    s.taxesPaid = 6;
    for (let k = 0; k < 500; k++) expect(rollOffer(s, Math.random).some((id) => CONFIG.superOffers.includes(id))).toBe(false);
    s.pool = [...s.pool, ...(CONFIG.superOffers as typeof s.pool)];
    const rate = (paid: number) => {
      s.taxesPaid = paid;
      let n = 0;
      for (let k = 0; k < 4000; k++) if (rollOffer(s, Math.random).some((id) => CONFIG.superOffers.includes(id))) n++;
      return n / 4000;
    };
    const r0 = rate(0);
    const r6 = rate(6);
    expect(r0).toBeGreaterThan(0.005);
    expect(r0).toBeLessThan(0.04);
    expect(r6).toBeGreaterThan(r0);
  });
  it('タカは袋のカラスを1枚追い出す（いなければ+2）', () => {
    const s = g();
    s.bag.crow = 2;
    s.results = [reel('hawk')];
    resolveAuto(s, 0, () => 0.5);
    expect(s.bag.crow).toBe(1);
    s.bag.crow = 0;
    const gold = s.gold;
    s.results = [reel('hawk')];
    resolveAuto(s, 0, () => 0.5);
    expect(s.gold).toBe(gold + 2);
  });
  it('大かかしがあると、カラスが出た日に袋のカラスを1枚追い出す（1日1回・カラスの友でも）', () => {
    const s = g();
    s.charms.crowFriend = 1;
    s.tools[at(2, 2)] = 'bigScarecrow';
    s.bag.crow = 3;
    s.results = [reel('crow'), reel('crow')];
    resolveAuto(s, 0, () => 0.5);
    resolveAuto(s, 1, () => 0.5);
    expect(s.bag.crow).toBe(2);
    s.day = 3;
    s.results = [reel('crow')];
    resolveAuto(s, 0, () => 0.5);
    expect(s.bag.crow).toBe(1);
  });
  it('カラスの友：カラスは食べずに+3、虫は2倍。欲張り：列+0.2・単品は売れない。早生：1段階育って植わり、売値−25%', () => {
    const s = g();
    s.charms.crowFriend = 1;
    ripe(s, 'corn', [at(0, 0)]);
    s.results = [reel('crow')];
    const before = s.gold;
    resolveAuto(s, 0, () => 0.1);
    expect(s.field[at(0, 0)]).not.toBe(null);
    expect(s.gold - before).toBe(3);
    const t = g();
    t.charms.greedy = 1;
    ripe(t, 'tomato', [at(0, 0)]);
    expect(sell(t, at(0, 0))).toBe(null);
    ripe(t, 'tomato', [at(1, 0), at(2, 0)]);
    expect(multSteps(t, at(0, 0))[0].x).toBeCloseTo(CONFIG.lineMult + 0.2);
    const u = g();
    const base = cropPrice(u, newCrop('melon'));
    u.charms.earlyCrop = 1;
    u.results = [reel('seed', 1)];
    useSymbol(u, 0, at(0, 0));
    expect(u.field[at(0, 0)]!.growth).toBe(1);
    expect(cropPrice(u, newCrop('melon'))).toBe(Math.round(base * 0.75));
  });
});

describe('市は開いて閉じたら、その日はもう開かない', () => {
  it('市を閉じると、その日は買い物できず、次の市の日にまた開く', () => {
    const s = newGame({ shop: [], charmPool: [] });
    s.day = 3;
    s.gold = 999;
    expect(canExpand(s)).toBe(true);
    s.marketClosed = true;
    expect(canExpand(s)).toBe(false);
    s.day = 5;
    beginDay(s, () => 0.5);
    expect(s.marketClosed).toBe(false);
  });
});
