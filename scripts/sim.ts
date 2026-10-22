// ボットで遊ばせてバランスを確認する。
// npm run sim -- [回数] [starter|full|addX,addY…] [smart|random]   （FOCUS=1 で買い物を絞る）
//   smart: 列を狙って置き、列がそろうまで待つ / random: 置き場所・使う場所・買い物を適当に決め、実ったらすぐ売る

import { CHARMS, CHARM_ORDER, CONFIG, CROPS, META, PLACES, SEEDS, SYMBOLS, type CropKind, type PlaceId, type UpgradeId } from '../src/config.ts';
import {
  buy, buyPlace, canBuy, canBuyPlace, canExpand, canPlace, expand, expandPrice, canUse, cellAt, cellX, cellY, chooseCharm, fieldCells,
  isOpen, isRipe, newGame, nextTax, place, placePrice, pullWeed, resolveAllAuto, resolveFever, ripeGroup, sell, shapeCells,
  startDay, upgradePrice, useSymbol, validTargets, type GameState,
} from '../src/game.ts';

const runs = Number(process.argv[2] ?? 2000);
const mode = process.argv[3] ?? 'full';
const bot = process.argv[4] ?? 'smart';
const smart = bot === 'smart';
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// 絵柄袋を薄めすぎないよう、良い絵柄は枚数に上限を設けて買う
function wants(s: GameState, id: UpgradeId): boolean {
  if (id === 'addSun') return s.bag.sun < 3;
  if (id === 'addGoldSeed') return s.bag.goldSeed < 3;
  if (id === 'addFertilizer') return s.bag.fertilizer < 2;
  if (id === 'addBee') return s.bag.bee < 2;
  if (id === 'addMerchant') return s.bag.merchant < 2;
  if (id === 'addClover') return s.bag.clover < 1;
  if (id === 'addMoon') return s.bag.moon < 3;
  if (id === 'addSeed') return s.bag.seed < 5;
  if (id === 'addRain') return s.bag.rain < 4;
  if (id === 'addBerrySeed') return s.bag.berrySeed < 3;
  if (id === 'addPumpkinSeed') return s.bag.pumpkinSeed < 2;
  if (id === 'addWatermelonSeed') return s.bag.watermelonSeed < 2;
  if (id === 'addHoe') return s.bag.hoe < 1 && (s.bag.weed > 0 || s.bag.frost > 0);
  return true;
}
// FOCUS=1 は種をトマトに絞って買う（袋を薄めない買い方）
const PRIORITY: UpgradeId[] = process.env.FOCUS
  ? ['removeTanuki', 'removeFrost', 'removeWeed', 'removeMole', 'removeBug', 'removeCrow', 'addSeed', 'addRain', 'addSun', 'addMoon', 'addBee', 'addFertilizer']
  : ['removeTanuki', 'removeFrost', 'removeWeed', 'removeMole', 'removeBug', 'removeCrow', 'addHoe', 'addSeed', 'addBerrySeed', 'addPumpkinSeed', 'addWatermelonSeed', 'addRain', 'addGoldSeed', 'addSun', 'addMoon', 'addBee', 'addFertilizer', 'addMerchant', 'addClover'];

/** 3マスの並び（縦・横・斜め）全部。列になり得る窓 */
function windows(s: GameState): number[][] {
  const out: number[][] = [];
  for (const c of fieldCells(s)) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const w = [0, 1, 2].map((k) => cellAt(s, cellX(c) + dx * k, cellY(c) + dy * k));
      if (w.every((x) => x !== null)) out.push(w as number[]);
    }
  }
  return out;
}

/** 列になり得る（道具・雑草がない）窓 */
const usable = (s: GameState, w: number[]) => w.every((c) => !s.tools[c] && !s.weeds[c]);

