// ゲームのルール本体。画面に依存しない純粋なロジック。

import {
  CHARMS, CHARM_ORDER, CONFIG, SYMBOLS, SYMBOL_ORDER, UPGRADE_SYMBOL,
  type AddUpgradeId, type CharmId, type SymbolId, type UpgradeId,
} from './config.ts';

export type Rng = () => number;

export interface Crop {
  kind: 'normal' | 'gold';
  growth: number;
  fertilized: boolean;
  /** 熟成のお守りで上がった売値 */
  bonus: number;
}

export interface ReelResult {
  symbol: SymbolId;
  /** 使い切ったか（自動の絵柄は効果が出たら true） */
  used: boolean;
  /** この出目で使える回数（種は1〜3、ほかは1） */
  total: number;
  /** 残りの使用回数 */
  left: number;
  /** 効果の倍率（ゾロ目のフィーバーで 2） */
  power: number;
}

export interface Purchase {
  day: number;
  id: UpgradeId;
}

export interface GameState {
  /** 0 = まだ1回も回していない */
  day: number;
  gold: number;
  reels: number;
  bag: Record<SymbolId, number>;
  field: (Crop | null)[];
  results: ReelResult[];
  /** 今日フィーバーした絵柄 */
  fever: SymbolId[];
  /** 今日の売値倍率（商人） */
  priceMult: number;
  /** 次の日の金の種の重み倍率（四つ葉）。1 なら効果なし */
  cloverBoost: number;
  charms: Record<CharmId, number>;
  /** 年貢を納めた直後に選ぶお守りの候補 */
  charmOffer: CharmId[] | null;
  over: boolean;
  taxesPaid: number;
  /** 年貢を winTaxes 回納めたか（以降はエンドレス） */
  cleared: boolean;
  /** このゲームでショップに並ぶ「足す」強化（開始時に選ぶ） */
  shop: AddUpgradeId[];
  /** このゲームで出るお守り（解放済みのもの） */
  charmPool: CharmId[];
  /** これまでに消した枚数（消す価格が上がる） */
  removed: { crow: number; bug: number };
  stats: {
    spins: number;
    totalEarned: number;
    cropsSold: number;
    cropsEaten: number;
    crowsMissed: number;
    fevers: number;
    lineHarvests: number;
    purchases: Purchase[];
    charms: { day: number; id: CharmId }[];
  };
}

const emptyCharms = (): Record<CharmId, number> =>
  Object.fromEntries(CHARM_ORDER.map((id) => [id, 0])) as Record<CharmId, number>;

export interface GameSetup {
  shop: AddUpgradeId[];
  charmPool: CharmId[];
}

export const ALL_ADDS: AddUpgradeId[] = ['addSeed', 'addRain', 'addSun', 'addFertilizer', 'addBee', 'addMerchant', 'addGoldSeed', 'addClover'];

export function newGame(setup: GameSetup = { shop: ALL_ADDS, charmPool: CHARM_ORDER }): GameState {
  return {
    shop: [...setup.shop],
    charmPool: [...setup.charmPool],
    removed: { crow: 0, bug: 0 },
    day: 0,
    gold: CONFIG.initialGold,
    reels: CONFIG.initialReels,
    bag: { ...CONFIG.initialBag },
    field: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => null),
    results: [],
    fever: [],
    priceMult: 1,
    cloverBoost: 1,
    charms: emptyCharms(),
    charmOffer: null,
    over: false,
    taxesPaid: 0,
    cleared: false,
    stats: {
      spins: 0, totalEarned: 0, cropsSold: 0, cropsEaten: 0, crowsMissed: 0, fevers: 0, lineHarvests: 0,
      purchases: [], charms: [],
    },
  };
}

// ---- 畑の位置 ----

export function neighbors(cell: number): number[] {
  const cols = CONFIG.fieldCols;
  const x = cell % cols;
  const y = Math.floor(cell / cols);
  const out: number[] = [];
  if (y > 0) out.push(cell - cols);
  if (y < CONFIG.fieldRows - 1) out.push(cell + cols);
  if (x > 0) out.push(cell - 1);
  if (x < cols - 1) out.push(cell + 1);
  return out;
}

