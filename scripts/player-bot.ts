// プレイヤー程度に考えるボット（npm run sim -- 回数 starter player）
// - 仕入れ：袋の「種」と「育てる札」の割合を見て、足りない方を取る（種を切らさない）
// - 植え方：長い列（4つ・5つ）がそろうように、同じ作物を同じ線に並べる。堆肥・巣箱の周りを優先
// - 売り方：列が伸びきるまで待つ。年貢の前は売り切る
// - 市：年貢の分を残して、広げる → 堆肥 → 巣箱 → 豊穣の像 → リール の順に投資。置き物は列を切らない所へ
// - お守り：得と代償を点数にして選ぶ。どれも悪ければ取らない
// - 合体：主力の種が5枚そろったら合体（売値が上がる）

import { CROPS, PLACES, SEEDS, SYMBOLS, type CharmId, type CropKind, type PlaceId, type SymbolId, type UpgradeId, UPGRADE_SYMBOL, cropBase } from '../src/config.ts';
import {
  bagTotal, buy, buyPlace, canDiscard, discard, discardPrice, buyPremium, canBuy, canBuyPlace, canBuyPremium, canExpand, canPlace, canUse, cellAt, cellX, cellY, chooseCharm, expand, expandPrice,
  fieldCells, isOpen, isRipe, mergeable, mergeCost, mergeSymbol, nextTax, place, placePrice, premiumPrice, pullWeed, ripeGroup, sell, shapeCells, skipCharm,
  takeOffer, upgradePrice, useSymbol, validTargets, type GameState,
} from '../src/game.ts';

const GROW: SymbolId[] = ['rain', 'sun', 'bee', 'thunder', 'can', 'moon', 'bigRain', 'bigSun', 'raijin', 'queenBee'];
const PESTS: SymbolId[] = ['crow', 'bug', 'weed', 'tanuki', 'frost', 'mole', 'locust'];
const DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

const count = (s: GameState, f: (id: SymbolId) => boolean): number => (Object.keys(s.bag) as SymbolId[]).filter(f).reduce((n, id) => n + s.bag[id], 0);
const seedsIn = (s: GameState) => count(s, (id) => !!SEEDS[id]);
const growIn = (s: GameState) => count(s, (id) => GROW.includes(id));

/** 主力の作物：袋の種でいちばん多いもの（大物は除く） */
function mainCrop(s: GameState): CropKind {
  let best: CropKind = 'tomato';
  let n = -1;
  for (const id of Object.keys(s.bag) as SymbolId[]) {
    const seed = SEEDS[id];
    if (!seed || CROPS[seed.crop].big || s.bag[id] <= n) continue;
    n = s.bag[id];
    best = cropBase(seed.crop);
  }
  return best;
}

/** 列になり得る一直線（道具・雑草で切れる、3マス以上）を全部 */
function segments(s: GameState, tools = s.tools): number[][] {
  const out: number[][] = [];
  const blocked = (c: number | null) => c === null || !!tools[c] || !!s.weeds[c];
  for (const c of fieldCells(s)) {
    if (blocked(c)) continue;
    for (const [dx, dy] of DIRS) {
      // 線の始まり（ひとつ前が外か、ふさがっている）だけから数える
      if (!blocked(cellAt(s, cellX(c) - dx, cellY(c) - dy))) continue;
      const seg: number[] = [];
      for (let x = cellX(c), y = cellY(c); !blocked(cellAt(s, x, y)); x += dx, y += dy) seg.push(cellAt(s, x, y)!);
      if (seg.length >= 3) out.push(seg);
    }
  }
  return out;
}

const lenMult = (n: number) => (n >= 5 ? 1.8 : n === 4 ? 1.5 : 1.3);
/** 畑の形の値打ち：長い線がいくつあるか */
const layoutValue = (s: GameState, tools = s.tools) => segments(s, tools).reduce((v, seg) => v + lenMult(seg.length) * seg.length, 0);

/** kind を cell に植えたときの値打ち：同じ作物の長い線にどれだけ乗るか */
function plantScore(s: GameState, cell: number, kind: CropKind): number {
  let v = 0;
  for (const seg of segments(s)) {
    if (!seg.includes(cell)) continue;
    const crops = seg.map((c) => s.field[c]).filter(Boolean);
    const same = crops.every((c) => cropBase(c!.kind) === cropBase(kind));
    v += same ? (1 + crops.length) ** 2 * lenMult(seg.length) : 0.3;
  }
  if (s.tiles[cell] === 'compost') v += 6;
  if (fieldCells(s).some((t) => (s.tools[t] === 'hive' || s.tools[t] === 'queenHive') && Math.abs(cellX(t) - cellX(cell)) <= 1 && Math.abs(cellY(t) - cellY(cell)) <= 1)) v += 3;
  return v;
}

