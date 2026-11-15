// ゲームのルール本体。画面に依存しない純粋なロジック。

import { L } from './i18n.ts';
import {
  BAG_CONDITIONS, CHARM_CURSE, COMBOS, CUT, MERGES, cropBase, symbolBase, FARMERS, PAUSED_CHARMS, isCutAdd, COMBO_POWER, CHARMS, CHARM_ORDER, CHARM_PLACE, CONFIG, CROPS, EVENT_CONDITIONS, PLACE_ORDER, PLACES, SEEDS, SYMBOLS, SYMBOL_ORDER, TOOL_EVOLVE, UPGRADE_SYMBOL,
  type AddUpgradeId, type CharmId, type CropKind, type PlaceId, type ShapeId, type SymbolId, type UpgradeId,
} from './config.ts';
import { CONTRACTS, CONTRACT_ORDER, CONTRACT_STAR_WEIGHTS, contractGold, contractMaxStars, type ContractId } from './contracts.ts';

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
  /** 霧の週：霧に隠れたリール（lost なら今日は使えない） */
  fog?: 'seen' | 'lost';
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
  | { kind: 'evolve'; cell: number; from: PlaceId; to: PlaceId };

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
  /** 選んだ農家（FARMERS の id） */
  farmer: string;
  /** 朝（日付は進んだが、まだリールを回していない。市の日は市が開いている） */
  morning: boolean;
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
  /** 週契約：月曜の朝に並ぶ3つ（受けるか見送るまで残る） */
  contractOffer: ContractId[];
  /** 今週受けた週契約 */
  contract: ContractId | null;
  /** 虫の大発生で今週袋に入れた虫の数（日曜に抜く） */
  contractBugs: number;
  /** 日曜に果たした週契約（画面で見返りを見せたら消す） */
  contractDone: ContractId | null;
  /** 次の年貢の割引（市が閉まるの見返り。0.3 なら −30%） */
  taxCut: number;
  /** この市でもう合体したか（1回の市で1種類まで） */
  mergedThisMarket: boolean;
  /** 開発用のプレイログ（1行1出来事。設定の「ログを書き出す」で取り出す） */
  log: string[];
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
  /** 今日そろった組み合わせ（雷雨など）。その日だけ効く */
  combos: CharmId[];
  /** 今日の仕入れ（毎日の仕入れのとき）。1つ選ぶか、次の日になると消える */
  offer: AddUpgradeId[];
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
    /** 日ごとの稼ぎ（振り返り用。添え字は日） */
    earnedByDay: number[];
    /** 使わずに消えた手動の出目の数（振り返り用） */
    expired: number;
    /** 評価用：列で売った作物の数・出た手動の出目の数・納めた年貢の合計 */
    lineCrops?: number;
    manualTotal?: number;
    taxTotal?: number;
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
  /** 農家（FARMERS の id） */
  farmer?: string;
}

export const ALL_ADDS: AddUpgradeId[] = ['addSeed', 'addBerrySeed', 'addPumpkinSeed', 'addMelonSeed', 'addWatermelonSeed', 'addRain', 'addSun', 'addThunder', 'addHoe', 'addFertilizer', 'addBee', 'addMerchant', 'addGoldSeed', 'addClover'];

export function newGame(setup: GameSetup = { shop: ALL_ADDS, charmPool: CHARM_ORDER }): GameState {
  const state = freshGame(setup);
  glog(state, `開始 難しさ=${state.difficulty} 農家=${state.farmer}`);
  // 農家：最初の袋の増減・最初のお守り・最初に持っている畑の品
  const farmer = FARMERS.find((f) => f.id === state.farmer);
  if (farmer) {
    (Object.entries(farmer.bag) as [SymbolId, number][]).forEach(([sym, n]) => (state.bag[sym] = Math.max(0, state.bag[sym] + n)));
    (Object.entries(farmer.charms) as [CharmId, number][]).forEach(([id, n]) => (state.charms[id] += n));
    state.stock.push(...farmer.stock);
  }
  return state;
}

