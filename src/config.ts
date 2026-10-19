// 畑スロットの調整用パラメータ。数値はすべてここで変える。

export type SymbolId =
  | 'seed'
  | 'goldSeed'
  | 'rain'
  | 'sun'
  | 'fertilizer'
  | 'bee'
  | 'crow'
  | 'bug'
  | 'coin'
  | 'merchant'
  | 'clover';

export type UpgradeId =
  | 'addSeed'
  | 'addRain'
  | 'addSun'
  | 'addFertilizer'
  | 'addGoldSeed'
  | 'addBee'
  | 'addMerchant'
  | 'addClover'
  | 'removeCrow'
  | 'removeBug';

export type CharmId =
  | 'coinPurse'
  | 'gentleRain'
  | 'crowToll'
  | 'aging'
  | 'seedSack'
  | 'sunBlessing'
  | 'bargain'
  | 'scarecrow'
  | 'bumper'
  | 'goldLuck'
  | 'bugWard'
  | 'taxRelief'
  | 'artisan';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  emoji: string;
  /** manual: 出目をタップして使う / auto: 停止した瞬間に効果が出る */
  kind: 'manual' | 'auto';
  /** 対象マスの選択が要らない手動絵柄（太陽） */
  noTarget?: boolean;
  desc: string;
  /** フィーバー時の効果 */
  feverDesc: string;
  /** 演出用のレア度 */
  rarity: 'normal' | 'rare' | 'bad';
}

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  seed: { id: 'seed', name: '種', emoji: '🌰', kind: 'manual', desc: '空きマスに作物を1〜3個植える', feverDesc: '植えられる数×2', rarity: 'normal' },
  goldSeed: { id: 'goldSeed', name: '金の種', emoji: '🌟', kind: 'manual', desc: '空きマスに金の作物を植える', feverDesc: '2個植えられる', rarity: 'rare' },
  rain: { id: 'rain', name: '雨', emoji: '🌧️', kind: 'manual', desc: '作物1つの成長＋2', feverDesc: '成長＋4', rarity: 'normal' },
  sun: { id: 'sun', name: '太陽', emoji: '☀️', kind: 'manual', noTarget: true, desc: '畑の全作物の成長＋1', feverDesc: '全作物の成長＋2', rarity: 'normal' },
  fertilizer: { id: 'fertilizer', name: '肥料', emoji: '🧪', kind: 'manual', desc: '作物1つの売値を2倍', feverDesc: '2つの作物に使える', rarity: 'normal' },
  bee: { id: 'bee', name: '蜂', emoji: '🐝', kind: 'manual', desc: '選んだマスと上下左右の作物の成長＋1', feverDesc: '範囲の成長＋2', rarity: 'normal' },
  crow: { id: 'crow', name: 'カラス', emoji: '🐦', kind: 'auto', desc: '作物を1つ狙う（1/2で食べられる）', feverDesc: '食べる確率 1/2 → 3/4', rarity: 'bad' },
  bug: { id: 'bug', name: '虫', emoji: '🐛', kind: 'auto', desc: '作物1つの成長−1', feverDesc: '成長−2', rarity: 'bad' },
  coin: { id: 'coin', name: '金貨', emoji: '🪙', kind: 'auto', desc: 'その場で金がもらえる', feverDesc: '額が2倍', rarity: 'normal' },
  merchant: { id: 'merchant', name: '商人', emoji: '🧑‍🌾', kind: 'auto', desc: 'その日だけ売値×1.5', feverDesc: '売値の上がり幅が2倍', rarity: 'normal' },
  clover: { id: 'clover', name: '四つ葉', emoji: '🍀', kind: 'auto', desc: '次の日、金の種が出やすくなる', feverDesc: 'さらに出やすくなる', rarity: 'rare' },
};

/** 絵柄袋・ショップでの表示順 */
export const SYMBOL_ORDER: SymbolId[] = ['seed', 'goldSeed', 'rain', 'sun', 'fertilizer', 'bee', 'coin', 'merchant', 'clover', 'crow', 'bug'];

/** 感想フォームのURL（Googleフォーム等）。空なら結果画面にボタンを出さない */
export const FEEDBACK_URL = '';

/** 公開URL（結果の共有に使う） */
export const SHARE_URL = 'https://magis0619.github.io/Sixth/';

