// ゲームのルール本体。画面に依存しない純粋なロジック。

import {
  BAG_CONDITIONS, CHARMS, CHARM_ORDER, CHARM_PLACE, CONFIG, CROPS, EVENT_CONDITIONS, PLACE_ORDER, PLACES, SEEDS, SYMBOLS, SYMBOL_ORDER, TOOL_EVOLVE, UPGRADE_SYMBOL,
  type AddUpgradeId, type CharmId, type CropKind, type PlaceId, type ShapeId, type SymbolId, type UpgradeId,
} from './config.ts';

export type Rng = () => number;

export interface Crop {
  kind: CropKind;
  growth: number;
  fertilized: boolean;
  /** 熟成のお守りで上がった売値 */
  bonus: number;
  /** 2×2の大物（スイカ）の右・下・右下のマス：本体（左上）のマスの番号。本体と成長・売値は本体が持つ */
  anchor?: number;
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

/** 画面に知らせる出来事（特別なお守り・進化など）。画面側が取り出して演出する */
export type Notice =
  | { kind: 'ready'; id: CharmId }
  | { kind: 'got'; id: CharmId }
  | { kind: 'golden'; id: CharmId }
  | { kind: 'evolve'; cell: number; from: PlaceId; to: PlaceId }
  | { kind: 'jackpot'; amount: number };

/** 夜のうちに入ったお金（水車・釣り堀・鶏小屋・牛小屋） */
export interface NightIncome {
  wheel: number;
  /** 水車の立った水路の並び */
  wheels: number[][];
  fish: number;
  /** 大物が釣れた池 */
  bigFish: number[];
  animals: number;
  /** 夜のうちに育ったマス（巣箱の苺・水車の隣・水路・井戸） */
  grown: number[];
}

/** 週ごとの相場：高値と安値の作物 */
export interface Market {
  high: CropKind | null;
  low: CropKind | null;
}

export interface Purchase {
  day: number;
  id: UpgradeId;
}

export interface GameState {
  /** このプレイの識別子（記録の集計用） */
  runId: string;
  /** 難しさ（0＝ふつう、1〜4＝難しい） */
  difficulty: number;
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
  /** 袋の条件を満たして、次の年貢後の3択に必ず並ぶ特別なお守り */
  ready: CharmId[];
  /** 一度並んだ特別なお守り（以後はふだんの抽選にも混ざる） */
  specials: CharmId[];
  /** 道具が働いた回数（マスごと。進化に使う） */
  toolXp: number[];
  /** 今日、雨・太陽が効いたマスと、天気雨で上乗せ済みのマス */
  today: { rain: number[]; sun: number[]; boosted: number[] };
  /** 首の皮：次の年貢が半分 */
  halfTax: boolean;
  /** 画面に知らせる出来事 */
  notices: Notice[];
  /** 買った回数（畑を広げる・道具ごと。価格が上がる） */
  bought: Partial<Record<PlaceId | 'expand', number>>;
  /** 鍬で耕したマス（次に植えた作物が成長+1） */
  tilled: boolean[];
  /** 今週の相場 */
  market: Market | null;
  /** ゆうべ入ったお金（画面で知らせる） */
  nightIncome: NightIncome | null;
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
  lastObstacles: SymbolId[];
  over: boolean;
  taxesPaid: number;
  /** 年貢を winTaxes 回納めたか（以降はエンドレス） */
  cleared: boolean;
  /** このゲームでショップにいつも並ぶ「足す」強化（開始時に選ぶ） */
  shop: AddUpgradeId[];
  /** 週替わりで並ぶ候補（解放済みの「足す」強化） */
  pool: AddUpgradeId[];
  /** 今週の週替わり */
  /** 今週ショップに並ぶ「足す」品（weeklyCount 個。週ごとに入れ替わる） */
  weekly: AddUpgradeId[];
  /** 今週ショップに並ぶ畑の品（道具・特別なマス） */
  weeklyPlaces: PlaceId[];
  /** このゲームで出るお守り（解放済みのもの） */
  charmPool: CharmId[];
  /** これまでに消した枚数（絵柄ごと。消す価格が上がる） */
  removed: Partial<Record<SymbolId, number>>;
  /** 今週お邪魔を消した回数（週が替わると0に戻る） */
  removedThisWeek: number;
  /** 今日、彩りの畑がそろった（その日のうちは売っても続く） */
  colorfulToday: boolean;
  stats: {
    spins: number;
    totalEarned: number;
    cropsSold: number;
    cropsEaten: number;
    /** カラスに食べられた数（カラス返しの条件） */
    crowEaten: number;
    crowsMissed: number;
    fevers: number;
    lineHarvests: number;
    ordersDone: number;
    /** このプレイで売ったことのある作物（品評会の条件） */
    soldKinds: CropKind[];
    purchases: Purchase[];
    charms: { day: number; id: CharmId }[];
  };
}

/** お守りが金色（同じものを goldenAt 個そろえた）か */
export function isGolden(state: GameState, id: CharmId): boolean {
  return CHARMS[id].max >= CONFIG.goldenAt && state.charms[id] >= CONFIG.goldenAt;
}

/** お守りの効き目（金色なら2倍） */
export function lv(state: GameState, id: CharmId): number {
  return isGolden(state, id) ? state.charms[id] * 2 : state.charms[id];
}

const emptyCharms = (): Record<CharmId, number> =>
  Object.fromEntries(CHARM_ORDER.map((id) => [id, 0])) as Record<CharmId, number>;

export interface GameSetup {
  shop: AddUpgradeId[];
  charmPool: CharmId[];
  /** 週替わりの候補（解放済み）。省略時は shop と同じ */
  pool?: AddUpgradeId[];
  /** 難しさ（0＝ふつう） */
  difficulty?: number;
}

export const ALL_ADDS: AddUpgradeId[] = ['addSeed', 'addBerrySeed', 'addPumpkinSeed', 'addMelonSeed', 'addWatermelonSeed', 'addRain', 'addSun', 'addThunder', 'addHoe', 'addFertilizer', 'addBee', 'addMerchant', 'addGoldSeed', 'addClover'];

export function newGame(setup: GameSetup = { shop: ALL_ADDS, charmPool: CHARM_ORDER }): GameState {
  return {
    runId: Math.random().toString(36).slice(2, 10),
    difficulty: setup.difficulty ?? 0,
    shop: [...setup.shop],
    pool: [...(setup.pool ?? setup.shop)],
    weekly: [],
    weeklyPlaces: [],
    charmPool: [...setup.charmPool],
    removed: {},
    removedThisWeek: 0,
    colorfulToday: false,
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
    ready: [],
    specials: [],
    toolXp: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => 0),
    today: { rain: [], sun: [], boosted: [] },
    halfTax: false,
    notices: [],
    tilled: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => false),
    market: null,
    nightIncome: null,
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
    lastObstacles: [],
    over: false,
    taxesPaid: 0,
    cleared: false,
    stats: {
      spins: 0, totalEarned: 0, cropsSold: 0, cropsEaten: 0, crowEaten: 0, crowsMissed: 0, fevers: 0, lineHarvests: 0, ordersDone: 0,
      soldKinds: [], purchases: [], charms: [],
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
  if (shape === 'x') return [cell, ...offsets(state, cell, [[-1, -1], [1, -1], [-1, 1], [1, 1]])];
  if (shape === 'all') return fieldCells(state);
  if (shape === 'cross') {
    // 雷雨：斜めにもいっぱいに効く
    const diag = state.charms.thunderstorm > 0;
    return fieldCells(state).filter((c) => {
      const dx = Math.abs(cellX(c) - cellX(cell));
      const dy = Math.abs(cellY(c) - cellY(cell));
      return dx === 0 || dy === 0 || (diag && dx === dy);
    });
  }
  // 横一列：その行の全マス
  if (shape === 'row') return fieldCells(state).filter((c) => cellY(c) === cellY(cell));
  // 縦一列：その列の全マス
  return fieldCells(state).filter((c) => cellX(c) === cellX(cell));
}

// ---- 2×2の大物（スイカ） ----

/** そのマスの作物の本体のマス（大物の右・下・右下は左上の本体を指す） */
export function rootOf(state: GameState, cell: number): number {
  return state.field[cell]?.anchor ?? cell;
}

/** 本体 root から右・下・右下の4マス（畑の外は除く） */
export function bigCells(state: GameState, root: number): number[] {
  return [root, ...offsets(state, root, [[1, 0], [0, 1], [1, 1]])];
}

/** 作物が占めるマス（大物なら4マス） */
export function cropCells(state: GameState, cell: number): number[] {
  const root = rootOf(state, cell);
  const c = state.field[root];
  return c && CROPS[c.kind].big ? bigCells(state, root) : [root];
}

/** 作物を畑から取り除く（大物は4マスとも） */
export function removeCrop(state: GameState, cell: number): void {
  cropCells(state, cell).forEach((i) => (state.field[i] = null));
}

/** 作物の占めるマスのどれかが凍っているか */
function frozenCrop(state: GameState, cell: number): boolean {
  return cropCells(state, cell).some((i) => state.frost[i] > 0);
}

// ---- 水路のつながり ----

/** 水車：縦か横に wheelMin 個以上まっすぐ並んだ水路の並び */
export function waterWheels(state: GameState): number[][] {
  const out: number[][] = [];
  const scan = (lines: number[][]) =>
    lines.forEach((line) => {
      let run: number[] = [];
      [...line, -1].forEach((c) => {
        if (c >= 0 && state.tiles[c] === 'water') run.push(c);
        else {
          if (run.length >= CONFIG.wheelMin) out.push(run);
          run = [];
        }
      });
    });
  scan(Array.from({ length: state.rows }, (_, y) => Array.from({ length: state.cols }, (_, x) => cellAt(state, x, y)!)));
  scan(Array.from({ length: state.cols }, (_, x) => Array.from({ length: state.rows }, (_, y) => cellAt(state, x, y)!)));
  return out;
}

/** 釣り堀：上下左右の4方を水路だけで囲んだ空きマス（畑の端は囲みにならない） */
export function isPond(state: GameState, cell: number): boolean {
  if (!inField(state, cell) || state.tiles[cell] === 'water' || state.field[cell] || state.tools[cell]) return false;
  const n = neighbors(state, cell);
  return n.length === 4 && n.every((i) => state.tiles[i] === 'water');
}

/** 水車1つの毎晩のお金（水車職人なら2倍） */
export function wheelGold(state: GameState, run: number[]): number {
  return run.length * CONFIG.wheelGold * (state.charms.wheelwright ? 2 : 1);
}

/** 夜のうちに入るお金（水車・釣り堀・鶏小屋・牛小屋） */
function collectNightIncome(state: GameState, rng: Rng, grown: number[]): NightIncome {
  const wheels = waterWheels(state);
  const wheel = wheels.reduce((n, w) => n + wheelGold(state, w), 0);
  let fish = 0;
  const bigFish: number[] = [];
  fieldCells(state).forEach((i) => {
    if (!isPond(state, i)) return;
    fish += CONFIG.fishGold;
    if (rng() < CONFIG.bigFishChance) {
      fish += CONFIG.bigFishGold;
      bigFish.push(i);
    }
  });
  const animals = fieldCells(state).reduce((n, i) => n + animalGold(state, i), 0);
  earn(state, wheel + fish + animals);
  return { wheel, wheels, fish, bigFish, animals, grown };
}

// ---- セット効果 ----

/** 牧場：鶏小屋・牛小屋・巣箱（女王蜂の巣箱でもよい）が全部畑にあると、3つの効果が2倍 */
export function hasRanch(state: GameState): boolean {
  const has = (...ids: PlaceId[]) => fieldCells(state).some((i) => ids.includes(state.tools[i]!));
  return has('henhouse') && has('cowshed') && has('hive', 'queenHive');
}

/** 彩りの畑：実った作物（凍っていない）の種類の数 */
export function ripeKinds(state: GameState): CropKind[] {
  return [...new Set(fieldCells(state).flatMap((i) => {
    const c = state.field[i];
    return c && c.anchor === undefined && isRipe(c) && !frozenCrop(state, i) ? [c.kind] : [];
  }))];
}

/** 彩りの畑。一度そろった日は、売って種類が減ってもその日のうちは続く */
export function isColorful(state: GameState): boolean {
  return state.colorfulToday || ripeKinds(state).length >= CONFIG.colorfulKinds;
}

/** 鶏小屋・牛小屋1つの毎晩の収入（牧場主・水飲み場・牧場のセット効果込み） */
export function animalGold(state: GameState, cell: number): number {
  const t = state.tools[cell];
  if (t !== 'henhouse' && t !== 'cowshed') return 0;
  let gold = (t === 'henhouse' ? CONFIG.henhouseGold : CONFIG.cowshedGold) + lv(state, 'rancher');
  // 牛小屋の隣に水路があれば水飲み場
  if (t === 'cowshed' && neighbors(state, cell).some((n) => state.tiles[n] === 'water')) gold += CONFIG.cowWaterGold;
  return gold * (hasRanch(state) ? 2 : 1);
}

/** 鶏小屋の周り8マス（虫を食べる） */
function nearHenhouse(state: GameState, cell: number): boolean {
  return around(state, cell, 1).some((i) => state.tools[i] === 'henhouse');
}

// ---- 相場 ----

/** 今の絵柄袋で育てられる作物 */
function growableKinds(state: GameState): CropKind[] {
  return [...new Set(Object.entries(SEEDS).filter(([sym]) => state.bag[sym as SymbolId] > 0).map(([, d]) => d!.crop))];
}

/** 週ごとの相場：全作物から高値1つ・安値1つ（育てている作物だけから選ぶと、ただの値上げになる） */
export function rollMarket(_state: GameState, rng: Rng): Market {
  const kinds = Object.keys(CROPS) as CropKind[];
  const high = kinds.length ? kinds.splice(Math.floor(rng() * kinds.length), 1)[0] : null;
  const low = kinds.length ? kinds[Math.floor(rng() * kinds.length)] : null;
  return { high, low };
}

/** 相場の倍率 */
export function marketMult(state: GameState, kind: CropKind): number {
  if (state.market?.high === kind) return CONFIG.marketHigh;
  if (state.market?.low === kind) return CONFIG.marketLow;
  return 1;
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
  const relief = Math.min(0.5, 0.1 * lv(state, 'taxRelief'));
  const half = (state.halfTax ? 0.5 : 1) * (state.difficulty >= 1 ? 1.3 : 1);
  return { dueDay, daysLeft: dueDay - state.day, amount: Math.round(taxAmount(index) * (1 - relief) * half), index };
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
  if (state.day > 0 && lv(state, 'aging') > 0) {
    state.field.forEach((c) => {
      if (c && isRipe(c)) c.bonus += 3 * lv(state, 'aging');
    });
  }
  // 井戸・水路は夜のうちに作物を育てる。水車・釣り堀・鶏小屋・牛小屋のお金が入る
  const grown = state.day > 0 ? overnightGrowth(state) : [];
  state.nightIncome = state.day > 0 ? collectNightIncome(state, rng, grown) : null;
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
  state.today = { rain: [], sun: [], boosted: [] };
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
  state.halfTax = false;
  // 首の皮：ギリギリで払えたら、次の年貢が半分
  if (state.charms.lastStraw === 0 && state.taxesPaid >= EVENT_CONDITIONS.lastStrawFrom && state.gold <= EVENT_CONDITIONS.lastStraw) {
    grant(state, 'lastStraw');
    state.halfTax = true;
  }
  state.lastObstacles = rollObstacles(state.taxesPaid, rng, state.difficulty);
  state.lastObstacles.forEach((o) => state.bag[o]++);
  checkReady(state);
  state.charmOffer = rollCharmOffer(state, rng);
  const cleared = !state.cleared && state.taxesPaid >= CONFIG.winTaxes;
  if (cleared) state.cleared = true;
  return { ok: true, tax: t.amount, expired, cleared };
}

/** n 回目の年貢を納めたときに袋に増えるお邪魔 */
export function obstacleRule(n: number, difficulty = 0): { count: number; pool: SymbolId[] } {
  // 難しい3以上：2回分早く進み、枚数も1枚多い
  const hard = difficulty >= 3;
  const r = [...CONFIG.obstacleSchedule].reverse().find((x) => n + (hard ? 2 : 0) >= x.from) ?? CONFIG.obstacleSchedule[0];
  return { count: r.count + (hard ? 1 : 0), pool: r.pool };
}

export function rollObstacles(n: number, rng: Rng, difficulty = 0): SymbolId[] {
  const { count, pool } = obstacleRule(n, difficulty);
  return Array.from({ length: count }, () => pool[Math.floor(rng() * pool.length)]);
}

export function drawDay(state: GameState, rng: Rng): void {
  state.day++;
  state.stats.spins++;
  state.colorfulToday = false;
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
    // 大きな種袋は、1個ずつ植える種（かぼちゃ・メロン・金の種・スイカ）も含めて全部の種に効く
    const total = seed ? (seed.single ? 1 : rollSeedCount(rng) + seed.extra) + lv(state, 'seedSack') : 1;
    return { symbol, used: false, total, left: total, power };
  });
  // 新しい週には新しい注文と週替わりの品が来る
  if (!state.order || state.order.dueDay < state.day) {
    state.order = makeOrder(state, rng);
    state.weekly = rollWeekly(state, rng);
    state.weeklyPlaces = rollWeeklyPlaces(state, rng);
    state.removedThisWeek = 0;
    // 相場は難しいモードから（marketFrom 以上）
    state.market = CONFIG.marketOn && state.difficulty >= CONFIG.marketFrom ? rollMarket(state, rng) : null;
  }
}