function freshGame(setup: GameSetup): GameState {
  return {
    runId: Math.random().toString(36).slice(2, 10),
    difficulty: setup.difficulty ?? 0,
    farmer: setup.farmer ?? 'basic',
    morning: false,
    shop: [...setup.shop],
    pool: [...(setup.pool ?? setup.shop)],
    offer: [],
    combos: [],
    weekly: [],
    weeklyPlaces: [],
    charmPool: [...setup.charmPool],
    removed: {},
    removedThisWeek: 0,
    colorfulToday: false,
    day: 0,
    gold: CONFIG.initialGold,
    reels: CONFIG.initialReels,
    // 難しい5：増えるイナゴが最初から袋にいる
    bag: { ...CONFIG.initialBag, locust: (setup.difficulty ?? 0) >= 5 ? CONFIG.locustStart : 0 },
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
    contractOffer: [],
    contract: null,
    contractBugs: 0,
    contractDone: null,
    taxCut: 0,
    mergedThisMarket: false,
    log: [],
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
      soldKinds: [], purchases: [], charms: [], earnedByDay: [], expired: 0,
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
  if (shape === 'one') return [cell];
  // 合体した形：縦3列・斜めの線いっぱい・周り9マス
  if (shape === 'col3') return fieldCells(state).filter((c) => Math.abs(cellX(c) - cellX(cell)) <= 1);
  if (shape === 'xline') return fieldCells(state).filter((c) => Math.abs(cellX(c) - cellX(cell)) === Math.abs(cellY(c) - cellY(cell)));
  if (shape === 'box') return [cell, ...around(state, cell, 1)];
  if (shape === 'plus') return [cell, ...neighbors(state, cell)];
  if (shape === 'cross') {
    // 雷雨：斜めにもいっぱいに効く
    const diag = comboOn(state, 'thunderstorm');
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
  let gold = (t === 'henhouse' ? CONFIG.henhouseGold : CONFIG.cowshedGold) + 2 * lv(state, 'rancher');
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
  return [...new Set(Object.entries(SEEDS).filter(([sym]) => state.bag[sym as SymbolId] > 0).map(([, d]) => cropBase(d!.crop)))];
}

/** 週ごとの相場：全作物から高値1つ・安値1つ（育てている作物だけから選ぶと、ただの値上げになる） */
export function rollMarket(_state: GameState, rng: Rng): Market {
  const kinds = (Object.keys(CROPS) as CropKind[]).filter((k) => !CROPS[k].base);
  const high = kinds.length ? kinds.splice(Math.floor(rng() * kinds.length), 1)[0] : null;
  const low = kinds.length ? kinds[Math.floor(rng() * kinds.length)] : null;
  return { high, low };
}

/** 相場の倍率 */
export function marketMult(state: GameState, kind: CropKind): number {
  kind = cropBase(kind);
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
  // 年貢の減免：1つで5%、上限25%（強すぎたので弱めた）
  const relief = Math.min(0.3, 0.1 * lv(state, 'taxRelief'));
  // 曰く付きのお守りの代償：大きな種袋・豊作は1つ+10%、からくり職人は+20%
  const curse = 1 + 0.1 * state.charms.seedSack + 0.1 * state.charms.bumper + 0.2 * state.charms.artisan;
  // 難しい1〜5：年貢×1.3・1.4・1.5・1.6・1.7
  const half = (state.halfTax ? 0.5 : 1) * (state.difficulty >= 1 ? 1.2 + 0.1 * state.difficulty : 1);
  return { dueDay, daysLeft: dueDay - state.day, amount: Math.round(taxAmount(index) * (1 - relief) * curse * (1 - (state.taxCut ?? 0)) * half), index };
}

// ---- 1日の進行 ----

export type EndDayResult =
  | { ok: true; tax: number | null; expired: number; cleared: boolean }
  | { ok: false; tax: number; expired: number; cleared: false };

/**
 * 今日を終える。期日なら年貢を徴収し、払えればお守りの候補を用意する（charmOffer）。
 * 払えなければゲームオーバー。続けて drawDay で翌日のスロットを回す。
 */
function endDayRaw(state: GameState, rng: Rng): EndDayResult {
  const expired = state.results.filter((r) => !r.used && SYMBOLS[r.symbol].kind === 'manual').length;
  state.stats.expired = (state.stats.expired ?? 0) + expired;
  // 熟成：実ったまま日をまたいだ作物の売値が上がる
  if (state.day > 0 && lv(state, 'aging') > 0) {
    state.field.forEach((c) => {
      // 1日ごとに+熟成の数、3日分まで（強すぎたので弱めた）
      if (c && isRipe(c)) c.bonus = Math.min(9 * lv(state, 'aging'), c.bonus + 3 * lv(state, 'aging'));
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
  state.combos = [];
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
  state.stats.taxTotal = (state.stats.taxTotal ?? 0) + t.amount;
  state.taxesPaid++;
  state.halfTax = false;
  state.taxCut = 0;
  // 週契約：その週を越えられたら見返り。契約は日曜で終わる
  finishContract(state);
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
  const rule = obstacleRule(n, difficulty);
  const count = rule.count;
  // 難しい5：年貢のたびに増えるお邪魔にイナゴも混ざる
  const pool = (difficulty >= 5 ? [...rule.pool, 'locust' as SymbolId] : rule.pool).filter(
    (s) => !CUT.symbols.includes(s) && (s !== 'tanuki' || difficulty >= CONFIG.tanukiFrom),
  );
  const picks = Array.from({ length: count }, () => pool[Math.floor(rng() * pool.length)]);
  // タヌキが来るときは、ほかのお邪魔と一緒にしない（1枚だけ）
  return picks.includes('tanuki') ? ['tanuki'] : picks;
}

/** 次の日を始めて、そのままリールを回す（市の日は beginDay と spinDay の間に市を開く） */
export function drawDay(state: GameState, rng: Rng): void {
  beginDay(state, rng);
  spinDay(state, rng);
}

/** 朝：日付を進め、市の品・注文・週替わりを用意する。リールはまだ回さない（市の日はここで市を開く） */
export function beginDay(state: GameState, rng: Rng): void {
  state.day++;
  state.colorfulToday = false;
  state.priceMult = 1;
  state.morning = true;
  // 仕入れ：市の日に3択（市の日がなければ毎日）
  state.offer = CONFIG.dailyPick && (!CONFIG.marketDays.length || isMarketDay(state.day)) ? rollOffer(state, rng) : [];
  // 新しい週には新しい注文と週替わりの品が来る
  if (!state.order || state.order.dueDay < state.day) {
    state.order = makeOrder(state, rng);
    state.weekly = rollWeekly(state, rng);
    state.weeklyPlaces = rollWeeklyPlaces(state, rng);
    state.removedThisWeek = 0;
    // 相場は難しいモードから（marketFrom 以上）
    state.market = CONFIG.marketOn && state.difficulty >= CONFIG.marketFrom ? rollMarket(state, rng) : null;
  }
  // 週契約：月曜の朝に3つ並ぶ。虫の大発生は毎朝虫が1枚入る
  state.contractOffer = weekDay(state.day) === 1 ? rollContracts(state, rng) : [];
  if (state.contract === 'bugBloom') {
    state.bag.bug++;
    state.contractBugs++;
  }
  // 市が閉まる週は、仕入れも市も出ない
  if (!shopOpen(state)) state.offer = [];
  // 市ごとに：お邪魔を消せる回数が戻り、畑の品が入れ替わる
  if (isMarketDay(state.day)) {
    state.mergedThisMarket = false;
    state.removedThisWeek = 0;
    state.weeklyPlaces = rollWeeklyPlaces(state, rng);
  }
}

/** リールを回す：袋から引いて、フィーバー・組み合わせを決める */
function spinDayRaw(state: GameState, rng: Rng): void {
  state.morning = false;
  state.stats.spins++;
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
    let total = seed ? (seed.single ? 1 : rollSeedCount(rng) + seed.extra) + lv(state, 'seedSack') : 1;
    // 種の節約：1枚で2個まで
    if (seed && state.contract === 'seedThrift') total = Math.min(2, total);
    return { symbol, used: false, total, left: total, power } as ReelResult;
  });
  // 霧の週：毎日リールが1つ霧に隠れ、半分の日はその出目が使えない
  if (state.contract === 'fog' && state.results.length) {
    const r = state.results[Math.floor(rng() * state.results.length)];
    r.fog = rng() < 0.5 ? 'lost' : 'seen';
    if (r.fog === 'lost') {
      r.used = true;
      r.left = 0;
    }
  }
  refreshCombos(state);
  state.stats.manualTotal = (state.stats.manualTotal ?? 0) + state.results.filter((r) => SYMBOLS[r.symbol].kind === 'manual' && r.fog !== 'lost').length;
}

/** 市の日か（週の marketDays 日目） */
export function isMarketDay(day: number): boolean {
  return day > 0 && CONFIG.marketDays.includes(((day - 1) % CONFIG.taxPeriod) + 1);
}

/** 今、買い物ができるか（市の日がない設定ならいつでも）。市が閉まる週は開かない */
export function shopOpen(state: GameState): boolean {
  if (state.contract === 'marketClosed') return false;
  return !CONFIG.marketDays.length || isMarketDay(state.day);
}

// ---- 合体 ----

/** 袋の枚数（合体した札は元の札 mergeNeed 枚と数える。お守りの条件などに使う） */
export function bagCount(state: GameState, sym: SymbolId): number {
  const m = MERGES[sym];
  return state.bag[sym] + (m ? state.bag[m] * CONFIG.mergeNeed : 0);
}

/** 合体できる絵柄（市が開いていて、この市でまだ合体しておらず、同じ札が mergeNeed 枚以上） */
export function mergeable(state: GameState): SymbolId[] {
  if (state.over || !shopOpen(state) || state.mergedThisMarket) return [];
  return (Object.keys(MERGES) as SymbolId[]).filter((s) => state.bag[s] >= CONFIG.mergeNeed && !CUT.symbols.includes(s));
}

/** 合体のお金：その週の年貢の30%（最低10） */
export function mergeCost(state: GameState): number {
  return Math.max(CONFIG.mergeCostMin, Math.round(nextTax(state).amount * CONFIG.mergeCostRate));
}

/** 同じ札 mergeNeed 枚を、お金を払って1枚の上位の札にする */
function mergeSymbolRaw(state: GameState, sym: SymbolId): boolean {
  if (!mergeable(state).includes(sym)) return false;
  const cost = mergeCost(state);
  if (state.gold < cost) return false;
  state.gold -= cost;
  state.bag[sym] -= CONFIG.mergeNeed;
  state.bag[MERGES[sym]!]++;
  state.mergedThisMarket = true;
  return true;
}

/** 週の何日目か（1＝月 … 7＝日） */
export function weekDay(day: number): number {
  return ((Math.max(1, day) - 1) % CONFIG.taxPeriod) + 1;
}

// ---- 週契約 ----

/** 今の袋や畑で意味のある週契約か（縛りが空振りしない・見返りが受け取れる） */
function contractFits(state: GameState, id: ContractId): boolean {
  switch (id) {
    case 'cloudy':
      return bagCount(state, 'sun') > 0;
    case 'drought':
      return bagCount(state, 'rain') > 0;
    case 'crowFlock':
      return state.bag.crow > 0;
    case 'brokenReel':
      return state.reels > 2;
    case 'fog':
      return state.reels < CONFIG.maxReels;
    case 'busyWeek':
      return state.reels > 2 && expandPrice(state) !== null;
    case 'longRain':
      return state.cols > 2;
    default:
      return true;
  }
}

/** 月曜の朝の週契約3つ（難しい1から。最初の週は出ない） */
export function rollContracts(state: GameState, rng: Rng): ContractId[] {
  const max = contractMaxStars(state.difficulty);
  if (!max || state.day < CONFIG.taxPeriod + 1) return [];
  const items = CONTRACT_ORDER.filter((id) => CONTRACTS[id].stars <= max && contractFits(state, id)).map((id) => ({ id, w: CONTRACT_STAR_WEIGHTS[CONTRACTS[id].stars] }));
  return pickWeighted(items, 3, rng);
}

/** 週契約を受ける（null なら見送る） */
function takeContractRaw(state: GameState, id: ContractId | null): boolean {
  if (id !== null && !state.contractOffer.includes(id)) return false;
  state.contractOffer = [];
  state.contract = id;
  state.contractBugs = 0;
  if (id === 'brokenReel') state.reels--;
  // 市が閉まる：今週の仕入れも出ない
  if (id === 'marketClosed') state.offer = [];
  if (id === 'bugBloom') {
    state.bag.bug++;
    state.contractBugs++;
  }
  return true;
}

/** 見返りのお金（週が進むほど増える） */
export function contractRewardGold(state: GameState, id: ContractId): number {
  const r = CONTRACTS[id].reward;
  return r.kind === 'gold' ? contractGold(r.n, state.taxesPaid) : 0;
}

/** 日曜の年貢を納めたあと：見返りを渡して、週契約を終える（お守りの3択は画面側で出す） */
function finishContract(state: GameState): void {
  const id = state.contract;
  if (!id) return;
  const r = CONTRACTS[id].reward;
  // お金は納めたあとの週の数で数える（表示と同じになるよう、先に数える）
  const gold = contractGold(r.kind === 'gold' ? r.n : 0, state.taxesPaid - 1);
  if (r.kind === 'gold') earn(state, gold);
  if (r.kind === 'remove') state.bag[r.symbol] = Math.max(0, state.bag[r.symbol] - 1);
  if (r.kind === 'place') state.stock.push(r.id);
  if (r.kind === 'moon') state.bag.moon++;
  if (r.kind === 'taxCut') state.taxCut = r.pct / 100;
  if (r.kind === 'reel') state.reels = Math.min(CONFIG.maxReels, state.reels + 1);
  if (r.kind === 'expand' && (state.cols < CONFIG.fieldCols || state.rows < CONFIG.fieldRows)) {
    state.bought.expand = (state.bought.expand ?? 0) + 1;
    if (state.cols <= state.rows) state.cols++;
    else state.rows++;
  }
  // 縛りを元に戻す
  if (id === 'brokenReel') state.reels++;
  if (id === 'bugBloom') state.bag.bug = Math.max(0, state.bag.bug - state.contractBugs);
  state.contractBugs = 0;
  state.contract = null;
  state.contractDone = id;
}

/** 週契約の見返りのお守り3択（レアは rare の段だけから） */
export function rollContractCharms(state: GameState, rng: Rng, rare: boolean): CharmId[] {
  const pool = state.charmPool
    .filter((id) => !PAUSED_CHARMS.includes(id) && !CHARMS[id].special && state.charms[id] < CHARMS[id].max && charmUseful(state, id) && (!rare || CHARMS[id].tier === 'rare'))
    .map((id) => ({ id, w: CONFIG.charmTierWeights[CHARMS[id].tier] }));
  return pickWeighted(pool, CONFIG.charmChoices, rng);
}

/** 作物を今売れないわけ（週契約）。売れるなら null */
export function sellBlock(state: GameState, cell: number, single = false): string | null {
  if (state.contract === 'sellWeekend' && weekDay(state.day) < 6) return L('今週は<b>土日だけ</b>売れる', 'This week you can sell on <b>Sat/Sun only</b>');
  if (state.contract === 'connoisseur') {
    const root = rootOf(state, cell);
    const crop = state.field[root];
    if (crop && !CROPS[crop.kind].big && (single || harvestGroup(state, root).length < MIN_RUN)) return L('今週は<b>単品は売れない</b>', '<b>No singles</b> this week');
  }
  return null;
}

/** 長雨で水びたしのマス（右端の1列） */
export function isFlooded(state: GameState, cell: number): boolean {
  return state.contract === 'longRain' && cellX(cell) === state.cols - 1;
}

/** 忙しい週：今日もう新しい出目を使えないか */
function busyLimit(state: GameState, reel: number): boolean {
  if (state.contract !== 'busyWeek') return false;
  const r = state.results[reel];
  if (r.left < r.total) return false;
  const started = state.results.filter((x, k) => k !== reel && SYMBOLS[x.symbol].kind === 'manual' && x.left < x.total && x.fog !== 'lost').length;
  return started >= 2;
}

/** 次の市の日（今日が市なら今日） */
export function nextMarketDay(state: GameState): number | null {
  if (!CONFIG.marketDays.length) return null;
  for (let d = Math.max(1, state.day); d < state.day + CONFIG.taxPeriod + 1; d++) if (isMarketDay(d)) return d;
  return null;
}

/** 空きマス（畑の中で、作物・道具・雑草・霜・池がない） */
export function isOpen(state: GameState, cell: number): boolean {
  return inField(state, cell) && !state.field[cell] && !state.tools[cell] && !state.weeds[cell] && !state.frost[cell] && !isPond(state, cell) && !isFlooded(state, cell);
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
    around(state, i, 1).forEach((c) => state.field[c] && cropBase(state.field[c]!.kind) === 'strawberry' && grow(state, c, pollen, affected));
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
function grant(state: GameState, id: CharmId, notice = true): void {
  state.charms[id]++;
  state.stats.charms.push({ day: state.day, id });
  if (notice) state.notices.push({ kind: 'got', id });
}

/** 出目の効く形（組み合わせで変わる：青天の霹靂の日は雷が十字） */
export function symbolShape(state: GameState, sym: SymbolId): ShapeId | undefined {
  if (sym === 'thunder' && comboOn(state, 'bolt')) return 'cross';
  // 曇り続き：太陽は1マスだけ
  if (symbolBase(sym) === 'sun' && state.contract === 'cloudy') return 'one';
  return SYMBOLS[sym].shape;
}

/** 組み合わせ：今日のスロットにそろった絵柄で、その日だけ自動で起きるものを決め直す */
export function refreshCombos(state: GameState): void {
  const counts = new Map<SymbolId, number>();
  state.results.forEach((r) => counts.set(symbolBase(r.symbol), (counts.get(symbolBase(r.symbol)) ?? 0) + 1));
  state.combos = (Object.entries(COMBOS) as [CharmId, Partial<Record<SymbolId, number>>][])
    .filter(([, need]) => (Object.entries(need) as [SymbolId, number][]).every(([sym, n]) => (counts.get(sym) ?? 0) >= n))
    .map(([id]) => id);
}

/** 組み合わせ（雷雨など）が今日効いているか。昔のセーブで持っているお守りもそのまま効く */
export function comboOn(state: GameState, id: CharmId): boolean {
  return state.combos.includes(id) || state.charms[id] > 0;
}

/** 袋の中身の条件を満たした特別なお守りを、次の3択に並ぶようにする */
export function checkReady(state: GameState): void {
  (Object.entries(BAG_CONDITIONS) as [CharmId, Partial<Record<SymbolId, number>>][]).forEach(([id, need]) => {
    if (state.charms[id] > 0 || state.ready.includes(id)) return;
    if ((Object.entries(need) as [SymbolId, number][]).every(([sym, n]) => bagCount(state, sym) >= n)) {
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

/** 今日の仕入れ：準備で選んだ品（出やすい）・解放済みの品から。レア（満月・金の種）はたまに1つだけ混ざる */
export function rollOffer(state: GameState, rng: Rng): AddUpgradeId[] {
  const ids = [...new Set<AddUpgradeId>([...state.shop, ...state.pool])].filter((id) => !isRareOffer(id) && !isCutAdd(id));
  const picks = pickWeighted(ids.map((id) => ({ id, w: state.shop.includes(id) ? 2 : 1 })), CONFIG.dailyOfferCount, rng);
  // たまにレア（満月・金の種）が1つ混ざる
  const rares = CONFIG.rareOffers.filter((id) => !isCutAdd(id));
  if (rares.length && rng() < CONFIG.rareOfferChance) {
    const rare = rares[Math.floor(rng() * rares.length)] as AddUpgradeId;
    picks.splice(Math.min(picks.length, CONFIG.dailyOfferCount - 1), 1, rare);
  }
  return picks;
}

/** レア仕入れ（準備では選べず、毎日の仕入れにたまに混ざる） */
export function isRareOffer(id: UpgradeId): boolean {
  return CONFIG.rareOffers.includes(id);
}

/** 仕入れから1つ選んで袋に入れる（タダ）。その日の仕入れは終わり */
function takeOfferRaw(state: GameState, id: AddUpgradeId): boolean {
  if (state.over || !state.offer.includes(id)) return false;
  state.bag[UPGRADE_SYMBOL[id]!.symbol] += UPGRADE_SYMBOL[id]!.delta;
  state.offer = [];
  state.stats.purchases.push({ day: state.day, id });
  checkReady(state);
  return true;
}

/** 今週の畑の品：ショップで買える道具・特別なマスから weeklyCount 個。1つは作戦が変わる品 */
export function rollWeeklyPlaces(state: GameState, rng: Rng): PlaceId[] {
  // 農家の品（牧場主の小屋など）はいつも並び、残りを週替わりで
  const fixed = (FARMERS.find((f) => f.id === state.farmer)?.favorPlaces ?? []).filter((id) => !CUT.places.includes(id));
  if (fixed.length) {
    const rest = PLACE_ORDER.filter((id) => PLACES[id].price !== null && !CUT.places.includes(id) && !fixed.includes(id));
    return [...fixed, ...pickWeighted(rest.map((id) => ({ id, w: 1 })), Math.max(0, CONFIG.weeklyCount - fixed.length), rng)];
  }
  return rollWithPivot(PLACE_ORDER.filter((id) => PLACES[id].price !== null && !CUT.places.includes(id)).map((id) => ({ id, w: 1 })), (id) => isPivotPlace(state, id), rng);
}

/** 雑草を抜く（草よけのお守りがあれば無料） */
export function weedCost(state: GameState): number {
  return state.charms.bugWard > 0 ? 0 : CONFIG.weedPullCost;
}

function pullWeedRaw(state: GameState, cell: number): boolean {
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
  const need = ({ strawberry: 5 + 3 * w, tomato: 3 + 2 * w, pumpkin: 1 + Math.ceil(w / 2), melon: 1 + Math.floor(w / 2), corn: 1 + Math.floor(w / 2), watermelon: 1 } as Partial<Record<CropKind, number>>)[crop] ?? 1;
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
function resolveFeverRaw(state: GameState, rng: Rng): FeverEvent[] {
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
    } else if (symbolBase(symbol) === 'rain') {
      const cells: number[] = [];
      fieldCells(state).forEach((i) => grow(state, i, 1, cells));
      events.push({ ...base, jackpot, role: 'grow', cells });
    } else if (symbolBase(symbol) === 'sun') {
      state.priceMult *= 2;
      events.push({ ...base, jackpot, role: 'festival', mult: state.priceMult });
    } else if (symbolBase(symbol) === 'fertilizer') {
      const cells = state.field.flatMap((c, i) => (c && !c.fertilized ? [i] : []));
      cells.forEach((i) => (state.field[i]!.fertilized = true));
      events.push({ ...base, jackpot, role: 'compost', cells });
    } else if (symbolBase(symbol) === 'bee') {
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
    } else if (symbol === 'moon' || symbolBase(symbol) === 'thunder') {
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
  | { type: 'locust'; cell: number | null; damage: number; bred: number }
  | { type: 'clover'; boost: number };

export function crowEatChance(state: GameState, power: number): number {
  const flock = state.contract === 'crowFlock' ? 2 : 1;
  return Math.min(1, (power > 1 ? CONFIG.crowEatChance * CONFIG.crowFeverMultiplier : CONFIG.crowEatChance) * flock);
}

function earn(state: GameState, amount: number): void {
  state.gold += amount;
  state.stats.totalEarned += amount;
  state.stats.earnedByDay[state.day] = (state.stats.earnedByDay[state.day] ?? 0) + amount;
}

/**
 * お邪魔の狙い：プレイヤーが一番やられたくない作物ほど高い点（実った列の売値・もうすぐ実る高い作物）。
 * 同じ点なら乱数で選ぶ
 */
export function cropWorth(state: GameState, cell: number): number {
  const root = rootOf(state, cell);
  const c = state.field[root];
  if (!c) return 0;
  const price = cropPrice(state, c, root);
  if (isRipe(c)) return price * Math.max(1, cellMultiplier(state, root)) + 1000;
  return price * (0.4 + c.growth / CROPS[c.kind].ripe);
}

function pickWorst(cells: number[], score: (i: number) => number, rng: Rng): number {
  let best = cells[0];
  let top = -Infinity;
  for (const i of cells) {
    const v = score(i) + rng() * 0.01;
    if (v > top) {
      top = v;
      best = i;
    }
  }
  return best;
}

/** 雑草の狙い：周りに作物が多い空きマス（列を作らせない） */
function weedWorth(state: GameState, cell: number): number {
  return around(state, cell, 1).reduce((n, i) => n + (state.field[i] ? 1 + cropWorth(state, i) / 1000 : 0), 0);
}

function resolveAutoRaw(state: GameState, reel: number, rng: Rng): AutoEvent | null {
  const r = state.results[reel];
  if (!r || r.used || SYMBOLS[r.symbol].kind !== 'auto') return null;
  r.used = true;
  r.left = 0;
  switch (r.symbol) {
    case 'coin': {
      const amount = (CONFIG.coinAmount + 2 * lv(state, 'coinPurse')) * r.power * (comboOn(state, 'prosperity') ? COMBO_POWER.prosperity : 1);
      earn(state, amount);
      return { type: 'coin', amount };
    }
    case 'koban': {
      // 小判：金貨より多く、年貢を納めるたびに増える
      const amount = (12 + 3 * state.taxesPaid + 2 * lv(state, 'coinPurse')) * r.power * (comboOn(state, 'prosperity') ? COMBO_POWER.prosperity : 1);
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
      // 一番やられたくない作物（実った列・もうすぐ実る高い作物）を狙う
      const cell = pickWorst(targets, (i) => cropWorth(state, i), rng);
      // 鶏小屋の周りの虫は食べられてしまう
      if (nearHenhouse(state, cell)) return { type: 'bug', cell, warded: true, damage: 0, hen: true };
      if (rng() < 1 - Math.pow(0.5, lv(state, 'bugWard'))) return { type: 'bug', cell, warded: true, damage: 0, hen: false };
      const crop = state.field[cell]!;
      const damage = Math.min(crop.growth, CONFIG.bugDamage * r.power);
      crop.growth -= damage;
      return { type: 'bug', cell, warded: false, damage, hen: false };
    }
    case 'locust': {
      // 出るたびに袋の中で増える（残しておくほど出やすくなる）。食べるのは育ち中の作物の成長1つ分
      const bred = rng() < CONFIG.locustBreedChance ? CONFIG.locustBreed * r.power : 0;
      state.bag.locust += bred;
      const targets = state.field.flatMap((c, i) => (c && c.growth > 0 && !isRipe(c) ? [i] : []));
      if (!targets.length) return { type: 'locust', cell: null, damage: 0, bred };
      const cell = pickWorst(targets, (i) => cropWorth(state, i), rng);
      state.field[cell]!.growth -= 1;
      return { type: 'locust', cell, damage: 1, bred };
    }
    case 'weed': {
      if (rng() < 1 - Math.pow(0.5, lv(state, 'bugWard'))) return { type: 'weed', cells: [], warded: true };
      const cells: number[] = [];
      for (let k = 0; k < r.power; k++) {
        const open = state.field.flatMap((_, i) => (isOpen(state, i) ? [i] : []));
        if (!open.length) break;
        // 作物に囲まれた空きマスに生える（列をふさぐ）
        const c = pickWorst(open, (i) => weedWorth(state, i), rng);
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
        // 一番高い作物のマスを凍らせる（作物がなければどこでも）
        const c = pickWorst(free, (i) => cropWorth(state, i), rng);
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
        // 一番大事な作物を押し出して、列を崩す
        const from = pickWorst(movable, (i) => cropWorth(state, i), rng);
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
      // 一番やられたくない作物を狙う（かかしで守っていれば追い払われる）
      const cell = pickWorst(occupied, (i) => cropWorth(state, i), rng);
      const crop = state.field[cell];
      // かかしの近くは追い払われる
      if (isGuarded(state, cell)) {
        state.stats.crowsMissed++;
        guardians(state, cell).forEach((g) => state.toolXp[g]++);
        evolveTools(state);
        return { type: 'crow', cell, crop, eaten: false, toll, guarded: true };
      }
      // 熟成の代償：実った作物はカラスが食べやすい
      if (rng() >= crowEatChance(state, r.power) * (crop && isRipe(crop) && state.charms.aging > 0 ? 1.5 : 1)) {
        state.stats.crowsMissed++;
        return { type: 'crow', cell, crop, eaten: false, toll, guarded: false };
      }
      removeCrop(state, cell);
      state.stats.cropsEaten++;
      state.stats.crowEaten++;
      // カラス返し：たくさん食べられたらその場でもらえる
      if (!CUT.charms.includes('crowReturn') && state.charms.crowReturn === 0 && state.stats.crowEaten >= EVENT_CONDITIONS.crowReturn) grant(state, 'crowReturn');
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
  // 日照りの誓い：雨が効かない。忙しい週：1日2つまで
  if (symbolBase(r.symbol) === 'rain' && state.contract === 'drought') return false;
  if (busyLimit(state, reel)) return false;
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
  if (symbolBase(r.symbol) === 'sun' && shapeCells(state, symbolShape(state, r.symbol)!, cell).some((i) => state.frost[i] > 0)) return true;
  // 極上の肥料は、範囲に肥料をまだやっていない作物があれば使える（実っていてもよい）
  if (r.symbol === 'superFert') return shapeCells(state, 'plus', cell).some((i) => { const c = state.field[rootOf(state, i)]; return !!c && !c.fertilized && !frozenCrop(state, i); });
  // 形で効く出目は、範囲に育てられる作物が1つでもあれば使える
  if (def.shape) return shapeCells(state, symbolShape(state, r.symbol)!, cell).some((i) => growableAt(state, i));
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
  if (!comboOn(state, 'sunshower')) return;
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
function useSymbolRaw(state: GameState, reel: number, cell: number | null): number[] | null {
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
    const boost = (state.bred?.includes(r.symbol) ? 1 : 0) + (cells.some((i) => state.tilled[i]) ? (state.charms.tillMaster ? 2 : 1) : 0) + (comboOn(state, 'sowing') ? 1 : 0);
    crop.growth = Math.min(CROPS[seed.crop].ripe - 1, boost);
    cells.forEach((i, k) => {
      state.field[i] = k === 0 ? crop : { ...newCrop(seed.crop), anchor: cell! };
      state.tilled[i] = false;
    });
    return cells;
  }
  switch (r.symbol) {
    case 'bigRain':
      // 大雨：十字に+1、真ん中だけ+2
      shapeCells(state, 'cross', cell!).forEach((i) => grow(state, i, r.power + (i === cell ? 1 + 2 * lv(state, 'gentleRain') : 0), affected));
      state.today.rain.push(...shapeCells(state, 'cross', cell!));
      sunshower(state, affected);
      return affected;
    case 'raijin':
      shapeCells(state, 'row', cell!).forEach((i) => grow(state, i, 3 * r.power, affected));
      return affected;
    case 'queenBee':
      shapeCells(state, 'xline', cell!).forEach((i) => grow(state, i, r.power, affected));
      return affected;
    case 'superFert':
      shapeCells(state, 'plus', cell!).forEach((i) => {
        const root = rootOf(state, i);
        const c = state.field[root];
        if (c && !c.fertilized && !frozenCrop(state, i)) {
          c.fertilized = true;
          cropCells(state, root).forEach((x) => affected.includes(x) || affected.push(x));
        }
      });
      return affected;
    case 'bigSun': {
      const sunCells = shapeCells(state, symbolShape(state, 'bigSun')!, cell!);
      sunCells.forEach((i) => {
        if (state.frost[i] > 0) {
          state.frost[i] = 0;
          if (!affected.includes(i)) affected.push(i);
        }
      });
      const amount = CONFIG.sunGrowth * r.power + state.charms.sunBlessing;
      sunCells.forEach((i) => grow(state, i, amount, affected));
      state.today.sun.push(...sunCells);
      sunshower(state, affected);
      return affected;
    }
    case 'rain':
      // 恵みの雨は真ん中のマスにだけ上乗せ
      shapeCells(state, 'cross', cell!).forEach((i) => grow(state, i, CONFIG.rainGrowth * r.power + (i === cell ? 2 * lv(state, 'gentleRain') : 0), affected));
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
      shapeCells(state, symbolShape(state, 'thunder')!, cell!).forEach((i) => grow(state, i, 2 * r.power, affected));
      return affected;
    case 'moon':
      fieldCells(state).forEach((i) => grow(state, i, r.power + (comboOn(state, 'moonFeast') ? 1 : 0), affected));
      return affected;
    case 'sun': {
      // 霜を溶かしてから育てる（溶けたマスの作物もすぐ育つ）
      const sunCells = shapeCells(state, symbolShape(state, 'sun')!, cell!);
      sunCells.forEach((i) => {
        if (state.frost[i] > 0) {
          state.frost[i] = 0;
          if (!affected.includes(i)) affected.push(i);
        }
      });
      const amount = CONFIG.sunGrowth * r.power + state.charms.sunBlessing;
      sunCells.forEach((i) => grow(state, i, amount, affected));
      state.today.sun.push(...sunCells);
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
  const charm = (def.gold ? 10 * lv(state, 'goldLuck') : 3 * lv(state, 'bumper')) + (def.big ? 50 * lv(state, 'bigGame') : 0);
  const hive = cell === undefined ? 0 : hiveBonus(state, cell);
  const fert = crop.fertilized ? CONFIG.fertilizerMultiplier : 1;
  const tile = cell !== undefined && state.tiles[cell] === 'compost' ? 2 : 1;
  const fair = (1 + CONFIG.exhibitionBonus * state.charms.exhibition) * (isColorful(state) ? 1 + CONFIG.colorfulBonus : 1);
  // 組み合わせ：秋の月（かぼちゃ）・豊年祭（全部）
  const combo = (cropBase(crop.kind) === 'pumpkin' && comboOn(state, 'harvestMoon') ? COMBO_POWER.harvestMoon : 1) * (comboOn(state, 'festival') ? COMBO_POWER.festival : 1);
  // 市の日は高く売れる（市が閉まる週は除く）。牧場主の代償で作物が安くなる
  const marketDay = isMarketDay(state.day) && state.contract !== 'marketClosed' ? CONFIG.marketDaySell : 1;
  const rancher = Math.max(0.5, 1 - 0.1 * state.charms.rancher);
  return Math.round((def.price + charm + crop.bonus + hive) * fert * tile * state.priceMult * marketMult(state, crop.kind) * fair * combo * marketDay * rancher);
}

export function isRipe(crop: Crop | null): boolean {
  return crop !== null && crop.growth >= CROPS[crop.kind].ripe;
}

/** 一列（縦・横・斜め）に並ぶとみなす最小の個数 */
const MIN_RUN = 3;
const RUN_DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];
/** 斜めの風：斜めの列だけ */
const DIAG_DIRS: [number, number][] = [[1, 1], [1, -1]];

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
  for (const [dx, dy] of state.contract === 'diagWind' ? DIAG_DIRS : RUN_DIRS) {
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
  if (state.field[cell] && CROPS[state.field[cell]!.kind].big) return [{ label: L('大物', 'Big'), x: 1 }];
  const runs = runsThrough(state, cell);
  if (!runs.length) return [{ label: L('単品', 'Single'), x: singleMult(state) }];
  const steps = [{ label: L('列', 'Line'), x: lineMult(state) }];
  if (inSameCropLine(state, cell)) {
    steps.push({ label: L('同じ作物', 'Same crop'), x: CONFIG.sameCropMult });
    // トマト祭り：トマトだけの列はさらに上乗せ
    if (comboOn(state, 'tomatoFest') && state.field[cell]!.kind === 'tomato') steps.push({ label: L('トマト祭り', 'Tomato Fest'), x: COMBO_POWER.cropLine });
    if (comboOn(state, 'flowerField') && cropBase(state.field[cell]!.kind) === 'strawberry') steps.push({ label: L('花畑', 'Flower Field'), x: COMBO_POWER.cropLine });
  }
  if (runs.length > 1) steps.push({ label: L(`${runs.length}本が交差`, `${runs.length} lines cross`), x: 1 + CONFIG.crossBonus * (runs.length - 1) });
  return steps;
}

/** 単品の倍率（難しい4では安い） */
export function singleMult(state: GameState): number {
  // 草よけの代償：単品はさらに半分
  return (state.difficulty >= 4 ? 0.3 : CONFIG.singleMult) * (state.charms.bugWard > 0 ? 0.5 : 1);
}

/** 列の倍率（大物狙いの代償で下がる） */
export function lineMult(state: GameState): number {
  return Math.max(1, CONFIG.lineMult - 0.2 * state.charms.bigGame);
}

/** ショップの値段の倍率（難しい2以上で高い） */
export function shopMult(state: GameState): number {
  // 年貢の減免の代償：市の値段+30%ずつ
  return (state.difficulty >= 2 ? 1.3 : 1) * (state.contract === 'pricey' ? 1.5 : 1) * (1 + 0.3 * state.charms.taxRelief);
}

/** お守りの3択を、どれも取らずに閉じる（全部曰く付きなので、取らないのも手） */
export function skipCharm(state: GameState): void {
  if (!state.charmOffer) return;
  glog(state, `お守り 取らない（候補: ${state.charmOffer.map((id) => CHARMS[id].name).join('/')}）`);
  state.charmOffer = null;
}

/** 同じ作物だけの列に入っているか（演出・表示用） */
export function inSameCropLine(state: GameState, cell: number): boolean {
  return runsThrough(state, cell).some((run) => run.every((c) => cropBase(state.field[c]!.kind) === cropBase(state.field[run[0]]!.kind)));
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
  /** 大豊作の大当たり */
  bumper: number;
}

/** single=true は列を崩さず1マスだけ、列の倍率なしで売る（大商い用） */
function sellRaw(state: GameState, cell: number, single = false): SellResult | null {
  cell = rootOf(state, cell);
  const crop = state.field[cell];
  if (state.over || !crop || !isRipe(crop) || frozenCrop(state, cell) || sellBlock(state, cell, single)) return null;
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
  // 大豊作：畑の植えられるマスを全部いっぺんに売った
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
  cells.forEach(({ kind }) => state.stats.soldKinds.includes(cropBase(kind)) || state.stats.soldKinds.push(cropBase(kind)));
  if (CONFIG.exhibitionOn && state.charms.exhibition === 0 && (Object.keys(CROPS) as CropKind[]).filter((k) => !CROPS[k].base).every((k) => state.stats.soldKinds.includes(k))) grant(state, 'exhibition');
  let bumper = 0;
  // 大豊作は1プレイに1回だけ
  if (whole && state.charms.bumperHarvest === 0) {
    grant(state, 'bumperHarvest', false);
    bumper = Math.round(CONFIG.bumperJackpot * (1 + state.taxesPaid * CONFIG.jackpotGrowth));
    earn(state, bumper);
  }
  if (line) evolveTools(state);
  state.stats.cropsSold += cells.length;
  if (line) state.stats.lineHarvests++;
  if (line) state.stats.lineCrops = (state.stats.lineCrops ?? 0) + cells.length;
  let orderReward = 0;
  const o = state.order;
  if (o && !o.done) {
    o.have = Math.min(o.need, o.have + cells.filter((c) => cropBase(c.kind) === o.crop).length);
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
  // イナゴは増え続けるので、値上がりはゆるやか（払い続ければ抑えられる）
  if (change.delta < 0) base *= Math.pow(change.symbol === 'locust' ? CONFIG.locustRemoveGrowth : CONFIG.removeGrowth, state.removed[change.symbol] ?? 0);
  if (id === 'addMoon') base *= Math.pow(CONFIG.moonGrowth, state.bag.moon);
  const discount = Math.min(0.5, 0.1 * lv(state, 'bargain'));
  return Math.max(1, Math.round(base * (1 - discount) * shopMult(state)));
}

export function upgradeAvailable(state: GameState, id: UpgradeId): boolean {
  const change = UPGRADE_SYMBOL[id]!;
  // 毎日の仕入れのときは、ショップで足せる絵柄は満月だけ（ほかは仕入れで）
  if (change.delta > 0) return !CONFIG.dailyPick && state.weekly.includes(id as AddUpgradeId);
  // イナゴを消すのは週1回の数に入らない（増える速さに追いつけるように）
  return state.bag[change.symbol] > 0 && (change.symbol === 'locust' || !removeLimitReached(state));
}

/** 今週はもうお邪魔を消せない */
export function removeLimitReached(state: GameState): boolean {
  return state.removedThisWeek >= CONFIG.removesPerWeek;
}

export function canBuy(state: GameState, id: UpgradeId): boolean {
  return !state.over && shopOpen(state) && upgradeAvailable(state, id) && state.gold >= upgradePrice(state, id);
}

function buyRaw(state: GameState, id: UpgradeId): boolean {
  if (!canBuy(state, id)) return false;
  state.gold -= upgradePrice(state, id);
  const change = UPGRADE_SYMBOL[id]!;
  state.bag[change.symbol] += change.delta;
  if (change.delta < 0) {
    state.removed[change.symbol] = (state.removed[change.symbol] ?? 0) + 1;
    if (change.symbol !== 'locust') state.removedThisWeek++;
  }
  state.stats.purchases.push({ day: state.day, id });
  checkReady(state);
  return true;
}

// ---- お守り ----

/** そのゲームで役に立つお守りか（大物狙いはスイカの種を使えるときだけ） */
function charmUseful(state: GameState, id: CharmId): boolean {
  if (id === 'bigGame') return state.bag.watermelonSeed > 0 || state.bag.boxSeed > 0 || state.shop.includes('addWatermelonSeed') || state.pool.includes('addWatermelonSeed');
  return true;
}

export function rollCharmOffer(state: GameState, rng: Rng): CharmId[] {
  // 袋の条件を満たした特別なお守りは必ず並ぶ
  const offer: CharmId[] = state.ready.filter((id) => state.charms[id] === 0).slice(0, CONFIG.charmChoices);
  // 必ず並ぶのは1回だけ。以後はふだんの抽選に混ざる
  state.ready = state.ready.filter((id) => !offer.includes(id));
  offer.forEach((id) => state.specials.includes(id) || state.specials.push(id));
  const pool = state.charmPool
    .filter((id) => !PAUSED_CHARMS.includes(id) && (!CHARMS[id].special || state.specials.includes(id)) && !offer.includes(id) && state.charms[id] < CHARMS[id].max && charmUseful(state, id))
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

function chooseCharmRaw(state: GameState, id: CharmId): boolean {
  if (!state.charmOffer?.includes(id)) return false;
  state.charms[id]++;
  state.ready = state.ready.filter((x) => x !== id);
  if (state.charms[id] === CONFIG.goldenAt && isGolden(state, id)) state.notices.push({ kind: 'golden', id });
  if (id === 'artisan') state.reels = Math.min(CONFIG.maxReels, state.reels + 1);
  // 曰く付き：袋にお邪魔が入る
  (Object.entries(CHARM_CURSE[id]?.bag ?? {}) as [SymbolId, number][]).forEach(([sym, n]) => (state.bag[sym] += n));
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
  return !state.over && shopOpen(state) && p !== null && state.gold >= p;
}

/** 列→行の順に1つ広げる（3×3 → 4×3 → 4×4 → 5×4 → 5×5） */
function expandRaw(state: GameState): boolean {
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
  // 市ではいくつでも買える（置き待ちにたまる）。置ける場所が残っていない物は買えない
  return !state.over && shopOpen(state) && p !== null && state.weeklyPlaces.includes(id) && state.gold >= p && roomLeft(state, id) > 0;
}

/** id を置ける場所の残り（置ける場所の数から、手元で置き待ちの同じ層の物を引く） */
export function roomLeft(state: GameState, id: PlaceId): number {
  const kind = PLACES[id].kind;
  const spots = fieldCells(state).filter((c) => canPlaceAt(state, id, c)).length;
  return spots - state.stock.filter((s) => PLACES[s].kind === kind).length;
}

/** 買って手元に置く。畑に置くのは place で */
function buyPlaceRaw(state: GameState, id: PlaceId): boolean {
  if (!canBuyPlace(state, id)) return false;
  state.gold -= placePrice(state, id)!;
  state.bought[id] = (state.bought[id] ?? 0) + 1;
  state.stock.push(id);
  return true;
}

/** 手元の先頭の物を cell に置けるか。道具は空いたマス（特別なマスの上でもよい）、特別なマスは道具・特別なマスのないマス */
/** 手元の先頭の物を cell に置けるか */
export function canPlace(state: GameState, cell: number): boolean {
  const id = state.stock[0];
  return !!id && canPlaceAt(state, id, cell);
}

/**
 * id を cell に置けるか。土地（水路・堆肥）と建物（道具）は別の層：
 * 土地は作物が植わっていても敷ける（土地がまだないマスなら）。建物は何もない空きマスだけ
 */
export function canPlaceAt(state: GameState, id: PlaceId, cell: number): boolean {
  if (!inField(state, cell) || state.tools[cell] || isPond(state, cell)) return false;
  // 建物は、特別なマスの上にも置ける（空きマスなら）
  if (PLACES[id].kind === 'tool') return isOpen(state, cell);
  // 土地は大物の一部には敷けない（本体と売値がずれるので）
  return !state.tiles[cell] && !(state.field[cell] && CROPS[state.field[cell]!.kind].big);
}

/** id を置ける場所が畑のどこかにあるか（ないなら買えない） */
export function hasRoomFor(state: GameState, id: PlaceId): boolean {
  return fieldCells(state).some((c) => canPlaceAt(state, id, c));
}

/** 手元の物を置ける場所があり、置くまでほかの操作はできない */
export function mustPlace(state: GameState): boolean {
  return state.stock.length > 0 && fieldCells(state).some((c) => canPlace(state, c));
}

function placeRaw(state: GameState, cell: number): PlaceId | null {
  if (!canPlace(state, cell)) return null;
  const id = state.stock.shift()!;
  if (PLACES[id].kind === 'tool') state.tools[cell] = id;
  else state.tiles[cell] = id;
  return id;
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
  for (const [dx, dy] of state.contract === 'diagWind' ? DIAG_DIRS : RUN_DIRS) {
    const run: CropKind[] = [kind];
    for (let x = cx + dx, y = cy + dy, k = cropAt(x, y); k; x += dx, y += dy, k = cropAt(x, y)) run.push(k);
    for (let x = cx - dx, y = cy - dy, k = cropAt(x, y); k; x -= dx, y -= dy, k = cropAt(x, y)) run.push(k);
    if (run.length >= MIN_RUN) runs.push(run);
  }
  if (!runs.length) return 0;
  let m = lineMult(state);
  if (runs.some((r) => r.every((k) => cropBase(k) === cropBase(kind)))) m *= CONFIG.sameCropMult;
  if (runs.length > 1) m *= 1 + CONFIG.crossBonus * (runs.length - 1);
  return m;
}

// ---- 開発用のプレイログ ----
// ルールの操作はすべてここを通る（画面の操作も自動プレイも同じ記録になる）。1行1出来事、日と曜日を頭に付ける

const WD_JA = ['月', '火', '水', '木', '金', '土', '日'];
const LOG_MAX = 5000;
/** マスを (x,y)（左上が1,1）で */
export const cellName = (cell: number): string => `(${cellX(cell) + 1},${cellY(cell) + 1})`;
const cropName = (c: Crop | null | undefined): string => (c ? CROPS[c.kind].name : '-');

export function glog(state: GameState, text: string): void {
  if (!state.log) state.log = [];
  const head = state.day > 0 ? `D${state.day}${WD_JA[weekDay(state.day) - 1]}` : 'D0';
  state.log.push(`${head} ${text}`);
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
}

export function endDay(state: GameState, rng: Rng): EndDayResult {
  const before = state.gold;
  const expiredNames = state.results.filter((r) => !r.used && SYMBOLS[r.symbol].kind === 'manual').map((r) => SYMBOLS[r.symbol].name);
  const res = endDayRaw(state, rng);
  if (state.day > 0) glog(state, `夜 所持${state.gold}${expiredNames.length ? ` 使わず消えた:${expiredNames.join('・')}` : ''}${state.nightIncome && state.nightIncome.wheel + state.nightIncome.fish + state.nightIncome.animals ? ` 夜の収入+${state.nightIncome.wheel + state.nightIncome.fish + state.nightIncome.animals}` : ''}`);
  if (res.tax !== null) {
    glog(state, res.ok ? `年貢${state.taxesPaid}回目 ${res.tax}を払った（${before}→${state.gold}）${state.lastObstacles.length ? ` お邪魔+${state.lastObstacles.map((o) => SYMBOLS[o].name).join('・')}` : ''}${res.cleared ? ' ★クリア' : ''}` : `年貢 ${res.tax}が払えず終わり（所持${state.gold}）`);
    if (state.charmOffer) glog(state, `お守り候補 ${state.charmOffer.map((id) => CHARMS[id].name).join('/')}`);
  }
  return res;
}

export function spinDay(state: GameState, rng: Rng): void {
  spinDayRaw(state, rng);
  const r = state.results.map((x) => `${SYMBOLS[x.symbol].name}${x.total > 1 ? `×${x.total}` : ''}${x.fog === 'lost' ? '(霧で使えない)' : ''}`).join(' / ');
  glog(state, `回す 所持${state.gold} 出目: ${r}${state.fever.length ? ` フィーバー:${state.fever.map((f) => SYMBOLS[f].name).join('・')}` : ''}${state.combos.length ? ` 組み合わせ:${state.combos.map((c) => CHARMS[c].name).join('・')}` : ''}`);
}

export function mergeSymbol(state: GameState, sym: SymbolId): boolean {
  const cost = mergeCost(state);
  const ok = mergeSymbolRaw(state, sym);
  if (ok) glog(state, `合体 ${SYMBOLS[sym].name}×${CONFIG.mergeNeed}→${SYMBOLS[MERGES[sym]!].name} -${cost}`);
  return ok;
}

export function takeContract(state: GameState, id: ContractId | null): boolean {
  const offer = [...state.contractOffer];
  const ok = takeContractRaw(state, id);
  if (ok && offer.length) glog(state, `週契約 ${id ? CONTRACTS[id].name : 'なし'}（候補: ${offer.map((c) => `${CONTRACTS[c].name}★${CONTRACTS[c].stars}`).join('/')}）`);
  return ok;
}

export function takeOffer(state: GameState, id: AddUpgradeId): boolean {
  const offer = state.offer.map((o) => SYMBOLS[UPGRADE_SYMBOL[o]!.symbol].name);
  const ok = takeOfferRaw(state, id);
  if (ok) glog(state, `仕入れ ${SYMBOLS[UPGRADE_SYMBOL[id]!.symbol].name}（候補: ${offer.join('/')}）`);
  return ok;
}

export function pullWeed(state: GameState, cell: number): boolean {
  const cost = weedCost(state);
  const ok = pullWeedRaw(state, cell);
  if (ok) glog(state, `草むしり ${cellName(cell)} -${cost}`);
  return ok;
}

export function resolveFever(state: GameState, rng: Rng): FeverEvent[] {
  const ev = resolveFeverRaw(state, rng);
  ev.forEach((e) => glog(state, `フィーバー ${SYMBOLS[e.symbol].name}×${e.count} 役:${e.role} 大当たり+${e.jackpot}${e.role === 'honey' ? ` はちみつ+${e.amount}` : ''}`));
  return ev;
}

export function resolveAuto(state: GameState, reel: number, rng: Rng): AutoEvent | null {
  const sym = state.results[reel]?.symbol;
  const ev = resolveAutoRaw(state, reel, rng);
  if (!ev || !sym) return ev;
  let t = '';
  switch (ev.type) {
    case 'coin': t = `+${ev.amount}`; break;
    case 'crow': t = ev.cell === null ? '狙う作物なし' : ev.guarded ? `かかしで追い払った ${cellName(ev.cell)}` : ev.eaten ? `${cropName(ev.crop)}を食べた ${cellName(ev.cell)}` : `外れ ${cellName(ev.cell)}`; break;
    case 'bug': t = ev.cell === null ? '作物なし' : ev.warded ? `防いだ ${cellName(ev.cell)}` : `成長-${ev.damage} ${cellName(ev.cell)}`; break;
    case 'weed': t = ev.warded ? '防いだ' : `生えた ${ev.cells.map(cellName).join('')}`; break;
    case 'tanuki': t = `盗んだ${ev.stolen} ${ev.taken.map((x) => cropName(x.crop)).join('・')}`; break;
    case 'frost': t = `凍った ${ev.cells.map(cellName).join('')}`; break;
    case 'mole': t = `押し出し${ev.moves.length}`; break;
    case 'locust': t = `${ev.cell === null ? '作物なし' : `成長-1 ${cellName(ev.cell)}`}${ev.bred ? ` 袋で+${ev.bred}` : ''}`; break;
    case 'merchant': t = `売値×${ev.mult}`; break;
    case 'clover': t = `明日の金の種×${ev.boost}`; break;
  }
  glog(state, `自動 ${SYMBOLS[sym].name}: ${t}`);
  return ev;
}

export function useSymbol(state: GameState, reel: number, cell: number | null): number[] | null {
  const sym = state.results[reel]?.symbol;
  const res = useSymbolRaw(state, reel, cell);
  if (res && sym) glog(state, SEEDS[sym] ? `植える ${CROPS[SEEDS[sym]!.crop].name} ${cell === null ? '' : cellName(cell)}` : `使う ${SYMBOLS[sym].name} ${cell === null ? '畑全体' : cellName(cell)} 効いたマス${res.length}`);
  return res;
}

export function sell(state: GameState, cell: number, single = false): SellResult | null {
  const res = sellRaw(state, cell, single);
  if (res) {
    const kinds = [...new Set(res.cells.map((c) => CROPS[c.kind].name))].join('・');
    glog(state, `売る ${kinds}×${res.size} ${res.line ? `列×${Math.round(res.mult * 100) / 100}` : single ? '大商い' : '単品'} +${res.total}${res.orderReward ? ` 注文達成+${res.orderReward}` : ''}${res.bumper ? ` 大豊作+${res.bumper}` : ''}`);
  }
  return res;
}

export function buy(state: GameState, id: UpgradeId): boolean {
  const price = upgradePrice(state, id);
  const ok = buyRaw(state, id);
  if (ok) glog(state, `市で買う ${UPGRADE_SYMBOL[id]!.delta < 0 ? '消す' : '足す'}:${SYMBOLS[UPGRADE_SYMBOL[id]!.symbol].name} -${price}`);
  return ok;
}

export function chooseCharm(state: GameState, id: CharmId): boolean {
  const ok = chooseCharmRaw(state, id);
  if (ok) glog(state, `お守り ${CHARMS[id].name}（${state.charms[id]}個目）`);
  return ok;
}

export function expand(state: GameState): boolean {
  const price = expandPrice(state);
  const ok = expandRaw(state);
  if (ok) glog(state, `畑を広げる ${state.cols}×${state.rows} -${price}`);
  return ok;
}

export function buyPlace(state: GameState, id: PlaceId): boolean {
  const price = placePrice(state, id);
  const ok = buyPlaceRaw(state, id);
  if (ok) glog(state, `市で買う ${PLACES[id].name} -${price}`);
  return ok;
}

export function place(state: GameState, cell: number): PlaceId | null {
  const id = placeRaw(state, cell);
  if (id) glog(state, `置く ${PLACES[id].name} ${cellName(cell)}`);
  return id;
}

/** 書き出し用：今の様子のまとめ（畑のマス目・袋・お守り） */
export function logSnapshot(state: GameState): string[] {
  const out: string[] = [];
  out.push(`日=${state.day} 所持=${state.gold} 年貢=${state.taxesPaid}回納めた 次の年貢=${nextTax(state).amount}（D${nextTax(state).dueDay}） 難しさ=${state.difficulty} 農家=${state.farmer} リール=${state.reels} 畑=${state.cols}×${state.rows}${state.over ? ' 終わり' : ''}${state.cleared ? ' クリア済み' : ''}`);
  out.push(`袋(${bagTotal(state.bag)}枚): ${SYMBOL_ORDER.filter((s) => state.bag[s] > 0).map((s) => `${SYMBOLS[s].name}${state.bag[s]}`).join(' ')}`);
  const rt = rateRun(state);
  out.push(`評価: ${rt.rank}（${rt.score}点） ${rt.parts.map((p) => `${p.label}${p.value}(${p.detail})`).join(' ')}`);
  out.push(`お守り: ${CHARM_ORDER.filter((c) => state.charms[c] > 0).map((c) => `${CHARMS[c].name}${state.charms[c]}`).join(' ') || 'なし'}`);
  if (state.contract) out.push(`週契約: ${CONTRACTS[state.contract].name}`);
  if (state.stock.length) out.push(`置き待ち: ${state.stock.map((p) => PLACES[p].name).join(' ')}`);
  out.push('畑（作物 育ち/実る・道具・特別なマス）:');
  for (let y = 0; y < state.rows; y++) {
    const row: string[] = [];
    for (let x = 0; x < state.cols; x++) {
      const i = y * CONFIG.fieldCols + x;
      const c = state.field[i];
      const parts: string[] = [];
      if (c && c.anchor === undefined) parts.push(`${CROPS[c.kind].name}${Math.min(c.growth, CROPS[c.kind].ripe)}/${CROPS[c.kind].ripe}${c.fertilized ? '肥' : ''}`);
      if (c && c.anchor !== undefined) parts.push('〃');
      if (state.tools[i]) parts.push(PLACES[state.tools[i]!].name);
      if (state.tiles[i]) parts.push(`[${PLACES[state.tiles[i]!].name}]`);
      if (state.weeds[i]) parts.push('雑草');
      if (state.frost[i]) parts.push(`霜${state.frost[i]}`);
      row.push(parts.join('+') || '空き');
    }
    out.push(`  ${row.join(' | ')}`);
  }
  return out;
}

// ---- 評価：クリアの「うまさ」を4つの数字で ----

export interface RatingPart {
  key: 'line' | 'use' | 'guard' | 'margin';
  label: string;
  /** 0〜100 */
  value: number;
  detail: string;
}
export interface Rating {
  score: number;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  parts: RatingPart[];
}

export function rateRun(state: GameState): Rating {
  const st = state.stats;
  const pct = (x: number) => Math.max(0, Math.min(100, Math.round(x * 100)));
  const sold = st.cropsSold;
  const lineCrops = st.lineCrops ?? 0;
  const manual = st.manualTotal ?? 0;
  const taxTotal = st.taxTotal ?? 0;
  const parts: RatingPart[] = [
    // 列で売れたか（単品で売るほど下がる）
    { key: 'line', label: L('列で売った', 'Sold in lines'), value: sold ? pct(lineCrops / sold) : 0, detail: `${lineCrops}/${sold}` },
    // 出目をむだにしなかったか
    { key: 'use', label: L('出目を使い切った', 'Used your reels'), value: manual ? pct(1 - st.expired / manual) : 0, detail: `${manual - st.expired}/${manual}` },
    // お邪魔から守れたか
    { key: 'guard', label: L('作物を守った', 'Protected crops'), value: sold + st.cropsEaten ? pct(1 - st.cropsEaten / (sold + st.cropsEaten)) : 0, detail: L(`取られた${st.cropsEaten}`, `${st.cropsEaten} lost`) },
    // 年貢に対してどれだけ稼げたか（年貢の2.5倍で満点）
    { key: 'margin', label: L('稼ぎの余裕', 'Earning margin'), value: taxTotal ? pct((st.totalEarned / taxTotal - 1) / 1.5) : 0, detail: taxTotal ? `×${(st.totalEarned / taxTotal).toFixed(1)}` : '-' },
  ];
  const score = Math.round(parts.reduce((n, p) => n + p.value, 0) / parts.length);
  const rank = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
  return { score, rank, parts };
}
