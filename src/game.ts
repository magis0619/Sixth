// ゲームのルール本体。画面に依存しない純粋なロジック。

import {
  CHARMS, CHARM_ORDER, CHARM_PLACE, CONFIG, CROPS, PLACES, SEEDS, SYMBOLS, SYMBOL_ORDER, UPGRADE_SYMBOL,
  type AddUpgradeId, type CharmId, type CropKind, type PlaceId, type ShapeId, type SymbolId, type UpgradeId,
} from './config.ts';

export type Rng = () => number;

export interface Crop {
  kind: CropKind;
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
  /** 効果の倍率（カラス・虫の「群れ」で 2。良い絵柄のフィーバーは役で報いるので 1 のまま） */
  power: number;
}

/** お客さんの注文。年貢の週ごとに1件 */
export interface Order {
  crop: CropKind;
  need: number;
  have: number;
  reward: number;
  /** この日の終わりまで（年貢の期日と同じ） */
  dueDay: number;
  done: boolean;
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
  /** 畑の今の広さ。マスの番号は最大の広さ（CONFIG.fieldCols）で数え、範囲外のマスは使えない */
  cols: number;
  rows: number;
  field: (Crop | null)[];
  /** マスに置いた道具（そのマスには植えられず、列にも入らない） */
  tools: (PlaceId | null)[];
  /** 特別なマス（作物と重ねられる） */
  tiles: (PlaceId | null)[];
  /** 手に入れて、まだ畑に置いていない道具・特別なマス */
  stock: PlaceId[];
  /** 買った回数（畑を広げる・道具ごと。価格が上がる） */
  bought: Partial<Record<PlaceId | 'expand', number>>;
  /** 雑草が生えているマス（植えられない。毎日となりへ広がる） */
  weeds: boolean[];
  /** 霜で凍っている残り日数（0 は凍っていない）。凍ったマスは植える・育つ・売るができない */
  frost: number[];
  results: ReelResult[];
  /** 今日フィーバーした絵柄 */
  fever: SymbolId[];
  /** 品種改良（種のフィーバー）：今日この種で植える作物は1段階育った状態から */
  bred: SymbolId[];
  /** 今日の売値倍率（商人） */
  priceMult: number;
  /** 次の日の金の種の重み倍率（四つ葉）。1 なら効果なし */
  cloverBoost: number;
  charms: Record<CharmId, number>;
  /** 年貢を納めた直後に選ぶお守りの候補 */
  charmOffer: CharmId[] | null;
  order: Order | null;
  /** 直近の年貢で袋に増えたお邪魔 */
  lastObstacle: SymbolId | null;
  over: boolean;
  taxesPaid: number;
  /** 年貢を winTaxes 回納めたか（以降はエンドレス） */
  cleared: boolean;
  /** このゲームでショップにいつも並ぶ「足す」強化（開始時に選ぶ） */
  shop: AddUpgradeId[];
  /** 週替わりで並ぶ候補（解放済みの「足す」強化） */
  pool: AddUpgradeId[];
  /** 今週の週替わり */
  weekly: AddUpgradeId[];
  /** このゲームで出るお守り（解放済みのもの） */
  charmPool: CharmId[];
  /** これまでに消した枚数（絵柄ごと。消す価格が上がる） */
  removed: Partial<Record<SymbolId, number>>;
  stats: {
    spins: number;
    totalEarned: number;
    cropsSold: number;
    cropsEaten: number;
    crowsMissed: number;
    fevers: number;
    lineHarvests: number;
    ordersDone: number;
    purchases: Purchase[];
    charms: { day: number; id: CharmId }[];
  };
}

const emptyCharms = (): Record<CharmId, number> =>
  Object.fromEntries(CHARM_ORDER.map((id) => [id, 0])) as Record<CharmId, number>;

export interface GameSetup {
  shop: AddUpgradeId[];
  charmPool: CharmId[];
  /** 週替わりの候補（解放済み）。省略時は shop と同じ */
  pool?: AddUpgradeId[];
}

export const ALL_ADDS: AddUpgradeId[] = ['addSeed', 'addBerrySeed', 'addPumpkinSeed', 'addRain', 'addSun', 'addFertilizer', 'addBee', 'addMerchant', 'addGoldSeed', 'addClover'];