/** 空きマス（畑の中で、作物・道具・雑草・霜・池がない） */
export function isOpen(state: GameState, cell: number): boolean {
  return inField(state, cell) && !state.field[cell] && !state.tools[cell] && !state.weeds[cell] && !state.frost[cell] && !isPond(state, cell);
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
  // 巣箱の周りの苺は受粉で育つ（牧場なら2倍）
  const pollen = hasRanch(state) ? 2 : 1;
  fieldCells(state).forEach((i) => {
    if (state.tools[i] !== 'hive' && state.tools[i] !== 'queenHive') return;
    around(state, i, 1).forEach((c) => state.field[c]?.kind === 'strawberry' && grow(state, c, pollen, affected));
  });
  // 水車の立った水路に隣り合うマスは、水が引かれて育つ（いくつの水車に隣り合っても1回）
  const wheelSide = new Set<number>();
  waterWheels(state).forEach((w) => w.forEach((c) => neighbors(state, c).forEach((n) => !w.includes(n) && state.tiles[n] !== 'water' && wheelSide.add(n))));
  const sideGrown: number[] = [];
  wheelSide.forEach((c) => grow(state, c, 1, sideGrown));
  sideGrown.forEach((c) => affected.includes(c) || affected.push(c));
  fieldCells(state).forEach((i) => {
    if (state.tiles[i] === 'water') grow(state, i, 1, affected);
    const t = state.tools[i];
    if (t === 'well' || t === 'goldenWell') {
      const cells = t === 'well' ? neighbors(state, i) : around(state, i, 1);
      cells.forEach((c) => {
        const before = state.field[c]?.growth;
        grow(state, c, 1, affected);
        // 井戸は育てた数だけ経験を積む
        if (t === 'well' && state.field[c] && state.field[c]!.growth !== before) state.toolXp[i]++;
      });
    }
  });
  evolveTools(state);
  return affected;
}

