// ゲームのルール本体。画面に依存しない純粋なロジック。

import { L } from './i18n.ts';
import {
  BAG_CONDITIONS, CHARM_CURSE, COMBOS, CUT, MERGES, cropBase, symbolBase, FARMERS, PAUSED_CHARMS, isCutAdd, COMBO_POWER, CHARMS, CHARM_ORDER, CHARM_PLACE, CONFIG, CROPS, EVENT_CONDITIONS, PLACE_ORDER, PLACES, SEEDS, SYMBOLS, SYMBOL_ORDER, TOOL_EVOLVE, UPGRADE_SYMBOL,
  type AddUpgradeId, type CharmId, type CropKind, type PlaceId, type ShapeId, type SymbolId, type TaxCondKind, type UpgradeId, type WhimId,
  URA, YOKAI, type HarassId, type YokaiId,
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
  /** 実ってから過ぎた夜の数（難しい6：spoilDays になると傷んで売れなくなる） */
  ripeDays?: number;
  /** カラスにつつかれた（かぼちゃ・スイカなど食べられない作物）。売値−20% */
  pecked?: boolean;
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
  /** 月の満ち欠け（0新月・1三日月・2半月・3満月）。満月のときだけ使える */
  moon?: number;
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
  | { kind: 'toolLevel'; cell: number; tool: PlaceId; lv: number };

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
  /** 市の朝の仕入れでタダでもらった */
  free?: boolean;
}

/** 殿様モードの年貢の条件（その週の日曜の年貢に付く）。got は売るたびに数える（日曜に残すは畑を見る） */
export interface TaxCond {
  kind: TaxCondKind;
  crop?: CropKind;
  need: number;
  got: number;
}

export interface GameState {
  /** このプレイの識別子（記録の集計用） */
  runId: string;
  /** このプレイの種（出目の流れを決める数）。同じ種なら、同じ操作で同じ出目になる（挑戦状・週替わりの対決に使う） */
  seed?: number;
  /** 乱数の今の位置（続きから遊んでも同じ流れが続くよう保存する） */
  rngState?: number;
  /** 挑戦状から始めたプレイ：送ってきた人の結果（結果画面で比べる） */
  challenge?: ChallengeFrom | null;
  /** 裏（妖怪退治）のプレイ。ふつうのプレイは null */
  ura?: UraState | null;
  /** 殿様モードの段（0＝殿様モードではない、1〜3） */
  lordLevel: number;
  /** 今週の年貢の条件（殿様モード） */
  taxCond: TaxCond | null;
  /** 今週の殿様の気まぐれ（殿様モード） */
  whim: WhimId | null;
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
  /** 大かかしが袋のカラスを追い出した日（1日1回まで） */
  crowBanishedDay?: number;
  stock: PlaceId[];
  /** 袋の条件を満たして、次の年貢後の3択に必ず並ぶ特別なお守り */
  ready: CharmId[];
  /** 一度並んだ特別なお守り（以後はふだんの抽選にも混ざる） */
  specials: CharmId[];
  /** 道具が働いた回数（マスごと。進化に使う） */
  toolXp: number[];
  /** 鶏小屋・牛小屋の段（0〜animalLvMax）。働くほど上がる */
  toolLv: number[];
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
  /** 要らない札を捨てた回数（値段が上がる）と、この市で捨てたか */
  discards: number;
  discardedThisMarket: boolean;
  /** この市で捨てた枚数（断捨離なら2枚まで） */
  discardsThisMarket: number;
  /** 月見の代償：満月を使った日 */
  moonUsedDay: number;
  /** 今日の市はもう閉じた（市は開いて閉じたら、その日はもう開かない） */
  marketClosed: boolean;
  /** 大きな買い物（後半の市）を買った数 */
  premium: Partial<Record<PremiumId, number>>;
  /** 月の満ち欠け（袋の月の札すべてで共通）。0新月 → 1三日月 → 2半月 → 3満月。満月を使うと新月に戻る */
  moonPhase: number;
  /** 卵がスロットに出た回数（eggHatch 回で1つ孵ってツバメになる） */
  eggProgress: number;
  /** 開発用のプレイログ（1行1出来事。設定の「ログを書き出す」で取り出す） */
  log: string[];
  /** 開発用：ログの集計（お金の出入り・被害）。週ごとと通し */
  logStats?: { week: Record<string, number>; total: Record<string, number>; bag?: string };
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
  /** 今日の市の割引の品（'place:巣箱の id' / 'up:消す品の id' / 'expand'）。買うと消える */
  sale?: { key: string; day: number } | null;
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
    /** 日ごとに市などで使ったお金（負けた理由の振り返り用。添え字は日） */
    spentByDay?: number[];
  };
}

/** 市・道具などでお金を使う（年貢・盗まれた分は含めない）。日ごとの支出を数える */
function spend(state: GameState, amount: number): void {
  state.gold -= amount;
  const by = (state.stats.spentByDay ??= []);
  by[state.day] = (by[state.day] ?? 0) + amount;
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

/** 挑戦状を送ってきた人の結果 */
export interface ChallengeFrom {
  day: number;
  taxes: number;
  earned: number;
  cleared: boolean;
  rank: string;
  score: number;
  runId: string;
}

export interface GameSetup {
  /** 種（省略時はでたらめに決める） */
  seed?: number;
  /** 挑戦状から始めるとき：送ってきた人の結果 */
  challenge?: ChallengeFrom;
  /** 裏（妖怪退治）の段。0・省略はふつうのプレイ */
  ura?: number;
  shop: AddUpgradeId[];
  charmPool: CharmId[];
  /** 週替わりの候補（解放済み）。省略時は shop と同じ */
  pool?: AddUpgradeId[];
  /** 難しさ（0＝ふつう） */
  difficulty?: number;
  /** 殿様モードの段（0＝なし） */
  lord?: number;
  /** 農家（FARMERS の id） */
  farmer?: string;
  /** 農家の腕前の段（0〜3） */
  mastery?: number;
}

export const ALL_ADDS: AddUpgradeId[] = ['addCan', 'addEgg', 'addHawk', 'addSeed', 'addBerrySeed', 'addPumpkinSeed', 'addMelonSeed', 'addWatermelonSeed', 'addRain', 'addSun', 'addThunder', 'addHoe', 'addFertilizer', 'addBee', 'addMerchant', 'addGoldSeed', 'addClover'];

export function newGame(setup: GameSetup = { shop: ALL_ADDS, charmPool: CHARM_ORDER }): GameState {
  const state = freshGame(setup);
  glog(state, `開始 難しさ=${state.difficulty} 農家=${state.farmer}`);
  // 農家：最初の袋の増減・最初のお守り・最初に持っている畑の品
  const farmer = FARMERS.find((f) => f.id === state.farmer);
  if (farmer) {
    (Object.entries(farmer.bag) as [SymbolId, number][]).forEach(([sym, n]) => (state.bag[sym] = Math.max(0, state.bag[sym] + n)));
    (Object.entries(farmer.charms) as [CharmId, number][]).forEach(([id, n]) => (state.charms[id] += n));
    state.stock.push(...farmer.stock);
    // 腕前：上げた段の分だけ、始めの所持金・札・畑の品が足される
    (farmer.mastery ?? []).slice(0, setup.mastery ?? 0).forEach((p) => {
      state.gold += p.gold ?? 0;
      (Object.entries(p.bag ?? {}) as [SymbolId, number][]).forEach(([sym, n]) => (state.bag[sym] += n));
      state.stock.push(...(p.stock ?? []));
    });
    if (setup.mastery) glog(state, `腕前 段${setup.mastery}`);
  }
  if (setup.ura) startUra(state, setup.ura);
  return state;
}

/** でたらめな種（32ビット） */
export function makeSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/**
 * このプレイの乱数（mulberry32）。位置は state.rngState に持つので、保存して続きから遊んでも同じ流れになる。
 * 種のない古い保存は、ここで種を決める
 */
export function nextRand(state: GameState): number {
  if (state.rngState === undefined) {
    state.seed ??= makeSeed();
    state.rngState = state.seed;
  }
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 週替わりの種：その週（月曜はじまり・日本時間）の全員に同じ種。週の名前（2026-W48 など）も返す */
export function weeklySeed(now = new Date()): { seed: number; week: string } {
  const jst = new Date(now.getTime() + 9 * 3600e3);
  const day = (jst.getUTCDay() + 6) % 7; // 月曜＝0
  const monday = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - day));
  // ISO 週番号（その週の木曜が属する年の何週目か）
  const thu = new Date(monday.getTime() + 3 * 86400e3);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = Math.floor((thu.getTime() - jan1.getTime()) / 86400e3 / 7) + 1;
  const week = `${thu.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
  let h = 2166136261;
  for (const ch of `hatake-slot:${week}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return { seed: h >>> 0, week };
}