/** 縦・横・斜めの列（3×3なら8本） */
export const LINES: number[][] = (() => {
  const n = CONFIG.fieldCols;
  const lines: number[][] = [];
  for (let i = 0; i < n; i++) {
    lines.push(Array.from({ length: n }, (_, k) => i * n + k));
    lines.push(Array.from({ length: n }, (_, k) => k * n + i));
  }
  if (CONFIG.fieldCols === CONFIG.fieldRows) {
    lines.push(Array.from({ length: n }, (_, k) => k * n + k));
    lines.push(Array.from({ length: n }, (_, k) => k * n + (n - 1 - k)));
  }
  return lines;
})();

// ---- 絵柄袋 ----

export function bagTotal(bag: Record<SymbolId, number>): number {
  return SYMBOL_ORDER.reduce((n, id) => n + bag[id], 0);
}

export function drawSymbol(bag: Record<SymbolId, number>, rng: Rng): SymbolId {
  let r = rng() * bagTotal(bag);
  for (const id of SYMBOL_ORDER) {
    r -= bag[id];
    if (r < 0) return id;
  }
  return SYMBOL_ORDER.find((id) => bag[id] > 0)!;
}

/** 四つ葉の効果を乗せた、今日の抽選用の絵柄袋 */
export function drawBag(state: GameState): Record<SymbolId, number> {
  if (state.cloverBoost <= 1) return state.bag;
  return { ...state.bag, goldSeed: Math.max(1, state.bag.goldSeed) * state.cloverBoost };
}

export function rollSeedCount(rng: Rng): number {
  const weights = CONFIG.seedCountWeights;
  let r = rng() * weights.reduce((n, w) => n + w.weight, 0);
  for (const w of weights) {
    r -= w.weight;
    if (r < 0) return w.count;
  }
  return weights[weights.length - 1].count;
}

// ---- 年貢 ----

export function taxAmount(index: number): number {
  const s = CONFIG.taxSchedule;
  if (index < s.length) return s[index];
  let amount = s[s.length - 1];
  for (let i = s.length; i <= index; i++) amount = Math.round(amount * CONFIG.taxGrowth);
  return amount;
}

export interface TaxInfo {
  dueDay: number;
  daysLeft: number;
  amount: number;
  index: number;
}

/** 次に納める年貢。dueDay の日の終わり（次の回転前）に徴収される */
export function nextTax(state: GameState): TaxInfo {
  // 納めた回数から次の期日を決める（納付直後に同じ年貢を指さないように）
  const index = state.taxesPaid;
  const dueDay = (index + 1) * CONFIG.taxPeriod;
  const relief = Math.min(0.5, 0.1 * state.charms.taxRelief);
  return { dueDay, daysLeft: dueDay - state.day, amount: Math.round(taxAmount(index) * (1 - relief)), index };
}

// ---- 1日の進行 ----

export type EndDayResult =
  | { ok: true; tax: number | null; expired: number; cleared: boolean }
  | { ok: false; tax: number; expired: number; cleared: false };

/**
 * 今日を終える。期日なら年貢を徴収し、払えればお守りの候補を用意する（charmOffer）。
 * 払えなければゲームオーバー。続けて drawDay で翌日のスロットを回す。
 */
export function endDay(state: GameState, rng: Rng): EndDayResult {
  const expired = state.results.filter((r) => !r.used && SYMBOLS[r.symbol].kind === 'manual').length;
  // 熟成：実ったまま日をまたいだ作物の売値が上がる
  if (state.day > 0 && state.charms.aging > 0) {
    state.field.forEach((c) => {
      if (c && isRipe(c)) c.bonus += state.charms.aging;
    });
  }
  state.results = [];
  // 「今日だけ」の効果はここで終わる
  state.fever = [];
  state.priceMult = 1;
  if (!(state.day > 0 && state.day % CONFIG.taxPeriod === 0)) return { ok: true, tax: null, expired, cleared: false };
  const t = nextTax(state);
  if (state.gold < t.amount) {
    state.over = true;
    return { ok: false, tax: t.amount, expired, cleared: false };
  }
  state.gold -= t.amount;
  state.taxesPaid++;
  state.bag.bug += CONFIG.bugPerTax;
  state.charmOffer = rollCharmOffer(state, rng);
  const cleared = !state.cleared && state.taxesPaid >= CONFIG.winTaxes;
  if (cleared) state.cleared = true;
  return { ok: true, tax: t.amount, expired, cleared };
}