/** 道具の進化：働いた回数が足りたら上位の道具に変わる */
export function evolveTools(state: GameState): void {
  fieldCells(state).forEach((i) => {
    const t = state.tools[i];
    const ev = t ? TOOL_EVOLVE[t] : undefined;
    if (!t || !ev || state.toolXp[i] < ev.need) return;
    state.tools[i] = ev.to;
    state.toolXp[i] = 0;
    state.notices.push({ kind: 'evolve', cell: i, from: t, to: ev.to });
  });
}

/** cell を守っている（普通の）かかし。進化の経験に使う */
function guardians(state: GameState, cell: number): number[] {
  return fieldCells(state).filter((i) => state.tools[i] === 'scarecrow' && Math.abs(cellX(i) - cellX(cell)) <= 1 && Math.abs(cellY(i) - cellY(cell)) <= 1);
}

/** 特別なお守りをその場でもらう */
function grant(state: GameState, id: CharmId): void {
  state.charms[id]++;
  state.stats.charms.push({ day: state.day, id });
  state.notices.push({ kind: 'got', id });
}

/** 袋の中身の条件を満たした特別なお守りを、次の3択に並ぶようにする */
export function checkReady(state: GameState): void {
  (Object.entries(BAG_CONDITIONS) as [CharmId, Partial<Record<SymbolId, number>>][]).forEach(([id, need]) => {
    if (state.charms[id] > 0 || state.ready.includes(id)) return;
    if ((Object.entries(need) as [SymbolId, number][]).every(([sym, n]) => state.bag[sym] >= n)) {
      state.ready.push(id);
      state.notices.push({ kind: 'ready', id });
    }
  });
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

/** 重みつきで重ならないように n 個選ぶ */
function pickWeighted<T>(items: { id: T; w: number }[], n: number, rng: Rng): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    let r = rng() * pool.reduce((s, p) => s + p.w, 0);
    const k = Math.max(0, pool.findIndex((p) => (r -= p.w) < 0));
    out.push(pool.splice(k, 1)[0].id);
  }
  return out;
}