function freshGame(setup: GameSetup): GameState {
  const seed = (setup.seed ?? makeSeed()) >>> 0;
  return {
    runId: Math.random().toString(36).slice(2, 10),
    seed,
    rngState: seed,
    challenge: setup.challenge ?? null,
    difficulty: setup.difficulty ?? 0,
    lordLevel: setup.lord ?? 0,
    taxCond: null,
    whim: null,
    farmer: setup.farmer ?? 'basic',
    morning: false,
    shop: [...setup.shop],
    pool: [...(setup.pool ?? setup.shop)],
    offer: [],
    combos: [],
    weekly: [],
    weeklyPlaces: [],
    sale: null,
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
    toolLv: Array.from({ length: CONFIG.fieldCols * CONFIG.fieldRows }, () => 0),
    today: { rain: [], sun: [], boosted: [] },
    halfTax: false,
    notices: [],
    contractOffer: [],
    contract: null,
    contractBugs: 0,
    contractDone: null,
    taxCut: 0,
    mergedThisMarket: false,
    discards: 0,
    discardedThisMarket: false,
    discardsThisMarket: 0,
    moonUsedDay: 0,
    marketClosed: false,
    premium: {},
    moonPhase: 0,
    eggProgress: 0,
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
  // 鶏小屋・牛小屋は毎晩働いて経験を積む（収入のあとで段が上がる）
  fieldCells(state).forEach((i) => (state.tools[i] === 'henhouse' || state.tools[i] === 'cowshed') && animalXp(state, i));
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
  const step = state.toolLv?.[cell] ?? 0;
  let gold = (t === 'henhouse' ? CONFIG.henhouseGold + CONFIG.henhouseLvGold * step : CONFIG.cowshedGold + CONFIG.cowshedLvGold * step) + 2 * lv(state, 'rancher');
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

/** 難しさごとの年貢の倍率（CONFIG.difficultyTaxMult） */
export function difficultyTaxMult(difficulty: number): number {
  const m = CONFIG.difficultyTaxMult;
  return m[Math.max(0, Math.min(m.length - 1, difficulty))];
}

/** 難しさごとの、クリアまでの年貢の額（お守りの増減なし）。難しさの画面のグラフ用 */
export function taxPlan(difficulty: number): number[] {
  return Array.from({ length: CONFIG.winTaxes }, (_, i) => Math.round(taxAmount(i) * difficultyTaxMult(difficulty)));
}

export interface TaxInfo {
  dueDay: number;
  daysLeft: number;
  amount: number;
  index: number;
}

/** 次に納める年貢。dueDay の日の終わり（次の回転前）に徴収される */
/** お守りの代償で年貢が上がる割合（%）。大きな種袋・豊作は1つ+10、からくり職人は+20、大かかしは+5 */
export function taxCursePct(state: GameState): number {
  return 10 * state.charms.seedSack + 10 * state.charms.bumper + 20 * state.charms.artisan + 5 * state.charms.scarecrow;
}

export function nextTax(state: GameState): TaxInfo {
  // 納めた回数から次の期日を決める（納付直後に同じ年貢を指さないように）
  const index = state.taxesPaid;
  const dueDay = (index + 1) * CONFIG.taxPeriod;
  // 年貢の減免：1つで5%、上限25%（強すぎたので弱めた）
  const relief = Math.min(0.3, 0.1 * lv(state, 'taxRelief'));
  // 曰く付きのお守りの代償：大きな種袋・豊作は1つ+10%、からくり職人は+20%
  const curse = 1 + taxCursePct(state) / 100;
  const half = (state.halfTax ? 0.5 : 1) * difficultyTaxMult(state.difficulty);
  // 殿様モード：年貢の条件・豊作を見たいに届いていない分だけ増える（届けば元に戻る）
  const lord = 1 + lordPenalty(state);
  // 難しい8：置き物の維持費は、年貢に足し算で乗る
  return { dueDay, daysLeft: dueDay - state.day, amount: Math.round(taxAmount(index) * (1 - relief) * curse * (1 - (state.taxCut ?? 0)) * half * lord) + upkeep(state), index };
}

// ---- 1日の進行 ----

export type EndDayResult =
  | { ok: true; tax: number | null; expired: number; cleared: boolean; seedGold: number; forfeited?: number }
  | { ok: false; tax: number; expired: number; cleared: false; seedGold: number; ura?: boolean };

/**
 * 今日を終える。期日なら年貢を徴収し、払えればお守りの候補を用意する（charmOffer）。
 * 払えなければゲームオーバー。続けて drawDay で翌日のスロットを回す。
 */
function endDayRaw(state: GameState, rng: Rng): EndDayResult {
  const expired = state.results.filter((r) => !r.used && SYMBOLS[r.symbol].kind === 'manual').length;
  state.stats.expired = (state.stats.expired ?? 0) + expired;
  // 植えきれなかった種は、1つ1金で売れる（あふれた種がむだにならないように）
  // 使わずに終わった手動の出目（雨・太陽など）も、1枚 spareReelGold で小銭になる
  const spare = state.results.filter((r) => !SEEDS[r.symbol] && !r.used && SYMBOLS[r.symbol].kind === 'manual' && r.fog !== 'lost').length * CONFIG.spareReelGold;
  const seedGold = state.results.reduce((n, r) => n + (SEEDS[r.symbol] && r.fog !== 'lost' ? Math.max(0, r.left) : 0), 0) * CONFIG.seedSellGold + spare;
  if (seedGold) earn(state, seedGold);
  // 熟成：実ったまま日をまたいだ作物の売値が上がる
  if (state.day > 0 && lv(state, 'aging') > 0) {
    state.field.forEach((c) => {
      // 1日ごとに+熟成の数、3日分まで（強すぎたので弱めた）
      // 1日ごとに元の売値の10%×熟成の数、3日分まで（元の売値に比例）
      if (c && isRipe(c)) {
        const per = CROPS[c.kind].price * 0.1 * lv(state, 'aging');
        c.bonus = Math.min(3 * per, c.bonus + per);
      }
    });
  }
  // 実ったまま夜を越した数を数える（難しい6で傷む。実っていなければ0に戻す）
  if (state.day > 0) state.field.forEach((c) => c && c.anchor === undefined && (c.ripeDays = isRipe(c) ? (c.ripeDays ?? 0) + 1 : 0));
  // 井戸・水路は夜のうちに作物を育てる。水車・釣り堀・鶏小屋・牛小屋のお金が入る
  const grown = state.day > 0 ? overnightGrowth(state) : [];
  state.nightIncome = state.day > 0 ? collectNightIncome(state, rng, grown) : null;
  // 殿様の気まぐれ・見回り：毎晩、家来が実った作物を1つ持っていく（かかしの周りは守られる）
  if (state.day > 0 && state.whim === 'patrol') patrolNight(state);
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
  // 裏：ノルマはない。妖怪の残りの回転を減らし、妨害を起こす。期限が来たら負け
  if (state.ura) {
    if (state.day > 0 && !uraNight(state)) {
      state.over = true;
      return { ok: false, tax: 0, expired, cleared: false, seedGold, ura: true };
    }
    return { ok: true, tax: null, expired, cleared: false, seedGold };
  }
  if (!(state.day > 0 && state.day % CONFIG.taxPeriod === 0)) return { ok: true, tax: null, expired, cleared: false, seedGold };
  const t = nextTax(state);
  if (state.gold < t.amount) {
    state.over = true;
    return { ok: false, tax: t.amount, expired, cleared: false, seedGold };
  }
  state.gold -= t.amount;
  state.stats.taxTotal = (state.stats.taxTotal ?? 0) + t.amount;
  if (state.taxCond || state.whim) glog(state, `殿様 ${lordSummary(state)} 年貢+${Math.round(lordPenalty(state) * 100)}%`);
  state.taxCond = null;
  state.whim = null;
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
  // 難しい9：次の年貢の額を超えたお金は持ち越せない
  let forfeited = 0;
  if (state.difficulty >= CONFIG.carryFrom) {
    const cap = carryCap(state);
    if (state.gold > cap) {
      forfeited = state.gold - cap;
      state.gold = cap;
      glog(state, `持ち越せない分 -${forfeited}（上限${cap}）`);
    }
  }
  return { ok: true, tax: t.amount, expired, cleared, seedGold, forfeited };
}

/** n 回目の年貢を納めたときに袋に増えるお邪魔 */
export function obstacleRule(n: number, difficulty = 0): { count: number; pool: SymbolId[] } {
  // 難しい3以上：表が hardObstacleStep 回分早く進み、枚数も hardObstacleExtra 枚多い
  const hard = difficulty >= 3;
  const r = [...CONFIG.obstacleSchedule].reverse().find((x) => n + (hard ? CONFIG.hardObstacleStep : 0) >= x.from) ?? CONFIG.obstacleSchedule[0];
  return { count: r.count + (hard ? CONFIG.hardObstacleExtra : 0), pool: r.pool };
}

export function rollObstacles(n: number, rng: Rng, difficulty = 0): SymbolId[] {
  const rule = obstacleRule(n, difficulty);
  const count = rule.count;
  // 難しい5：年貢のたびに増えるお邪魔にイナゴも混ざる
  const pool = (difficulty >= 5 ? [...rule.pool, 'locust' as SymbolId] : rule.pool).filter(
    (s) => !CUT.symbols.includes(s) && (s !== 'tanuki' || difficulty >= CONFIG.tanukiFrom),
  );
  // 同じお邪魔は1回に sameObstacleMax 枚まで。超えたら、まだ上限に届いていない別のお邪魔から選び直す（ほかになければ入れない）
  const picks: SymbolId[] = [];
  for (let k = 0; k < count; k++) {
    const room = pool.filter((p) => picks.filter((x) => x === p).length < CONFIG.sameObstacleMax);
    if (!room.length) break;
    const first = pool[Math.floor(rng() * pool.length)];
    picks.push(room.includes(first) ? first : room[Math.floor(rng() * room.length)]);
  }
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
  state.marketClosed = false;
  state.colorfulToday = false;
  state.priceMult = 1;
  state.morning = true;
  // 仕入れ：市の日に3択（市の日がなければ毎日）
  state.offer = CONFIG.dailyPick && (!CONFIG.marketDays.length || isMarketDay(state.day)) ? rollOffer(state, rng) : [];
  // 新しい週には新しい注文と週替わりの品が来る（注文がない週は、月曜を週の始まりとして数える）
  if (state.order ? state.order.dueDay < state.day : state.day === 1 || weekDay(state.day) === 1) {
    state.order = state.ura ? null : makeOrder(state, rng);
    state.weekly = rollWeekly(state, rng);
    state.weeklyPlaces = rollWeeklyPlaces(state, rng);
    state.removedThisWeek = 0;
    // 相場は難しいモードから（marketFrom 以上）
    state.market = CONFIG.marketOn && state.difficulty >= CONFIG.marketFrom ? rollMarket(state, rng) : null;
  }
  // 殿様モード：月曜の朝に、今週の年貢の条件と気まぐれが決まる
  if (state.lordLevel > 0 && weekDay(state.day) === 1) {
    rollLordWeek(state, rng);
    // 年貢の条件がある週は、注文は出さない（同じ「作物を何個」が2つ並んで紛らわしいので、条件が注文の代わり）
    if (state.taxCond) state.order = null;
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
    state.discardedThisMarket = false;
    state.discardsThisMarket = 0;
    state.removedThisWeek = 0;
    state.weeklyPlaces = rollWeeklyPlaces(state, rng);
    rollSale(state);
  }
  logMarket(state);
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
  // 月の満ち欠け：月が出るたびに1つ満ちる。満月になった月だけ使える（使うと新月に戻る）
  state.results.forEach((r) => {
    if (r.symbol !== 'moon') return;
    // 月見のお守り：2つずつ満ちる
    state.moonPhase = Math.min(3, (state.moonPhase ?? 0) + (state.charms.moonViewing > 0 ? 2 : 1));
    r.moon = state.moonPhase;
    if (r.moon < 3) {
      r.used = true;
      r.left = 0;
    }
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
  // 裏：市・仕入れはない（手に入れるのは妖怪を倒したときの3択だけ）
  if (state.ura) return false;
  if (state.contract === 'marketClosed' || state.marketClosed || state.whim === 'frugal') return false;
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
  spend(state, cost);
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
  // 縛りが空振りしないものだけ（袋に少ししかない札の縛り・買い物しない週の物価高は、ただの見返りになる）
  const seeds = (Object.keys(SEEDS) as SymbolId[]).reduce((n, s) => n + state.bag[s], 0);
  switch (id) {
    case 'cloudy':
      return bagCount(state, 'sun') >= 2;
    case 'drought':
      return bagCount(state, 'rain') >= 2;
    case 'crowFlock':
      return state.bag.crow >= 2;
    case 'seedThrift':
      return seeds >= 3;
    case 'pricey':
      // 買い物できるお金があるときだけ
      return state.gold >= 60;
    case 'bugBloom':
      return fieldCells(state).some((i) => state.field[i]);
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
  // 週契約は一旦お休み（仕組みは残してある。CONFIG.contractsOn で戻せる）
  if (!CONFIG.contractsOn) return [];
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
  if (state.contract === 'connoisseur' || state.charms.greedy > 0) {
    const root = rootOf(state, cell);
    const crop = state.field[root];
    if (crop && !CROPS[crop.kind].big && (single || harvestGroup(state, root).length < MIN_RUN)) return state.charms.greedy > 0 ? L('欲張り：<b>単品は売れない</b>', 'Greedy: <b>no singles</b>') : L('今週は<b>単品は売れない</b>', '<b>No singles</b> this week');
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
    out.push(...lineToolCells(state, i));
  });
  return out;
}

/** スプリンクラー（横一列）・ため池（縦一列）・風車（縦と横）が夜に育てるマス */
function lineToolCells(state: GameState, i: number): number[] {
  const t = state.tools[i];
  if (t !== 'sprinkler' && t !== 'reservoir' && t !== 'windmill') return [];
  const row = t === 'sprinkler' || t === 'windmill';
  const col = t === 'reservoir' || t === 'windmill';
  return fieldCells(state).filter((c) => c !== i && ((row && cellY(c) === cellY(i)) || (col && cellX(c) === cellX(i))));
}

function overnightGrowth(state: GameState): number[] {
  const affected: number[] = [];
  // スプリンクラー・ため池・風車：線の上の作物が毎晩+1
  fieldCells(state).forEach((i) => lineToolCells(state, i).forEach((c) => grow(state, c, 1, affected)));
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

/** 鶏小屋・牛小屋の経験：貯まったら段が上がる */
function animalXp(state: GameState, cell: number): void {
  state.toolLv ??= state.field.map(() => 0);
  if ((state.toolLv[cell] ?? 0) >= CONFIG.animalLvMax) return;
  state.toolXp[cell]++;
  if (state.toolXp[cell] < CONFIG.animalLvNeed) return;
  state.toolXp[cell] = 0;
  state.toolLv[cell] = (state.toolLv[cell] ?? 0) + 1;
  state.notices.push({ kind: 'toolLevel', cell, tool: state.tools[cell]!, lv: state.toolLv[cell] });
  glog(state, `育った ${PLACES[state.tools[cell]!].name} Lv${state.toolLv[cell] + 1} ${cellName(cell)}`);
}

/** お邪魔を追い払ったお礼（大かかしの守りなら多め）。もらった額を返す */
function repelReward(state: GameState, cell: number): number {
  const big = fieldCells(state).some((i) => state.tools[i] === 'bigScarecrow' && Math.abs(cellX(i) - cellX(cell)) <= 2 && Math.abs(cellY(i) - cellY(cell)) <= 2);
  const amount = big ? CONFIG.repelBigGold : CONFIG.repelGold;
  earn(state, amount);
  return amount;
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
    glog(state, `進化 ${PLACES[t].name}→${PLACES[ev.to].name} ${cellName(i)}`);
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
  // トマトの種は最初から必ず候補に入れる（雨・太陽の2択にならないように）
  const ids = [...new Set<AddUpgradeId>(['addSeed', ...state.shop, ...state.pool])].filter((id) => !isRareOffer(id) && !isCutAdd(id));
  // 雨・太陽はよく出る（基本の札）。農家の得意な品はその次
  // 断捨離の代償：仕入れが2択
  const n = CONFIG.dailyOfferCount - (state.charms.declutter > 0 ? 1 : 0);
  const picks = pickWeighted(ids.map((id) => ({ id, w: (CONFIG.offerWeights[id] ?? 1) * (state.shop.includes(id) ? 1.5 : 1) })), n, rng);
  // たまにレア（満月・金の種）が1つ混ざる
  const rares = CONFIG.rareOffers.filter((id) => !isCutAdd(id));
  // 週ごとに品が良くなる：年貢を納めるたびに、レアが混ざりやすくなる（8%→納めた回数×4%ずつ上乗せ）
  if (rares.length && rng() < CONFIG.rareOfferChance + 0.04 * state.taxesPaid) {
    const rare = rares[Math.floor(rng() * rares.length)] as AddUpgradeId;
    picks.splice(Math.min(picks.length, n - 1), 1, rare);
  }
  // ごくまれにスーパーレア（金の札）が1つ混ざる（いちばん左に）
  // 解放したもの（state.pool に入っているもの）だけ
  const supers = CONFIG.superOffers.filter((id) => state.pool.includes(id as AddUpgradeId));
  if (supers.length && rng() < CONFIG.superOfferChance + CONFIG.superOfferStep * state.taxesPaid) {
    const sup = supers[Math.floor(rng() * supers.length)] as AddUpgradeId;
    picks.splice(0, 1, sup);
  }
  return picks;
}

/** レア仕入れ（準備では選べず、毎日の仕入れにたまに混ざる） */
export function isRareOffer(id: UpgradeId): boolean {
  return CONFIG.rareOffers.includes(id) || CONFIG.superOffers.includes(id);
}

/** スーパーレアの仕入れ（金の札） */
export function isSuperOffer(id: UpgradeId): boolean {
  return CONFIG.superOffers.includes(id);
}

/** 仕入れから1つ選んで袋に入れる（タダ）。その日の仕入れは終わり */
function takeOfferRaw(state: GameState, id: AddUpgradeId): boolean {
  if (state.over || !state.offer.includes(id)) return false;
  state.bag[UPGRADE_SYMBOL[id]!.symbol] += UPGRADE_SYMBOL[id]!.delta;
  state.offer = [];
  state.stats.purchases.push({ day: state.day, id, free: true });
  checkReady(state);
  return true;
}

/** 今週の畑の品：ショップで買える道具・特別なマスから weeklyCount 個。1つは作戦が変わる品 */
/** 市に並べられる畑の品か（週ごとに良い品が増える） */
export function placeUnlocked(state: GameState, id: PlaceId): boolean {
  return state.taxesPaid >= (CONFIG.placeTier[id] ?? 0);
}

export function rollWeeklyPlaces(state: GameState, rng: Rng): PlaceId[] {
  // 週ごとに品が良くなる：その週に並び始めた品は出やすい
  const newest = Math.max(0, ...PLACE_ORDER.filter((id) => placeUnlocked(state, id)).map((id) => CONFIG.placeTier[id] ?? 0));
  const weight = (id: PlaceId) => (newest > 0 && (CONFIG.placeTier[id] ?? 0) === newest ? 2.5 : 1);
  const pool = PLACE_ORDER.filter((id) => PLACES[id].price !== null && !CUT.places.includes(id) && placeUnlocked(state, id));
  // 農家の品（牧場主の小屋など）はいつも並び、残りを週替わりで
  const fixed = (FARMERS.find((f) => f.id === state.farmer)?.favorPlaces ?? []).filter((id) => !CUT.places.includes(id));
  if (fixed.length) {
    const rest = pool.filter((id) => !fixed.includes(id));
    return [...fixed, ...pickWeighted(rest.map((id) => ({ id, w: weight(id) })), Math.max(0, CONFIG.weeklyCount - fixed.length), rng)];
  }
  return rollWithPivot(pool.map((id) => ({ id, w: weight(id) })), (id) => isPivotPlace(state, id), rng);
}

// ---- 要らない札を捨てる（市で1回、捨てるたびに高くなる） ----

export function discardPrice(state: GameState): number {
  // 断捨離：半額
  return Math.max(1, Math.round(CONFIG.discardBase * Math.pow(CONFIG.discardGrowth, state.discards ?? 0) * shopMult(state) * (state.charms.declutter > 0 ? 0.5 : 1)));
}

/** 捨てられる札か：お邪魔は「消す」で。袋が6枚より少なくはしない */
export function canDiscard(state: GameState, sym: SymbolId): boolean {
  return !state.over && shopOpen(state) && !state.discardedThisMarket && state.bag[sym] > 0 && SYMBOLS[sym].rarity !== 'bad' && bagTotal(state.bag) > 6 && state.gold >= discardPrice(state);
}

function discardRaw(state: GameState, sym: SymbolId): boolean {
  if (!canDiscard(state, sym)) return false;
  spend(state, discardPrice(state));
  state.bag[sym]--;
  state.discards = (state.discards ?? 0) + 1;
  // 断捨離なら市で2枚まで
  state.discardsThisMarket = (state.discardsThisMarket ?? 0) + 1;
  state.discardedThisMarket = state.discardsThisMarket >= (state.charms.declutter > 0 ? 2 : 1);
  return true;
}

/** 雑草を抜く（草よけのお守りがあれば無料） */
export function weedCost(state: GameState): number {
  return state.charms.bugWard > 0 || state.ura ? 0 : CONFIG.weedPullCost;
}

function pullWeedRaw(state: GameState, cell: number): boolean {
  const cost = weedCost(state);
  if (!state.weeds[cell] || state.gold < cost) return false;
  spend(state, cost);
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
    // 大判振る舞い：大当たり×2
    let jackpot = jackpotAmount(state, count) * (state.charms.bigSpender > 0 ? 2 : 1);
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
  | { type: 'crow'; cell: number | null; crop: Crop | null; eaten: boolean; toll: number; guarded: boolean; pecked?: boolean; reward?: number; banished?: boolean }
  | { type: 'bug'; cell: number | null; warded: boolean; damage: number; hen: boolean; reward?: number }
  | { type: 'coin'; amount: number }
  | { type: 'merchant'; mult: number }
  | { type: 'weed'; cells: number[]; warded: boolean }
  | { type: 'tanuki'; taken: { cell: number; crop: Crop; price: number }[]; escaped: boolean; stolen: number; guarded: number[]; reward?: number }
  | { type: 'frost'; cells: number[] }
  | { type: 'mole'; moves: { from: number; to: number; crop: Crop }[]; chased: number[] }
  | { type: 'locust'; cell: number | null; damage: number; bred: number }
  | { type: 'clover'; boost: number }
  | { type: 'egg'; progress: number; hatched: boolean }
  | { type: 'swallow'; removed: SymbolId | null; amount: number }
  | { type: 'hawk'; removed: boolean; amount: number };

export function crowEatChance(state: GameState, power: number): number {
  const flock = state.contract === 'crowFlock' ? 2 : 1;
  return Math.min(1, (power > 1 ? CONFIG.crowEatChance * CONFIG.crowFeverMultiplier : CONFIG.crowEatChance) * flock);
}

function earn(state: GameState, amount: number): void {
  // 裏：お金はなく、稼いだ額がそのまま妖怪へのダメージ
  if (state.ura) uraHit(state, amount);
  else state.gold += amount;
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
  if (!c || isSpoiled(state, c)) return 0;
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

/** かかしが追い払った：かかしは経験を積む（進化に使う） */
function scared(state: GameState, cell: number): void {
  state.stats.crowsMissed++;
  guardians(state, cell).forEach((g) => state.toolXp[g]++);
  evolveTools(state);
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
    case 'egg': {
      // 卵：出るたびに温まり、eggHatch 回で1つ孵って袋のツバメになる
      state.eggProgress = (state.eggProgress ?? 0) + 1;
      if (state.eggProgress >= CONFIG.eggHatch && state.bag.egg > 0) {
        state.eggProgress = 0;
        state.bag.egg--;
        state.bag.swallow++;
        return { type: 'egg', progress: CONFIG.eggHatch, hatched: true };
      }
      return { type: 'egg', progress: state.eggProgress, hatched: false };
    }
    case 'swallow': {
      // ツバメ：袋の虫（いなければイナゴ）を1枚追い出す。どちらもいなければ+2
      const target = (['bug', 'locust'] as SymbolId[]).find((sym) => state.bag[sym] > 0) ?? null;
      if (target) {
        state.bag[target]--;
        return { type: 'swallow', removed: target, amount: 0 };
      }
      earn(state, 2);
      return { type: 'swallow', removed: null, amount: 2 };
    }
    case 'hawk': {
      // タカ：袋のカラスを1枚追い出す。いなければ+2
      if (state.bag.crow > 0) {
        state.bag.crow--;
        return { type: 'hawk', removed: true, amount: 0 };
      }
      earn(state, 2);
      return { type: 'hawk', removed: false, amount: 2 };
    }
    case 'koban': {
      // 小判：金貨より多く、年貢を納めるたびに増える
      const amount = (12 + 3 * state.taxesPaid + 2 * lv(state, 'coinPurse')) * r.power * (comboOn(state, 'prosperity') ? COMBO_POWER.prosperity : 1);
      earn(state, amount);
      return { type: 'coin', amount };
    }
    case 'mallet':
      // 打出の小槌：今日の売値×2（商人と重ねると足し合わせ）
      state.priceMult += 1 * r.power;
      return { type: 'merchant', mult: state.priceMult };
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
      if (nearHenhouse(state, cell)) {
        // 食べた鶏小屋は経験を積み、お礼が入る
        around(state, cell, 1).filter((i) => state.tools[i] === 'henhouse').forEach((i) => animalXp(state, i));
        // 鶏が虫を食べると、卵が売れた分のお金（henBugGold）
        earn(state, CONFIG.henBugGold);
        return { type: 'bug', cell, warded: true, damage: 0, hen: true, reward: CONFIG.henBugGold };
      }
      // かかしの周りの虫は追い払われる
      if (isGuarded(state, cell)) {
        scared(state, cell);
        return { type: 'bug', cell, warded: true, damage: 0, hen: false, reward: repelReward(state, cell) };
      }
      if (rng() < 1 - Math.pow(0.5, lv(state, 'bugWard'))) return { type: 'bug', cell, warded: true, damage: 0, hen: false };
      const crop = state.field[cell]!;
      // カラスの友の代償：虫の効き目が2倍
      const damage = Math.min(crop.growth, CONFIG.bugDamage * r.power * (state.charms.crowFriend > 0 ? 2 : 1));
      crop.growth -= damage;
      return { type: 'bug', cell, warded: false, damage, hen: false };
    }
    case 'locust': {
      // 袋を荒らすだけ：出るたびに袋の中で増える（残しておくほど袋が薄まる）。畑はかじらない
      const bred = rng() < CONFIG.locustBreedChance ? CONFIG.locustBreed * r.power : 0;
      state.bag.locust += bred;
      return { type: 'locust', cell: null, damage: 0, bred };
    }
    case 'weed': {
      if (rng() < 1 - Math.pow(0.5, lv(state, 'bugWard'))) return { type: 'weed', cells: [], warded: true };
      const cells: number[] = [];
      for (let k = 0; k < r.power; k++) {
        const open = state.field.flatMap((_, i) => (isOpen(state, i) ? [i] : []));
        if (!open.length) break;
        // 作物に囲まれた空きマスに生える（列をふさぐ）
        const c = pickWorst(open, (i) => weedWorth(state, i), rng);
        // かかしの周りには生えない
        if (isGuarded(state, c)) {
          scared(state, c);
          return { type: 'weed', cells, warded: true };
        }
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
        return { type: 'tanuki', taken, escaped: true, stolen: 0, guarded, reward: repelReward(state, guarded[0]) };
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
      const toll = 2 * lv(state, 'crowToll') + 3 * state.charms.crowReturn + (state.charms.crowFriend > 0 ? 3 : 0);
      if (toll) earn(state, toll);
      // 大かかしが畑にあると、カラスが出た日に袋のカラスを1枚追い出す（1日1回）
      const banished = state.bag.crow > 0 && state.crowBanishedDay !== state.day && fieldCells(state).some((i) => state.tools[i] === 'bigScarecrow');
      if (banished) {
        state.bag.crow--;
        state.crowBanishedDay = state.day;
      }
      // カラスの友：作物には手を出さない
      if (state.charms.crowFriend > 0) return { banished, type: 'crow', cell: null, crop: null, eaten: false, toll, guarded: false };
      // かぼちゃは大きくて重いので狙われない
      // かぼちゃ・スイカのような重い作物も狙う（食べられないが、つついて売値を下げる）
      const occupied = state.field.flatMap((c, i) => (c && (c.anchor === undefined) ? [i] : []));
      if (occupied.length === 0) return { banished, type: 'crow', cell: null, crop: null, eaten: false, toll, guarded: false };
      // 一番やられたくない作物を狙う（かかしで守っていれば追い払われる）
      const cell = pickWorst(occupied, (i) => cropWorth(state, i), rng);
      const crop = state.field[cell];
      // かかしの近くは追い払われる
      if (isGuarded(state, cell)) {
        state.stats.crowsMissed++;
        guardians(state, cell).forEach((g) => state.toolXp[g]++);
        evolveTools(state);
        return { banished, type: 'crow', cell, crop, eaten: false, toll, guarded: true, reward: repelReward(state, cell) };
      }
      // 熟成の代償：実った作物はカラスが食べやすい
      if (rng() >= crowEatChance(state, r.power) * (crop && isRipe(crop) && state.charms.aging > 0 ? 1.5 : 1)) {
        state.stats.crowsMissed++;
        return { banished, type: 'crow', cell, crop, eaten: false, toll, guarded: false };
      }
      // 重くて食べられない作物は、つつくだけ（売値−20%、1回まで）
      if (crop && CROPS[crop.kind].crowProof) {
        crop.pecked = true;
        return { banished, type: 'crow', cell, crop, eaten: false, toll, guarded: false, pecked: true };
      }
      removeCrop(state, cell);
      state.stats.cropsEaten++;
      state.stats.crowEaten++;
      // カラス返し：たくさん食べられたらその場でもらえる
      if (!CUT.charms.includes('crowReturn') && state.charms.crowReturn === 0 && state.stats.crowEaten >= EVENT_CONDITIONS.crowReturn) grant(state, 'crowReturn');
      return { banished, type: 'crow', cell, crop, eaten: true, toll, guarded: false };
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
    const boost = (state.bred?.includes(r.symbol) ? 1 : 0) + (cells.some((i) => state.tilled[i]) ? (state.charms.tillMaster ? 2 : 1) : 0) + (comboOn(state, 'sowing') ? 1 : 0) + (state.charms.earlyCrop > 0 ? 1 : 0);
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
    case 'can':
      // じょうろ：1マスに+2
      grow(state, cell!, 2 * r.power, affected);
      return affected;
    case 'raijin':
      shapeCells(state, 'row', cell!).forEach((i) => grow(state, i, (3 + lv(state, 'thunderGod')) * r.power, affected));
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
      shapeCells(state, symbolShape(state, 'thunder')!, cell!).forEach((i) => grow(state, i, (2 + lv(state, 'thunderGod')) * r.power, affected));
      return affected;
    case 'blessRain':
      // 豊穣の雨：畑全部に+1（満月と違い、いつでも使える）
      fieldCells(state).forEach((i) => grow(state, i, r.power, affected));
      state.today.rain.push(...fieldCells(state));
      return affected;
    case 'amaterasu':
      // 天照：縦横の列いっぱいに+2
      shapeCells(state, 'cross', cell!).forEach((i) => grow(state, i, 2 * r.power + state.charms.sunBlessing, affected));
      state.today.sun.push(...shapeCells(state, 'cross', cell!));
      return affected;
    case 'moon':
      fieldCells(state).forEach((i) => grow(state, i, r.power + (comboOn(state, 'moonFeast') ? 1 : 0), affected));
      // 満月を使うと新月に戻る
      state.moonPhase = 0;
      state.moonUsedDay = state.day;
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
/** 周りの巣箱で上がる売値の割合（巣箱+20%・女王蜂の巣箱+50%、牧場なら2倍）。元の売値に掛ける */
export function hiveBonus(state: GameState, cell: number): number {
  const ranch = hasRanch(state) ? 2 : 1;
  return around(state, cell, 1).reduce((n, i) => n + (state.tools[i] === 'hive' ? 0.2 : state.tools[i] === 'queenHive' ? 0.5 : 0), 0) * ranch;
}

/** 列の倍率をかける前の売値。cell を渡すと巣箱・堆肥のマスも効く */
export function cropPrice(state: GameState, crop: Crop, cell?: number): number {
  const def = CROPS[crop.kind];
  // 売値のおまけは元の売値に比例（安い作物ほど得をしないように）。金運・大物狙いはその作物だけなので足し算のまま
  const charm = (def.gold ? 10 * lv(state, 'goldLuck') : def.price * 0.15 * lv(state, 'bumper')) + (def.big ? 50 * lv(state, 'bigGame') : 0);
  const hive = cell === undefined ? 0 : def.price * hiveBonus(state, cell);
  const fert = (crop.fertilized ? CONFIG.fertilizerMultiplier : 1) * (crop.pecked ? 0.8 : 1);
  const tile = cell !== undefined && state.tiles[cell] === 'compost' ? 2 : 1;
  const fair = (1 + CONFIG.exhibitionBonus * state.charms.exhibition) * (isColorful(state) ? 1 + CONFIG.colorfulBonus : 1);
  // 組み合わせ：秋の月（かぼちゃ）・豊年祭（全部）
  const combo = (cropBase(crop.kind) === 'pumpkin' && comboOn(state, 'harvestMoon') ? COMBO_POWER.harvestMoon : 1) * (comboOn(state, 'festival') ? COMBO_POWER.festival : 1);
  // 市の日は高く売れる（市が閉まる週は除く）。牧場主の代償で作物が安くなる
  const marketDay = isMarketDay(state.day) && state.contract !== 'marketClosed' && !state.ura ? CONFIG.marketDaySell : 1;
  // 裏：今の妖怪の弱点の作物はダメージ×weakMult
  const weak = state.ura && state.ura.weak === cropBase(crop.kind) ? URA.weakMult : 1;
  const rancher = Math.max(0.5, 1 - 0.1 * state.charms.rancher);
  // 大きな買い物：豊穣の像は1つにつき売値+10%。早生の代償で売値−25%
  const statue = (1 + 0.1 * (state.premium?.statue ?? 0)) * (state.charms.earlyCrop > 0 ? 0.75 : 1);
  // 秋の実り：かぼちゃ・スイカ+50%、代償で苺・トマト−20%（1つごと）
  const base = cropBase(crop.kind);
  const autumn = lv(state, 'autumnHarvest') ? (base === 'pumpkin' || base === 'watermelon' ? 1 + 0.5 * lv(state, 'autumnHarvest') : base === 'strawberry' || base === 'tomato' ? Math.max(0.5, 1 - 0.2 * lv(state, 'autumnHarvest')) : 1) : 1;
  // 月見の代償：満月を使った日は−20%。大判振る舞いの代償：良い絵柄のフィーバーがない日は−10%
  const moonDay = state.charms.moonViewing > 0 && state.moonUsedDay === state.day && state.day > 0 ? 0.8 : 1;
  const quiet = state.charms.bigSpender > 0 && !state.fever.some((s) => SYMBOLS[s].rarity !== 'bad') ? 0.9 : 1;
  return Math.round((def.price + charm + crop.bonus + hive) * fert * tile * state.priceMult * marketMult(state, crop.kind) * fair * combo * marketDay * rancher * statue * autumn * moonDay * quiet * weak);
}

/** 難しい6：傷んだ作物か（実ってから spoilDays 夜を越した）。売れず、列にも入らない */
export function isSpoiled(state: GameState, crop: Crop): boolean {
  return state.difficulty >= CONFIG.spoilFrom && (crop.ripeDays ?? 0) >= CONFIG.spoilDays;
}

/** 難しい6：傷むまであと何日か（傷まない難しさ・実っていない作物は null） */
export function spoilLeft(state: GameState, crop: Crop): number | null {
  if (state.difficulty < CONFIG.spoilFrom || !isRipe(crop)) return null;
  return Math.max(0, CONFIG.spoilDays - (crop.ripeDays ?? 0));
}

/** 傷んだ作物を捨てる値段 */
export function spoilClearCost(state: GameState): number {
  return state.charms.bugWard > 0 ? 0 : CONFIG.spoilClearCost;
}

/** 傷んだ作物をお金を払って捨てる（雑草を抜くのと同じ形） */
export function clearSpoiled(state: GameState, cell: number): boolean {
  const root = rootOf(state, cell);
  const c = state.field[root];
  const cost = spoilClearCost(state);
  if (state.over || !c || !isSpoiled(state, c) || state.gold < cost) return false;
  spend(state, cost);
  removeCrop(state, root);
  lstat(state, OUT + '傷んだ作物を捨てる', cost);
  glog(state, `傷んだ${CROPS[c.kind].name}を捨てる ${cellName(root)} -${cost}`);
  return true;
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
    return c !== null && isRipe(state.field[c]) && !isSpoiled(state, state.field[c]!) && !state.frost[c] && !CROPS[state.field[c]!.kind].big;
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
  if (!isRipe(state.field[cell]) || isSpoiled(state, state.field[cell]!) || state.frost[cell]) return 0;
  return multSteps(state, cell).reduce((m, s) => m * s.x, 1);
}

/** 倍率の内訳（演出で1つずつ乗せて見せる） */
export function multSteps(state: GameState, cell: number): { label: string; x: number }[] {
  // 大物は1個で売る作物なので、単品でも半値にならない
  if (state.field[cell] && CROPS[state.field[cell]!.kind].big) return [{ label: L('大物', 'Big'), x: 1 }];
  const runs = runsThrough(state, cell);
  if (!runs.length) return [{ label: L('単品', 'Single'), x: singleMult(state) }];
  const steps = [{ label: L('列', 'Line'), x: lineMult(state) }];
  // 長い列ほど高い（4つ・5つ）
  const long = longLineMult(Math.max(...runs.map((r) => r.length)));
  if (long > 1) steps.push({ label: L(`${Math.max(...runs.map((r) => r.length))}つの列`, `${Math.max(...runs.map((r) => r.length))}-long`), x: long });
  if (inSameCropLine(state, cell)) {
    steps.push({ label: L('同じ作物', 'Same crop'), x: CONFIG.sameCropMult });
    // トマト祭り：トマトだけの列はさらに上乗せ
    if (comboOn(state, 'tomatoFest') && state.field[cell]!.kind === 'tomato') steps.push({ label: L('トマト祭り', 'Tomato Fest'), x: COMBO_POWER.cropLine });
    if (comboOn(state, 'flowerField') && cropBase(state.field[cell]!.kind) === 'strawberry') steps.push({ label: L('花畑', 'Flower Field'), x: COMBO_POWER.cropLine });
  }
  if (runs.length > 1 && CONFIG.crossBonus > 0) steps.push({ label: L(`${runs.length}本が交差`, `${runs.length} lines cross`), x: 1 + CONFIG.crossBonus * (runs.length - 1) });
  // 難しい7：同じ作物だけでそろった列を1本も通らないマスは、倍率の上乗せ分が半分
  if (state.difficulty >= CONFIG.mixedFrom && !inSameCropLine(state, cell)) {
    const m = steps.reduce((a, s) => a * s.x, 1);
    if (m > 1) steps.push({ label: L('混ぜた列', 'Mixed line'), x: Math.round(((1 + (m - 1) * CONFIG.mixedKeep) / m) * 100) / 100 });
  }
  return steps;
}

/** 長い列の上乗せ（3つは×1。畑の最大は5なので5で頭打ち） */
export function longLineMult(len: number): number {
  return CONFIG.longLineMult[Math.min(len, 5)] ?? 1;
}

/** 単品の倍率（難しい4では安い） */
export function singleMult(state: GameState): number {
  // 草よけの代償：単品はさらに半分
  return (state.difficulty >= 4 ? 0.3 : CONFIG.singleMult) * (state.charms.bugWard > 0 ? 0.5 : 1) * (state.whim === 'flashy' ? CONFIG.lord.flashySingle : 1);
}

/** 列の倍率（大物狙いの代償で下がる） */
export function lineMult(state: GameState): number {
  // 欲張りで+0.2、大物狙いの代償で−0.2ずつ
  return Math.max(1, CONFIG.lineMult + (state.charms.greedy > 0 ? 0.2 : 0) - 0.2 * state.charms.bigGame);
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
  if (!isRipe(state.field[cell]) || isSpoiled(state, state.field[cell]!) || state.frost[cell]) return [];
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
  if (state.over || !crop || !isRipe(crop) || isSpoiled(state, crop) || frozenCrop(state, cell) || sellBlock(state, cell, single)) return null;
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
  // 大豊作は畑を4×4以上に広げてから（3×3は全部植えるだけでそろってしまう）
  const whole = !single && size >= plantable && size >= 16;
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
  countTaxCond(state, cells.map((c) => c.kind), line);
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

export function upgradePrice(state: GameState, id: UpgradeId, noSale = false): number {
  let base = CONFIG.upgradePrices[id];
  // お邪魔は消すたびに高くなる（全部消して楽になりすぎないように）
  const change = UPGRADE_SYMBOL[id]!;
  // イナゴは増え続けるので、値上がりはゆるやか（払い続ければ抑えられる）
  if (change.delta < 0) base *= Math.pow(change.symbol === 'locust' ? CONFIG.locustRemoveGrowth : CONFIG.removeGrowth, state.removed[change.symbol] ?? 0);
  if (id === 'addMoon') base *= Math.pow(CONFIG.moonGrowth, state.bag.moon);
  const discount = Math.min(0.5, 0.1 * lv(state, 'bargain'));
  return Math.max(1, Math.round(base * (1 - discount) * shopMult(state) * saleMult(state, `up:${id}`, noSale)));
}

export function upgradeAvailable(state: GameState, id: UpgradeId): boolean {
  const change = UPGRADE_SYMBOL[id]!;
  // 毎日の仕入れのときは、ショップで足せる絵柄は満月だけ（ほかは仕入れで）
  if (change.delta > 0) return !CONFIG.dailyPick && state.weekly.includes(id as AddUpgradeId);
  // イナゴを消すのは週1回の数に入らない（増える速さに追いつけるように）
  // お邪魔を消せるのは、イナゴも含めて市で1枚まで
  return state.bag[change.symbol] > 0 && !removeLimitReached(state);
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
  spend(state, upgradePrice(state, id));
  if (onSale(state, `up:${id}`)) state.sale = null;
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
  const has = (sym: SymbolId, add: AddUpgradeId) => state.bag[sym] > 0 || state.shop.includes(add) || state.pool.includes(add);
  if (id === 'autumnHarvest') return has('pumpkinSeed', 'addPumpkinSeed') || has('watermelonSeed', 'addWatermelonSeed');
  if (id === 'thunderGod') return state.bag.thunder > 0 || state.bag.raijin > 0;
  if (id === 'moonViewing') return state.bag.moon > 0;
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

export function expandPrice(state: GameState, noSale = false): number | null {
  const p = CONFIG.expandPrices[state.bought.expand ?? 0];
  if (p === undefined || (state.cols >= CONFIG.fieldCols && state.rows >= CONFIG.fieldRows)) return null;
  // 畑仕事の名人：広げる値段−40%
  return Math.max(1, Math.round(p * (1 - Math.min(0.5, 0.1 * lv(state, 'bargain'))) * shopMult(state) * (state.charms.farmMaster > 0 ? 0.6 : 1) * saleMult(state, 'expand', noSale)));
}

export function canExpand(state: GameState): boolean {
  const p = expandPrice(state);
  return !state.over && shopOpen(state) && p !== null && state.gold >= p;
}

/** 列→行の順に1つ広げる（3×3 → 4×3 → 4×4 → 5×4 → 5×5） */
function expandRaw(state: GameState): boolean {
  if (!canExpand(state)) return false;
  spend(state, expandPrice(state)!);
  if (onSale(state, 'expand')) state.sale = null;
  state.bought.expand = (state.bought.expand ?? 0) + 1;
  if (state.cols <= state.rows) state.cols++;
  else state.rows++;
  return true;
}

// ---- 市の割引：市ごとに1つの品を半額に ----

/** 割引の候補：並んでいる畑の品・袋のお邪魔を消す品・畑を広げる */
function saleCandidates(state: GameState): string[] {
  const out: string[] = [];
  state.weeklyPlaces.forEach((id) => {
    if (PLACES[id].price !== null && roomLeft(state, id) > 0) out.push(`place:${id}`);
  });
  (Object.keys(UPGRADE_SYMBOL) as UpgradeId[]).forEach((id) => {
    if (UPGRADE_SYMBOL[id]!.delta < 0 && state.bag[UPGRADE_SYMBOL[id]!.symbol] > 0) out.push(`up:${id}`);
  });
  if (expandPrice(state, true) !== null) out.push('expand');
  return out;
}

/**
 * 市の日の朝に、割引の品を1つ決める。
 * ゲームの乱数を使うと、そのあとの出目が全部ずれるので、その回の番号と日付から決める
 */
function rollSale(state: GameState): void {
  const c = saleCandidates(state);
  if (!c.length) {
    state.sale = null;
    return;
  }
  let h = state.day * 2654435761;
  for (const ch of state.runId ?? '') h = Math.imul(h ^ ch.charCodeAt(0), 2246822519);
  state.sale = { key: c[Math.abs(h) % c.length], day: state.day };
}

/** 割引の品の名前（記録用） */
function saleName(key: string): string {
  const [kind, id] = key.split(':');
  if (kind === 'place') return PLACES[id as PlaceId].name;
  if (kind === 'up') return `消す:${SYMBOLS[UPGRADE_SYMBOL[id as UpgradeId]!.symbol].name}`;
  return '広げる';
}

/** その品が今日の市の割引か */
export function onSale(state: GameState, key: string): boolean {
  return !!state.sale && state.sale.key === key && state.sale.day === state.day;
}

const saleMult = (state: GameState, key: string, noSale: boolean): number => (!noSale && onSale(state, key) ? CONFIG.saleRate : 1);

/** noSale：割引の前の値段（札に打ち消し線で出す） */
export function placePrice(state: GameState, id: PlaceId, noSale = false): number | null {
  const base = PLACES[id].price;
  if (base === null) return null;
  const p = base * Math.pow(CONFIG.placeGrowth, state.bought[id] ?? 0);
  // 畑仕事の名人の代償：置き物+40%
  return Math.max(1, Math.round(p * (1 - Math.min(0.5, 0.1 * lv(state, 'bargain'))) * shopMult(state) * (state.charms.farmMaster > 0 && PLACES[id].kind === 'tool' ? 1.4 : 1) * saleMult(state, `place:${id}`, noSale)));
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
  spend(state, placePrice(state, id)!);
  if (onSale(state, `place:${id}`)) state.sale = null;
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
  // 建物は、特別なマスの上にも置ける。作物があっても置ける（作物はどける。大物は除く）
  if (PLACES[id].kind === 'tool') return isOpen(state, cell) || (!!state.field[cell] && !CROPS[state.field[cell]!.kind].big && state.field[cell]!.anchor === undefined && !state.weeds[cell] && !state.frost[cell] && !isFlooded(state, cell));
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
  if (PLACES[id].kind === 'tool') {
    // 作物があればどける
    state.field[cell] = null;
    state.tools[cell] = id;
    state.toolXp[cell] = 0;
    if (state.toolLv) state.toolLv[cell] = 0;
  } else state.tiles[cell] = id;
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
  let m = lineMult(state) * longLineMult(Math.max(...runs.map((r) => r.length)));
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

/** 集計に足す（収入はプラス、支出・被害は名前で分ける） */
function lstat(state: GameState, key: string, n: number): void {
  if (!n) return;
  state.logStats ??= { week: {}, total: {} };
  const st = state.logStats;
  st.week[key] = (st.week[key] ?? 0) + n;
  st.total[key] = (st.total[key] ?? 0) + n;
}

const IN = '収入:';
const OUT = '支出:';
const LOSS = '被害:';
/** 集計を「収入+X（内訳） 支出-Y（内訳） 被害（内訳）」の1行に */
function statLine(m: Record<string, number>): string {
  const part = (pre: string): [number, string] => {
    const e = Object.entries(m).filter(([k]) => k.startsWith(pre)).sort((a, b) => b[1] - a[1]);
    return [e.reduce((a, [, v]) => a + v, 0), e.map(([k, v]) => `${k.slice(pre.length)}${v}`).join(' ')];
  };
  const [inn, ind] = part(IN);
  const [out, outd] = part(OUT);
  const [, lossd] = part(LOSS);
  return `収入+${inn}（${ind || 'なし'}） 支出-${out}（${outd || 'なし'}）${lossd ? ` 被害（${lossd}）` : ''}`;
}

const GROW_SYMS: SymbolId[] = ['rain', 'sun', 'bee', 'thunder', 'can', 'moon', 'bigRain', 'bigSun', 'raijin', 'queenBee'];
const PEST_SYMS: SymbolId[] = ['crow', 'bug', 'weed', 'tanuki', 'frost', 'mole', 'locust'];
/** 袋を「種・育てる・お邪魔・ほか」の数と内訳で */
function bagLine(state: GameState): string {
  const has = SYMBOL_ORDER.filter((s) => state.bag[s] > 0);
  const n = (f: (s: SymbolId) => boolean): number => has.filter(f).reduce((a, s) => a + state.bag[s], 0);
  const seed = n((s) => !!SEEDS[s]);
  const grow = n((s) => GROW_SYMS.includes(s));
  const pest = n((s) => PEST_SYMS.includes(s));
  return `袋${bagTotal(state.bag)}枚（種${seed} 育てる${grow} お邪魔${pest} ほか${bagTotal(state.bag) - seed - grow - pest}）: ${has.map((s) => `${SYMBOLS[s].name}${state.bag[s]}`).join(' ')}`;
}

/** 畑の数のまとめ（空き・育ち中・実り・雑草・霜） */
function fieldLine(state: GameState): string {
  let empty = 0, growing = 0, ripe = 0, weeds = 0, frost = 0, nearly = 0;
  for (let y = 0; y < state.rows; y++)
    for (let x = 0; x < state.cols; x++) {
      const i = y * CONFIG.fieldCols + x;
      const c = state.field[i];
      if (state.weeds[i]) weeds++;
      if (state.frost[i]) frost++;
      if (!c) {
        if (!state.weeds[i] && !state.tools[i]) empty++;
        continue;
      }
      if (c.anchor !== undefined) continue;
      if (isRipe(c)) ripe++;
      else {
        growing++;
        if (CROPS[c.kind].ripe - c.growth === 1) nearly++;
      }
    }
  return `畑 空き${empty} 育ち中${growing}（あと1:${nearly}） 実り${ripe}${weeds ? ` 雑草${weeds}` : ''}${frost ? ` 霜${frost}` : ''}`;
}

/** 市が開いたときの並びと値段 */
export function logMarket(state: GameState): void {
  if (!shopOpen(state) || !isMarketDay(state.day)) return;
  const ups = (Object.keys(UPGRADE_SYMBOL) as UpgradeId[]).filter((id) => upgradeAvailable(state, id));
  const name = (id: UpgradeId): string => SYMBOLS[UPGRADE_SYMBOL[id]!.symbol].name;
  const add = ups.filter((id) => UPGRADE_SYMBOL[id]!.delta > 0).map((id) => `${name(id)}${upgradePrice(state, id)}`);
  const rem = ups.filter((id) => UPGRADE_SYMBOL[id]!.delta < 0).map((id) => `${name(id)}${upgradePrice(state, id)}`);
  const places = state.weeklyPlaces.map((id) => `${PLACES[id].name}${placePrice(state, id) ?? '×'}`);
  const ex = expandPrice(state);
  const prem = premiumShown(state) ? PREMIUM_ORDER.map((id) => `${PREMIUM[id].name}${premiumPrice(state, id) ?? '×'}`) : [];
  const merge = mergeable(state).map((s) => `${SYMBOLS[s].name}→${SYMBOLS[MERGES[s]!].name}`);
  glog(state, `市 所持${state.gold}${state.offer.length ? ` 仕入れ候補:${state.offer.map((o) => SYMBOLS[UPGRADE_SYMBOL[o]!.symbol].name).join('/')}` : ''}${add.length ? ` 足す:${add.join(' ')}` : ''}${rem.length ? ` 消す:${rem.join(' ')}` : ' 消す:なし'} 道具:${places.join(' ') || 'なし'}${ex !== null ? ` 広げる${ex}` : ''}${prem.length ? ` 大きな:${prem.join(' ')}` : ''}${merge.length ? ` 合体できる:${merge.join(' ')}(-${mergeCost(state)})` : ''}${state.sale?.day === state.day ? ` 半額:${saleName(state.sale.key)}` : ''}`);
}

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
  lstat(state, IN + '余った出目', res.seedGold ?? 0);
  if (state.nightIncome) lstat(state, IN + '夜の収入', state.nightIncome.wheel + state.nightIncome.fish + state.nightIncome.animals);
  if (state.day > 0) glog(state, `夜 所持${state.gold}${res.seedGold ? ` 余った出目+${res.seedGold}` : ''}${expiredNames.length ? ` 使わず消えた:${expiredNames.join('・')}` : ''}${state.nightIncome && state.nightIncome.wheel + state.nightIncome.fish + state.nightIncome.animals ? ` 夜の収入+${state.nightIncome.wheel + state.nightIncome.fish + state.nightIncome.animals}` : ''}`);
  if (res.tax !== null) {
    glog(state, res.ok ? `年貢${state.taxesPaid}回目 ${res.tax}を払った（${before}→${state.gold}）${state.lastObstacles.length ? ` お邪魔+${state.lastObstacles.map((o) => SYMBOLS[o].name).join('・')}` : ''}${res.cleared ? ' ★クリア' : ''}` : `年貢 ${res.tax}が払えず終わり（所持${state.gold}）`);
    if (state.logStats) {
      glog(state, `週のまとめ ${statLine(state.logStats.week)}`);
      state.logStats.week = {};
    }
    if (state.charmOffer) glog(state, `お守り候補 ${state.charmOffer.map((id) => CHARMS[id].name).join('/')}`);
  }
  return res;
}

export function spinDay(state: GameState, rng: Rng): void {
  const g0 = state.gold;
  const bl = bagLine(state);
  state.logStats ??= { week: {}, total: {} };
  if (state.logStats.bag !== bl) {
    glog(state, bl);
    state.logStats.bag = bl;
  }
  glog(state, fieldLine(state));
  spinDayRaw(state, rng);
  lstat(state, IN + '回した時', state.gold - g0);
  const r = state.results.map((x) => `${SYMBOLS[x.symbol].name}${x.total > 1 ? `×${x.total}` : ''}${x.fog === 'lost' ? '(霧で使えない)' : ''}`).join(' / ');
  glog(state, `回す 所持${state.gold} 出目: ${r}${state.fever.length ? ` フィーバー:${state.fever.map((f) => SYMBOLS[f].name).join('・')}` : ''}${state.combos.length ? ` 組み合わせ:${state.combos.map((c) => CHARMS[c].name).join('・')}` : ''}`);
}

export function discard(state: GameState, sym: SymbolId): boolean {
  const price = discardPrice(state);
  const ok = discardRaw(state, sym);
  if (ok) lstat(state, OUT + '捨てる', price);
  if (ok) glog(state, `捨てる ${SYMBOLS[sym].name} -${price}`);
  return ok;
}

export function mergeSymbol(state: GameState, sym: SymbolId): boolean {
  const cost = mergeCost(state);
  const ok = mergeSymbolRaw(state, sym);
  if (ok) lstat(state, OUT + '合体', cost);
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
  if (ok) lstat(state, OUT + '草むしり', cost);
  if (ok) glog(state, `草むしり ${cellName(cell)} -${cost}`);
  return ok;
}

export function resolveFever(state: GameState, rng: Rng): FeverEvent[] {
  const g0 = state.gold;
  const ev = resolveFeverRaw(state, rng);
  lstat(state, IN + 'フィーバー', state.gold - g0);
  ev.forEach((e) => glog(state, `フィーバー ${SYMBOLS[e.symbol].name}×${e.count} 役:${e.role} 大当たり+${e.jackpot}${e.role === 'honey' ? ` はちみつ+${e.amount}` : ''}`));
  return ev;
}

export function resolveAuto(state: GameState, reel: number, rng: Rng): AutoEvent | null {
  const sym = state.results[reel]?.symbol;
  const g0 = state.gold;
  const ev = resolveAutoRaw(state, reel, rng);
  if (!ev || !sym) return ev;
  const rw = 'reward' in ev ? (ev.reward ?? 0) : 0;
  const henAte = ev.type === 'bug' && ev.hen;
  lstat(state, IN + (henAte ? '鶏が虫を食べた' : '追い払い'), rw);
  const dg = state.gold - g0 - rw;
  if (dg > 0) lstat(state, IN + SYMBOLS[sym].name, dg);
  if (dg < 0) lstat(state, LOSS + SYMBOLS[sym].name + 'のお金', -dg);
  if (ev.type === 'crow' && ev.crop && (ev.eaten || ev.pecked)) {
    lstat(state, LOSS + 'カラス(個)', ev.eaten ? 1 : 0);
    lstat(state, LOSS + 'カラス(値)', ev.eaten ? CROPS[ev.crop.kind].price : Math.round(CROPS[ev.crop.kind].price * 0.2));
  }
  if (ev.type === 'bug' && ev.cell !== null && !ev.warded) lstat(state, LOSS + '虫(成長)', ev.damage);
  if (ev.type === 'locust') lstat(state, LOSS + 'イナゴ(袋+)', ev.bred);
  if (ev.type === 'tanuki') lstat(state, LOSS + 'タヌキ(値)', ev.taken.reduce((a, x) => a + x.price, 0));
  if (ev.type === 'weed' && !ev.warded) lstat(state, LOSS + '雑草(マス)', ev.cells.length);
  let t = '';
  switch (ev.type) {
    case 'coin': t = `+${ev.amount}`; break;
    case 'crow': t = ev.cell === null ? (state.charms.crowFriend > 0 ? `カラスの友で食べない +${ev.toll}` : '狙う作物なし') : ev.guarded ? `かかしで追い払った ${cellName(ev.cell)}` : ev.eaten ? `${cropName(ev.crop)}を食べた ${cellName(ev.cell)}（売値${ev.crop ? CROPS[ev.crop.kind].price : 0}）` : ev.pecked ? `${cropName(ev.crop)}をつついた −20% ${cellName(ev.cell)}` : `外れ ${cellName(ev.cell)}`;
      if (ev.banished) t += '・大かかしが袋のカラスを追い出した';
      break;
    case 'bug': t = ev.cell === null ? '作物なし' : ev.warded ? `防いだ ${cellName(ev.cell)}` : `成長-${ev.damage} ${cellName(ev.cell)}`; break;
    case 'weed': t = ev.warded ? '防いだ' : ev.cells.length ? `生えた ${ev.cells.map(cellName).join('')}` : '生える所なし'; break;
    case 'tanuki': t = `盗んだ${ev.stolen} ${ev.taken.map((x) => cropName(x.crop)).join('・')}`; break;
    case 'frost': t = `凍った ${ev.cells.map(cellName).join('')}`; break;
    case 'mole': t = `押し出し${ev.moves.length}`; break;
    case 'locust': t = ev.bred ? `袋で+${ev.bred}（袋に${state.bag.locust}匹）` : '増えなかった'; break;
    case 'merchant': t = `売値×${ev.mult}`; break;
    case 'clover': t = `明日の金の種×${ev.boost}`; break;
    case 'egg': t = ev.hatched ? '孵ってツバメになった' : `孵化 ${ev.progress}/${CONFIG.eggHatch}`; break;
    case 'swallow': t = ev.removed ? `${SYMBOLS[ev.removed].name}を追い出した` : `+${ev.amount}`; break;
    case 'hawk': t = ev.removed ? 'カラスを追い出した' : `+${ev.amount}`; break;
  }
  glog(state, `自動 ${SYMBOLS[sym].name}: ${t}${rw ? (henAte ? ` 鶏が食べた+${rw}` : ` 追い払いのお礼+${rw}`) : ''}`);
  return ev;
}

export function useSymbol(state: GameState, reel: number, cell: number | null): number[] | null {
  const sym = state.results[reel]?.symbol;
  const g0 = state.gold;
  const res = useSymbolRaw(state, reel, cell);
  if (res && sym) lstat(state, IN + SYMBOLS[sym].name, state.gold - g0);
  if (res && sym) glog(state, SEEDS[sym] ? `植える ${CROPS[SEEDS[sym]!.crop].name} ${cell === null ? '' : cellName(cell)}` : `使う ${SYMBOLS[sym].name} ${cell === null ? '畑全体' : cellName(cell)} 効いたマス${res.length}`);
  return res;
}

export function sell(state: GameState, cell: number, single = false): SellResult | null {
  // 記録用：売る前に、実ってから何夜たったか（一番長いもの）と、傷んだ数を見ておく
  const before = (single ? [rootOf(state, cell)] : harvestGroup(state, rootOf(state, cell))).map((c) => state.field[c]).filter((c): c is Crop => !!c);
  const ripeMax = Math.max(0, ...before.map((c) => c.ripeDays ?? 0));
  const res = sellRaw(state, cell, single);
  if (res) {
    lstat(state, IN + (res.line ? '列で売る' : single ? '大商い' : '単品'), res.total - res.orderReward - res.bumper);
    lstat(state, IN + '注文', res.orderReward);
    lstat(state, IN + '大豊作', res.bumper);
    const kinds = [...new Set(res.cells.map((c) => CROPS[c.kind].name))].join('・');
    glog(state, `売る ${kinds}×${res.size} ${res.line ? `列×${Math.round(res.mult * 100) / 100}` : single ? '大商い' : '単品'} +${res.total}${res.orderReward ? ` 注文達成+${res.orderReward}` : ''}${res.bumper ? ` 大豊作+${res.bumper}` : ''}${ripeMax ? ` 実って${ripeMax}日` : ''}`);
  }
  return res;
}

export function buy(state: GameState, id: UpgradeId): boolean {
  const price = upgradePrice(state, id);
  const ok = buyRaw(state, id);
  if (ok) lstat(state, OUT + (UPGRADE_SYMBOL[id]!.delta < 0 ? '消す' : '足す'), price);
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
  if (ok) lstat(state, OUT + '広げる', price ?? 0);
  if (ok) glog(state, `畑を広げる ${state.cols}×${state.rows} -${price}`);
  return ok;
}

export function buyPlace(state: GameState, id: PlaceId): boolean {
  const price = placePrice(state, id);
  const ok = buyPlaceRaw(state, id);
  if (ok) lstat(state, OUT + '道具', price ?? 0);
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
  if (state.logStats) out.push(`通しの集計: ${statLine(state.logStats.total)}`);
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
  /** 進み具合（0〜100。クリアで100） */
  progress: number;
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
  // うまさの平均に、どこまで進んだかを掛ける（負けたら高い評価にはならない）。クリアなら×1
  const progress = state.cleared ? 1 : Math.min(1, state.taxesPaid / CONFIG.winTaxes);
  const skill = parts.reduce((n, p) => n + p.value, 0) / parts.length;
  const score = Math.round(skill * (0.2 + 0.8 * progress));
  const rank = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
  return { score, rank, parts, progress: Math.round(progress * 100) };
}

// ---- 大きな買い物（後半の市だけ。お金の使い道） ----

export type PremiumId = 'statue' | 'reel';
export const PREMIUM: Record<PremiumId, { name: string; desc: string; price: number; growth: number; max: number; art: string }> = {
  statue: { name: L('豊穣の像', 'Harvest Statue'), desc: L('売値+10%', 'Prices +10%'), price: 120, growth: 1.6, max: 3, art: 'trophy' },
  reel: { name: L('からくりリール', 'Clockwork Reel'), desc: L('リール+1', 'Reel +1'), price: 240, growth: 1, max: 1, art: 'artisan' },
};
export const PREMIUM_ORDER: PremiumId[] = ['statue', 'reel'];
/** 大きな買い物が並ぶのは、この回数の年貢を納めたあと（4週目）から */
export const PREMIUM_FROM = 3;

export function premiumShown(state: GameState): boolean {
  return state.taxesPaid >= PREMIUM_FROM;
}

/** 値段（売り切れ・並ばないなら null） */
export function premiumPrice(state: GameState, id: PremiumId): number | null {
  const p = PREMIUM[id];
  const n = state.premium?.[id] ?? 0;
  if (n >= p.max) return null;
  if (id === 'reel' && state.reels >= CONFIG.maxReels) return null;
  return Math.round(p.price * Math.pow(p.growth, n) * shopMult(state));
}

export function canBuyPremium(state: GameState, id: PremiumId): boolean {
  const price = premiumPrice(state, id);
  return !state.over && shopOpen(state) && premiumShown(state) && price !== null && state.gold >= price;
}

export function buyPremium(state: GameState, id: PremiumId): boolean {
  if (!canBuyPremium(state, id)) return false;
  const price = premiumPrice(state, id)!;
  spend(state, price);
  state.premium = { ...state.premium, [id]: (state.premium?.[id] ?? 0) + 1 };
  if (id === 'reel') state.reels = Math.min(CONFIG.maxReels, state.reels + 1);
  lstat(state, OUT + '大きな買い物', price);
  glog(state, `大きな買い物 ${PREMIUM[id].name} -${price}`);
  return true;
}

// ---- 殿様モード：年貢の条件と殿様の気まぐれ ----

const weekOf = (day: number) => Math.ceil(day / CONFIG.taxPeriod);
const pick = <T>(list: T[], rng: Rng): T => list[Math.floor(rng() * list.length)];

/** 袋で育てられる作物（元の作物で数える） */
function bagCrops(state: GameState): CropKind[] {
  const out: CropKind[] = [];
  SYMBOL_ORDER.forEach((id) => {
    const s = SEEDS[id];
    if (s && state.bag[id] > 0 && !out.includes(cropBase(s.crop))) out.push(cropBase(s.crop));
  });
  return out;
}

/** その週の年貢の条件を作る（作れなければ null） */
export function makeTaxCond(state: GameState, kind: TaxCondKind, week: number, rng: Rng): TaxCond | null {
  const crops = bagCrops(state);
  switch (kind) {
    case 'crop': {
      if (!crops.length) return null;
      const crop = pick(crops, rng);
      const cheap = CROPS[crop].price <= 8;
      return { kind, crop, need: cheap ? 2 + week : 1 + Math.floor(week / 3), got: 0 };
    }
    case 'line':
      return { kind, need: 1 + Math.floor(week / 3), got: 0 };
    case 'sameLine':
      return { kind, need: 1 + Math.floor(week / 5), got: 0 };
    case 'big':
      return crops.some((c) => c === 'pumpkin' || c === 'watermelon') ? { kind, need: 1, got: 0 } : null;
    case 'keep':
      return { kind, need: 2 + Math.floor(week / 3), got: 0 };
  }
}

/** 月曜の朝：今週の年貢の条件と気まぐれを決める */
export function rollLordWeek(state: GameState, rng: Rng): void {
  const lvl = Math.max(0, Math.min(3, state.lordLevel));
  const week = weekOf(state.day);
  const L2 = CONFIG.lord;
  const condOn = week > CONFIG.winTaxes ? lvl >= L2.endlessCond : L2.condWeeks[lvl].includes(week);
  state.taxCond = null;
  if (condOn) {
    // 作れない条件（袋に大物の種がないなど）は、ほかの種類で作り直す
    const kinds = [...L2.kinds[lvl]];
    while (kinds.length && !state.taxCond) {
      const k = kinds.splice(Math.floor(rng() * kinds.length), 1)[0];
      state.taxCond = makeTaxCond(state, k, week, rng);
    }
  }
  // 気まぐれは止めている間は出さない（CONFIG.lord.whimsOn）
  state.whim = L2.whimsOn && week <= CONFIG.winTaxes && L2.whimWeeks[lvl].includes(week) ? pick(L2.whims[lvl], rng) : null;
  if (state.taxCond || state.whim) glog(state, `殿様 今週 ${lordSummary(state)}`);
}

/** 条件の今の数（日曜に残すは、今の畑の実り） */
export function taxCondGot(state: GameState): number {
  const c = state.taxCond;
  if (!c) return 0;
  if (c.kind === 'keep') return fieldCells(state).filter((i) => state.field[i] && !state.field[i]!.anchor && isRipe(state.field[i]!)).length;
  return c.got;
}

/** 豊作を見たい：畑の半分に作物が植わっているか */
export function harvestShown(state: GameState): { planted: number; need: number } {
  const cells = fieldCells(state).filter((i) => !state.tools[i]);
  return { planted: cells.filter((i) => state.field[i]).length, need: Math.ceil(cells.length / 2) };
}

/** 年貢が何割増えるか（条件に届いていない分と、豊作を見たい） */
export function lordPenalty(state: GameState): number {
  if (!state.lordLevel) return 0;
  let p = 0;
  const c = state.taxCond;
  if (c) p += Math.min(CONFIG.lord.condMax, CONFIG.lord.condStep * Math.max(0, c.need - taxCondGot(state)));
  if (state.whim === 'harvest') {
    const h = harvestShown(state);
    if (h.planted < h.need) p += CONFIG.lord.harvestPenalty;
  }
  return p;
}

/** 売ったときに条件を数える */
function countTaxCond(state: GameState, kinds: CropKind[], line: boolean): void {
  const c = state.taxCond;
  if (!c) return;
  const base = kinds.map(cropBase);
  if (c.kind === 'crop') c.got += base.filter((k) => k === c.crop).length;
  if (c.kind === 'line' && line) c.got++;
  if (c.kind === 'sameLine' && line && base.every((k) => k === base[0])) c.got++;
  if (c.kind === 'big') c.got += base.filter((k) => k === 'pumpkin' || k === 'watermelon').length;
}

/** 見回り：実った一番高い作物を1つ持っていく（かかしの周りは守られる） */
function patrolNight(state: GameState): void {
  const ripe = fieldCells(state).filter((i) => {
    const c = state.field[i];
    return c && !c.anchor && isRipe(c) && !isGuarded(state, i);
  });
  if (!ripe.length) return;
  const cell = ripe.reduce((a, b) => (cropPrice(state, state.field[b]!, b) > cropPrice(state, state.field[a]!, a) ? b : a));
  glog(state, `殿様 見回りが${CROPS[state.field[cell]!.kind].name}を持っていった (${cellX(cell) + 1},${cellY(cell) + 1})`);
  removeCrop(state, cell);
}

const WHIM_NAMES: Record<WhimId, string> = { frugal: '質素倹約', flashy: '派手好き', patrol: '見回り', harvest: '豊作を見たい' };
/** ログ用のひと言 */
export function lordSummary(state: GameState): string {
  const c = state.taxCond;
  const cond = c ? `条件:${c.kind}${c.crop ? '=' + CROPS[c.crop].name : ''} ${taxCondGot(state)}/${c.need}` : '';
  return [cond, state.whim ? `気まぐれ:${WHIM_NAMES[state.whim]}` : ''].filter(Boolean).join(' ');
}

// ---- 難しい8・9：置き物の維持費・持ち越せるお金の上限 ----

/** 難しい8：毎週の年貢に乗る置き物の維持費（置いた道具1つにつき、値段×upkeepRate） */
export function upkeep(state: GameState): number {
  if (state.difficulty < CONFIG.upkeepFrom) return 0;
  return fieldCells(state).reduce((n, i) => {
    const id = state.tools[i];
    return id ? n + Math.round((PLACES[id].price ?? CONFIG.upkeepFree) * CONFIG.upkeepRate) : n;
  }, 0);
}

/** 難しい9：年貢を払ったあとに持ち越せるお金（次の年貢の額×carryCapMult） */
export function carryCap(state: GameState): number {
  return Math.round(nextTax(state).amount * CONFIG.carryCapMult);
}

// ---- 裏（妖怪退治） ----
// 週もノルマもない。稼いだ額（作物の売上など）がそのまま妖怪へのダメージ（earn）。
// 妖怪ごとに回転の期限があり、期限までに倒せなければ負け。2回転ごとに妨害（1回転前に予告）。
// 倒すと3択（種・絵柄・お守り・置き物・畑を広げる・お邪魔を払う）から1つ。最後の大蛇を倒せばクリア

export interface UraState {
  level: number;
  /** 今の妖怪（URA.order の何番目か） */
  idx: number;
  foe: YokaiId;
  hp: number;
  maxHp: number;
  /** 残りの回転（夜を越すたびに1減る） */
  turnsLeft: number;
  limit: number;
  /** 今の弱点の作物（大蛇は入れ替わる） */
  weak: CropKind;
  /** 次の妨害と、それまでの回転 */
  harass: HarassId;
  harassIn: number;
  /** 倒したあとの3択（選ぶまで次の妖怪は来ない） */
  reward: UraReward[] | null;
  /** 最後の大蛇を倒した */
  won: boolean;
  /** 倒した数・最後の妨害（演出と記録用） */
  defeated: number;
  lastHarass: { id: HarassId; cells: number[] } | null;
}

export type UraReward =
  | { kind: 'seed'; sym: SymbolId; n: number }
  | { kind: 'symbol'; sym: SymbolId; n: number }
  | { kind: 'charm'; id: CharmId }
  | { kind: 'place'; id: PlaceId }
  | { kind: 'expand' }
  | { kind: 'clean'; n: number };

/** 作物の種の絵柄 */
function seedOf(kind: CropKind): SymbolId {
  return ((Object.keys(SEEDS) as SymbolId[]).find((id) => SEEDS[id]!.crop === kind) ?? 'seed') as SymbolId;
}

/** 段に合わせた体力（いまは裏1だけ） */
const uraHp = (def: (typeof YOKAI)[YokaiId], level: number): number => Math.round(def.hp * (1 + 0.25 * (level - 1)));

function spawnFoe(state: GameState, idx: number): void {
  const u = state.ura!;
  const id = URA.order[Math.min(idx, URA.order.length - 1)];
  const def = YOKAI[id];
  u.idx = idx;
  u.foe = id;
  u.maxHp = u.hp = uraHp(def, u.level);
  u.limit = u.turnsLeft = def.limit;
  u.weak = def.weak === 'rotate' ? URA.rotateKinds[0] : def.weak;
  u.harass = def.harass[0];
  u.harassIn = URA.firstHarass;
  glog(state, `裏 ${def.name}が来た 体力${u.hp} 期限${u.limit}回転 弱点:${CROPS[u.weak].name}`);
}

export function startUra(state: GameState, level: number): void {
  state.ura = { level, idx: 0, foe: URA.order[0], hp: 0, maxHp: 0, turnsLeft: 0, limit: 0, weak: 'tomato', harass: 'pests', harassIn: URA.harassEvery, reward: null, won: false, defeated: 0, lastHarass: null };
  state.order = null;
  (Object.entries(URA.startBag) as [SymbolId, number][]).forEach(([sym, n]) => (state.bag[sym] = (state.bag[sym] ?? 0) + n));
  spawnFoe(state, 0);
}

/** 稼いだ額で妖怪をたたく（earn から呼ぶ） */
function uraHit(state: GameState, amount: number): void {
  const u = state.ura;
  if (!u || u.reward || u.won || u.hp <= 0 || amount <= 0) return;
  u.hp = Math.max(0, u.hp - amount);
  if (u.hp > 0) return;
  u.defeated++;
  glog(state, `裏 ${YOKAI[u.foe].name}を倒した（残り${u.turnsLeft}回転）`);
  if (YOKAI[u.foe].boss || u.idx >= URA.order.length - 1) {
    u.won = true;
    state.cleared = true;
    return;
  }
  u.reward = rollUraReward(state);
}

/** 倒したあとの3択：①次の妖怪の弱点の種 ②置き物・畑を広げる・お守り ③育てる絵柄・お邪魔を払う・お守り */
export function rollUraReward(state: GameState): UraReward[] {
  const r = () => nextRand(state);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  const next = YOKAI[URA.order[Math.min(state.ura!.idx + 1, URA.order.length - 1)]];
  const nextWeak = next.weak === 'rotate' ? URA.rotateKinds[0] : next.weak;
  const out: UraReward[] = [{ kind: 'seed', sym: seedOf(nextWeak), n: CROPS[nextWeak].big || SEEDS[seedOf(nextWeak)]?.single ? 2 : 3 }];
  const places = PLACE_ORDER.filter((id) => PLACES[id].price !== null && roomLeft(state, id) > 0);
  const charms = rollCharmOffer(state, r).filter((id) => state.charms[id] < CHARMS[id].max);
  const canExpand = !(state.cols >= CONFIG.fieldCols && state.rows >= CONFIG.fieldRows);
  const second: UraReward[] = [...(places.length ? [{ kind: 'place', id: pick(places) } as UraReward] : []), ...(canExpand ? [{ kind: 'expand' } as UraReward] : []), ...(charms[0] ? [{ kind: 'charm', id: charms[0] } as UraReward] : [])];
  out.push(second.length ? pick(second) : { kind: 'symbol', sym: 'rain', n: 2 });
  const pests = (Object.keys(state.bag) as SymbolId[]).filter((id) => SYMBOLS[id]?.rarity === 'bad' && state.bag[id] > 0);
  const grow = (['rain', 'sun', 'thunder', 'can', 'fertilizer'] as SymbolId[]).filter((id) => id in state.bag);
  const third: UraReward[] = [{ kind: 'symbol', sym: pick(grow), n: 2 }, ...(pests.length ? [{ kind: 'clean', n: 2 } as UraReward] : []), ...(charms[1] ? [{ kind: 'charm', id: charms[1] } as UraReward] : [])];
  out.push(pick(third));
  return out;
}

/** 3択から1つ受け取り、次の妖怪を呼ぶ */
export function takeUraReward(state: GameState, index: number): boolean {
  const u = state.ura;
  const rw = u?.reward?.[index];
  if (!u || !rw) return false;
  if (rw.kind === 'seed' || rw.kind === 'symbol') state.bag[rw.sym] = (state.bag[rw.sym] ?? 0) + rw.n;
  else if (rw.kind === 'charm') {
    state.charmOffer = [rw.id];
    chooseCharm(state, rw.id);
  } else if (rw.kind === 'place') state.stock.push(rw.id);
  else if (rw.kind === 'expand') {
    if (state.cols <= state.rows) state.cols = Math.min(CONFIG.fieldCols, state.cols + 1);
    else state.rows = Math.min(CONFIG.fieldRows, state.rows + 1);
    state.bought.expand = (state.bought.expand ?? 0) + 1;
  } else if (rw.kind === 'clean') {
    for (let k = 0; k < rw.n; k++) {
      const pests = (Object.keys(state.bag) as SymbolId[]).filter((id) => SYMBOLS[id]?.rarity === 'bad' && state.bag[id] > 0).sort((a, b) => state.bag[b] - state.bag[a]);
      if (pests[0]) state.bag[pests[0]]--;
    }
  }
  glog(state, `裏 ごほうび ${uraRewardName(rw)}`);
  u.reward = null;
  spawnFoe(state, u.idx + 1);
  return true;
}

/** ごほうびの名前（記録用） */
export function uraRewardName(rw: UraReward): string {
  switch (rw.kind) {
    case 'seed':
    case 'symbol':
      return `${SYMBOLS[rw.sym].name}×${rw.n}`;
    case 'charm':
      return CHARMS[rw.id].name;
    case 'place':
      return PLACES[rw.id].name;
    case 'expand':
      return '畑を広げる';
    case 'clean':
      return `お邪魔を${rw.n}枚払う`;
  }
}

/** 夜：残りの回転を減らし、妨害を起こす。期限が来ても倒せていなければ false（負け） */
function uraNight(state: GameState): boolean {
  const u = state.ura!;
  if (u.won || u.reward) return true;
  u.turnsLeft--;
  u.harassIn--;
  u.lastHarass = null;
  if (u.harassIn <= 0 && u.hp > 0) {
    u.lastHarass = { id: u.harass, cells: applyHarass(state, u.harass) };
    const list = YOKAI[u.foe].harass;
    u.harass = list[(list.indexOf(u.harass) + 1) % list.length];
    u.harassIn = URA.harassEvery;
  }
  // 大蛇：弱点が数回転ごとに入れ替わる
  if (YOKAI[u.foe].weak === 'rotate' && (u.limit - u.turnsLeft) % URA.rotateEvery === 0) {
    u.weak = URA.rotateKinds[(URA.rotateKinds.indexOf(u.weak) + 1) % URA.rotateKinds.length];
    glog(state, `裏 大蛇の弱点が${CROPS[u.weak].name}に変わった`);
  }
  if (u.turnsLeft <= 0 && u.hp > 0) {
    glog(state, `裏 ${YOKAI[u.foe].name}を倒せず終わり（残り体力${u.hp}）`);
    return false;
  }
  return true;
}

/** 妨害を起こす。荒らしたマスを返す（演出用） */
function applyHarass(state: GameState, id: HarassId): number[] {
  const u = state.ura!;
  const cells = fieldCells(state);
  const name = YOKAI[u.foe].name;
  if (id === 'burnRow') {
    // 実りが一番多い横一列の、実った作物を燃やす（予告を見て、その日のうちに売れば守れる）
    const ripeAt = (i: number) => !!state.field[i] && state.field[i]!.anchor === undefined && isRipe(state.field[i]!) && !CROPS[state.field[i]!.kind].big;
    const rows = Array.from({ length: state.rows }, (_, y) => cells.filter((i) => cellY(i) === y && ripeAt(i)));
    const hit = rows.reduce((a, b) => (b.length > a.length ? b : a), [] as number[]);
    hit.forEach((i) => removeCrop(state, i));
    glog(state, `裏 ${name}が横一列の実りを燃やした（${hit.length}個）`);
    return hit;
  }
  if (id === 'frost') {
    // 作物が一番多い縦一列を凍らせる（次の日は売れず、育たない）
    const cols = Array.from({ length: state.cols }, (_, x) => cells.filter((i) => cellX(i) === x));
    const col = cols.reduce((a, b) => (b.filter((i) => state.field[i]).length > a.filter((i) => state.field[i]).length ? b : a));
    col.forEach((i) => (state.frost[i] = URA.frostDays));
    glog(state, `裏 ${name}が縦一列を凍らせた`);
    return col;
  }
  if (id === 'steal') {
    const ripe = cells.filter((i) => state.field[i] && state.field[i]!.anchor === undefined && isRipe(state.field[i]!));
    if (!ripe.length) return [];
    const cell = ripe.reduce((a, b) => (cropPrice(state, state.field[b]!, b) > cropPrice(state, state.field[a]!, a) ? b : a));
    glog(state, `裏 ${name}が${CROPS[state.field[cell]!.kind].name}を盗んだ`);
    removeCrop(state, cell);
    return [cell];
  }
  if (id === 'heal') {
    const back = Math.round(u.maxHp * URA.healRate);
    u.hp = Math.min(u.maxHp, u.hp + back);
    glog(state, `裏 ${name}の体力が${back}戻った`);
    return [];
  }
  // お邪魔を混ぜる
  const pool: SymbolId[] = ['crow', 'bug', 'weed'];
  for (let k = 0; k < URA.pestCount; k++) state.bag[pool[Math.floor(nextRand(state) * pool.length)]]++;
  glog(state, `裏 ${name}が袋にお邪魔を${URA.pestCount}枚混ぜた`);
  return [];
}