/** 道具を置くのにいちばん損が少ないマス（列を切らない・周りに作物が来る） */
function bestToolCell(s: GameState, id: PlaceId): number | null {
  const cells = fieldCells(s).filter((c) => canPlace(s, c));
  if (!cells.length) return null;
  const base = layoutValue(s);
  const around = (c: number) => fieldCells(s).filter((n) => n !== c && Math.abs(cellX(n) - cellX(c)) <= 1 && Math.abs(cellY(n) - cellY(c)) <= 1).length;
  const score = (c: number) => {
    const tools = [...s.tools];
    tools[c] = id;
    const loss = base - layoutValue(s, tools);
    // 作物があるマスは、どけるので避ける
    return -loss * 3 - (s.field[c] ? 100 : 0) + (id === 'hive' || id === 'queenHive' || id === 'scarecrow' || id === 'bigScarecrow' || id === 'goldenWell' ? around(c) * 0.8 : 0);
  };
  return cells.sort((a, b) => score(b) - score(a))[0];
}

/** 特別なマス（堆肥・水路）を敷く所：いちばん長い線の上 */
function bestTileCell(s: GameState): number | null {
  const cells = fieldCells(s).filter((c) => canPlace(s, c));
  if (!cells.length) return null;
  const segs = segments(s);
  const score = (c: number) => segs.filter((g) => g.includes(c)).reduce((v, g) => v + lenMult(g.length), 0);
  return cells.sort((a, b) => score(b) - score(a))[0];
}

function placeStock(s: GameState): void {
  while (s.stock.length) {
    const id = s.stock[0];
    const c = PLACES[id].kind === 'tool' ? bestToolCell(s, id) : bestTileCell(s);
    if (c === null || !place(s, c)) return;
  }
}

// ---- 仕入れ ----

/** 仕入れの3択から1つ：種と育てる札の釣り合い、主力の作物、袋の中身を見る */
export function pickOffer(s: GameState): UpgradeId | null {
  if (!s.offer.length) return null;
  const total = bagTotal(s.bag);
  const seeds = seedsIn(s) / total;
  const grow = growIn(s) / total;
  const main = mainCrop(s);
  const score = (id: UpgradeId): number => {
    const sym = UPGRADE_SYMBOL[id]!.symbol;
    const seed = SEEDS[sym];
    if (seed) {
      if (CROPS[seed.crop].big) return s.cols * s.rows >= 16 ? 2 : 0;
      // 主力以外の種は混ぜない（同じ作物の列のおまけが消える）
      // ただし種がとても少ないなら、どの種でも畑を空けるよりよい
      if (cropBase(seed.crop) !== main) return seeds < 0.25 ? 7 : 1.5;
      // 種が4割を切ったら主力の種を最優先
      return seeds < 0.4 ? 9 : 3;
    }
    if (GROW.includes(sym)) {
      if (sym === 'moon') return s.bag.moon < 2 ? 6 : 1;
      // 育てる札は種と同じくらいまで
      const base = grow < seeds ? 6 : 2;
      return base + (sym === 'thunder' ? 1 : 0) + (sym === 'can' ? -1 : 0);
    }
    if (sym === 'fertilizer') return s.bag.fertilizer < 2 ? 4 : 1;
    if (sym === 'egg') return count(s, (x) => x === 'bug' || x === 'locust') >= 2 ? 5 : 1;
    return 1;
  };
  return [...s.offer].sort((a, b) => score(b) - score(a))[0];
}

// ---- お守り ----

const CHARM_VALUE: Partial<Record<CharmId, (s: GameState) => number>> = {
  greedy: () => 5,
  crowFriend: () => 5,
  bumper: () => 4,
  queenHive: () => 4,
  goldenWell: () => 3,
  scarecrow: () => 3,
  seedSack: () => 3,
  taxRelief: () => 3,
  gentleRain: (s) => (s.bag.rain >= 3 ? 3 : 1),
  sunBlessing: (s) => (s.bag.sun >= 2 ? 2 : 0),
  coinPurse: () => 1,
  bargain: () => 2,
  bugWard: () => 1,
  artisan: () => 1,
  crowToll: () => 2,
  aging: () => 0,
  earlyCrop: () => -1,
  rancher: (s) => (fieldCells(s).some((c) => s.tools[c] === 'henhouse' || s.tools[c] === 'cowshed') ? 2 : -2),
  bigGame: () => -2,
  wheelwright: () => -1,
  autumnHarvest: (s) => (mainCrop(s) === 'pumpkin' ? 4 : -2),
  thunderGod: (s) => (s.bag.thunder >= 2 ? 3 : 1),
  moonViewing: (s) => (s.bag.moon >= 1 ? 2 : 0),
  bigSpender: () => 1,
  declutter: () => 1,
  farmMaster: (s) => (s.cols * s.rows < 25 ? 3 : 0),
};