/** 作戦が変わる「足す」品か（袋にまだない絵柄なら新しい作戦になる） */
export function isPivotAdd(state: GameState, id: AddUpgradeId): boolean {
  return id in CONFIG.pivotAdds && state.bag[UPGRADE_SYMBOL[id]!.symbol] === 0;
}

/** 作戦が変わる畑の品か（まだ買っていない道具・特別なマス） */
export function isPivotPlace(state: GameState, id: PlaceId): boolean {
  return id in CONFIG.pivotPlaces && !state.bought[id];
}

/** 1つ目は作戦が変わる品から（あれば）、残りは重みつきで */
function rollWithPivot<T>(items: { id: T; w: number }[], pivot: (id: T) => boolean, rng: Rng): T[] {
  const first = pickWeighted(items.filter((x) => pivot(x.id)), 1, rng);
  return [...first, ...pickWeighted(items.filter((x) => !first.includes(x.id)), CONFIG.weeklyCount - first.length, rng)];
}

/** 今週の「足す」品：準備で選んだ品（出やすい）・解放済みの品・満月から weeklyCount 個。1つは作戦が変わる品 */
export function rollWeekly(state: GameState, rng: Rng): AddUpgradeId[] {
  const ids = [...new Set<AddUpgradeId>([...state.shop, ...state.pool, 'addMoon'])];
  return rollWithPivot(ids.map((id) => ({ id, w: state.shop.includes(id) ? 2 : 1 })), (id) => isPivotAdd(state, id), rng);
}