export function drawDay(state: GameState, rng: Rng): void {
  state.day++;
  state.stats.spins++;
  state.priceMult = 1;
  const bag = drawBag(state);
  state.cloverBoost = 1;
  const symbols = Array.from({ length: state.reels }, () => drawSymbol(bag, rng));
  const counts = new Map<SymbolId, number>();
  symbols.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
  state.fever = [...counts].filter(([, n]) => n >= CONFIG.feverCount).map(([s]) => s);
  if (state.fever.length) state.stats.fevers++;
  state.results = symbols.map((symbol) => {
    const power = state.fever.includes(symbol) ? CONFIG.feverPower : 1;
    let total = 1;
    if (symbol === 'seed') total = (rollSeedCount(rng) + state.charms.seedSack) * power;
    else if (symbol === 'goldSeed' || symbol === 'fertilizer') total = power;
    return { symbol, used: false, total, left: total, power };
  });
}

/** 年貢とお守りの選択をはさまずに1日進める（シミュレーター用） */
export function startDay(state: GameState, rng: Rng): EndDayResult {
  const res = endDay(state, rng);
  if (!res.ok) return res;
  if (state.charmOffer) chooseCharm(state, state.charmOffer[0]);
  drawDay(state, rng);
  return res;
}

export type AutoEvent =
  | { type: 'crow'; cell: number | null; crop: Crop | null; eaten: boolean; toll: number }
  | { type: 'bug'; cell: number | null; warded: boolean; damage: number }
  | { type: 'coin'; amount: number }
  | { type: 'merchant'; mult: number }
  | { type: 'clover'; boost: number };

export function crowEatChance(state: GameState, power: number): number {
  const base = Math.max(0.1, CONFIG.crowEatChance - 0.15 * state.charms.scarecrow);
  return Math.min(1, power > 1 ? base * CONFIG.crowFeverMultiplier : base);
}

function earn(state: GameState, amount: number): void {
  state.gold += amount;
  state.stats.totalEarned += amount;
}

export function resolveAuto(state: GameState, reel: number, rng: Rng): AutoEvent | null {
  const r = state.results[reel];
  if (!r || r.used || SYMBOLS[r.symbol].kind !== 'auto') return null;
  r.used = true;
  r.left = 0;
  switch (r.symbol) {
    case 'coin': {
      const amount = (CONFIG.coinAmount + 2 * state.charms.coinPurse) * r.power;
      earn(state, amount);
      return { type: 'coin', amount };
    }
    case 'merchant':
      state.priceMult += CONFIG.merchantBonus * r.power;
      return { type: 'merchant', mult: state.priceMult };
    case 'clover':
      state.cloverBoost = Math.max(state.cloverBoost, 1) * CONFIG.cloverMultiplier * r.power;
      return { type: 'clover', boost: state.cloverBoost };
    case 'bug': {
      const targets = state.field.flatMap((c, i) => (c && c.growth > 0 ? [i] : []));
      if (targets.length === 0) return { type: 'bug', cell: null, warded: false, damage: 0 };
      const cell = targets[Math.floor(rng() * targets.length)];
      if (rng() < 1 - Math.pow(0.5, state.charms.bugWard)) return { type: 'bug', cell, warded: true, damage: 0 };
      const crop = state.field[cell]!;
      const damage = Math.min(crop.growth, CONFIG.bugDamage * r.power);
      crop.growth -= damage;
      return { type: 'bug', cell, warded: false, damage };
    }
    case 'crow': {
      const toll = 2 * state.charms.crowToll;
      if (toll) earn(state, toll);
      const occupied = state.field.flatMap((c, i) => (c ? [i] : []));
      if (occupied.length === 0) return { type: 'crow', cell: null, crop: null, eaten: false, toll };
      const cell = occupied[Math.floor(rng() * occupied.length)];
      const crop = state.field[cell];
      if (rng() >= crowEatChance(state, r.power)) {
        state.stats.crowsMissed++;
        return { type: 'crow', cell, crop, eaten: false, toll };
      }
      state.field[cell] = null;
      state.stats.cropsEaten++;
      return { type: 'crow', cell, crop, eaten: true, toll };
    }
    default:
      return null;
  }
}