export function pickCharm(s: GameState): void {
  if (!s.charmOffer) return;
  const val = (id: CharmId) => CHARM_VALUE[id]?.(s) ?? 0.5;
  const best = [...s.charmOffer].sort((a, b) => val(b) - val(a))[0];
  if (val(best) <= 0) skipCharm(s);
  else chooseCharm(s, best);
}

// ---- 1日 ----

/** 年貢の前に取っておくお金 */
function reserve(s: GameState): number {
  const t = nextTax(s);
  // 前の日までは、まだ稼げる分を見込んで4割だけ残す
  return t.daysLeft <= 1 ? t.amount : Math.round(t.amount * 0.4);
}

function shop(s: GameState): void {
  const keep = reserve(s);
  const afford = (price: number | null) => price !== null && s.gold - price >= keep;
  for (let guard = 0; guard < 20; guard++) {
    // お邪魔を消す：タヌキ・イナゴはすぐ、カラス・虫は2枚から
    const rm = (['removeTanuki', 'removeLocust', 'removeCrow', 'removeBug', 'removeWeed'] as UpgradeId[]).find(
      (id) => canBuy(s, id) && afford(upgradePrice(s, id)) && s.bag[UPGRADE_SYMBOL[id]!.symbol] >= (id === 'removeTanuki' || id === 'removeLocust' || id === 'removeWeed' ? 1 : 2),
    );
    if (rm) { buy(s, rm); continue; }
    // 広げる（長い列が作れるようになる）
    if (canExpand(s) && afford(expandPrice(s))) { expand(s); placeStock(s); continue; }
    // 堆肥のマス：いちばん長い線の数まで
    const longest = Math.max(3, ...segments(s).map((g) => g.length));
    if ((s.bought.compost ?? 0) < longest && canBuyPlace(s, 'compost') && afford(placePrice(s, 'compost'))) { buyPlace(s, 'compost'); placeStock(s); continue; }
    // 置き物はマスを1つ使うので、畑が広くなってから（12マスで1つ、16マスで2つまで）
    const cells = s.cols * s.rows;
    const tools = fieldCells(s).filter((c) => s.tools[c]).length;
    const toolRoom = cells >= 20 ? 4 : cells >= 16 ? 3 : cells >= 12 ? 2 : 0;
    // ANIMALS=1（または牧場主）：鶏小屋・牛小屋を先に買う（3×3の畑でも2つまで）。自動化ビルドの計測用
    if (process.env.ANIMALS || s.farmer === 'rancher') {
      const animal = (['cowshed', 'henhouse'] as PlaceId[]).find((id) => tools < Math.max(toolRoom, 2) && canBuyPlace(s, id) && afford(placePrice(s, id)));
      if (animal) { buyPlace(s, animal); placeStock(s); continue; }
    }
    // 夜に育つ置き物（風車 → スプリンクラー・ため池）。列を切らない端に置く
    const night = (['windmill', 'sprinkler', 'reservoir'] as PlaceId[]).find((id) => tools < toolRoom && canBuyPlace(s, id) && afford(placePrice(s, id)));
    if (night) { buyPlace(s, night); placeStock(s); continue; }
    // カラスが多いならかかし（巣箱より先）
    if (tools < toolRoom && s.bag.crow >= 2 && !fieldCells(s).some((c) => s.tools[c] === 'scarecrow' || s.tools[c] === 'bigScarecrow') && canBuyPlace(s, 'scarecrow') && afford(placePrice(s, 'scarecrow'))) { buyPlace(s, 'scarecrow'); placeStock(s); continue; }
    if (tools < toolRoom && canBuyPlace(s, 'hive') && afford(placePrice(s, 'hive'))) { buyPlace(s, 'hive'); placeStock(s); continue; }
    // 大きな買い物（リールが先：引ける数が増える）
    if (canBuyPremium(s, 'reel') && afford(premiumPrice(s, 'reel'))) { buyPremium(s, 'reel'); continue; }
    if (canBuyPremium(s, 'statue') && afford(premiumPrice(s, 'statue'))) { buyPremium(s, 'statue'); continue; }
    break;
  }
  // 要らない札を捨てる：主力以外の種 → 金貨 → 多すぎる育てる札
  const extraGrow = growIn(s) > seedsIn(s) * 1.4 + 1;
  const junk = (Object.keys(s.bag) as SymbolId[]).find((id) => s.bag[id] > 0 && SEEDS[id] && !CROPS[SEEDS[id]!.crop].big && cropBase(SEEDS[id]!.crop) !== mainCrop(s))
    ?? (s.bag.coin > 0 ? 'coin' : undefined)
    ?? (extraGrow ? (['can', 'bee', 'sun', 'rain'] as SymbolId[]).find((id) => s.bag[id] > 1) : undefined);
  if (junk && canDiscard(s, junk) && s.gold - discardPrice(s) >= keep) discard(s, junk);
  // 合体：主力の種が5枚そろって、合体しても種が足りるとき（袋の3割以上が種で残る）
  const main = mainCrop(s);
  const m = mergeable(s).find((id) => SEEDS[id] && cropBase(SEEDS[id]!.crop) === main && (seedsIn(s) - 4) / (bagTotal(s.bag) - 4) >= 0.3);
  if (m && s.gold - mergeCost(s) >= keep) mergeSymbol(s, m);
}