/** 今週の畑の品：ショップで買える道具・特別なマスから weeklyCount 個。1つは作戦が変わる品 */
export function rollWeeklyPlaces(state: GameState, rng: Rng): PlaceId[] {
  return rollWithPivot(PLACE_ORDER.filter((id) => PLACES[id].price !== null).map((id) => ({ id, w: 1 })), (id) => isPivotPlace(state, id), rng);
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
  const kinds = growableKinds(state);
  if (!kinds.length) return null;
  const crop = kinds[Math.floor(rng() * kinds.length)];
  const w = state.taxesPaid;
  const need = { strawberry: 5 + 3 * w, tomato: 3 + 2 * w, pumpkin: 1 + Math.ceil(w / 2), melon: 1 + Math.floor(w / 2), corn: 1 + Math.floor(w / 2), watermelon: 1 }[crop];
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
    } else if (symbol === 'moon' || symbol === 'thunder') {
      const cells: number[] = [];
      fieldCells(state).forEach((i) => grow(state, i, 1, cells));
      events.push({ ...base, jackpot, role: 'grow', cells });
    } else if (symbol === 'hoe') {
      const cells: number[] = [];
      fieldCells(state).forEach((i) => till(state, i) && cells.push(i));
      events.push({ ...base, jackpot, role: 'grow', cells });
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
  | { type: 'bug'; cell: number | null; warded: boolean; damage: number; hen: boolean }
  | { type: 'coin'; amount: number }
  | { type: 'merchant'; mult: number }
  | { type: 'weed'; cells: number[]; warded: boolean }
  | { type: 'tanuki'; taken: { cell: number; crop: Crop; price: number }[]; escaped: boolean; stolen: number; guarded: number[] }
  | { type: 'frost'; cells: number[] }
  | { type: 'mole'; moves: { from: number; to: number; crop: Crop }[]; chased: number[] }
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
      const amount = (CONFIG.coinAmount + 2 * lv(state, 'coinPurse')) * r.power;
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
      if (targets.length === 0) return { type: 'bug', cell: null, warded: false, damage: 0, hen: false };
      const cell = targets[Math.floor(rng() * targets.length)];
      // 鶏小屋の周りの虫は食べられてしまう
      if (nearHenhouse(state, cell)) return { type: 'bug', cell, warded: true, damage: 0, hen: true };
      if (rng() < 1 - Math.pow(0.5, lv(state, 'bugWard'))) return { type: 'bug', cell, warded: true, damage: 0, hen: false };
      const crop = state.field[cell]!;
      const damage = Math.min(crop.growth, CONFIG.bugDamage * r.power);
      crop.growth -= damage;
      return { type: 'bug', cell, warded: false, damage, hen: false };
    }
    case 'weed': {
      if (rng() < 1 - Math.pow(0.5, lv(state, 'bugWard'))) return { type: 'weed', cells: [], warded: true };
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
        removeCrop(state, ripe[0].cell);
        state.stats.cropsEaten++;
        taken.push(ripe[0]);
      }
      // 実りがなければお金を盗む（実を早く売っても安全ではない）
      // 守られた実しかなければ逃げていく
      if (!taken.length && guarded.length) {
        guarded.forEach((c) => guardians(state, c).forEach((g) => state.toolXp[g]++));
        evolveTools(state);
        return { type: 'tanuki', taken, escaped: true, stolen: 0, guarded };
      }
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
    case 'mole': {
      // 地面の下から来るので、かかしでは防げない。大物は重くて動かせない
      const moves: { from: number; to: number; crop: Crop }[] = [];
      const chased: number[] = [];
      for (let k = 0; k < r.power; k++) {
        const movable = fieldCells(state).filter((i) => {
          const c = state.field[i];
          return c && !CROPS[c.kind].big && !state.frost[i] && neighbors(state, i).some((n) => isOpen(state, n));
        });
        if (!movable.length) break;
        const from = movable[Math.floor(rng() * movable.length)];
        // 鶏小屋の周り8マスに顔を出すと、鶏につつかれて逃げていく
        if (nearHenhouse(state, from)) {
          chased.push(from);
          continue;
        }
        const open = neighbors(state, from).filter((n) => isOpen(state, n));
        const to = open[Math.floor(rng() * open.length)];
        const crop = state.field[from]!;
        state.field[to] = crop;
        state.field[from] = null;
        moves.push({ from, to, crop });
      }
      return { type: 'mole', moves, chased };
    }
    case 'crow': {
      const toll = 2 * lv(state, 'crowToll') + 3 * state.charms.crowReturn;
      if (toll) earn(state, toll);
      // かぼちゃは大きくて重いので狙われない
      const occupied = state.field.flatMap((c, i) => (c && !CROPS[c.kind].crowProof ? [i] : []));
      if (occupied.length === 0) return { type: 'crow', cell: null, crop: null, eaten: false, toll, guarded: false };
      const cell = occupied[Math.floor(rng() * occupied.length)];
      const crop = state.field[cell];
      // かかしの近くは追い払われる
      if (isGuarded(state, cell)) {
        state.stats.crowsMissed++;
        guardians(state, cell).forEach((g) => state.toolXp[g]++);
        evolveTools(state);
        return { type: 'crow', cell, crop, eaten: false, toll, guarded: true };
      }
      if (rng() >= crowEatChance(state, r.power)) {
        state.stats.crowsMissed++;
        return { type: 'crow', cell, crop, eaten: false, toll, guarded: false };
      }
      removeCrop(state, cell);
      state.stats.cropsEaten++;
      state.stats.crowEaten++;
      // カラス返し：たくさん食べられたらその場でもらえる
      if (state.charms.crowReturn === 0 && state.stats.crowEaten >= EVENT_CONDITIONS.crowReturn) grant(state, 'crowReturn');
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
/** 凍っていない、育てられる作物（大物は本体で見る） */
const growableAt = (state: GameState, i: number): boolean => growable(state.field[rootOf(state, i)]) && !frozenCrop(state, i);

/** 鍬で耕せるマス：雑草・霜があるか、耕していない空きの土 */
function tillable(state: GameState, i: number): boolean {
  if (!inField(state, i) || state.tools[i] || isPond(state, i)) return false;
  return state.weeds[i] || state.frost[i] > 0 || (!state.field[i] && !state.tilled[i]);
}

/** 耕す：雑草と霜を消し、空きの土を耕す。変わったら true */
function till(state: GameState, i: number): boolean {
  if (!tillable(state, i)) return false;
  state.weeds[i] = false;
  state.frost[i] = 0;
  if (!state.field[i]) state.tilled[i] = true;
  return true;
}

/** 大物の種を cell（左上）に植えられるか：4マスとも空き */
function bigFits(state: GameState, cell: number): boolean {
  const x = cellX(cell);
  const y = cellY(cell);
  const cells = [cellAt(state, x, y), cellAt(state, x + 1, y), cellAt(state, x, y + 1), cellAt(state, x + 1, y + 1)];
  return cells.every((c) => c !== null && isOpen(state, c));
}

/** 出目 reel をマス cell に使えるか。太陽は cell を問わない */
export function canUse(state: GameState, reel: number, cell: number | null): boolean {
  const r = state.results[reel];
  if (!r || r.used || state.over) return false;
  const def = SYMBOLS[r.symbol];
  if (def.kind !== 'manual') return false;
  // 畑全体に効く出目（満月）は、マスを選ばずに使う
  if (def.shape === 'all') return fieldCells(state).some((i) => growableAt(state, i));
  if (cell === null) return validTargets(state, reel).length > 0;
  if (!inField(state, cell)) return false;
  const crop = state.field[rootOf(state, cell)];
  const seed = SEEDS[r.symbol];
  if (seed) return CROPS[seed.crop].big ? bigFits(state, cell) : isOpen(state, cell);
  // 鍬は、横一列に耕せるマスが1つでもあれば使える
  if (r.symbol === 'hoe') return shapeCells(state, 'row', cell).some((i) => tillable(state, i));
  // 太陽は霜も溶かすので、縦一列に霜があっても使える
  if (r.symbol === 'sun' && shapeCells(state, 'column', cell).some((i) => state.frost[i] > 0)) return true;
  // 形で効く出目は、範囲に育てられる作物が1つでもあれば使える
  if (def.shape) return shapeCells(state, def.shape, cell).some((i) => growableAt(state, i));
  if (frozenCrop(state, cell)) return false;
  if (r.symbol === 'fertilizer') return crop !== null && !crop.fertilized;
  return false;
}

export function validTargets(state: GameState, reel: number): number[] {
  const r = state.results[reel];
  if (!r || SYMBOLS[r.symbol].shape === 'all') return [];
  return fieldCells(state).filter((i) => canUse(state, reel, i));
}

/** 天気雨：同じ日に雨と太陽が両方効いたマスは、さらに+1（1日1回） */
function sunshower(state: GameState, affected: number[]): void {
  if (!state.charms.sunshower) return;
  // 大物は本体ごとに1回だけ
  const roots = [...new Set(state.today.rain.filter((c) => state.today.sun.includes(c)).map((c) => rootOf(state, c)))];
  roots
    .filter((c) => !state.today.boosted.includes(c))
    .forEach((c) => {
      state.today.boosted.push(c);
      // 天気雨は同じ日の上乗せなので、その日の雨・太陽で育ったあとでも別に数える
      const extra: number[] = [];
      grow(state, c, 1, extra);
      extra.forEach((x) => affected.includes(x) || affected.push(x));
    });
}

/** 育てる。大物は本体を1回だけ育てる（同じ出目で4マスに当たっても1回） */
function grow(state: GameState, cell: number, amount: number, affected: number[]): void {
  const root = rootOf(state, cell);
  const c = state.field[root];
  if (!growable(c) || frozenCrop(state, root) || amount <= 0) return;
  if (CROPS[c.kind].big && affected.includes(root)) return;
  c.growth = Math.min(CROPS[c.kind].ripe, c.growth + amount);
  if (!affected.includes(root)) affected.push(root);
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
    const cells = CROPS[seed.crop].big ? bigCells(state, cell!) : [cell!];
    // 品種改良・耕した土は1段階育った状態から（実る手前まで）
    const boost = (state.bred?.includes(r.symbol) ? 1 : 0) + (cells.some((i) => state.tilled[i]) ? (state.charms.tillMaster ? 2 : 1) : 0);
    crop.growth = Math.min(CROPS[seed.crop].ripe - 1, boost);
    cells.forEach((i, k) => {
      state.field[i] = k === 0 ? crop : { ...newCrop(seed.crop), anchor: cell! };
      state.tilled[i] = false;
    });
    return cells;
  }
  switch (r.symbol) {
    case 'rain':
      // 恵みの雨は真ん中のマスにだけ上乗せ
      shapeCells(state, 'cross', cell!).forEach((i) => grow(state, i, CONFIG.rainGrowth * r.power + (i === cell ? lv(state, 'gentleRain') : 0), affected));
      state.today.rain.push(...shapeCells(state, 'cross', cell!));
      sunshower(state, affected);
      return affected;
    case 'fertilizer':
      state.field[rootOf(state, cell!)]!.fertilized = true;
      return cropCells(state, cell!);
    case 'hoe':
      shapeCells(state, 'row', cell!).forEach((i) => till(state, i) && affected.push(i));
      return affected;
    case 'bee':
      shapeCells(state, 'x', cell!).forEach((i) => grow(state, i, CONFIG.beeGrowth * r.power, affected));
      return affected;
    case 'thunder':
      shapeCells(state, 'row', cell!).forEach((i) => grow(state, i, 2 * r.power, affected));
      return affected;
    case 'moon':
      fieldCells(state).forEach((i) => grow(state, i, r.power + state.charms.moonFeast, affected));
      return affected;
    case 'sun': {
      // 霜を溶かしてから育てる（溶けたマスの作物もすぐ育つ）
      shapeCells(state, 'column', cell!).forEach((i) => {
        if (state.frost[i] > 0) {
          state.frost[i] = 0;
          if (!affected.includes(i)) affected.push(i);
        }
      });
      const amount = CONFIG.sunGrowth * r.power + state.charms.sunBlessing;
      shapeCells(state, 'column', cell!).forEach((i) => grow(state, i, amount, affected));
      state.today.sun.push(...shapeCells(state, 'column', cell!));
      sunshower(state, affected);
      return affected;
    }
    default:
      return null;
  }
}