export function resolveAllAuto(state: GameState, rng: Rng): AutoEvent[] {
  const events: AutoEvent[] = [];
  state.results.forEach((_, i) => {
    const e = resolveAuto(state, i, rng);
    if (e) events.push(e);
  });
  return events;
}

// ---- 手動の絵柄 ----

const growable = (c: Crop | null): c is Crop => c !== null && c.growth < CONFIG.ripeGrowth;

/** 出目 reel をマス cell に使えるか。太陽は cell を問わない */
export function canUse(state: GameState, reel: number, cell: number | null): boolean {
  const r = state.results[reel];
  if (!r || r.used || state.over) return false;
  const def = SYMBOLS[r.symbol];
  if (def.kind !== 'manual') return false;
  if (def.noTarget) return state.field.some(growable);
  if (cell === null) return validTargets(state, reel).length > 0;
  const crop = state.field[cell];
  switch (r.symbol) {
    case 'seed':
    case 'goldSeed':
      return crop === null;
    case 'rain':
      return growable(crop);
    case 'fertilizer':
      return crop !== null && !crop.fertilized;
    case 'bee':
      return [cell, ...neighbors(cell)].some((i) => growable(state.field[i]));
    default:
      return false;
  }
}

export function validTargets(state: GameState, reel: number): number[] {
  const r = state.results[reel];
  if (!r || SYMBOLS[r.symbol].noTarget) return [];
  return state.field.flatMap((_, i) => (canUse(state, reel, i) ? [i] : []));
}

function grow(state: GameState, cell: number, amount: number, affected: number[]): void {
  const c = state.field[cell];
  if (!growable(c) || amount <= 0) return;
  c.growth = Math.min(CONFIG.ripeGrowth, c.growth + amount);
  if (!affected.includes(cell)) affected.push(cell);
}

/** 出目を使う。成功したら影響を受けたマスを返す */
export function useSymbol(state: GameState, reel: number, cell: number | null): number[] | null {
  if (!canUse(state, reel, cell)) return null;
  const r = state.results[reel];
  r.left--;
  r.used = r.left <= 0;
  const affected: number[] = [];
  switch (r.symbol) {
    case 'seed':
    case 'goldSeed':
      state.field[cell!] = { kind: r.symbol === 'goldSeed' ? 'gold' : 'normal', growth: 0, fertilized: false, bonus: 0 };
      return [cell!];
    case 'rain':
      grow(state, cell!, CONFIG.rainGrowth * r.power, affected);
      neighbors(cell!).forEach((n) => grow(state, n, state.charms.gentleRain, affected));
      return affected;
    case 'fertilizer':
      state.field[cell!]!.fertilized = true;
      return [cell!];
    case 'bee':
      [cell!, ...neighbors(cell!)].forEach((i) => grow(state, i, CONFIG.beeGrowth * r.power, affected));
      return affected;
    case 'sun': {
      const amount = CONFIG.sunGrowth * r.power + state.charms.sunBlessing;
      state.field.forEach((_, i) => grow(state, i, amount, affected));
      return affected;
    }
    default:
      return null;
  }
}

// ---- 売却 ----

export function cropPrice(state: GameState, crop: Crop): number {
  const base = crop.kind === 'gold' ? CONFIG.goldPrice + 10 * state.charms.goldLuck : CONFIG.normalPrice + 2 * state.charms.bumper;
  const fert = crop.fertilized ? CONFIG.fertilizerMultiplier : 1;
  return Math.round((base + crop.bonus) * fert * state.priceMult);
}

export function isRipe(crop: Crop | null): boolean {
  return crop !== null && crop.growth >= CONFIG.ripeGrowth;
}

/** 実が並んでいる列 */
export function ripeLines(state: GameState): number[][] {
  return LINES.filter((line) => line.every((i) => isRipe(state.field[i])));
}