export function newGame(setup: GameSetup = { shop: ALL_ADDS, charmPool: CHARM_ORDER }): GameState {
  return {
    shop: [...setup.shop],
    pool: [...(setup.pool ?? setup.shop)],
    weekly: [],
    charmPool: [...setup.charmPool],
    removed: {},
    day: 0,
    gold: CONFIG.initialGold,
    reels: CONFIG.initialReels,
    bag: { ...CONFIG.initialBag },
    cols: CONFIG.startCols,
    rows: CONFIG.startRows,
    field: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => null),
    tools: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => null),
    tiles: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => null),
    stock: [],
    bought: {},
    weeds: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => false),
    frost: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => 0),
    results: [],
    fever: [],
    bred: [],
    priceMult: 1,
    cloverBoost: 1,
    charms: emptyCharms(),
    charmOffer: null,
    order: null,
    lastObstacle: null,
    over: false,
    taxesPaid: 0,
    cleared: false,
    stats: {
      spins: 0, totalEarned: 0, cropsSold: 0, cropsEaten: 0, crowsMissed: 0, fevers: 0, lineHarvests: 0, ordersDone: 0,
      purchases: [], charms: [],
    },
  };
}

// ---- 畑の位置 ----

export const cellX = (cell: number): number => cell % CONFIG.fieldCols;
export const cellY = (cell: number): number => Math.floor(cell / CONFIG.fieldCols);

/** 今の畑の広さの中のマスか */
export function inField(state: GameState, cell: number): boolean {
  return cell >= 0 && cellX(cell) < state.cols && cellY(cell) < state.rows;
}

/** (x, y) のマス。畑の外なら null */
export function cellAt(state: GameState, x: number, y: number): number | null {
  return x >= 0 && y >= 0 && x < state.cols && y < state.rows ? y * CONFIG.fieldCols + x : null;
}

/** 今の畑のマス全部 */
export function fieldCells(state: GameState): number[] {
  return state.field.flatMap((_, i) => (inField(state, i) ? [i] : []));
}

/** cell からのずれ（dx, dy）の並びにあるマス（畑の外は除く） */
function offsets(state: GameState, cell: number, list: [number, number][]): number[] {
  return list.flatMap(([dx, dy]) => {
    const c = cellAt(state, cellX(cell) + dx, cellY(cell) + dy);
    return c === null ? [] : [c];
  });
}

/** 上下左右 */
export function neighbors(state: GameState, cell: number): number[] {
  return offsets(state, cell, [[0, -1], [0, 1], [-1, 0], [1, 0]]);
}

/** r マス以内（周り8マスは r=1） */
export function around(state: GameState, cell: number, r: number): number[] {
  const list: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx || dy) list.push([dx, dy]);
  return offsets(state, cell, list);
}

/** 出目の形で効くマス（中心を含む） */
export function shapeCells(state: GameState, shape: ShapeId, cell: number): number[] {
  if (!inField(state, cell)) return [];
  if (shape === 'cross') return [cell, ...neighbors(state, cell)];
  if (shape === 'x') return [cell, ...offsets(state, cell, [[-1, -1], [1, -1], [-1, 1], [1, 1]])];
  // 縦一列：その列の全マス
  return fieldCells(state).filter((c) => cellX(c) === cellX(cell));
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
      if (c && isRipe(c)) c.bonus += 3 * state.charms.aging;
    });
  }
  // 井戸・水路は夜のうちに作物を育てる
  if (state.day > 0) overnightGrowth(state);
  // 霜は日ごとに溶けていく。雑草はとなりの空きマスへ広がる
  state.frost = state.frost.map((d) => Math.max(0, d - 1));
  if (state.day > 0) {
    state.weeds.forEach((w, i) => {
      if (!w || rng() >= CONFIG.weedSpreadChance) return;
      const open = neighbors(state, i).filter((n) => isOpen(state, n));
      if (open.length) state.weeds[open[Math.floor(rng() * open.length)]] = true;
    });
  }
  state.results = [];
  // 「今日だけ」の効果はここで終わる
  state.fever = [];
  state.bred = [];
  state.priceMult = 1;
  if (!(state.day > 0 && state.day % CONFIG.taxPeriod === 0)) return { ok: true, tax: null, expired, cleared: false };
  const t = nextTax(state);
  if (state.gold < t.amount) {
    state.over = true;
    return { ok: false, tax: t.amount, expired, cleared: false };
  }
  state.gold -= t.amount;
  state.taxesPaid++;
  const obstacle = CONFIG.obstaclesPerTax[Math.floor(rng() * CONFIG.obstaclesPerTax.length)];
  state.bag[obstacle]++;
  state.lastObstacle = obstacle;
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
    const power = state.fever.includes(symbol) && SYMBOLS[symbol].rarity === 'bad' ? CONFIG.feverPower : 1;
    const seed = SEEDS[symbol];
    const total = seed && !seed.single ? rollSeedCount(rng) + seed.extra + state.charms.seedSack : 1;
    return { symbol, used: false, total, left: total, power };
  });
  // 新しい週には新しい注文と週替わりの品が来る
  if (!state.order || state.order.dueDay < state.day) {
    state.order = makeOrder(state, rng);
    state.weekly = rollWeekly(state, rng);
  }
}