/** 育てる札の使い先：育ち中の作物（もうすぐ実る・長い線にある物ほど） */
function growScore(s: GameState, shape: Parameters<typeof shapeCells>[1], c: number): number {
  return shapeCells(s, shape, c).reduce((n, x) => {
    const crop = s.field[x];
    if (!crop || isRipe(crop) || s.frost[x]) return n;
    const left = CROPS[crop.kind].ripe - crop.growth;
    return n + 1 + (left === 1 ? 1 : 0);
  }, 0);
}

export function playerDay(s: GameState): void {
  s.weeds.forEach((w, i) => { if (w) pullWeed(s, i); });
  placeStock(s);
  shop(s);
  // 種から先に植え、そのあと育てる
  const main = mainCrop(s);
  const order = (sym: SymbolId) => (SEEDS[sym] ? 0 : sym === 'fertilizer' ? 2 : 1);
  const idx = s.results.map((_, i) => i).sort((a, b) => order(s.results[a].symbol) - order(s.results[b].symbol));
  for (const i of idx) {
    while (canUse(s, i, null)) {
      const sym = s.results[i].symbol;
      const targets = validTargets(s, i);
      if (!targets.length) break;
      const seed = SEEDS[sym];
      const shape = SYMBOLS[sym].shape;
      let score: (c: number) => number;
      if (seed && CROPS[seed.crop].big) score = (c) => -segments(s).filter((g) => g.includes(c)).length;
      else if (seed) score = (c) => plantScore(s, c, seed.crop) + (cropBase(seed.crop) === main ? 0 : -1);
      else if (shape) score = (c) => growScore(s, shape, c);
      else score = (c) => (s.field[c] ? CROPS[s.field[c]!.kind].price * (isRipe(s.field[c]) ? 0.5 : 1) : 0);
      targets.sort((a, b) => score(b) - score(a));
      if (!seed && shape && score(targets[0]) <= 0) break;
      if (!useSymbol(s, i, targets[0])) break;
    }
  }
  sellDay(s);
  shop(s);
  placeStock(s);
}

/** 売る：列が伸びきったら。年貢の前・畑が詰まったら売り切る */
function sellDay(s: GameState): void {
  const t = nextTax(s);
  const pressed = t.daysLeft <= 1 && s.gold < t.amount;
  const segs = segments(s);
  for (const c of fieldCells(s)) {
    const crop = s.field[c];
    if (!crop || !isRipe(crop)) continue;
    if (CROPS[crop.kind].big) { sell(s, c); continue; }
    const group = ripeGroup(s, c);
    if (group.length >= 3) {
      // いちばん長い線で、まだ育ち中の同じ作物が残っていれば待つ（年貢の前は待たない）
      const mine = segs.filter((g) => g.includes(c)).sort((a, b) => b.length - a.length)[0];
      const waiting = mine?.some((x) => {
        const f = s.field[x];
        return f && !isRipe(f) && cropBase(f.kind) === cropBase(crop.kind) && CROPS[f.kind].ripe - f.growth <= 1;
      });
      if (!waiting || pressed || t.daysLeft === 0) sell(s, c);
      continue;
    }
    // 単品：列になる見込み（同じ作物か空きだけの線）がない・年貢が足りないときだけ
    const potential = segs.some((g) => g.includes(c) && g.every((x) => x === c || isOpen(s, x) || (s.field[x] && cropBase(s.field[x]!.kind) === cropBase(crop.kind))));
    if (!potential || pressed) sell(s, c);
  }
}

/** 盤面の文字（デバッグ用） */
export const debugPests = PESTS;