export const CONFIG = {
  /** 畑のマス数（3×3） */
  fieldCols: 3,
  fieldRows: 3,
  /** 初期リール本数と上限 */
  initialReels: 3,
  maxReels: 5,
  /** 初期の絵柄袋 */
  initialBag: {
    seed: 3, goldSeed: 0, rain: 2, sun: 1, fertilizer: 0, bee: 0,
    crow: 2, bug: 0, coin: 1, merchant: 0, clover: 0,
  } as Record<SymbolId, number>,
  initialGold: 0,
  /** 成長 */
  ripeGrowth: 3,
  rainGrowth: 2,
  sunGrowth: 1,
  beeGrowth: 1,
  /** 売値 */
  normalPrice: 6,
  goldPrice: 30,
  fertilizerMultiplier: 2,
  /** 金貨の額 */
  coinAmount: 3,
  /** カラスが狙った作物を食べる確率（外れると追い払える） */
  crowEatChance: 0.5,
  /** カラスの群れ（フィーバー）のときの食べる確率の倍率 */
  crowFeverMultiplier: 1.5,
  /** 虫が下げる成長 */
  bugDamage: 1,
  /** 年貢を納めるたびに絵柄袋に増える虫の枚数 */
  bugPerTax: 1,
  /** 商人1枚で上がる今日の売値倍率 */
  merchantBonus: 0.5,
  /** 四つ葉の翌日の金の種の出やすさ（重みの倍率） */
  cloverMultiplier: 3,
  /** 種1枚で植えられる数とその重み（1個:50%・2個:35%・3個:15%）。金の種は常に1個 */
  seedCountWeights: [
    { count: 1, weight: 50 },
    { count: 2, weight: 35 },
    { count: 3, weight: 15 },
  ],

  /** ゾロ目：同じ絵柄がこの数以上そろうとフィーバー（効果2倍） */
  feverCount: 3,
  feverPower: 2,

  /** そろい収穫：縦横斜めに実が並んだ列をまとめて売ったときの売値倍率 */
  lineBonus: 1.5,

  /** 強化の価格 */
  upgradePrices: {
    addSeed: 8,
    addRain: 8,
    addSun: 10,
    addFertilizer: 12,
    addGoldSeed: 25,
    addBee: 18,
    addMerchant: 15,
    addClover: 20,
    removeCrow: 15,
    removeBug: 12,
  } as Record<UpgradeId, number>,
  /** カラス・虫を消す価格は、消すたびに removeGrowth 倍になる */
  removeGrowth: 2,

  /** 年貢：taxPeriod 日ごとに、その日の終わり（次の回転前）に自動で徴収 */
  taxPeriod: 7,
  /** 1回目から順の年貢額。表を超えたら（エンドレス）直前の額 × taxGrowth */
  taxSchedule: [5, 18, 40, 75, 115, 160, 210, 270],
  taxGrowth: 1.5,
  /** この回数の年貢を納めるとクリア（その後はエンドレス） */
  winTaxes: 8,
  /** 年貢が近いことを警告し始める残り日数 */
  taxWarnDays: 2,

  /** 年貢を納めたときに出るお守りの選択肢の数 */
  charmChoices: 3,
  /** お守りのレア度ごとの出やすさ（強いお守りほど出にくい） */
  charmTierWeights: { common: 10, uncommon: 5, rare: 1.5 } as Record<CharmTier, number>,

  /** 演出のタイミング（ミリ秒） */
  timing: {
    spinBase: 650,
    spinStagger: 260,
    autoStep: 420,
    comboWindow: 1600,
  },

  /** 操作ヒントを出す最終日 */
  hintUntilDay: 10,
};

export const UPGRADES: { id: UpgradeId; name: string; emoji: string; desc: string }[] = [
  { id: 'addSeed', name: '種を足す', emoji: '🌰', desc: '絵柄袋に種を1枚追加' },
  { id: 'addRain', name: '雨を足す', emoji: '🌧️', desc: '絵柄袋に雨を1枚追加' },
  { id: 'addSun', name: '太陽を足す', emoji: '☀️', desc: '絵柄袋に太陽を1枚追加' },
  { id: 'addFertilizer', name: '肥料を足す', emoji: '🧪', desc: '絵柄袋に肥料を1枚追加' },
  { id: 'addGoldSeed', name: '金の種を足す', emoji: '🌟', desc: '絵柄袋に金の種を1枚追加' },
  { id: 'addBee', name: '蜂を足す', emoji: '🐝', desc: '絵柄袋に蜂を1枚追加' },
  { id: 'addMerchant', name: '商人を足す', emoji: '🧑‍🌾', desc: '絵柄袋に商人を1枚追加' },
  { id: 'addClover', name: '四つ葉を足す', emoji: '🍀', desc: '絵柄袋に四つ葉を1枚追加' },
  { id: 'removeCrow', name: 'カラスを消す', emoji: '🐦', desc: '絵柄袋からカラスを1枚削除' },
  { id: 'removeBug', name: '虫を消す', emoji: '🐛', desc: '絵柄袋から虫を1枚削除' },
];

/** 強化と、それが増減させる絵柄 */
export const UPGRADE_SYMBOL: Partial<Record<UpgradeId, { symbol: SymbolId; delta: number }>> = {
  addSeed: { symbol: 'seed', delta: 1 },
  addRain: { symbol: 'rain', delta: 1 },
  addSun: { symbol: 'sun', delta: 1 },
  addFertilizer: { symbol: 'fertilizer', delta: 1 },
  addGoldSeed: { symbol: 'goldSeed', delta: 1 },
  addBee: { symbol: 'bee', delta: 1 },
  addMerchant: { symbol: 'merchant', delta: 1 },
  addClover: { symbol: 'clover', delta: 1 },
  removeCrow: { symbol: 'crow', delta: -1 },
  removeBug: { symbol: 'bug', delta: -1 },
};

/** お守りのレア度。強さ（シミュレーターでの生存日数の伸び）で決めている */
export type CharmTier = 'common' | 'uncommon' | 'rare';