/** kind を cell に植えたときの列の見込み */
function plantScore(s: GameState, cell: number, kind: CropKind): number {
  let v = 0;
  for (const w of windows(s)) {
    if (!w.includes(cell) || !usable(s, w)) continue;
    const crops = w.map((c) => s.field[c]).filter(Boolean);
    const same = crops.every((c) => c!.kind === kind);
    v += 1 + crops.length * (same ? 3 : 1);
  }
  return v;
}

/** ripe な cell に、そろう見込みの列が残っているか */
function hasPotential(s: GameState, cell: number): boolean {
  return windows(s).some((w) => w.includes(cell) && usable(s, w) && w.every((c) => c === cell || s.field[c] || isOpen(s, c)));
}

function placeStock(s: GameState): void {
  while (s.stock.length) {
    const cells = fieldCells(s).filter((c) => canPlace(s, c));
    if (!cells.length) return;
    if (!smart) { place(s, pick(cells)); continue; }
    const id = s.stock[0];
    if (id === 'water') {
      cells.sort((a, b) => cellY(a) - cellY(b) || cellX(a) - cellX(b));
      place(s, cells[0]);
      continue;
    }
    // 道具は列を潰しにくい端へ、特別なマスは列の多い中央へ
    const lines = (c: number) => windows(s).filter((w) => w.includes(c)).length;
    cells.sort((a, b) => (PLACES[id].kind === 'tool' ? lines(a) - lines(b) : lines(b) - lines(a)));
    place(s, cells[0]);
  }
}

function playDay(s: GameState): void {
  s.weeds.forEach((w, i) => { if (w) pullWeed(s, i); });
  placeStock(s);
  const order = ['goldSeed', 'pumpkinSeed', 'seed', 'berrySeed', 'rain', 'bee', 'fertilizer', 'sun'];
  const idx = s.results.map((_, i) => i).sort((a, b) => order.indexOf(s.results[a].symbol) - order.indexOf(s.results[b].symbol));
  for (const i of idx) while (canUse(s, i, null)) {
    const sym = s.results[i].symbol;
    const targets = validTargets(s, i);
    if (!smart) { useSymbol(s, i, pick(targets)); continue; }
    const seed = SEEDS[sym];
    const shape = SYMBOLS[sym].shape;
    let score: (c: number) => number;
    if (seed && CROPS[seed.crop].big) score = (c) => (cellX(c) === 0 || cellY(c) === 0 ? 2 : 0) - plantScore(s, c, 'tomato') * 0.01;
    else if (seed) score = (c) => plantScore(s, c, seed.crop);
    else if (sym === 'hoe') score = (c) => shapeCells(s, 'row', c).reduce((n, x) => n + (s.weeds[x] ? 3 : s.frost[x] ? 2 : !s.field[x] && !s.tilled[x] ? 1 : 0), 0);
    else if (shape) score = (c) => shapeCells(s, shape, c).reduce((n, x) => {
      const crop = s.field[x];
      return n + (crop && !isRipe(crop) && !s.frost[x] ? 1 : 0);
    }, 0);
    else score = (c) => (s.field[c] ? ({ corn: 4, pumpkin: 3, tomato: 2, strawberry: 1 } as const)[s.field[c]!.kind] : 0);
    targets.sort((a, b) => score(b) - score(a));
    useSymbol(s, i, targets[0]);
  }
  const t = nextTax(s);
  const pressed = t.daysLeft <= 1 && s.gold < t.amount;
  const full = fieldCells(s).every((c) => !isOpen(s, c));
  for (const c of fieldCells(s)) {
    if (!isRipe(s.field[c])) continue;
    if (!smart) { sell(s, c); continue; }
    // 列がそろっていれば売る。そろう見込みがない・畑が詰まった・年貢が足りないときは単品で
    if (ripeGroup(s, c).length >= 3 || !hasPotential(s, c) || full || pressed) sell(s, c);
  }
  const reserve = t.daysLeft <= 3 ? t.amount : 0;
  for (let bought = true; bought;) {
    bought = false;
    if (!smart) {
      const opts: (() => boolean)[] = [];
      if (canExpand(s) && s.gold - expandPrice(s)! >= reserve) opts.push(() => expand(s));
      (Object.keys(PLACES) as PlaceId[]).forEach((id) => { if (canBuyPlace(s, id) && s.gold - placePrice(s, id)! >= reserve && Math.random() < 0.3) opts.push(() => buyPlace(s, id)); });
      PRIORITY.forEach((id) => { if (wants(s, id) && canBuy(s, id) && s.gold - upgradePrice(s, id) >= reserve) opts.push(() => buy(s, id)); });
      if (opts.length) { pick(opts)(); bought = true; }
      continue;
    }
    if (canExpand(s) && s.gold - expandPrice(s)! >= reserve) { expand(s); bought = true; continue; }
    if (!s.bought.compost && canBuyPlace(s, 'compost') && s.gold - placePrice(s, 'compost')! >= reserve) { buyPlace(s, 'compost'); bought = true; continue; }
    // ANIMALS=1 で鶏小屋・牛小屋も買う（毎晩お金が入る道具の強さを見る）
    if (process.env.ANIMALS) {
      const animal = (['henhouse', 'cowshed'] as const).find((id) => (s.bought[id] ?? 0) < 2 && canBuyPlace(s, id) && s.gold - placePrice(s, id)! >= reserve);
      if (animal) { buyPlace(s, animal); bought = true; continue; }
    }
    // WATER=1 で水路を一列に並べて水車を作る
    if (process.env.WATER && (s.bought.water ?? 0) < 4 && canBuyPlace(s, 'water') && s.gold - placePrice(s, 'water')! >= reserve) { buyPlace(s, 'water'); bought = true; continue; }
    for (const id of PRIORITY) {
      if (wants(s, id) && canBuy(s, id) && s.gold - upgradePrice(s, id) >= reserve) { buy(s, id); bought = true; break; }
    }
  }
  placeStock(s);
}

