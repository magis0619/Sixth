// ゲームのルール本体。画面に依存しない純粋なロジック。

import { CONFIG, SYMBOLS, SYMBOL_ORDER, type SymbolId, type UpgradeId } from './config.ts';

export type Rng = () => number;

export interface Crop {
  kind: 'normal' | 'gold';
  growth: number;
  fertilized: boolean;
}

export interface ReelResult {
  symbol: SymbolId;
  used: boolean;
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
  over: boolean;
  taxesPaid: number;
  stats: {
    spins: number;
    totalEarned: number;
    cropsSold: number;
    cropsEaten: number;
    purchases: Purchase[];
  };
}

export function newGame(): GameState {
  return {
    day: 0,
    gold: CONFIG.initialGold,
    reels: CONFIG.initialReels,
    bag: { ...CONFIG.initialBag },
    field: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => null),
    results: [],
    over: false,
    taxesPaid: 0,
    stats: { spins: 0, totalEarned: 0, cropsSold: 0, cropsEaten: 0, purchases: [] },
  };
}

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
  const p = CONFIG.taxPeriod;
  const dueDay = state.day === 0 ? p : Math.ceil(state.day / p) * p;
  const index = dueDay / p - 1;
  return { dueDay, daysLeft: dueDay - state.day, amount: taxAmount(index), index };
}

// ---- 1日の進行 ----

export type StartDayResult =
  | { ok: true; tax: { amount: number; index: number } | null; expired: number }
  | { ok: false; tax: { amount: number; index: number }; expired: number };

/**
 * 次の日へ進めてスロットを回す。期日なら先に年貢を徴収し、払えなければゲームオーバー。
 * 自動の絵柄は resolveAuto で1つずつ処理する（演出のため分けている）。
 */
export function startDay(state: GameState, rng: Rng): StartDayResult {
  const expired = state.results.filter((r) => !r.used && SYMBOLS[r.symbol].kind === 'manual').length;
  let tax: { amount: number; index: number } | null = null;
  if (state.day > 0 && state.day % CONFIG.taxPeriod === 0) {
    const t = nextTax(state);
    tax = { amount: t.amount, index: t.index };
    if (state.gold < t.amount) {
      state.over = true;
      state.results = [];
      return { ok: false, tax, expired };
    }
    state.gold -= t.amount;
    state.taxesPaid++;
  }
  state.day++;
  state.stats.spins++;
  state.results = Array.from({ length: state.reels }, () => ({ symbol: drawSymbol(state.bag, rng), used: false }));
  return { ok: true, tax, expired };
}

export type AutoEvent =
  | { type: 'crow'; cell: number | null; crop: Crop | null }
  | { type: 'coin'; amount: number };