// ---- 売却 ----

/** 周りの巣箱で上がる売値 */
export function hiveBonus(state: GameState, cell: number): number {
  const ranch = hasRanch(state) ? 2 : 1;
  return around(state, cell, 1).reduce((n, i) => n + (state.tools[i] === 'hive' ? 2 : state.tools[i] === 'queenHive' ? 6 : 0), 0) * ranch;
}

/** 列の倍率をかける前の売値。cell を渡すと巣箱・堆肥のマスも効く */
export function cropPrice(state: GameState, crop: Crop, cell?: number): number {
  const def = CROPS[crop.kind];
  const charm = (def.gold ? 10 * lv(state, 'goldLuck') : 2 * lv(state, 'bumper')) + (def.big ? 30 * lv(state, 'bigGame') : 0);
  const hive = cell === undefined ? 0 : hiveBonus(state, cell);
  const fert = crop.fertilized ? CONFIG.fertilizerMultiplier : 1;
  const tile = cell !== undefined && state.tiles[cell] === 'compost' ? 2 : 1;
  const fair = (1 + CONFIG.exhibitionBonus * state.charms.exhibition) * (isColorful(state) ? 1 + CONFIG.colorfulBonus : 1);
  return Math.round((def.price + charm + crop.bonus + hive) * fert * tile * state.priceMult * marketMult(state, crop.kind) * fair);
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
  // 大物は列に入らない
  const ok = (x: number, y: number) => {
    const c = cellAt(state, x, y);
    return c !== null && isRipe(state.field[c]) && !state.frost[c] && !CROPS[state.field[c]!.kind].big;
  };
  if (!ok(cellX(cell), cellY(cell))) return [];
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
  // 大物は1個で売る作物なので、単品でも半値にならない
  if (state.field[cell] && CROPS[state.field[cell]!.kind].big) return [{ label: '大物', x: 1 }];
  const runs = runsThrough(state, cell);
  if (!runs.length) return [{ label: '単品', x: singleMult(state) }];
  const steps = [{ label: '列', x: CONFIG.lineMult }];
  if (inSameCropLine(state, cell)) {
    steps.push({ label: '同じ作物', x: CONFIG.sameCropMult });
    // トマト祭り：トマトだけの列はさらに上乗せ
    if (state.charms.tomatoFest && state.field[cell]!.kind === 'tomato') steps.push({ label: 'トマト祭り', x: 1.5 });
  }
  if (runs.length > 1) steps.push({ label: `${runs.length}本が交差`, x: 1 + CONFIG.crossBonus * (runs.length - 1) });
  return steps;
}