const setup = mode === 'full'
  ? undefined
  : {
      shop: mode === 'starter' ? META.startUnlocked : (mode.split(',') as typeof META.startUnlocked),
      charmPool: CHARM_ORDER.filter((id) => !(id in META.charmUnlock)),
      // DIFF=1〜4 で難しいモード
      difficulty: Number(process.env.DIFF ?? 0),
    };
console.log(`mode=${mode} bot=${bot}`);
const days: number[] = [];
const taxes: number[] = [];
const goldAtTax: number[][] = [];
for (let n = 0; n < runs; n++) {
  const s = newGame(setup);
  while (!s.over && s.day < 200) {
    if (s.day > 0 && s.day % CONFIG.taxPeriod === 0) (goldAtTax[s.day / CONFIG.taxPeriod - 1] ??= []).push(s.gold);
    const r = startDay(s, Math.random);
    if (!r.ok) break;
    resolveFever(s, Math.random);
    if (s.charmOffer) chooseCharm(s, smart ? (s.charmOffer.find((id) => !CHARMS[id].special) ?? s.charmOffer[0]) : pick(s.charmOffer));
    resolveAllAuto(s, Math.random);
    playDay(s);
  }
  days.push(s.day);
  taxes.push(s.taxesPaid);
}

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
const passed = (k: number) => ((taxes.filter((t) => t >= k).length / runs) * 100).toFixed(0);
console.log(`runs=${runs} クリア率=${passed(CONFIG.winTaxes)}%`);
console.log(`到達日数 p10=${pct(days, 0.1)} p50=${pct(days, 0.5)} p90=${pct(days, 0.9)}`);
console.log(`年貢の通過率 ${CONFIG.taxSchedule.map((a, i) => `${i + 1}回目(${a})=${passed(i + 1)}%`).join(' ')}`);
console.log(`年貢日の所持金p50 ${goldAtTax.slice(0, 8).map((g) => pct(g, 0.5)).join(' / ')}`);