/** cell を通るそろった列 */
export function linesThrough(state: GameState, cell: number): number[][] {
  return ripeLines(state).filter((line) => line.includes(cell));
}

/** そろった列の数に応じた売値倍率 */
export function lineMultiplier(lines: number): number {
  const t = CONFIG.lineBonusByLines;
  return t[Math.min(lines, t.length - 1)];
}

/** cell を売ったときに一緒に売れるマス（そろった列があれば列ごと） */
export function harvestGroup(state: GameState, cell: number): number[] {
  const cells = new Set<number>([cell]);
  linesThrough(state, cell).forEach((line) => line.forEach((i) => cells.add(i)));
  return [...cells];
}

export interface SellResult {
  cells: { cell: number; price: number; kind: Crop['kind'] }[];
  total: number;
  line: boolean;
  /** 一度にそろった列の数（0 はそろいなし） */
  lines: number;
  mult: number;
}

export function sell(state: GameState, cell: number): SellResult | null {
  const crop = state.field[cell];
  if (state.over || !crop || !isRipe(crop)) return null;
  const group = harvestGroup(state, cell);
  const lines = linesThrough(state, cell).length;
  const line = lines > 0;
  const mult = lineMultiplier(lines);
  const cells = group.map((i) => {
    const c = state.field[i]!;
    return { cell: i, price: Math.round(cropPrice(state, c) * mult), kind: c.kind };
  });
  cells.forEach(({ cell: i }) => (state.field[i] = null));
  const total = cells.reduce((n, c) => n + c.price, 0);
  earn(state, total);
  state.stats.cropsSold += cells.length;
  if (line) state.stats.lineHarvests++;
  return { cells, total, line, lines, mult };
}

// ---- 強化 ----

export function upgradePrice(state: GameState, id: UpgradeId): number {
  let base = CONFIG.upgradePrices[id];
  // カラス・虫は消すたびに高くなる（全部消して楽になりすぎないように）
  if (id === 'removeCrow') base *= Math.pow(CONFIG.removeGrowth, state.removed.crow);
  if (id === 'removeBug') base *= Math.pow(CONFIG.removeGrowth, state.removed.bug);
  const discount = Math.min(0.5, 0.1 * state.charms.bargain);
  return Math.max(1, Math.round(base * (1 - discount)));
}

export function upgradeAvailable(state: GameState, id: UpgradeId): boolean {
  const change = UPGRADE_SYMBOL[id]!;
  if (change.delta > 0) return state.shop.includes(id as AddUpgradeId);
  return state.bag[change.symbol] > 0;
}

export function canBuy(state: GameState, id: UpgradeId): boolean {
  return !state.over && upgradeAvailable(state, id) && state.gold >= upgradePrice(state, id);
}

export function buy(state: GameState, id: UpgradeId): boolean {
  if (!canBuy(state, id)) return false;
  state.gold -= upgradePrice(state, id);
  const change = UPGRADE_SYMBOL[id]!;
  state.bag[change.symbol] += change.delta;
  if (id === 'removeCrow') state.removed.crow++;
  if (id === 'removeBug') state.removed.bug++;
  state.stats.purchases.push({ day: state.day, id });
  return true;
}

// ---- お守り ----

export function rollCharmOffer(state: GameState, rng: Rng): CharmId[] {
  const pool = state.charmPool.filter((id) => state.charms[id] < CHARMS[id].max).map((id) => ({
    id,
    w: CONFIG.charmTierWeights[CHARMS[id].tier],
  }));
  const offer: CharmId[] = [];
  while (offer.length < CONFIG.charmChoices && pool.length) {
    let r = rng() * pool.reduce((n, p) => n + p.w, 0);
    const k = Math.max(0, pool.findIndex((p) => (r -= p.w) < 0));
    offer.push(pool.splice(k, 1)[0].id);
  }
  return offer;
}

export function chooseCharm(state: GameState, id: CharmId): boolean {
  if (!state.charmOffer?.includes(id)) return false;
  state.charms[id]++;
  if (id === 'artisan') state.reels = Math.min(CONFIG.maxReels, state.reels + 1);
  state.charmOffer = null;
  state.stats.charms.push({ day: state.day, id });
  return true;
}