/** 空きマス（畑の中で、作物・道具・雑草・霜がない） */
export function isOpen(state: GameState, cell: number): boolean {
  return inField(state, cell) && !state.field[cell] && !state.tools[cell] && !state.weeds[cell] && !state.frost[cell];
}

/** 井戸・黄金の井戸・水路のマスで、夜のうちに育つマス */
export function overnightTargets(state: GameState): number[] {
  const out: number[] = [];
  fieldCells(state).forEach((i) => {
    if (state.tiles[i] === 'water') out.push(i);
    if (state.tools[i] === 'well') out.push(...neighbors(state, i));
    if (state.tools[i] === 'goldenWell') out.push(...around(state, i, 1));
  });
  return out;
}

function overnightGrowth(state: GameState): number[] {
  const affected: number[] = [];
  overnightTargets(state).forEach((c) => grow(state, c, 1, affected));
  return affected;
}

/** かかし（周り8マス）・大かかし（2マス以内）に守られているマス */
export function isGuarded(state: GameState, cell: number): boolean {
  return fieldCells(state).some((i) => {
    const t = state.tools[i];
    if (t !== 'scarecrow' && t !== 'bigScarecrow') return false;
    const r = t === 'scarecrow' ? 1 : 2;
    return Math.abs(cellX(i) - cellX(cell)) <= r && Math.abs(cellY(i) - cellY(cell)) <= r;
  });
}