export function resolveAuto(state: GameState, reel: number, rng: Rng): AutoEvent | null {
  const r = state.results[reel];
  if (!r || r.used || SYMBOLS[r.symbol].kind !== 'auto') return null;
  r.used = true;
  if (r.symbol === 'coin') {
    state.gold += CONFIG.coinAmount;
    state.stats.totalEarned += CONFIG.coinAmount;
    return { type: 'coin', amount: CONFIG.coinAmount };
  }
  // カラス
  const occupied = state.field.flatMap((c, i) => (c ? [i] : []));
  if (occupied.length === 0) return { type: 'crow', cell: null, crop: null };
  const cell = occupied[Math.floor(rng() * occupied.length)];
  const crop = state.field[cell];
  state.field[cell] = null;
  state.stats.cropsEaten++;
  return { type: 'crow', cell, crop };
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

/** 出目 reel をマス cell に使えるか。太陽は cell を問わない */
export function canUse(state: GameState, reel: number, cell: number | null): boolean {
  const r = state.results[reel];
  if (!r || r.used || state.over) return false;
  const def = SYMBOLS[r.symbol];
  if (def.kind !== 'manual') return false;
  if (def.noTarget) return state.field.some((c) => c && c.growth < CONFIG.ripeGrowth);
  if (cell === null) return validTargets(state, reel).length > 0;
  const crop = state.field[cell];
  switch (r.symbol) {
    case 'seed':
    case 'goldSeed':
      return crop === null;
    case 'rain':
      return crop !== null && crop.growth < CONFIG.ripeGrowth;
    case 'fertilizer':
      return crop !== null && !crop.fertilized;
    default:
      return false;
  }
}

export function validTargets(state: GameState, reel: number): number[] {
  const r = state.results[reel];
  if (!r || SYMBOLS[r.symbol].noTarget) return [];
  return state.field.flatMap((_, i) => (canUse(state, reel, i) ? [i] : []));
}

/** 出目を使う。成功したら影響を受けたマスを返す */
export function useSymbol(state: GameState, reel: number, cell: number | null): number[] | null {
  if (!canUse(state, reel, cell)) return null;
  const r = state.results[reel];
  r.used = true;
  switch (r.symbol) {
    case 'seed':
      state.field[cell!] = { kind: 'normal', growth: 0, fertilized: false };
      return [cell!];
    case 'goldSeed':
      state.field[cell!] = { kind: 'gold', growth: 0, fertilized: false };
      return [cell!];
    case 'rain': {
      const crop = state.field[cell!]!;
      crop.growth = Math.min(CONFIG.ripeGrowth, crop.growth + CONFIG.rainGrowth);
      return [cell!];
    }
    case 'fertilizer':
      state.field[cell!]!.fertilized = true;
      return [cell!];
    case 'sun': {
      const affected: number[] = [];
      state.field.forEach((c, i) => {
        if (c && c.growth < CONFIG.ripeGrowth) {
          c.growth = Math.min(CONFIG.ripeGrowth, c.growth + CONFIG.sunGrowth);
          affected.push(i);
        }
      });
      return affected;
    }
    default:
      return null;
  }
}

// ---- 売却 ----

export function cropPrice(crop: Crop): number {
  const base = crop.kind === 'gold' ? CONFIG.goldPrice : CONFIG.normalPrice;
  return crop.fertilized ? base * CONFIG.fertilizerMultiplier : base;
}

export function isRipe(crop: Crop | null): boolean {
  return crop !== null && crop.growth >= CONFIG.ripeGrowth;
}

export function sell(state: GameState, cell: number): number | null {
  const crop = state.field[cell];
  if (state.over || !crop || !isRipe(crop)) return null;
  const price = cropPrice(crop);
  state.field[cell] = null;
  state.gold += price;
  state.stats.totalEarned += price;
  state.stats.cropsSold++;
  return price;
}

// ---- 強化 ----

export function upgradePrice(state: GameState, id: UpgradeId): number {
  if (id === 'addReel') return CONFIG.reelPriceBase * (state.reels - 1);
  return CONFIG.upgradePrices[id];
}

export function upgradeAvailable(state: GameState, id: UpgradeId): boolean {
  if (id === 'addReel') return state.reels < CONFIG.maxReels;
  if (id === 'removeCrow') return state.bag.crow > 0;
  return true;
}

export function canBuy(state: GameState, id: UpgradeId): boolean {
  return !state.over && upgradeAvailable(state, id) && state.gold >= upgradePrice(state, id);
}

export function buy(state: GameState, id: UpgradeId): boolean {
  if (!canBuy(state, id)) return false;
  state.gold -= upgradePrice(state, id);
  switch (id) {
    case 'addSun':
      state.bag.sun++;
      break;
    case 'addFertilizer':
      state.bag.fertilizer++;
      break;
    case 'addGoldSeed':
      state.bag.goldSeed++;
      break;
    case 'removeCrow':
      state.bag.crow--;
      break;
    case 'addReel':
      state.reels++;
      break;
  }
  state.stats.purchases.push({ day: state.day, id });
  return true;
}