/** 単品の倍率（難しい4では安い） */
export function singleMult(state: GameState): number {
  return state.difficulty >= 4 ? 0.3 : CONFIG.singleMult;
}

/** ショップの値段の倍率（難しい2以上で高い） */
export function shopMult(state: GameState): number {
  return state.difficulty >= 2 ? 1.3 : 1;
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
  /** 豊年満作の大当たり */
  bumper: number;
}

/** single=true は列を崩さず1マスだけ、列の倍率なしで売る（大商い用） */
export function sell(state: GameState, cell: number, single = false): SellResult | null {
  cell = rootOf(state, cell);
  const crop = state.field[cell];
  if (state.over || !crop || !isRipe(crop) || frozenCrop(state, cell)) return null;
  const group = single ? [cell] : harvestGroup(state, cell);
  if (isColorful(state)) state.colorfulToday = true;
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
  // 豊年満作：畑の植えられるマスを全部いっぺんに売った
  const plantable = fieldCells(state).filter((i) => !state.tools[i]).length;
  const whole = !single && size >= plantable && size >= 9;
  // 巣箱は周りで列が売れるたびに経験を積む
  if (line) {
    fieldCells(state).forEach((i) => {
      if (state.tools[i] === 'hive' && group.some((c) => Math.abs(cellX(c) - cellX(i)) <= 1 && Math.abs(cellY(c) - cellY(i)) <= 1)) state.toolXp[i]++;
    });
  }
  cells.forEach(({ cell: i }) => removeCrop(state, i));
  const total = cells.reduce((n, c) => n + c.price, 0);
  earn(state, total);
  // 品評会：このプレイで作物を全種類売った
  cells.forEach(({ kind }) => state.stats.soldKinds.includes(kind) || state.stats.soldKinds.push(kind));
  if (CONFIG.exhibitionOn && state.charms.exhibition === 0 && (Object.keys(CROPS) as CropKind[]).every((k) => state.stats.soldKinds.includes(k))) grant(state, 'exhibition');
  let bumper = 0;
  if (whole) {
    if (state.charms.bumperHarvest === 0) grant(state, 'bumperHarvest');
    bumper = Math.round(CONFIG.bumperJackpot * (1 + state.taxesPaid * CONFIG.jackpotGrowth));
    earn(state, bumper);
    state.notices.push({ kind: 'jackpot', amount: bumper });
  }
  if (line) evolveTools(state);
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
  return { cells, total, line, lines, size, mult, steps, orderReward, bumper };
}

// ---- 強化 ----

export function upgradePrice(state: GameState, id: UpgradeId): number {
  let base = CONFIG.upgradePrices[id];
  // お邪魔は消すたびに高くなる（全部消して楽になりすぎないように）
  const change = UPGRADE_SYMBOL[id]!;
  if (change.delta < 0) base *= Math.pow(CONFIG.removeGrowth, state.removed[change.symbol] ?? 0);
  if (id === 'addMoon') base *= Math.pow(CONFIG.moonGrowth, state.bag.moon);
  const discount = Math.min(0.5, 0.1 * lv(state, 'bargain'));
  return Math.max(1, Math.round(base * (1 - discount) * shopMult(state)));
}

export function upgradeAvailable(state: GameState, id: UpgradeId): boolean {
  const change = UPGRADE_SYMBOL[id]!;
  if (change.delta > 0) return state.weekly.includes(id as AddUpgradeId);
  return state.bag[change.symbol] > 0 && !removeLimitReached(state);
}

/** 今週はもうお邪魔を消せない */
export function removeLimitReached(state: GameState): boolean {
  return state.removedThisWeek >= CONFIG.removesPerWeek;
}

export function canBuy(state: GameState, id: UpgradeId): boolean {
  return !state.over && upgradeAvailable(state, id) && state.gold >= upgradePrice(state, id);
}

export function buy(state: GameState, id: UpgradeId): boolean {
  if (!canBuy(state, id)) return false;
  state.gold -= upgradePrice(state, id);
  const change = UPGRADE_SYMBOL[id]!;
  state.bag[change.symbol] += change.delta;
  if (change.delta < 0) {
    state.removed[change.symbol] = (state.removed[change.symbol] ?? 0) + 1;
    state.removedThisWeek++;
  }
  state.stats.purchases.push({ day: state.day, id });
  checkReady(state);
  return true;
}

// ---- お守り ----

/** そのゲームで役に立つお守りか（大物狙いはスイカの種を使えるときだけ） */
function charmUseful(state: GameState, id: CharmId): boolean {
  if (id === 'bigGame') return state.bag.watermelonSeed > 0 || state.shop.includes('addWatermelonSeed') || state.pool.includes('addWatermelonSeed');
  return true;
}