export const CHARM_TIER_NAMES: Record<CharmTier, string> = { common: 'コモン', uncommon: 'アンコモン', rare: 'レア' };

export interface CharmDef {
  id: CharmId;
  tier: CharmTier;
  name: string;
  emoji: string;
  /** n 個持っているときの効果の説明 */
  desc: (n: number) => string;
  /** 重ねられる上限 */
  max: number;
}

/** お守り。年貢を納めるたびに charmChoices 個から1つ選ぶ。同じものは重ねて効果アップ */
export const CHARMS: Record<CharmId, CharmDef> = {
  coinPurse: { id: 'coinPurse', tier: 'uncommon', name: '金貨袋', emoji: '👛', desc: (n) => `金貨の額＋${2 * n}`, max: Infinity },
  gentleRain: { id: 'gentleRain', tier: 'uncommon', name: '恵みの雨', emoji: '☔', desc: (n) => `雨を使うと上下左右の作物も成長＋${n}`, max: Infinity },
  crowToll: { id: 'crowToll', tier: 'common', name: 'カラスの通行料', emoji: '🪶', desc: (n) => `カラスが来るたびに＋${2 * n}金`, max: Infinity },
  aging: { id: 'aging', tier: 'common', name: '熟成', emoji: '🍷', desc: (n) => `実ったまま日をまたぐと売値＋${n}`, max: Infinity },
  seedSack: { id: 'seedSack', tier: 'rare', name: '大きな種袋', emoji: '🎒', desc: (n) => `種で植えられる数＋${n}`, max: Infinity },
  sunBlessing: { id: 'sunBlessing', tier: 'rare', name: '日だまり', emoji: '🌻', desc: (n) => `太陽の成長＋${n}`, max: 2 },
  bargain: { id: 'bargain', tier: 'uncommon', name: '値切り上手', emoji: '🏷️', desc: (n) => `強化の価格−${Math.min(50, 10 * n)}%`, max: 5 },
  scarecrow: { id: 'scarecrow', tier: 'common', name: 'かかし', emoji: '🎃', desc: (n) => `カラスが食べる確率−${15 * n}%（下限10%）`, max: 3 },
  bumper: { id: 'bumper', tier: 'rare', name: '豊作', emoji: '🧺', desc: (n) => `通常の作物の売値＋${2 * n}`, max: Infinity },
  goldLuck: { id: 'goldLuck', tier: 'uncommon', name: '金運', emoji: '🐱', desc: (n) => `金の作物の売値＋${10 * n}`, max: Infinity },
  bugWard: { id: 'bugWard', tier: 'common', name: '虫よけ', emoji: '🌿', desc: (n) => `虫が${Math.round((1 - Math.pow(0.5, n)) * 100)}%で外れる`, max: 4 },
  artisan: { id: 'artisan', tier: 'rare', name: 'からくり職人', emoji: '🎰', desc: (n) => `リール＋${n}（1日の出来事が増える）`, max: 2 },
  taxRelief: { id: 'taxRelief', tier: 'common', name: '年貢の減免', emoji: '📜', desc: (n) => `年貢−${Math.min(50, 10 * n)}%`, max: 5 },
};

export const CHARM_ORDER = Object.keys(CHARMS) as CharmId[];

/** 「足す」強化（ゲーム開始時にショップへ並べるものを選ぶ対象） */
export type AddUpgradeId = Exclude<UpgradeId, 'removeCrow' | 'removeBug'>;

/**
 * 遊ぶたびに増える要素（メタ進行）。
 * ゲーム終了時に豊穣ポイントを獲得し、準備画面で「足す」強化やレアのお守りを解放する。
 * 解放した「足す」強化は、毎回コスト上限内でショップに並べるものを選ぶ。
 */
export const META = {
  /** 豊穣ポイント = 到達日数 × perDay + 年貢の納付回数 × perTax（クリアしていれば clearBonus を加算） */
  pointsPerDay: 1,
  pointsPerTax: 5,
  clearBonus: 30,
  /** 最初から解放されている「足す」強化 */
  startUnlocked: ['addSun', 'addRain'] as AddUpgradeId[],
  /** 「足す」強化の解放ポイントと、ショップに並べるコスト */
  adds: {
    addSun: { unlock: 0, cost: 2 },
    addRain: { unlock: 0, cost: 1 },
    addSeed: { unlock: 20, cost: 1 },
    addFertilizer: { unlock: 25, cost: 2 },
    addBee: { unlock: 35, cost: 2 },
    addMerchant: { unlock: 35, cost: 2 },
    addGoldSeed: { unlock: 45, cost: 3 },
    addClover: { unlock: 60, cost: 3 },
  } as Record<AddUpgradeId, { unlock: number; cost: number }>,
  /** レアのお守りは解放するまで出ない */
  charmUnlock: { sunBlessing: 50, bumper: 50, seedSack: 40 } as Partial<Record<CharmId, number>>,
  /** ショップに並べられるコストの上限と、その拡張 */
  baseCapacity: 4,
  capacityStep: 2,
  capacityPrices: [30, 50, 80],
};