/** 週替わり：いつも並ぶ品以外の解放済みから2つ */
export function rollWeekly(state: GameState, rng: Rng): AddUpgradeId[] {
  const pool = state.pool.filter((id) => !state.shop.includes(id));
  const out: AddUpgradeId[] = [];
  while (out.length < 2 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

/** 雑草を抜く（草よけのお守りがあれば無料） */
export function weedCost(state: GameState): number {
  return state.charms.bugWard > 0 ? 0 : CONFIG.weedPullCost;
}

export function pullWeed(state: GameState, cell: number): boolean {
  const cost = weedCost(state);
  if (!state.weeds[cell] || state.gold < cost) return false;
  state.gold -= cost;
  state.weeds[cell] = false;
  return true;
}

// ---- 注文 ----

/** 今の絵柄袋で育てられる作物から、週（年貢の回数）に応じた数の注文を作る */
export function makeOrder(state: GameState, rng: Rng): Order | null {
  const kinds = [...new Set(Object.entries(SEEDS).filter(([sym]) => state.bag[sym as SymbolId] > 0).map(([, d]) => d!.crop))];
  if (!kinds.length) return null;
  const crop = kinds[Math.floor(rng() * kinds.length)];
  const w = state.taxesPaid;
  const need = { strawberry: 5 + 3 * w, tomato: 3 + 2 * w, pumpkin: 1 + Math.ceil(w / 2), corn: 1 + Math.floor(w / 2) }[crop];
  const reward = Math.round(need * CROPS[crop].price * CONFIG.orderRewardMult) + CONFIG.orderRewardBase * (w + 1);
  return { crop, need, have: 0, reward, dueDay: nextTax(state).dueDay, done: false };
}

// ---- フィーバーの役 ----

export type FeverEvent = {
  symbol: SymbolId;
  count: number;
  jackpot: number;
} & (
  | { role: 'breed'; crop: CropKind }
  | { role: 'grow'; cells: number[] }
  | { role: 'festival'; mult: number }
  | { role: 'compost'; cells: number[] }
  | { role: 'honey'; amount: number }
  | { role: 'bigsale'; sold: SellResult[] }
  | { role: 'luck' }
  | { role: 'jackpot' }
);

export function jackpotAmount(state: GameState, count: number): number {
  return Math.round(CONFIG.jackpotBase * (count - 2) * (1 + state.taxesPaid * CONFIG.jackpotGrowth));
}

/** 良い絵柄のフィーバーの役を処理する（カラス・虫の群れは resolveAuto 側で強くなる） */
export function resolveFever(state: GameState, rng: Rng): FeverEvent[] {
  const events: FeverEvent[] = [];
  for (const symbol of state.fever) {
    if (SYMBOLS[symbol].rarity === 'bad') continue;
    const count = state.results.filter((r) => r.symbol === symbol).length;
    let jackpot = jackpotAmount(state, count);
    const base = { symbol, count };
    const seed = SEEDS[symbol];
    if (seed && symbol !== 'goldSeed') {
      // 勝手に植えると植える場所の判断を奪うので、植えたときに育った状態にするだけ
      state.bred.push(symbol);
      events.push({ ...base, jackpot, role: 'breed', crop: seed.crop });
    } else if (symbol === 'rain') {
      const cells: number[] = [];
      fieldCells(state).forEach((i) => grow(state, i, 1, cells));
      events.push({ ...base, jackpot, role: 'grow', cells });
    } else if (symbol === 'sun') {
      state.priceMult *= 2;
      events.push({ ...base, jackpot, role: 'festival', mult: state.priceMult });
    } else if (symbol === 'fertilizer') {
      const cells = state.field.flatMap((c, i) => (c && !c.fertilized ? [i] : []));
      cells.forEach((i) => (state.field[i]!.fertilized = true));
      events.push({ ...base, jackpot, role: 'compost', cells });
    } else if (symbol === 'bee') {
      const amount = CONFIG.honeyPerCrop * state.field.filter(Boolean).length;
      earn(state, amount);
      events.push({ ...base, jackpot, role: 'honey', amount });
    } else if (symbol === 'merchant') {
      const prev = state.priceMult;
      state.priceMult *= 2;
      const sold = state.field.flatMap((c, i) => {
        if (!c || !isRipe(c)) return [];
        const r = sell(state, i, true);
        return r ? [r] : [];
      });
      state.priceMult = prev;
      if (!sold.length) jackpot *= 2;
      events.push({ ...base, jackpot, role: 'bigsale', sold });
    } else if (symbol === 'clover') {
      state.charmOffer = rollCharmOffer(state, rng);
      events.push({ ...base, jackpot, role: 'luck' });
    } else {
      // 金貨・金の種：大当たり×3
      jackpot *= 3;
      events.push({ ...base, jackpot, role: 'jackpot' });
    }
    earn(state, jackpot);
  }
  return events;
}

export function newCrop(kind: CropKind): Crop {
  return { kind, growth: 0, fertilized: false, bonus: 0 };
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
  | { type: 'crow'; cell: number | null; crop: Crop | null; eaten: boolean; toll: number; guarded: boolean }
  | { type: 'bug'; cell: number | null; warded: boolean; damage: number }
  | { type: 'coin'; amount: number }
  | { type: 'merchant'; mult: number }
  | { type: 'weed'; cells: number[]; warded: boolean }
  | { type: 'tanuki'; taken: { cell: number; crop: Crop; price: number }[]; escaped: boolean; stolen: number; guarded: number[] }
  | { type: 'frost'; cells: number[] }
  | { type: 'clover'; boost: number };

export function crowEatChance(_state: GameState, power: number): number {
  return Math.min(1, power > 1 ? CONFIG.crowEatChance * CONFIG.crowFeverMultiplier : CONFIG.crowEatChance);
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
    case 'weed': {
      if (rng() < 1 - Math.pow(0.5, state.charms.bugWard)) return { type: 'weed', cells: [], warded: true };
      const cells: number[] = [];
      for (let k = 0; k < r.power; k++) {
        const open = state.field.flatMap((_, i) => (isOpen(state, i) ? [i] : []));
        if (!open.length) break;
        const c = open[Math.floor(rng() * open.length)];
        state.weeds[c] = true;
        cells.push(c);
      }
      return { type: 'weed', cells, warded: false };
    }
    case 'tanuki': {
      const taken: { cell: number; crop: Crop; price: number }[] = [];
      // かかしに守られた実には近寄れない
      const guarded = state.field.flatMap((c, i) => (c && isRipe(c) && !state.frost[i] && isGuarded(state, i) ? [i] : []));
      for (let k = 0; k < r.power; k++) {
        // 実ったまま置いてある一番高い作物（凍ったマス・守られたマスは触れない）
        const ripe = state.field
          .flatMap((c, i) => (c && isRipe(c) && !state.frost[i] && !isGuarded(state, i) ? [{ cell: i, crop: c, price: cropPrice(state, c, i) }] : []))
          .sort((a, b) => b.price - a.price);
        if (!ripe.length) break;
        state.field[ripe[0].cell] = null;
        state.stats.cropsEaten++;
        taken.push(ripe[0]);
      }
      // 実りがなければお金を盗む（実を早く売っても安全ではない）
      // 守られた実しかなければ逃げていく
      if (!taken.length && guarded.length) return { type: 'tanuki', taken, escaped: true, stolen: 0, guarded };
      let stolen = 0;
      if (!taken.length && state.gold > 0) {
        stolen = Math.min(state.gold, Math.max(CONFIG.tanukiMinSteal, Math.round(state.gold * CONFIG.tanukiStealRate)) * r.power);
        state.gold -= stolen;
      }
      return { type: 'tanuki', taken, escaped: false, stolen, guarded };
    }
    case 'frost': {
      const cells: number[] = [];
      const days = state.charms.heater > 0 ? 1 : CONFIG.frostDays;
      for (let k = 0; k < r.power; k++) {
        const free = fieldCells(state).filter((i) => !state.frost[i] && !state.tools[i]);
        if (!free.length) break;
        const c = free[Math.floor(rng() * free.length)];
        // 溶ける日を数えるため、今日の分を1日足しておく（endDay で1減る）
        state.frost[c] = days + 1;
        cells.push(c);
      }
      return { type: 'frost', cells };
    }
    case 'crow': {
      const toll = 2 * state.charms.crowToll;
      if (toll) earn(state, toll);
      // かぼちゃは大きくて重いので狙われない
      const occupied = state.field.flatMap((c, i) => (c && !CROPS[c.kind].crowProof ? [i] : []));
      if (occupied.length === 0) return { type: 'crow', cell: null, crop: null, eaten: false, toll, guarded: false };
      const cell = occupied[Math.floor(rng() * occupied.length)];
      const crop = state.field[cell];
      // かかしの近くは追い払われる
      if (isGuarded(state, cell)) {
        state.stats.crowsMissed++;
        return { type: 'crow', cell, crop, eaten: false, toll, guarded: true };
      }
      if (rng() >= crowEatChance(state, r.power)) {
        state.stats.crowsMissed++;
        return { type: 'crow', cell, crop, eaten: false, toll, guarded: false };
      }
      state.field[cell] = null;
      state.stats.cropsEaten++;
      return { type: 'crow', cell, crop, eaten: true, toll, guarded: false };
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

const growable = (c: Crop | null): c is Crop => c !== null && c.growth < CROPS[c.kind].ripe;
/** 凍っていない、育てられる作物 */
const growableAt = (state: GameState, i: number): boolean => growable(state.field[i]) && !state.frost[i];

/** 出目 reel をマス cell に使えるか。太陽は cell を問わない */
export function canUse(state: GameState, reel: number, cell: number | null): boolean {
  const r = state.results[reel];
  if (!r || r.used || state.over) return false;
  const def = SYMBOLS[r.symbol];
  if (def.kind !== 'manual') return false;
  if (cell === null) return validTargets(state, reel).length > 0;
  if (!inField(state, cell)) return false;
  const crop = state.field[cell];
  if (SEEDS[r.symbol]) return isOpen(state, cell);
  // 形で効く出目は、範囲に育てられる作物が1つでもあれば使える
  if (def.shape) return shapeCells(state, def.shape, cell).some((i) => growableAt(state, i));
  if (state.frost[cell]) return false;
  if (r.symbol === 'fertilizer') return crop !== null && !crop.fertilized;
  return false;
}

export function validTargets(state: GameState, reel: number): number[] {
  const r = state.results[reel];
  if (!r) return [];
  return fieldCells(state).filter((i) => canUse(state, reel, i));
}

function grow(state: GameState, cell: number, amount: number, affected: number[]): void {
  const c = state.field[cell];
  if (!growable(c) || state.frost[cell] || amount <= 0) return;
  c.growth = Math.min(CROPS[c.kind].ripe, c.growth + amount);
  if (!affected.includes(cell)) affected.push(cell);
}

/** 出目を使う。成功したら影響を受けたマスを返す */
export function useSymbol(state: GameState, reel: number, cell: number | null): number[] | null {
  if (!canUse(state, reel, cell)) return null;
  const r = state.results[reel];
  r.left--;
  r.used = r.left <= 0;
  const affected: number[] = [];
  const seed = SEEDS[r.symbol];
  if (seed) {
    const crop = newCrop(seed.crop);
    if (state.bred?.includes(r.symbol)) crop.growth = Math.min(CROPS[seed.crop].ripe - 1, 1);
    state.field[cell!] = crop;
    return [cell!];
  }
  switch (r.symbol) {
    case 'rain':
      // 恵みの雨は真ん中のマスにだけ上乗せ
      shapeCells(state, 'cross', cell!).forEach((i) => grow(state, i, CONFIG.rainGrowth * r.power + (i === cell ? state.charms.gentleRain : 0), affected));
      return affected;
    case 'fertilizer':
      state.field[cell!]!.fertilized = true;
      return [cell!];
    case 'bee':
      shapeCells(state, 'x', cell!).forEach((i) => grow(state, i, CONFIG.beeGrowth * r.power, affected));
      return affected;
    case 'sun': {
      const amount = CONFIG.sunGrowth * r.power + state.charms.sunBlessing;
      shapeCells(state, 'column', cell!).forEach((i) => grow(state, i, amount, affected));
      return affected;
    }
    default:
      return null;
  }
}

// ---- 売却 ----

/** 周りの巣箱で上がる売値 */
export function hiveBonus(state: GameState, cell: number): number {
  return around(state, cell, 1).reduce((n, i) => n + (state.tools[i] === 'hive' ? 2 : state.tools[i] === 'queenHive' ? 6 : 0), 0);
}

/** 列の倍率をかける前の売値。cell を渡すと巣箱・堆肥のマスも効く */
export function cropPrice(state: GameState, crop: Crop, cell?: number): number {
  const def = CROPS[crop.kind];
  const charm = def.gold ? 10 * state.charms.goldLuck : 2 * state.charms.bumper;
  const hive = cell === undefined ? 0 : hiveBonus(state, cell);
  const fert = crop.fertilized ? CONFIG.fertilizerMultiplier : 1;
  const tile = cell !== undefined && state.tiles[cell] === 'compost' ? 2 : 1;
  return Math.round((def.price + charm + crop.bonus + hive) * fert * tile * state.priceMult);
}

export function isRipe(crop: Crop | null): boolean {
  return crop !== null && crop.growth >= CROPS[crop.kind].ripe;
}

/** 一列（縦・横・斜め）に並ぶとみなす最小の個数 */
const MIN_RUN = 3;
const RUN_DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

/**
 * cell を通る、縦・横・斜めに MIN_RUN 個以上そろった一列（実ったマスだけ）。
 * 一列にならない並び（L字の3個など）は含まれない
 */
function runsThrough(state: GameState, cell: number): number[][] {
  const ok = (x: number, y: number) => {
    const c = cellAt(state, x, y);
    return c !== null && isRipe(state.field[c]) && !state.frost[c];
  };
  const cx = cellX(cell);
  const cy = cellY(cell);
  const runs: number[][] = [];
  for (const [dx, dy] of RUN_DIRS) {
    const run = [cell];
    for (let x = cx + dx, y = cy + dy; ok(x, y); x += dx, y += dy) run.push(cellAt(state, x, y)!);
    for (let x = cx - dx, y = cy - dy; ok(x, y); x -= dx, y -= dy) run.push(cellAt(state, x, y)!);
    if (run.length >= MIN_RUN) runs.push(run);
  }
  return runs;
}

/**
 * 実ったマスを売るときの倍率。列に入らない単品は singleMult、
 * 列に入っていれば lineMult ×（同じ作物だけの列があれば sameCropMult）×（交わる列の数のぶん上乗せ）
 */
export function cellMultiplier(state: GameState, cell: number): number {
  if (!isRipe(state.field[cell]) || state.frost[cell]) return 0;
  return multSteps(state, cell).reduce((m, s) => m * s.x, 1);
}

/** 倍率の内訳（演出で1つずつ乗せて見せる） */
export function multSteps(state: GameState, cell: number): { label: string; x: number }[] {
  const runs = runsThrough(state, cell);
  if (!runs.length) return [{ label: '単品', x: CONFIG.singleMult }];
  const steps = [{ label: '列', x: CONFIG.lineMult }];
  if (inSameCropLine(state, cell)) steps.push({ label: '同じ作物', x: CONFIG.sameCropMult });
  if (runs.length > 1) steps.push({ label: `${runs.length}本が交差`, x: 1 + CONFIG.crossBonus * (runs.length - 1) });
  return steps;
}

/** 同じ作物だけの列に入っているか（演出・表示用） */
export function inSameCropLine(state: GameState, cell: number): boolean {
  return runsThrough(state, cell).some((run) => run.every((c) => state.field[c]!.kind === state.field[run[0]]!.kind));
}

/**
 * cell と一緒に収穫できるマス（cell 自身を含む）。
 * 縦・横・斜めに3個以上そろった列が、マスを共有してつながったもの（コの字・十字・Zなどは可、L字の3個は不可）。
 * 列に入らない実は単品
 */
export function ripeGroup(state: GameState, cell: number): number[] {
  if (!isRipe(state.field[cell]) || state.frost[cell]) return [];
  const seen = new Set<number>([cell]);
  const queue = [cell];
  while (queue.length) {
    const c = queue.shift()!;
    for (const run of runsThrough(state, c)) {
      for (const n of run) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
  }
  return [...seen];
}

/** 演出の段階（0：単品・1：一列・2：二列以上・3：大収穫・4：ほぼ全部） */
export function groupTier(size: number): number {
  return size >= 9 ? 4 : size >= 6 ? 3 : size >= 4 ? 2 : size >= 3 ? 1 : 0;
}

/** cell を売ったときに一緒に売れるマス（つながった実をまとめて） */
export function harvestGroup(state: GameState, cell: number): number[] {
  return ripeGroup(state, cell);
}

export interface SellResult {
  cells: { cell: number; price: number; kind: Crop['kind'] }[];
  total: number;
  line: boolean;
  /** 演出の段階（groupTier）。0 は単品 */
  lines: number;
  /** まとめて売った数 */
  size: number;
  mult: number;
  /** 一番倍率の高いマスの倍率の内訳 */
  steps: { label: string; x: number }[];
  /** この売却で注文を達成したときの報酬 */
  orderReward: number;
}

/** single=true は列を崩さず1マスだけ、列の倍率なしで売る（大商い用） */
export function sell(state: GameState, cell: number, single = false): SellResult | null {
  const crop = state.field[cell];
  if (state.over || !crop || !isRipe(crop) || state.frost[cell]) return null;
  const group = single ? [cell] : harvestGroup(state, cell);
  const size = group.length;
  const line = size >= MIN_RUN;
  const lines = line ? groupTier(size) : 0;
  // 倍率は並んでいるうちに計算する（売って空いたマスは数えない）
  const mults = group.map((i) => (single ? 1 : cellMultiplier(state, i)));
  const mult = Math.max(...mults);
  // 一番倍率の高いマスの内訳（演出用）
  const steps = single ? [] : multSteps(state, group[mults.indexOf(mult)]);
  const cells = group.map((i, k) => {
    const c = state.field[i]!;
    return { cell: i, price: Math.round(cropPrice(state, c, i) * mults[k]), kind: c.kind };
  });
  cells.forEach(({ cell: i }) => (state.field[i] = null));
  const total = cells.reduce((n, c) => n + c.price, 0);
  earn(state, total);
  state.stats.cropsSold += cells.length;
  if (line) state.stats.lineHarvests++;
  let orderReward = 0;
  const o = state.order;
  if (o && !o.done) {
    o.have = Math.min(o.need, o.have + cells.filter((c) => c.kind === o.crop).length);
    if (o.have >= o.need) {
      o.done = true;
      orderReward = o.reward;
      earn(state, orderReward);
      state.stats.ordersDone++;
    }
  }
  return { cells, total, line, lines, size, mult, steps, orderReward };
}

// ---- 強化 ----

export function upgradePrice(state: GameState, id: UpgradeId): number {
  let base = CONFIG.upgradePrices[id];
  // お邪魔は消すたびに高くなる（全部消して楽になりすぎないように）
  const change = UPGRADE_SYMBOL[id]!;
  if (change.delta < 0) base *= Math.pow(CONFIG.removeGrowth, state.removed[change.symbol] ?? 0);
  const discount = Math.min(0.5, 0.1 * state.charms.bargain);
  return Math.max(1, Math.round(base * (1 - discount)));
}

export function upgradeAvailable(state: GameState, id: UpgradeId): boolean {
  const change = UPGRADE_SYMBOL[id]!;
  if (change.delta > 0) return state.shop.includes(id as AddUpgradeId) || state.weekly.includes(id as AddUpgradeId);
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
  if (change.delta < 0) state.removed[change.symbol] = (state.removed[change.symbol] ?? 0) + 1;
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
  const place = CHARM_PLACE[id];
  if (place) state.stock.push(place);
  state.charmOffer = null;
  state.stats.charms.push({ day: state.day, id });
  return true;
}

// ---- 畑を広げる・道具と特別なマス ----

export function expandPrice(state: GameState): number | null {
  const p = CONFIG.expandPrices[state.bought.expand ?? 0];
  if (p === undefined) return null;
  return Math.max(1, Math.round(p * (1 - Math.min(0.5, 0.1 * state.charms.bargain))));
}

export function canExpand(state: GameState): boolean {
  const p = expandPrice(state);
  return !state.over && p !== null && state.gold >= p;
}

/** 列→行の順に1つ広げる（3×3 → 4×3 → 4×4 → 5×4 → 5×5） */
export function expand(state: GameState): boolean {
  if (!canExpand(state)) return false;
  state.gold -= expandPrice(state)!;
  state.bought.expand = (state.bought.expand ?? 0) + 1;
  if (state.cols <= state.rows) state.cols++;
  else state.rows++;
  return true;
}

export function placePrice(state: GameState, id: PlaceId): number | null {
  const base = PLACES[id].price;
  if (base === null) return null;
  const p = base * Math.pow(CONFIG.placeGrowth, state.bought[id] ?? 0);
  return Math.max(1, Math.round(p * (1 - Math.min(0.5, 0.1 * state.charms.bargain))));
}

export function canBuyPlace(state: GameState, id: PlaceId): boolean {
  const p = placePrice(state, id);
  return !state.over && p !== null && state.gold >= p;
}

/** 買って手元に置く。畑に置くのは place で */
export function buyPlace(state: GameState, id: PlaceId): boolean {
  if (!canBuyPlace(state, id)) return false;
  state.gold -= placePrice(state, id)!;
  state.bought[id] = (state.bought[id] ?? 0) + 1;
  state.stock.push(id);
  return true;
}

/** 手元の先頭の物を cell に置けるか。道具は空いたマス、特別なマスは道具・特別なマスのないマス */
export function canPlace(state: GameState, cell: number): boolean {
  const id = state.stock[0];
  if (!id || !inField(state, cell) || state.tools[cell] || state.tiles[cell]) return false;
  if (PLACES[id].kind === 'tool') return isOpen(state, cell);
  return true;
}

export function place(state: GameState, cell: number): PlaceId | null {
  if (!canPlace(state, cell)) return null;
  const id = state.stock.shift()!;
  if (PLACES[id].kind === 'tool') state.tools[cell] = id;
  else state.tiles[cell] = id;
  return id;
}