export function rollCharmOffer(state: GameState, rng: Rng): CharmId[] {
  // 袋の条件を満たした特別なお守りは必ず並ぶ
  const offer: CharmId[] = state.ready.filter((id) => state.charms[id] === 0).slice(0, CONFIG.charmChoices);
  // 必ず並ぶのは1回だけ。以後はふだんの抽選に混ざる
  state.ready = state.ready.filter((id) => !offer.includes(id));
  offer.forEach((id) => state.specials.includes(id) || state.specials.push(id));
  const pool = state.charmPool
    .filter((id) => (!CHARMS[id].special || state.specials.includes(id)) && !offer.includes(id) && state.charms[id] < CHARMS[id].max && charmUseful(state, id))
    .map((id) => ({
    id,
    w: CONFIG.charmTierWeights[CHARMS[id].tier],
  }));
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
  state.ready = state.ready.filter((x) => x !== id);
  if (state.charms[id] === CONFIG.goldenAt && isGolden(state, id)) state.notices.push({ kind: 'golden', id });
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
  if (p === undefined || (state.cols >= CONFIG.fieldCols && state.rows >= CONFIG.fieldRows)) return null;
  return Math.max(1, Math.round(p * (1 - Math.min(0.5, 0.1 * lv(state, 'bargain'))) * shopMult(state)));
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
  return Math.max(1, Math.round(p * (1 - Math.min(0.5, 0.1 * lv(state, 'bargain'))) * shopMult(state)));
}

export function canBuyPlace(state: GameState, id: PlaceId): boolean {
  const p = placePrice(state, id);
  return !state.over && p !== null && state.weeklyPlaces.includes(id) && state.gold >= p;
}

/** 買って手元に置く。畑に置くのは place で */
export function buyPlace(state: GameState, id: PlaceId): boolean {
  if (!canBuyPlace(state, id)) return false;
  state.gold -= placePrice(state, id)!;
  state.bought[id] = (state.bought[id] ?? 0) + 1;
  state.stock.push(id);
  return true;
}

/** 手元の先頭の物を cell に置けるか。道具は空いたマス（特別なマスの上でもよい）、特別なマスは道具・特別なマスのないマス */
export function canPlace(state: GameState, cell: number): boolean {
  const id = state.stock[0];
  if (!id || !inField(state, cell) || state.tools[cell] || isPond(state, cell)) return false;
  // 道具は、特別なマスの上にも置ける（空きマスなら）。特別なマスは、すでに特別なマスがあるマスには置けない
  if (PLACES[id].kind === 'tool') return isOpen(state, cell);
  // 特別なマスは大物の一部には置けない（本体と売値がずれるので）
  return !state.tiles[cell] && !(state.field[cell] && CROPS[state.field[cell]!.kind].big);
}

export function place(state: GameState, cell: number): PlaceId | null {
  if (!canPlace(state, cell)) return null;
  const id = state.stock.shift()!;
  if (PLACES[id].kind === 'tool') state.tools[cell] = id;
  else state.tiles[cell] = id;
  return id;
}

// ---- 狙い：次に回す前に「何が出たら嬉しいか」 ----

export interface Aim {
  symbol: SymbolId;
  /** その絵柄を一番いいマスに使ったとき、新しく実る作物の数 */
  ripen: number;
  /** 1本のリールにその絵柄が出る確率（%） */
  pct: number;
}

/** 育てる絵柄のうち、今の畑で一番多く実らせられるもの（夜の成長は数えない） */
export function bestAim(state: GameState): Aim | null {
  const bag = drawBag(state);
  const total = bagTotal(bag);
  if (!total) return null;
  const ripeNow = (s: GameState) => fieldCells(s).filter((i) => s.field[i] && s.field[i]!.anchor === undefined && isRipe(s.field[i])).length;
  const base = ripeNow(state);
  let best: Aim | null = null;
  (['rain', 'sun', 'bee', 'thunder', 'moon'] as SymbolId[]).forEach((symbol) => {
    if (!bag[symbol]) return;
    const cells = SYMBOLS[symbol].shape === 'all' ? [null] : fieldCells(state);
    let top = 0;
    cells.forEach((cell) => {
      const s = structuredClone({ ...state, results: [{ symbol, used: false, total: 1, left: 1, power: 1 }], notices: [] }) as GameState;
      if (useSymbol(s, 0, cell)) top = Math.max(top, ripeNow(s) - base);
    });
    const pct = Math.round((bag[symbol] / total) * 100);
    if (top > 0 && (!best || top > best.ripen || (top === best.ripen && pct > best.pct))) best = { symbol, ripen: top, pct };
  });
  return best;
}

// ---- 列の予告：植える前に、そこへ植えると列になるか ----

/** cell に kind を植えたら、育ち中も含めた作物で縦・横・斜めに3つ以上並ぶか。並ぶなら売るときの倍率の見込み、並ばなければ 0 */
export function plantLineMult(state: GameState, cell: number, kind: CropKind): number {
  if (CROPS[kind].big) return 0;
  const cropAt = (x: number, y: number): CropKind | null => {
    const c = cellAt(state, x, y);
    if (c === null) return null;
    if (c === cell) return kind;
    const f = state.field[c];
    return f && !CROPS[f.kind].big ? f.kind : null;
  };
  const cx = cellX(cell);
  const cy = cellY(cell);
  const runs: CropKind[][] = [];
  for (const [dx, dy] of RUN_DIRS) {
    const run: CropKind[] = [kind];
    for (let x = cx + dx, y = cy + dy, k = cropAt(x, y); k; x += dx, y += dy, k = cropAt(x, y)) run.push(k);
    for (let x = cx - dx, y = cy - dy, k = cropAt(x, y); k; x -= dx, y -= dy, k = cropAt(x, y)) run.push(k);
    if (run.length >= MIN_RUN) runs.push(run);
  }
  if (!runs.length) return 0;
  let m = CONFIG.lineMult;
  if (runs.some((r) => r.every((k) => k === kind))) m *= CONFIG.sameCropMult;
  if (runs.length > 1) m *= 1 + CONFIG.crossBonus * (runs.length - 1);
  return m;
}
