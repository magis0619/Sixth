// 畑スロットの調整用パラメータ。数値はすべてここで変える。
import { EN } from './i18n.ts';

export type SymbolId =
  | 'seed'
  | 'berrySeed'
  | 'pumpkinSeed'
  | 'goldSeed'
  | 'melonSeed'
  | 'watermelonSeed'
  | 'rain'
  | 'sun'
  | 'fertilizer'
  | 'bee'
  | 'crow'
  | 'bug'
  | 'coin'
  | 'merchant'
  | 'clover'
  | 'moon'
  | 'thunder'
  | 'hoe'
  | 'weed'
  | 'tanuki'
  | 'frost'
  | 'mole'
  | 'locust'
  // 合体した絵柄（同じ札4枚で1枚）
  | 'oniSeed'
  | 'heartSeed'
  | 'lanternSeed'
  | 'boxSeed'
  | 'bigRain'
  | 'bigSun'
  | 'raijin'
  | 'queenBee'
  | 'superFert'
  | 'koban'
  // じょうろ・卵（孵化するとツバメ）
  | 'can'
  | 'egg'
  | 'swallow'
  // タカ（袋のカラスを追い出す）
  | 'hawk'
  // スーパーレア（市の仕入れにまれに並ぶ金の札）
  | 'blessRain'
  | 'amaterasu'
  | 'mallet';

export type UpgradeId =
  | 'addSeed'
  | 'addBerrySeed'
  | 'addPumpkinSeed'
  | 'addRain'
  | 'addSun'
  | 'addFertilizer'
  | 'addGoldSeed'
  | 'addBee'
  | 'addMerchant'
  | 'addClover'
  | 'addMoon'
  | 'addBlessRain'
  | 'addAmaterasu'
  | 'addMallet'
  | 'addMelonSeed'
  | 'addThunder'
  | 'addWatermelonSeed'
  | 'addHoe'
  | 'addCan'
  | 'addEgg'
  | 'addHawk'
  | 'removeCrow'
  | 'removeBug'
  | 'removeWeed'
  | 'removeTanuki'
  | 'removeFrost'
  | 'removeMole'
  | 'removeLocust';

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
  | 'artisan'
  | 'heater'
  | 'goldenWell'
  | 'queenHive'
  | 'rancher'
  | 'bigGame'
  | 'wheelwright'
  | 'tillMaster'
  // ---- 条件を満たすと出る特別なお守り ----
  | 'thunderstorm'
  | 'tomatoFest'
  | 'sunshower'
  | 'moonFeast'
  | 'flowerField'
  | 'bolt'
  | 'sowing'
  | 'harvestMoon'
  | 'prosperity'
  | 'festival'
  | 'bumperHarvest'
  | 'crowReturn'
  | 'lastStraw'
  | 'exhibition'
  // 曰く付きのお守り（追加）
  | 'crowFriend'
  | 'greedy'
  | 'earlyCrop'
  | 'autumnHarvest'
  | 'thunderGod'
  | 'moonViewing'
  | 'bigSpender'
  | 'declutter'
  | 'farmMaster';

/**
 * 一旦減らした要素（試し中）。ここに並べたものはゲームに出ない（仕入れ・ショップ・お邪魔・お守り・組み合わせ・図鑑）。
 * コードは残してあるので、この表から消せば元に戻る。古いセーブで袋や畑にあるものはそのまま効く
 */
export const CUT = {
  symbols: ['melonSeed', 'goldSeed', 'clover', 'hoe', 'merchant', 'frost', 'mole'] as SymbolId[],
  places: [] as string[],
  charms: ['coinPurse', 'crowToll', 'bargain', 'goldLuck', 'goldenWell', 'wheelwright', 'tillMaster', 'heater', 'crowReturn', 'sowing', 'prosperity'] as CharmId[],
};

export interface SymbolDef {
  id: SymbolId;
  name: string;
  emoji: string;
  /** manual: 出目をタップして使う / auto: 停止した瞬間に効果が出る */
  kind: 'manual' | 'auto';
  /** 効く範囲の形（手動の成長系）。選んだマスを中心にこの形のマスへ効く */
  shape?: ShapeId;
  desc: string;
  /** フィーバー時の効果 */
  feverDesc: string;
  /** 演出用のレア度 */
  rarity: 'normal' | 'rare' | 'super' | 'bad';
  /** 合体した絵柄なら、元の絵柄（組み合わせ・お守りの条件・フィーバーの役は元の絵柄として数える） */
  base?: SymbolId;
}

// feverDesc：同じ絵柄が3つ以上そろったときの「役」。良い絵柄の役には必ず金貨の大当たりが付く
export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  seed: { id: 'seed', name: 'トマトの種', emoji: '🍅', kind: 'manual', desc: 'トマトを3〜5個植える', feverDesc: '品種改良：今日植えるトマトは1段階育った状態から', rarity: 'normal' },
  berrySeed: { id: 'berrySeed', name: '苺の種', emoji: '🍓', kind: 'manual', desc: '苺を4〜6個植える', feverDesc: '品種改良：今日植える苺は1段階育った状態から', rarity: 'normal' },
  pumpkinSeed: { id: 'pumpkinSeed', name: 'かぼちゃの種', emoji: '🎃', kind: 'manual', desc: 'かぼちゃを1個植える', feverDesc: '品種改良：今日植えるかぼちゃは1段階育った状態から', rarity: 'normal' },
  melonSeed: { id: 'melonSeed', name: 'メロンの種', emoji: '🍈', kind: 'manual', desc: 'メロンを1個植える', feverDesc: '品種改良：今日植えるメロンは1段階育った状態から', rarity: 'rare' },
  watermelonSeed: { id: 'watermelonSeed', name: 'スイカの種', emoji: '🍉', kind: 'manual', desc: 'スイカを1個植える（2×2マス）', feverDesc: '品種改良：今日植えるスイカは1段階育った状態から', rarity: 'rare' },
  goldSeed: { id: 'goldSeed', name: '金の種', emoji: '🌟', kind: 'manual', desc: '金のとうもろこしを植える', feverDesc: '黄金の実り：大当たり×3', rarity: 'rare' },
  rain: { id: 'rain', name: '雨', emoji: '🌧️', kind: 'manual', shape: 'cross', desc: '縦横十字 成長+1', feverDesc: '虹：全作物の成長＋1', rarity: 'normal' },
  sun: { id: 'sun', name: '太陽', emoji: '☀️', kind: 'manual', shape: 'column', desc: '縦一列 成長+1', feverDesc: '夏祭り：今日の売値×2', rarity: 'normal' },
  fertilizer: { id: 'fertilizer', name: '肥料', emoji: '🧪', kind: 'manual', desc: '売値×1.5', feverDesc: '堆肥：畑の全作物に肥料', rarity: 'normal' },
  bee: { id: 'bee', name: '蜂', emoji: '🐝', kind: 'manual', shape: 'x', desc: '斜め 成長+1', feverDesc: 'はちみつ：作物1つにつき＋4', rarity: 'normal' },
  crow: { id: 'crow', name: 'カラス', emoji: '🐦', kind: 'auto', desc: '一番大事な作物を狙い、1/2で食べる（かぼちゃ・スイカはつついて売値−20%）', feverDesc: '群れ：食べる確率 1/2 → 3/4', rarity: 'bad' },
  bug: { id: 'bug', name: '虫', emoji: '🐛', kind: 'auto', desc: '一番大事な作物の成長−1', feverDesc: '群れ：成長−2', rarity: 'bad' },
  coin: { id: 'coin', name: '金貨', emoji: '🪙', kind: 'auto', desc: '+金', feverDesc: '大当たり×3', rarity: 'normal' },
  merchant: { id: 'merchant', name: '商人', emoji: '🧑‍🌾', kind: 'auto', desc: '今日の売値×1.5', feverDesc: '大商い：実った作物を今すぐ×2で全部買い取る', rarity: 'normal' },
  clover: { id: 'clover', name: '四つ葉', emoji: '🍀', kind: 'auto', desc: '明日 金の種↑', feverDesc: '幸運：お守りを1つ選べる', rarity: 'rare' },
  thunder: { id: 'thunder', name: '雷', emoji: '⚡', kind: 'manual', shape: 'row', desc: '横一列 成長+2', feverDesc: '大雷：全作物の成長＋1', rarity: 'rare' },
  hoe: { id: 'hoe', name: '鍬', emoji: '⛏️', kind: 'manual', shape: 'row', desc: '横一列の雑草・霜を消して耕す（次に植えると成長+1）', feverDesc: '大耕し：畑全体を耕す', rarity: 'normal' },
  moon: { id: 'moon', name: '月', emoji: '🌕', kind: 'manual', shape: 'all', desc: '出るたびに満ちる（新月→三日月→半月→満月）。満月のときだけ全作物 成長+1、使うと新月に戻る', feverDesc: '月の宴：全作物の成長さらに＋1', rarity: 'rare' },
  // ---- お邪魔系（年貢を納めるたびにどれかが袋に増える） ----
  weed: { id: 'weed', name: '雑草', emoji: '🌾', kind: 'auto', desc: '作物の隣の空きマスを塞ぐ・広がる', feverDesc: '群れ：2か所に生える', rarity: 'bad' },
  tanuki: { id: 'tanuki', name: 'タヌキ', emoji: '🦝', kind: 'auto', desc: '実りを盗む', feverDesc: '群れ：2つ持っていく', rarity: 'bad' },
  frost: { id: 'frost', name: '霜', emoji: '❄️', kind: 'auto', desc: '3日凍らせる', feverDesc: '群れ：2マスが凍る', rarity: 'bad' },
  mole: { id: 'mole', name: 'モグラ', emoji: '🐀', kind: 'auto', desc: '作物を隣の空きマスへ押し出す', feverDesc: '群れ：2つ押し出す', rarity: 'bad' },
  // ---- 合体した絵柄（同じ札4枚が1枚になる） ----
  oniSeed: { id: 'oniSeed', name: '鬼トマトの種', emoji: '🍅', kind: 'manual', desc: '売値12・3〜5個', feverDesc: '品種改良：今日植える鬼トマトは1段階育った状態から', rarity: 'rare', base: 'seed' },
  heartSeed: { id: 'heartSeed', name: 'ハート苺の種', emoji: '🍓', kind: 'manual', desc: '売値9・4〜6個', feverDesc: '品種改良：今日植えるハート苺は1段階育った状態から', rarity: 'rare', base: 'berrySeed' },
  lanternSeed: { id: 'lanternSeed', name: 'ランタンかぼちゃの種', emoji: '🎃', kind: 'manual', desc: '売値60・4日', feverDesc: '品種改良：今日植えるランタンかぼちゃは1段階育った状態から', rarity: 'rare', base: 'pumpkinSeed' },
  boxSeed: { id: 'boxSeed', name: '箱スイカの種', emoji: '🍉', kind: 'manual', desc: '2×2・売値220', feverDesc: '品種改良：今日植える箱スイカは1段階育った状態から', rarity: 'rare', base: 'watermelonSeed' },
  bigRain: { id: 'bigRain', name: '大雨', emoji: '🌧️', kind: 'manual', shape: 'cross', desc: '十字+1・真ん中+2', feverDesc: '虹：全作物の成長＋1', rarity: 'rare', base: 'rain' },
  bigSun: { id: 'bigSun', name: '真夏の太陽', emoji: '☀️', kind: 'manual', shape: 'col3', desc: '縦3列 成長+1', feverDesc: '夏祭り：今日の売値×2', rarity: 'rare', base: 'sun' },
  raijin: { id: 'raijin', name: '雷神', emoji: '⚡', kind: 'manual', shape: 'row', desc: '横一列 成長+3', feverDesc: '大雷：全作物の成長＋1', rarity: 'rare', base: 'thunder' },
  queenBee: { id: 'queenBee', name: '女王蜂', emoji: '🐝', kind: 'manual', shape: 'xline', desc: '斜めの線いっぱい 成長+1', feverDesc: 'はちみつ：作物1つにつき＋4', rarity: 'rare', base: 'bee' },
  superFert: { id: 'superFert', name: '極上の肥料', emoji: '🧪', kind: 'manual', shape: 'plus', desc: '十字 売値×1.5', feverDesc: '堆肥：畑の全作物に肥料', rarity: 'rare', base: 'fertilizer' },
  can: { id: 'can', name: 'じょうろ', emoji: '🚿', kind: 'manual', shape: 'one', desc: '1マス 成長+2', feverDesc: '大当たり×3', rarity: 'normal' },
  egg: { id: 'egg', name: '卵', emoji: '🥚', kind: 'auto', desc: 'スロットに3回出ると孵ってツバメになる', feverDesc: '大当たり×3', rarity: 'normal' },
  blessRain: { id: 'blessRain', name: '豊穣の雨', emoji: '🌈', kind: 'manual', shape: 'all', desc: '畑全部 成長+1', feverDesc: '虹：全作物の成長＋1', rarity: 'super', base: 'rain' },
  amaterasu: { id: 'amaterasu', name: '天照', emoji: '🌞', kind: 'manual', shape: 'cross', desc: '縦横の列 成長+2', feverDesc: '夏祭り：今日の売値×2', rarity: 'super', base: 'sun' },
  mallet: { id: 'mallet', name: '打出の小槌', emoji: '🔨', kind: 'auto', desc: '今日の売値×2', feverDesc: '大当たり×3', rarity: 'super' },
  hawk: { id: 'hawk', name: 'タカ', emoji: '🦅', kind: 'auto', desc: '袋のカラスを1枚追い出す', feverDesc: '大当たり×3', rarity: 'normal' },
  swallow: { id: 'swallow', name: 'ツバメ', emoji: '🐦', kind: 'auto', desc: '袋の虫を1枚追い出す（虫がいなければ+2）', feverDesc: '大当たり×3', rarity: 'normal' },
  koban: { id: 'koban', name: '小判', emoji: '🪙', kind: 'auto', desc: '+12（年貢を納めるたびに+3）', feverDesc: '大当たり×3', rarity: 'rare', base: 'coin' },
  locust: { id: 'locust', name: 'イナゴ', emoji: '🦗', kind: 'auto', desc: '出るたびに1/2で袋に1匹増える（畑はかじらない）', feverDesc: '大群：増えるときは2匹', rarity: 'bad' },
};

/** 絵柄袋・ショップでの表示順 */
export const SYMBOL_ORDER: SymbolId[] = [
  'seed', 'oniSeed', 'berrySeed', 'heartSeed', 'pumpkinSeed', 'lanternSeed', 'melonSeed', 'watermelonSeed', 'boxSeed', 'goldSeed', 'rain', 'bigRain', 'sun', 'bigSun', 'thunder', 'raijin', 'hoe', 'fertilizer', 'superFert', 'bee', 'queenBee', 'coin', 'koban', 'can', 'egg', 'swallow', 'hawk', 'blessRain', 'amaterasu', 'mallet', 'merchant', 'clover', 'moon', 'crow', 'bug', 'weed', 'tanuki', 'frost', 'mole', 'locust',
];

// ---- 作物 ----

export type CropKind = 'tomato' | 'strawberry' | 'pumpkin' | 'melon' | 'corn' | 'watermelon' | 'oniTomato' | 'heartBerry' | 'lanternPumpkin' | 'boxMelon';

export interface CropDef {
  kind: CropKind;
  name: string;
  /** 実るまでの成長 */
  ripe: number;
  price: number;
  /** カラスに食べられない */
  crowProof?: boolean;
  /** 金の作物（金運のお守りが効く） */
  gold?: boolean;
  /** 2×2マスを占める大物（列に入らず、単品でも半値にならない） */
  big?: boolean;
  /** 合体した種で育つ作物なら、元の作物（同じ作物の列・注文・相場は元の作物として数える） */
  base?: CropKind;
}

/** 早く安い苺・標準のトマト・遅く高いかぼちゃ・レアな金のとうもろこし */
export const CROPS: Record<CropKind, CropDef> = {
  strawberry: { kind: 'strawberry', name: '苺', ripe: 2, price: 4 },
  tomato: { kind: 'tomato', name: 'トマト', ripe: 3, price: 6 },
  pumpkin: { kind: 'pumpkin', name: 'かぼちゃ', ripe: 5, price: 24, crowProof: true },
  melon: { kind: 'melon', name: 'メロン', ripe: 6, price: 45 },
  corn: { kind: 'corn', name: '金のとうもろこし', ripe: 3, price: 30, gold: true },
  watermelon: { kind: 'watermelon', name: 'スイカ', ripe: 6, price: 90, crowProof: true, big: true },
  // 合体した種で育つ作物
  oniTomato: { kind: 'oniTomato', name: '鬼トマト', ripe: 3, price: 12, base: 'tomato' },
  heartBerry: { kind: 'heartBerry', name: 'ハート苺', ripe: 2, price: 9, base: 'strawberry' },
  lanternPumpkin: { kind: 'lanternPumpkin', name: 'ランタンかぼちゃ', ripe: 4, price: 60, crowProof: true, base: 'pumpkin' },
  boxMelon: { kind: 'boxMelon', name: '箱スイカ', ripe: 5, price: 220, crowProof: true, big: true, base: 'watermelon' },
};

/** 元の作物（合体した作物は元の作物として数える） */
export const cropBase = (k: CropKind): CropKind => CROPS[k].base ?? k;
/** 元の絵柄 */
export const symbolBase = (s: SymbolId): SymbolId => SYMBOLS[s].base ?? s;

/** 合体：同じ絵柄が mergeNeed 枚そろうと、市で1枚の上位の絵柄にできる */
export const MERGES: Partial<Record<SymbolId, SymbolId>> = {
  seed: 'oniSeed', berrySeed: 'heartSeed', pumpkinSeed: 'lanternSeed', watermelonSeed: 'boxSeed',
  rain: 'bigRain', sun: 'bigSun', thunder: 'raijin', bee: 'queenBee', fertilizer: 'superFert', coin: 'koban',
};

/** 種の絵柄と、植わる作物・1枚で植えられる数の上乗せ */
export const SEEDS: Partial<Record<SymbolId, { crop: CropKind; extra: number; single?: boolean }>> = {
  seed: { crop: 'tomato', extra: 0 },
  berrySeed: { crop: 'strawberry', extra: 1 },
  pumpkinSeed: { crop: 'pumpkin', extra: 0, single: true },
  melonSeed: { crop: 'melon', extra: 0, single: true },
  goldSeed: { crop: 'corn', extra: 0, single: true },
  watermelonSeed: { crop: 'watermelon', extra: 0, single: true },
  oniSeed: { crop: 'oniTomato', extra: 0 },
  heartSeed: { crop: 'heartBerry', extra: 1 },
  lanternSeed: { crop: 'lanternPumpkin', extra: 0, single: true },
  boxSeed: { crop: 'boxMelon', extra: 0, single: true },
};

/** 出目の効く範囲の形 */
/** 年貢の条件：作物の数・列で売る・同じ作物の列・大物（かぼちゃ・スイカ）・日曜に実りを残す */
export type TaxCondKind = 'crop' | 'line' | 'sameLine' | 'big' | 'keep';
/** 殿様の気まぐれ：質素倹約（市が開かない）・派手好き（単品がさらに半分）・見回り（毎晩実りを1つ持っていく）・豊作を見たい（日曜に畑の半分） */
export type WhimId = 'frugal' | 'flashy' | 'patrol' | 'harvest';

export type ShapeId = 'cross' | 'column' | 'row' | 'x' | 'all' | 'one' | 'col3' | 'xline' | 'box' | 'plus';

export const SHAPE_NAMES: Record<ShapeId, string> = { cross: '縦横十字', column: '縦一列', row: '横一列', x: '斜め', all: '畑全体', one: '1マス', col3: '縦3列', xline: '斜めの線', box: '周り9マス', plus: '十字の5マス' };

// ---- 畑に置くもの（道具・特別なマス） ----

/** 道具はマスを占める（植えられない・列に入らない）。特別なマスは作物と重ねられる */
export type PlaceId = 'scarecrow' | 'bigScarecrow' | 'well' | 'goldenWell' | 'hive' | 'queenHive' | 'henhouse' | 'cowshed' | 'compost' | 'water' | 'sprinkler' | 'reservoir' | 'windmill';

export interface PlaceDef {
  id: PlaceId;
  kind: 'tool' | 'tile';
  name: string;
  desc: string;
  /** ショップの価格（null はお守りでしか手に入らない）。同じ物を買うたびに placeGrowth 倍 */
  price: number | null;
}

export const PLACES: Record<PlaceId, PlaceDef> = {
  scarecrow: { id: 'scarecrow', kind: 'tool', name: 'かかし', desc: '周り8マスをカラス・虫・雑草から守る', price: 20 },
  bigScarecrow: { id: 'bigScarecrow', kind: 'tool', name: '大かかし', desc: '2マス以内をカラス・虫・雑草から守る。カラスが出た日に袋のカラスを1枚追い出す（1日1回）', price: null },
  well: { id: 'well', kind: 'tool', name: '井戸', desc: '上下左右 毎日+1', price: 60 },
  goldenWell: { id: 'goldenWell', kind: 'tool', name: '黄金の井戸', desc: '周り8マス 毎日+1', price: null },
  hive: { id: 'hive', kind: 'tool', name: '巣箱', desc: '周り8マス 売値+20%・苺が毎晩育つ', price: 30 },
  queenHive: { id: 'queenHive', kind: 'tool', name: '女王蜂の巣箱', desc: '周り8マス 売値+50%・苺が毎晩育つ', price: null },
  henhouse: { id: 'henhouse', kind: 'tool', name: '鶏小屋', desc: '毎日+3・周り8マスの虫を食べ（+3）、モグラを追い払う', price: 50 },
  cowshed: { id: 'cowshed', kind: 'tool', name: '牛小屋', desc: '毎日+4・隣に水路で+2', price: 100 },
  compost: { id: 'compost', kind: 'tile', name: '堆肥のマス', desc: '売値×2', price: 35 },
  water: { id: 'water', kind: 'tile', name: '水路のマス', desc: '毎日+1・3つ並べると水車（隣も育つ）・4方を囲むと釣り堀', price: 30 },
  // 夜に育つ置き物（週が進むと市に並ぶ）
  sprinkler: { id: 'sprinkler', kind: 'tool', name: 'スプリンクラー', desc: '横一列 毎晩+1', price: 70 },
  reservoir: { id: 'reservoir', kind: 'tool', name: 'ため池', desc: '縦一列 毎晩+1', price: 70 },
  windmill: { id: 'windmill', kind: 'tool', name: '風車', desc: '縦と横の列 毎晩+1', price: 150 },
};

export const PLACE_ORDER = Object.keys(PLACES) as PlaceId[];

/**
 * プレイ記録の送り先（Googleスプレッドシートの Apps Script をウェブアプリとして公開したURL）。
 * 空なら送らない。作り方は scripts/telemetry-apps-script.gs の先頭
 */
export const TELEMETRY_URL = 'https://script.google.com/macros/s/AKfycbyZXEhnOGCWEbJSaH0wzPVJWe0ImuMukZqiz1f5zshcQkiH0oDvP6sWKLs2fIIH1_0GFg/exec';

/** 感想フォームのURL（Googleフォーム等）。空なら結果画面にボタンを出さない */
export const FEEDBACK_URL = '';

/** 公開URL（結果の共有に使う） */
export const SHARE_URL = 'https://magis0619.github.io/Sixth/';

export const CONFIG = {
  /** 畑の最大の広さ（5×5）。マスの番号はこの広さで数える */
  fieldCols: 5,
  fieldRows: 5,
  /** 始めの広さ（3×3）。広げるたびに列→行の順に1つ増える */
  startCols: 3,
  startRows: 3,
  /** 畑を広げる価格（広げた回数ごと。3×3 → 4×3 → 4×4 → 5×4 → 5×5）。かなり高め */
  expandPrices: [70, 130, 220, 340],
  /** 道具・特別なマスは同じ物を買うたびにこの倍率で高くなる */
  placeGrowth: 1.5,
  /** 初期リール本数と上限 */
  initialReels: 3,
  maxReels: 5,
  /** 初期の絵柄袋 */
  initialBag: {
    seed: 3, berrySeed: 0, pumpkinSeed: 0, melonSeed: 0, goldSeed: 0, rain: 2, sun: 1, thunder: 0, fertilizer: 0, bee: 0,
    crow: 1, bug: 0, coin: 1, merchant: 0, clover: 0, moon: 0, weed: 0, tanuki: 0, frost: 0, watermelonSeed: 0, hoe: 0, mole: 0, locust: 0,
    oniSeed: 0, heartSeed: 0, lanternSeed: 0, boxSeed: 0, bigRain: 0, bigSun: 0, raijin: 0, queenBee: 0, superFert: 0, koban: 0, can: 0, egg: 0, swallow: 0, hawk: 0, blessRain: 0, amaterasu: 0, mallet: 0,
  } as Record<SymbolId, number>,
  /** 合体に要る同じ絵柄の枚数（市で1回に1種類まで） */
  /** 市の日（水・土）に売ると売値がこの倍率 */
  marketDaySell: 1.25,
  /** 植えきれなかった種は、夜に1つこの額で売れる */
  seedSellGold: 1,
  /** 使わずに終わった育てる出目（雨・太陽など）も、1枚につきこの額（捨てる損を減らす） */
  spareReelGold: 1,
  /** 卵が孵るまでに、スロットに出る回数 */
  eggHatch: 3,
  mergeNeed: 4,
  /** 合体のお金：その週の年貢の割合（最低 mergeCostMin） */
  mergeCostRate: 0.3,
  mergeCostMin: 10,
  initialGold: 0,
  /** 成長（実るまでの成長は作物ごとに CROPS で決める） */
  rainGrowth: 1,
  sunGrowth: 1,
  beeGrowth: 1,
  /** 肥料の売値倍率（作物ごとの売値は CROPS） */
  // 肥料は×1.5（高い作物にかけて溜めると一撃が大きすぎた）
  fertilizerMultiplier: 1.5,
  /** 週契約（一旦お休み。仕組みは残してある） */
  contractsOn: false,
  /** 金貨の額 */
  coinAmount: 3,
  /** カラスが狙った作物を食べる確率（外れると追い払える） */
  crowEatChance: 0.5,
  /** カラスの群れ（フィーバー）のときの食べる確率の倍率 */
  crowFeverMultiplier: 1.5,
  /** 虫が下げる成長 */
  bugDamage: 1,
  /** 難しい5：最初から袋に入っているイナゴの数 */
  locustStart: 1,
  /** イナゴが出るたびに袋で増える数（大群なら2倍）と、増える確率 */
  locustBreed: 1,
  locustBreedChance: 0.5,
  /** イナゴを消す価格は消すたびにこの倍率（ほかのお邪魔よりゆるやか）。週1回の数には入らない */
  locustRemoveGrowth: 1.15,
  /**
   * 年貢を納めるたびに絵柄袋に増えるお邪魔。こちらが強くなるのに合わせて、回を追うごとに数も種類も増える。
   * from 回目の年貢から、pool の中から count 枚（表の最後の行より先はエンドレスでも同じ）
   */
  obstacleSchedule: [
    // 同じ名前を重ねるほど出やすい。霜・モグラを外したので、カラスは序盤1/3・中盤から3/7（約4割）にそろえ直した
    //（前は霜・モグラが抜けた分カラスが5〜6割になり、袋がカラスだらけになっていた）
    { from: 1, count: 1, pool: ['bug', 'weed', 'crow'] },
    { from: 3, count: 1, pool: ['bug', 'weed', 'crow', 'tanuki'] },
    { from: 5, count: 2, pool: ['bug', 'bug', 'weed', 'weed', 'crow', 'crow', 'crow', 'tanuki'] },
    { from: 7, count: 3, pool: ['bug', 'bug', 'weed', 'weed', 'crow', 'crow', 'crow', 'tanuki'] },
  ] as { from: number; count: number; pool: SymbolId[] }[],
  /** タヌキは単体で凶悪なので、年貢のあとに増えるのは難しいこの段階から。増えるときはほかのお邪魔と一緒にしない */
  tanukiFrom: 4,
  /**
   * 殿様モード（難しさはふつうのまま、段1〜3）。週ごとの「年貢の条件」と、殿様の気まぐれ
   * condWeeks：年貢の条件が付く週（何週目か）。8週目より先（エンドレス）は endlessCond の段だけ毎週
   * kinds：その段で出る条件の種類。whimWeeks：気まぐれが来る週。whims：その段で出る気まぐれ
   * 条件に届かなかった分は、1つにつき年貢 +condStep（上限 condMax）。豊作を見たいは畑の半分に届かなければ +harvestPenalty
   */
  lord: {
    condWeeks: [[], [3, 5], [2, 3, 4, 5, 6, 7], [2, 3, 4, 5, 6, 7]] as number[][],
    endlessCond: 2,
    kinds: [[], ['crop'], ['crop', 'line', 'sameLine'], ['crop', 'line', 'sameLine', 'big', 'keep']] as TaxCondKind[][],
    whimWeeks: [[], [7], [7], [4, 7]] as number[][],
    whims: [[], ['frugal', 'flashy'], ['frugal', 'flashy', 'patrol', 'harvest'], ['frugal', 'flashy', 'patrol', 'harvest']] as WhimId[][],
    condStep: 0.2,
    condMax: 0.6,
    harvestPenalty: 0.3,
    flashySingle: 0.5,
    /** 殿様モードの段ごとの、もらえるポイントの倍率 */
    pointMult: [1, 1.3, 1.6, 2],
  },
  /** 難しい3以上：お邪魔の表を何回分早く進めるか・1回に何枚多いか */
  // 前は2回分早く・1枚多くで、難しい3のクリア率が2から急に5%まで落ちていた
  hardObstacleStep: 1,
  hardObstacleExtra: 0,
  /** 1回の年貢で袋に入る同じお邪魔の上限（カラスが一度に3枚入ってフィーバーしやすくなるのを防ぐ） */
  sameObstacleMax: 2,
  /** 雑草：抜く費用と、毎日となりの空きマスへ広がる確率 */
  weedPullCost: 3,
  weedSpreadChance: 0.5,
  /** 霜：凍っている日数 */
  frostDays: 3,
  /** タヌキ：実った作物がなければ所持金のこの割合を持っていく（最低 tanukiMinSteal） */
  tanukiStealRate: 0.1,
  tanukiMinSteal: 3,
  /** 水車：水路が縦か横に wheelMin 個以上まっすぐつながると、つながった数 × wheelGold が毎晩入る */
  wheelMin: 3,
  wheelGold: 1,
  /** 釣り堀：上下左右（畑の中のもの）がすべて水路で3方以上の空きマスは池。毎晩 fishGold、ときどき大物 */
  fishGold: 4,
  bigFishChance: 0.15,
  bigFishGold: 20,
  /** 牛小屋の隣に水路があると（水飲み場）毎晩の収入に上乗せ */
  cowWaterGold: 2,
  /** 彩りの畑：実った作物がこの種類以上同時にあると売値に上乗せ */
  colorfulKinds: 4,
  colorfulBonus: 0.1,
  /** 鶏小屋・牛小屋の毎晩の収入 */
  henhouseGold: 3,
  cowshedGold: 4,
  /** 鶏小屋・牛小屋は働くほど育つ：毎晩と虫を食べるたびに経験1。animalLvNeed で1段上がる（animalLvMax まで） */
  animalLvNeed: 7,
  animalLvMax: 2,
  /** 1段ごとの毎晩の収入の上乗せ */
  henhouseLvGold: 1,
  cowshedLvGold: 2,
  /** かかし・鶏小屋がお邪魔を追い払うともらえるお金（大かかしは repelBigGold） */
  repelGold: 1,
  /** 鶏小屋の鶏が虫を食べたときのお金 */
  henBugGold: 3,
  repelBigGold: 2,
  /** 市場の相場：週ごとに1品が高値・1品が安値。難しい marketFrom から */
  marketFrom: 2,
  /** 相場は一時停止中（false の間は出ない） */
  marketOn: false,
  marketHigh: 1.5,
  marketLow: 0.7,
  /** 品評会：売値の上乗せ */
  exhibitionBonus: 0.2,
  /** 品評会（お守り）は一時停止中（false の間はもらえない・図鑑にも出ない） */
  exhibitionOn: false,
  /** 商人1枚で上がる今日の売値倍率 */
  merchantBonus: 0.5,
  /** 四つ葉の翌日の金の種の出やすさ（重みの倍率） */
  cloverMultiplier: 3,
  /** 種1枚で植えられる数とその重み（1個:50%・2個:35%・3個:15%）。金の種は常に1個 */
  seedCountWeights: [
    // 種切れで畑が空きやすかったので、植える数を1つ増やした（2〜4 → 3〜5）
    { count: 3, weight: 40 },
    { count: 4, weight: 40 },
    { count: 5, weight: 20 },
  ],

  /** ゾロ目：同じ絵柄がこの数以上そろうとフィーバー。良い絵柄は役＋大当たり、カラス・虫は「群れ」で効果2倍 */
  feverCount: 3,
  feverPower: 2,
  /** 大当たりの金貨 = jackpotBase ×（そろった数 − 2）×（1 + 年貢の納付回数 × jackpotGrowth） */
  jackpotBase: 6,
  jackpotGrowth: 0.5,
  /** はちみつ：畑の作物1つあたりの金 */
  honeyPerCrop: 4,

  /** 注文：年貢の週ごとに1件。報酬 = 必要数 × 売値 × orderRewardMult ＋ orderRewardBase ×（週＋1） */
  orderRewardMult: 0.6,
  orderRewardBase: 3,

  /**
   * 列の収穫：縦・横・斜めに3つ以上そろった実は列ごとまとめて売る。
   * 列に入らない単品は売値×singleMult。列の実は×lineMult、同じ作物だけの列に入っていればさらに×sameCropMult。
   * 1つの実が複数の列に入っていると、2本目以降1本ごとに×(1 + crossBonus) が上乗せされる
   */
  singleMult: 0.5,
  lineMult: 1.3,
  sameCropMult: 1.3,
  // 交差のおまけは一旦なし（3×3に全部植えるだけで最大になっていた）
  crossBonus: 0,
  /** 長い列ほど高い：そのマスを通る一番長い列の長さで、列の倍率にさらに掛ける（4つで合わせて×1.5、5つで×1.8） */
  longLineMult: { 4: 1.15, 5: 1.4 } as Record<number, number>,

  /** 強化の価格 */
  upgradePrices: {
    addSeed: 8,
    addCan: 10,
    addEgg: 12,
    addHawk: 14,
    addBerrySeed: 8,
    addPumpkinSeed: 14,
    addRain: 8,
    addSun: 10,
    addFertilizer: 12,
    addGoldSeed: 25,
    addMelonSeed: 22,
    addThunder: 30,
    addWatermelonSeed: 28,
    addHoe: 10,
    addBee: 18,
    addMerchant: 15,
    addClover: 20,
    addMoon: 60,
    addBlessRain: 0,
    addAmaterasu: 0,
    addMallet: 0,
    // カラスは消すより守る相手（高め）
    removeCrow: 30,
    removeBug: 12,
    removeWeed: 12,
    removeTanuki: 15,
    removeFrost: 12,
    removeMole: 15,
    removeLocust: 12,
  } as Record<UpgradeId, number>,
  /** 満月は足すたびに moonGrowth 倍になる */
  moonGrowth: 1.5,
  /** お邪魔を消す価格は、消すたびに removeGrowth 倍になる（2倍だと高すぎたので1.3倍） */
  removeGrowth: 1.3,
  /** お邪魔を消せるのは1回の市（市の日がなければ1週間）にこの回数まで。一気に全部消して楽になりすぎないように */
  removesPerWeek: 1,
  /** ショップに週ごとに並ぶ数（絵柄を足す品・畑の品それぞれ）。消す品と畑を広げるはいつも並ぶ */
  weeklyCount: 3,
  /**
   * 毎日の仕入れ（試し中）：毎日3つの絵柄から1つをタダで袋に入れる。ショップでは絵柄を足せなくなる。
   * false にすると、前の「週替わりの3品をショップで買う」に戻る
   */
  dailyPick: true,
  /** 毎日の仕入れに並ぶ数 */
  dailyOfferCount: 3,
  /**
   * 市の日（試し中）：週の何日目に市が立つか。市の日だけ、タダの仕入れ（3つから1つ必ず）と買い物（畑の品・お邪魔を消す・広げる）ができる。
   * 空にすると、仕入れは毎日・ショップはいつでもに戻る
   */
  marketDays: [3, 6] as number[],
  /**
   * 農家（試し中）：始める前に農家を1人選ぶ。最初の袋・最初に持っている物・市に出やすい品が農家ごとに違う。
   * false にすると、前の「荷台に積んだ品が市に出やすい」準備に戻る
   */
  farmers: true,
  /** 仕入れは見送れない（必ず1つ選ぶ）。false なら見送れる */
  offerForced: true,
  /** レア仕入れ：準備では選べず、毎日の仕入れにたまに混ざる絵柄と、その確率 */
  rareOffers: ['addMoon', 'addGoldSeed'] as UpgradeId[],
  /** 市の仕入れの出やすさ（書いていない札は1） */
  offerWeights: { addRain: 4, addSun: 4, addSeed: 2 } as Partial<Record<AddUpgradeId, number>>,
  rareOfferChance: 0.08,
  /** スーパーレア（金の札）：仕入れにまれに1つ混ざる。年貢を納めるたびに出やすくなる（2%＋納めた回数×1%） */
  superOffers: ['addBlessRain', 'addAmaterasu', 'addMallet'] as UpgradeId[],
  superOfferChance: 0.02,  // 解放したものの中から
  superOfferStep: 0.01,
  /** 毎週1つは必ず並ぶ「作戦が変わる品」と、その作戦のひと言 */
  pivotAdds: {
    addBerrySeed: '苺：2日で実る。巣箱の周りで毎晩育つ',
    addPumpkinSeed: 'かぼちゃ：高くてカラスに強い',
    addMelonSeed: 'メロン：1個で大きく稼ぐ',
    addWatermelonSeed: 'スイカ：2×2の大物で一発',
    addGoldSeed: '金のとうもろこし：レアで高い',
    addHoe: '鍬：耕して次の作物を早く',
    addThunder: '雷：横一列を一気に育てる',
    addMerchant: '商人：売る日を選んで高く',
  } as Partial<Record<string, string>>,
  /** 市に並び始める週：この回数の年貢を納めたあとから（週ごとに品が良くなる）。ない物は最初から */
  placeTier: { well: 2, cowshed: 2, sprinkler: 2, reservoir: 2, windmill: 4 } as Partial<Record<string, number>>,
  /** 要らない札を捨てる：最初の値段と、捨てるたびに掛かる倍率（市で1回まで） */
  discardBase: 10,
  discardGrowth: 1.6,
  pivotPlaces: {
    henhouse: '鶏小屋：毎晩のお金＋虫・モグラよけ',
    cowshed: '牛小屋：毎晩のお金で稼ぐ',
    hive: '巣箱：周りの売値アップ＋苺',
    water: '水路：並べて水車・囲んで釣り堀',
    well: '井戸：周りを毎晩育てる',
  } as Partial<Record<string, string>>,

  /** 年貢：taxPeriod 日ごとに、その日の終わり（次の回転前）に自動で徴収 */
  taxPeriod: 7,
  /** 1回目から順の年貢額。表を超えたら（エンドレス）直前の額 × taxGrowth */
  // 4回目からは中盤以後として×1.3（185→240・280→365・380→495・475→620・570→740）
  // 序盤（1〜3回目）も、1週目の稼ぎに合わせて上げた（5・25・80 → 10・45・110）
  // 交差のおまけをなくして稼ぎが減ったので、4回目以降をなだらかに（240→190 など）。1回ごとにおよそ×1.3〜1.6
  taxSchedule: [10, 40, 80, 120, 160, 200, 240, 290],
  /** 難しさごとの年貢の倍率（ふつう〜難しい5） */
  // 自動プレイのクリア率がおよそ 70→55→40→25→17→6% になるように（2026-11-21）
  difficultyTaxMult: [1, 1.15, 1.2, 1.3, 1.45, 1.5],
  taxGrowth: 1.5,
  /** この回数の年貢を納めるとクリア（その後はエンドレス） */
  winTaxes: 7,
  /** 年貢が近いことを警告し始める残り日数 */
  taxWarnDays: 2,

  /** 年貢を納めたときに出るお守りの選択肢の数 */
  charmChoices: 3,
  /** お守りのレア度ごとの出やすさ（強いお守りほど出にくい） */
  charmTierWeights: { common: 10, uncommon: 5, rare: 1.5 } as Record<CharmTier, number>,
  /** 同じお守りをこの数そろえると金色に進化して効果が2倍 */
  goldenAt: 3,
  /** 大豊作の大当たり（1プレイに1回。年貢の回数で増える） */
  bumperJackpot: 40,

  /** 演出のタイミング（ミリ秒） */
  timing: {
    // 最初のリールが止まるまで（回っている間のわくわくを長めに）
    spinBase: 980,
    spinStagger: 170,
    autoStep: 280,
    comboWindow: 1600,
  },

  /** 操作ヒントを出す最終日 */
  hintUntilDay: 10,
};

export const UPGRADES: { id: UpgradeId; name: string; emoji: string; desc: string }[] = [
  { id: 'addCan', name: 'じょうろを足す', emoji: '🚿', desc: '絵柄袋にじょうろ（1マス 成長+2）を1枚追加' },
  { id: 'addEgg', name: '卵を足す', emoji: '🥚', desc: '絵柄袋に卵を1枚追加。スロットに3回出るとツバメになる' },
  { id: 'addHawk', name: 'タカを足す', emoji: '🦅', desc: '絵柄袋にタカを1枚追加。出ると袋のカラスを1枚追い出す' },
  { id: 'addSeed', name: 'トマトの種を足す', emoji: '🍅', desc: '絵柄袋にトマトの種を1枚追加' },
  { id: 'addBerrySeed', name: '苺の種を足す', emoji: '🍓', desc: '絵柄袋に苺の種を1枚追加' },
  { id: 'addPumpkinSeed', name: 'かぼちゃの種を足す', emoji: '🎃', desc: '絵柄袋にかぼちゃの種を1枚追加' },
  { id: 'addRain', name: '雨を足す', emoji: '🌧️', desc: '絵柄袋に雨を1枚追加' },
  { id: 'addSun', name: '太陽を足す', emoji: '☀️', desc: '絵柄袋に太陽を1枚追加' },
  { id: 'addFertilizer', name: '肥料を足す', emoji: '🧪', desc: '絵柄袋に肥料を1枚追加' },
  { id: 'addGoldSeed', name: '金の種を足す', emoji: '🌟', desc: '絵柄袋に金の種を1枚追加' },
  { id: 'addMelonSeed', name: 'メロンの種を足す', emoji: '🍈', desc: '絵柄袋にメロンの種を1枚追加' },
  { id: 'addThunder', name: '雷を足す', emoji: '⚡', desc: '絵柄袋に雷を1枚追加' },
  { id: 'addWatermelonSeed', name: 'スイカの種を足す', emoji: '🍉', desc: '絵柄袋にスイカの種を1枚追加' },
  { id: 'addHoe', name: '鍬を足す', emoji: '⛏️', desc: '絵柄袋に鍬を1枚追加' },
  { id: 'addBee', name: '蜂を足す', emoji: '🐝', desc: '絵柄袋に蜂を1枚追加' },
  { id: 'addMerchant', name: '商人を足す', emoji: '🧑‍🌾', desc: '絵柄袋に商人を1枚追加' },
  { id: 'addClover', name: '四つ葉を足す', emoji: '🍀', desc: '絵柄袋に四つ葉を1枚追加' },
  { id: 'addBlessRain', name: '豊穣の雨を足す', emoji: '🌈', desc: '絵柄袋に豊穣の雨（畑全部 成長+1）を1枚追加' },
  { id: 'addAmaterasu', name: '天照を足す', emoji: '🌞', desc: '絵柄袋に天照（縦横の列いっぱい 成長+2）を1枚追加' },
  { id: 'addMallet', name: '打出の小槌を足す', emoji: '🔨', desc: '絵柄袋に打出の小槌（今日の売値×2）を1枚追加' },
  { id: 'addMoon', name: '月を足す', emoji: '🌕', desc: '絵柄袋に月（満ち欠けして、満月で全作物＋1）を1枚追加。足すたびに高くなる' },
  { id: 'removeCrow', name: 'カラスを消す', emoji: '🐦', desc: '絵柄袋からカラスを1枚削除' },
  { id: 'removeBug', name: '虫を消す', emoji: '🐛', desc: '絵柄袋から虫を1枚削除' },
  { id: 'removeWeed', name: '雑草を消す', emoji: '🌾', desc: '絵柄袋から雑草を1枚削除' },
  { id: 'removeTanuki', name: 'タヌキを消す', emoji: '🦝', desc: '絵柄袋からタヌキを1枚削除' },
  { id: 'removeFrost', name: '霜を消す', emoji: '❄️', desc: '絵柄袋から霜を1枚削除' },
  { id: 'removeMole', name: 'モグラを消す', emoji: '🐀', desc: '絵柄袋からモグラを1枚削除' },
  { id: 'removeLocust', name: 'イナゴを消す', emoji: '🦗', desc: '絵柄袋からイナゴを1枚削除' },
];

/** 強化と、それが増減させる絵柄 */
export const UPGRADE_SYMBOL: Partial<Record<UpgradeId, { symbol: SymbolId; delta: number }>> = {
  addSeed: { symbol: 'seed', delta: 1 },
  addCan: { symbol: 'can', delta: 1 },
  addEgg: { symbol: 'egg', delta: 1 },
  addHawk: { symbol: 'hawk', delta: 1 },
  addBerrySeed: { symbol: 'berrySeed', delta: 1 },
  addPumpkinSeed: { symbol: 'pumpkinSeed', delta: 1 },
  addRain: { symbol: 'rain', delta: 1 },
  addSun: { symbol: 'sun', delta: 1 },
  addFertilizer: { symbol: 'fertilizer', delta: 1 },
  addGoldSeed: { symbol: 'goldSeed', delta: 1 },
  addMelonSeed: { symbol: 'melonSeed', delta: 1 },
  addThunder: { symbol: 'thunder', delta: 1 },
  addWatermelonSeed: { symbol: 'watermelonSeed', delta: 1 },
  addHoe: { symbol: 'hoe', delta: 1 },
  addBee: { symbol: 'bee', delta: 1 },
  addMerchant: { symbol: 'merchant', delta: 1 },
  addClover: { symbol: 'clover', delta: 1 },
  addMoon: { symbol: 'moon', delta: 1 },
  addBlessRain: { symbol: 'blessRain', delta: 1 },
  addAmaterasu: { symbol: 'amaterasu', delta: 1 },
  addMallet: { symbol: 'mallet', delta: 1 },
  removeCrow: { symbol: 'crow', delta: -1 },
  removeBug: { symbol: 'bug', delta: -1 },
  removeWeed: { symbol: 'weed', delta: -1 },
  removeTanuki: { symbol: 'tanuki', delta: -1 },
  removeFrost: { symbol: 'frost', delta: -1 },
  removeMole: { symbol: 'mole', delta: -1 },
  removeLocust: { symbol: 'locust', delta: -1 },
};

/** 道具をもらえるお守りと、もらえる道具 */
export const CHARM_PLACE: Partial<Record<CharmId, PlaceId>> = {
  scarecrow: 'bigScarecrow',
  goldenWell: 'goldenWell',
  queenHive: 'queenHive',
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
  /**
   * 条件で出る特別なお守り。bag＝袋の中身を満たすと次の年貢後の3択に必ず並ぶ（ふだんの抽選には出ない）、
   * event＝出来事を満たしたその場でもらえる。hint は図鑑で未達成のときに出す短いヒント
   */
  special?: { kind: 'bag' | 'event' | 'combo'; hint: string };
}

/** 曰く付きの代償の文（n 個持ったとき）。代償がなければ空 */
export function curseText(id: CharmId, n: number): string {
  return CHARM_CURSE[id]?.text(n) ?? '';
}

/**
 * 曰く付き：ふだんのお守りは強い代わりに、必ず何かを失う（n は持っている数）。
 * bag は取ったときに袋に入るお邪魔
 */
export const CHARM_CURSE: Partial<Record<CharmId, { text: (n: number) => string; bag?: Partial<Record<SymbolId, number>> }>> = {
  gentleRain: { text: () => '袋にカラス+1', bag: { crow: 1 } },
  aging: { text: () => '実った作物をカラスが食べやすい（×1.5）' },
  seedSack: { text: (n) => `年貢+${10 * n}%` },
  sunBlessing: { text: () => '袋にカラス+2', bag: { crow: 2 } },
  queenHive: { text: () => '袋に虫+2', bag: { bug: 2 } },
  scarecrow: { text: (n) => `年貢+${5 * n}%` },
  bumper: { text: (n) => `年貢+${10 * n}%` },
  bugWard: { text: () => '単品の売値がさらに半分' },
  artisan: { text: () => '年貢+20%' },
  rancher: { text: (n) => `作物の売値−${10 * n}%` },
  bigGame: { text: (n) => `列の倍率−${(0.2 * n).toFixed(1)}` },
  taxRelief: { text: (n) => `市の値段+${30 * n}%` },
  crowFriend: { text: () => '虫の効き目が2倍' },
  greedy: { text: () => '単品は売れない（列か大物だけ）' },
  earlyCrop: { text: () => '作物の売値−25%' },
  autumnHarvest: { text: (n) => `苺・トマトの売値−${20 * n}%` },
  thunderGod: { text: () => '袋に雑草+2', bag: { weed: 2 } },
  moonViewing: { text: () => '満月を使った日は売値−20%' },
  bigSpender: { text: () => 'フィーバーのない日は売値−10%' },
  declutter: { text: () => '仕入れが2択になる' },
  farmMaster: { text: () => '置き物の値段+40%' },
};

/** お守り。年貢を納めるたびに charmChoices 個から1つ選ぶ。同じものは重ねて効果アップ */
export const CHARMS: Record<CharmId, CharmDef> = {
  coinPurse: { id: 'coinPurse', tier: 'uncommon', name: '金貨袋', emoji: '👛', desc: (n) => `金貨の額＋${2 * n}`, max: Infinity },
  gentleRain: { id: 'gentleRain', tier: 'uncommon', name: '恵みの雨', emoji: '☔', desc: (n) => `雨の中心 さらに成長＋${2 * n}`, max: 3 },
  crowToll: { id: 'crowToll', tier: 'common', name: 'カラスの通行料', emoji: '🪶', desc: (n) => `カラスが来るたびに＋${2 * n}`, max: Infinity },
  aging: { id: 'aging', tier: 'common', name: '熟成', emoji: '🍷', desc: (n) => `実ったまま1日ごとに売値＋${10 * n}%（3日まで）`, max: 3 },
  seedSack: { id: 'seedSack', tier: 'rare', name: '大きな種袋', emoji: '🎒', desc: (n) => `種1枚で植える数+${n}（トマト${3 + n}〜${5 + n}個）`, max: 2 },
  sunBlessing: { id: 'sunBlessing', tier: 'rare', name: '日だまり', emoji: '🌻', desc: (n) => `太陽の成長＋${n}`, max: 2 },
  goldenWell: { id: 'goldenWell', tier: 'rare', name: '黄金の井戸', emoji: '⛲', desc: () => '黄金の井戸を置く（周り8マス 毎日+1）', max: Infinity },
  queenHive: { id: 'queenHive', tier: 'uncommon', name: '女王蜂の巣箱', emoji: '👑', desc: () => '女王蜂の巣箱を置く（周り8マス 売値+50%）', max: 2 },
  bargain: { id: 'bargain', tier: 'uncommon', name: '値切り上手', emoji: '🏷️', desc: (n) => `強化の価格−${Math.min(50, 10 * n)}%`, max: 5 },
  scarecrow: { id: 'scarecrow', tier: 'common', name: '大かかし', emoji: '🎃', desc: () => '大かかしを置く（2マス以内を守る。カラスが出た日は袋のカラスも1枚追い出す）', max: 3 },
  bumper: { id: 'bumper', tier: 'rare', name: '豊作', emoji: '🧺', desc: (n) => `金以外の作物 売値＋${15 * n}%`, max: 3 },
  goldLuck: { id: 'goldLuck', tier: 'uncommon', name: '金運', emoji: '🐱', desc: (n) => `金のとうもろこし 売値＋${10 * n}`, max: 3 },
  bugWard: { id: 'bugWard', tier: 'common', name: '草よけ', emoji: '🌿', desc: (n) => `虫・雑草を${Math.round((1 - Math.pow(0.5, n)) * 100)}%防ぐ・草むしり無料`, max: 4 },
  heater: { id: 'heater', tier: 'common', name: '湯たんぽ', emoji: '♨️', desc: () => '霜が1日で溶ける', max: 1 },
  artisan: { id: 'artisan', tier: 'rare', name: 'からくり職人', emoji: '🎰', desc: (n) => `リール＋${n}`, max: 1 },
  rancher: { id: 'rancher', tier: 'uncommon', name: '牧場主', emoji: '🤠', desc: (n) => `鶏小屋・牛小屋の収入＋${2 * n}`, max: 3 },
  bigGame: { id: 'bigGame', tier: 'uncommon', name: '大物狙い', emoji: '🍉', desc: (n) => `スイカの売値＋${50 * n}`, max: 3 },
  wheelwright: { id: 'wheelwright', tier: 'uncommon', name: '水車職人', emoji: '🛞', desc: () => '水車のお金×2', max: 1 },
  tillMaster: { id: 'tillMaster', tier: 'common', name: '耕作上手', emoji: '⛏️', desc: () => '耕した土に植えると成長+2', max: 1 },
  taxRelief: { id: 'taxRelief', tier: 'uncommon', name: '年貢の減免', emoji: '📜', desc: (n) => `年貢−${Math.min(30, 10 * n)}%`, max: 3 },
  // 組み合わせ（お守りではない）：同じ日のスロットに2つそろうと、その日だけ自動で起きる（COMBOS）
  thunderstorm: { id: 'thunderstorm', tier: 'rare', name: '雷雨', emoji: '⛈️', desc: () => '今日は雨が斜めにも効く', max: 1, special: { kind: 'combo', hint: '雨2つと雷がそろうと…？' } },
  tomatoFest: { id: 'tomatoFest', tier: 'rare', name: 'トマト祭り', emoji: '🍅', desc: () => '今日はトマトだけの列 さらに×1.5', max: 1, special: { kind: 'combo', hint: 'トマトの種が2つ出ると…？' } },
  sunshower: { id: 'sunshower', tier: 'rare', name: '天気雨', emoji: '🌦️', desc: () => '今日は雨と太陽が重なったマス +1', max: 1, special: { kind: 'combo', hint: '雨と太陽とトマトの種がそろうと…？' } },
  moonFeast: { id: 'moonFeast', tier: 'rare', name: '月の宴', emoji: '🎑', desc: () => '今日は満月がさらに+1', max: 1, special: { kind: 'combo', hint: '満月と太陽と金貨がそろうと…？' } },
  flowerField: { id: 'flowerField', tier: 'rare', name: '花畑', emoji: '🌸', desc: () => '今日は苺だけの列 さらに×1.5', max: 1, special: { kind: 'combo', hint: '蜂と苺の種と太陽がそろうと…？' } },
  bolt: { id: 'bolt', tier: 'rare', name: '青天の霹靂', emoji: '🌩️', desc: () => '今日は雷が縦にも効く（十字）', max: 1, special: { kind: 'combo', hint: '雷と太陽2つがそろうと…？' } },
  sowing: { id: 'sowing', tier: 'rare', name: '種まき日和', emoji: '🌱', desc: () => '今日植える作物は成長+1から', max: 1, special: { kind: 'combo', hint: '鍬とトマトの種2つがそろうと…？' } },
  harvestMoon: { id: 'harvestMoon', tier: 'rare', name: '秋の月', emoji: '🎃', desc: () => '今日はかぼちゃの売値×2', max: 1, special: { kind: 'combo', hint: 'かぼちゃの種と満月と雨がそろうと…？' } },
  prosperity: { id: 'prosperity', tier: 'rare', name: '商売繁盛', emoji: '💰', desc: () => '今日は金貨の額×2', max: 1, special: { kind: 'combo', hint: '商人と金貨2つがそろうと…？' } },
  festival: { id: 'festival', tier: 'rare', name: '豊年祭', emoji: '🎊', desc: () => '今日は全部の売値×1.5', max: 1, special: { kind: 'combo', hint: '雨と太陽と満月がそろうと…？' } },
  bumperHarvest: { id: 'bumperHarvest', tier: 'rare', name: '大豊作', emoji: '🌾', desc: () => '畑いっぱいの作物を一度に売った！（1回だけの大当たり）', max: 1, special: { kind: 'event', hint: '畑いっぱいを一度に売ると…？' } },
  crowReturn: { id: 'crowReturn', tier: 'rare', name: 'カラス返し', emoji: '🪃', desc: () => 'カラスが来るたび +3', max: 1, special: { kind: 'event', hint: 'カラスにたくさん食べられると…？' } },
  lastStraw: { id: 'lastStraw', tier: 'rare', name: '首の皮', emoji: '🧵', desc: () => '次の年貢が半分', max: 1, special: { kind: 'event', hint: '年貢をギリギリで…？' } },
  crowFriend: { id: 'crowFriend', tier: 'uncommon', name: 'カラスの友', emoji: '🐦', desc: () => 'カラスが作物を食べず、来るたびに+3', max: 1 },
  greedy: { id: 'greedy', tier: 'uncommon', name: '欲張り', emoji: '💰', desc: () => '列の倍率+0.2', max: 1 },
  earlyCrop: { id: 'earlyCrop', tier: 'rare', name: '早生', emoji: '🌱', desc: () => '植えた作物は1段階育った状態から（1回早く実る）', max: 1 },
  autumnHarvest: { id: 'autumnHarvest', tier: 'uncommon', name: '秋の実り', emoji: '🍂', desc: (n) => `かぼちゃ・スイカの売値+${50 * n}%`, max: 2 },
  thunderGod: { id: 'thunderGod', tier: 'uncommon', name: '雷さま', emoji: '⚡', desc: (n) => `雷の成長+${n}`, max: 2 },
  moonViewing: { id: 'moonViewing', tier: 'uncommon', name: '月見', emoji: '🌕', desc: () => '月が2つずつ満ちる（新月→半月→満月）', max: 1 },
  bigSpender: { id: 'bigSpender', tier: 'rare', name: '大判振る舞い', emoji: '💰', desc: () => 'フィーバーの大当たり×2', max: 1 },
  declutter: { id: 'declutter', tier: 'uncommon', name: '断捨離', emoji: '🧹', desc: () => '札を捨てる値段が半分・市で2回まで', max: 1 },
  farmMaster: { id: 'farmMaster', tier: 'uncommon', name: '畑仕事の名人', emoji: '🧑‍🌾', desc: () => '畑を広げる値段−40%', max: 1 },
  exhibition: { id: 'exhibition', tier: 'rare', name: '品評会', emoji: '🏅', desc: () => '作物の売値+20%', max: 1, special: { kind: 'event', hint: '作物を全種類売ると…？' } },
};

export const CHARM_ORDER = Object.keys(CHARMS) as CharmId[];
/** 一時停止中・廃止したお守り（図鑑・解放の一覧に出さない）。トマト祭りは廃止（古いセーブで持っていても効く） */
export const PAUSED_CHARMS: CharmId[] = ['tomatoFest', ...CUT.charms, ...(CONFIG.exhibitionOn ? [] : ['exhibition' as CharmId])];

/** ふだんの抽選に出るお守り（特別なお守りは条件でしか出ない） */
export const NORMAL_CHARMS = CHARM_ORDER.filter((id) => !CHARMS[id].special);

/** 袋の中身で開く特別なお守りの条件（この枚数以上） */
export const BAG_CONDITIONS: Partial<Record<CharmId, Partial<Record<SymbolId, number>>>> = {};

/** 組み合わせの効き目 */
export const COMBO_POWER = {
  /** 作物だけの列の倍率（トマト祭り・花畑） */
  cropLine: 1.5,
  /** かぼちゃの売値（秋の月） */
  harvestMoon: 2,
  /** 金貨の額（商売繁盛） */
  prosperity: 2,
  /** 全部の売値（豊年祭） */
  festival: 1.5,
};

/** 組み合わせ：同じ日のスロットにこの絵柄がそろうと、その日だけ自動で起きる */
const ALL_COMBOS: Partial<Record<CharmId, Partial<Record<SymbolId, number>>>> = {
  // リール3つの絵柄がそろったときだけ起きる（2つでそろうと出すぎたので3つに）
  thunderstorm: { rain: 2, thunder: 1 },
  sunshower: { rain: 1, sun: 1, seed: 1 },
  moonFeast: { moon: 1, sun: 1, coin: 1 },
  flowerField: { bee: 1, berrySeed: 1, sun: 1 },
  bolt: { thunder: 1, sun: 2 },
  sowing: { hoe: 1, seed: 2 },
  harvestMoon: { pumpkinSeed: 1, moon: 1, rain: 1 },
  prosperity: { merchant: 1, coin: 2 },
  festival: { rain: 1, sun: 1, moon: 1 },
};
export const COMBOS = Object.fromEntries(Object.entries(ALL_COMBOS).filter(([id]) => !CUT.charms.includes(id as CharmId))) as typeof ALL_COMBOS;

/** 減らした絵柄を足す品か */
export function isCutAdd(id: string): boolean {
  const sym = UPGRADE_SYMBOL[id as UpgradeId]?.symbol;
  return !!sym && CUT.symbols.includes(sym);
}

/** 出来事で開く特別なお守りの条件の数 */
export const EVENT_CONDITIONS = {
  /** カラスに食べられた回数 */
  crowReturn: 5,
  /** 年貢を払ったあとの残りがこの金額以下（lastStrawFrom 回目の年貢から） */
  lastStraw: 10,
  lastStrawFrom: 3,
};

/** 道具の進化：この回数働くと上位の道具に変わる */
export const TOOL_EVOLVE: Partial<Record<PlaceId, { to: PlaceId; need: number; what: string }>> = {
  scarecrow: { to: 'bigScarecrow', need: 10, what: '守る' },
  well: { to: 'goldenWell', need: 20, what: '育てる' },
  hive: { to: 'queenHive', need: 10, what: '列で売る' },
};

/** 難しいモードの段階。1つ下をクリアすると次が開く。厳しさは積み重なる */
export const DIFFICULTIES = [
  { name: 'ふつう', desc: '' },
  { name: '難しい1', desc: '年貢×1.15' },
  { name: '難しい2', desc: 'ショップ×1.3・年貢×1.2' },
  { name: '難しい3', desc: 'お邪魔が早く来る・年貢×1.3' },
  { name: '難しい4', desc: '単品×0.3・年貢×1.45' },
  { name: '難しい5', desc: '増えるイナゴ・年貢×1.5' },
];

/** 農家：最初の袋（いつもの袋からの増減）・最初のお守り・最初に持っている畑の品・市に出やすい品（2倍） */
/** 農家の腕前の1段：始めの所持金・袋の札・最初に持っている畑の品 */
export interface FarmerPerk {
  gold?: number;
  bag?: Partial<Record<SymbolId, number>>;
  stock?: PlaceId[];
}

export interface FarmerDef {
  id: string;
  name: string;
  /** 一言の説明（勝ち筋） */
  desc: string;
  /** 準備画面の絵 */
  art: string;
  bag: Partial<Record<SymbolId, number>>;
  charms: Partial<Record<CharmId, number>>;
  stock: PlaceId[];
  favor: UpgradeId[];
  /** 市の畑の品にいつも並ぶ品 */
  favorPlaces?: PlaceId[];
  /** この難しさ（DIFFICULTIES の番号）をクリアすると解放。なければ最初から */
  unlockClear?: number;
  /** 初めてこの農家で遊ぶときのこつ */
  tip?: string;
  /** 腕前（ポイントで1段ずつ上げる）。段ごとに始めに足される物 */
  mastery?: FarmerPerk[];
}

export const FARMERS: FarmerDef[] = [
  { id: 'basic', name: 'ふつうの農家', desc: 'いつもの袋で、何でも育てる。日だまりつき', art: 'tomato', bag: {}, charms: { sunBlessing: 1 }, stock: [], favor: [], mastery: [{ bag: { rain: 1 } }, { gold: 15 }, { stock: ['scarecrow'] }] },
  { id: 'berry', name: '苺農家', desc: '苺の列で数を売る。市にいつも巣箱。草よけつき', art: 'strawberry', bag: { seed: -2, berrySeed: 3 }, charms: { bugWard: 1 }, stock: [], favor: ['addBerrySeed', 'addBee'], favorPlaces: ['hive'], unlockClear: 0, tip: '苺は2日で実る。市の巣箱を苺の近くに置くと、毎晩育って売値も上がる', mastery: [{ bag: { berrySeed: 1 } }, { gold: 15 }, { bag: { bee: 1 } }] },
  { id: 'pumpkin', name: 'かぼちゃ農家', desc: '大物を1つずつ高く売る。欲張りつき', art: 'pumpkin', bag: { seed: -1, pumpkinSeed: 1 }, charms: { greedy: 1 }, stock: [], favor: ['addPumpkinSeed', 'addWatermelonSeed', 'addFertilizer'], unlockClear: 1, tip: 'かぼちゃは高く売れて、カラスに食べられない。肥料と組み合わせよう', mastery: [{ bag: { fertilizer: 1 } }, { gold: 15 }, { stock: ['compost'] }] },
  { id: 'rancher', name: '牧場主', desc: '小屋で毎晩お金を稼ぐ。市にいつも鶏小屋。牧場主つき', art: 'henhouse', bag: {}, charms: { rancher: 1 }, stock: [], favor: [], favorPlaces: ['henhouse'], unlockClear: 2, tip: '市にいつも鶏小屋。早めに買って置くと、毎晩お金が入る', mastery: [{ bag: { coin: 1 } }, { gold: 15 }, { stock: ['henhouse'] }] },
  { id: 'rain', name: '雨乞い', desc: '雨で一気に育てる。恵みの雨つき', art: 'rain', bag: { rain: 1, sun: -1 }, charms: { gentleRain: 1 }, stock: [], favor: ['addRain', 'addThunder'], unlockClear: 3, tip: '雨の真ん中のマスはさらに+1（恵みの雨）。雨を中心に組み立てよう', mastery: [{ bag: { rain: 1 } }, { gold: 15 }, { bag: { thunder: 1 } }] },
];

/** 「足す」強化（ゲーム開始時にショップへ並べるものを選ぶ対象） */
export type AddUpgradeId = Exclude<UpgradeId, `remove${string}`>;

/**
 * 遊ぶたびに増える要素（メタ進行）。
 * ゲーム終了時に豊穣ポイントを獲得し、準備画面で「足す」強化やレアのお守りを解放する。
 * 解放した「足す」強化は、毎回コスト上限内でショップに並べるものを選ぶ。
 */
export const META = {
  /** 豊穣ポイント = 到達日数 × perDay + 年貢の納付回数 × perTax（クリアしていれば clearBonus を加算） */
  pointsPerDay: 0.5,
  pointsPerTax: 3,
  clearBonus: 20,
  /** 最初から解放されている「足す」強化 */
  // 最初から並ぶ札（はじめての人が雨・太陽だけにならないように。上級の物だけポイントで解放）
  startUnlocked: ['addSun', 'addRain', 'addSeed', 'addBerrySeed', 'addPumpkinSeed', 'addFertilizer', 'addBee', 'addCan', 'addEgg', 'addHawk'] as AddUpgradeId[],
  /** 「足す」強化の解放ポイントと、ショップに並べるコスト */
  adds: {
    addSun: { unlock: 0, cost: 2 },
    addCan: { unlock: 0, cost: 1 },
    addEgg: { unlock: 0, cost: 2 },
    addHawk: { unlock: 0, cost: 2 },
    addRain: { unlock: 0, cost: 1 },
    addSeed: { unlock: 20, cost: 1 },
    addBerrySeed: { unlock: 15, cost: 1 },
    addPumpkinSeed: { unlock: 30, cost: 2 },
    addFertilizer: { unlock: 25, cost: 2 },
    addBee: { unlock: 35, cost: 2 },
    addMerchant: { unlock: 35, cost: 2 },
    addGoldSeed: { unlock: 45, cost: 3 },
    // メロン・雷はポイントでは買えず、達成で解放される（ACHIEVE_ADDS）
    addMelonSeed: { unlock: 0, cost: 2 },
    addThunder: { unlock: 0, cost: 3 },
    addClover: { unlock: 60, cost: 3 },
    addHoe: { unlock: 25, cost: 1 },
    addWatermelonSeed: { unlock: 40, cost: 3 },
    // 満月・金の種はレア仕入れ（準備では選べない。rareOffers）
    addMoon: { unlock: 0, cost: 0 },
    // スーパーレアは解放するまで市に出ない
    addBlessRain: { unlock: 120, cost: 0 },
    addAmaterasu: { unlock: 100, cost: 0 },
    addMallet: { unlock: 150, cost: 0 },
  } as Record<AddUpgradeId, { unlock: number; cost: number }>,
  /** レアのお守りは解放するまで出ない */
  // あとから足したお守りも、解放するまで出ない（初めのうちは3択が薄まらない）
  charmUnlock: { sunBlessing: 50, bumper: 50, seedSack: 40, autumnHarvest: 40, thunderGod: 40, moonViewing: 40, declutter: 40, farmMaster: 50, bigSpender: 60 } as Partial<Record<CharmId, number>>,
  /** 組み合わせのヒント（まだの組み合わせの絵柄を1つ見せる）の値段 */
  comboHintPrice: 20,
  /** 列の演出（見た目だけ。遊びは変わらない）：名前・絵・ひと言・値段 */
  lineFx: [
    { id: 'leaves', name: '若葉の風', ico: 'leafBit', desc: '葉っぱが舞う', price: 60 },
    { id: 'coins', name: '金貨の雨', ico: 'coin', desc: '金貨が降る', price: 80 },
    { id: 'stars', name: '星くず', ico: 'star', desc: '星がきらきら降る', price: 100 },
    { id: 'hearts', name: 'ハートの雨', ico: 'heart', desc: 'ハートがふわふわ降る', price: 100 },
    { id: 'butterflies', name: 'ちょうちょ', ico: 'butterfly', desc: 'ちょうちょが飛び立つ', price: 120 },
    { id: 'fireworks', name: '打ち上げ花火', ico: 'sparkle', desc: '花火が上がる', price: 150 },
  ] as const,
  /** 農家の腕前を1段上げる値段（段1・段2・段3） */
  masteryPrices: [60, 120, 200],
  /** ショップに並べられるコストの上限と、その拡張 */
  baseCapacity: 4,
  capacityStep: 2,
  capacityPrices: [70, 130, 220],
};

/** 達成で解放される「足す」強化と、その条件（meta.ts の achievements で判定） */
export const ACHIEVE_ADDS: Partial<Record<AddUpgradeId, { hint: string; done: string }>> = {
  addMelonSeed: { hint: '初めてクリアすると…？', done: '初めてクリア' },
  addThunder: { hint: '列をたくさん売ると…？', done: '累計で列を100回売る' },
};

/** 累計の列の数で雷が解放される */
export const THUNDER_LINES = 100;

// ---- 英語表示：名前と説明を差し替える ----
if (EN) {
  const sym: Partial<Record<SymbolId, [string, string, string]>> = {
    seed: ['Tomato Seed', 'Plant 3–5 tomatoes', 'Breeding: tomatoes planted today start one stage grown'],
    berrySeed: ['Strawberry Seed', 'Plant 4–6 strawberries', 'Breeding: strawberries planted today start one stage grown'],
    pumpkinSeed: ['Pumpkin Seed', 'Plant 1 pumpkin', 'Breeding: pumpkins planted today start one stage grown'],
    melonSeed: ['Melon Seed', 'Plant 1 melon', 'Breeding: melons planted today start one stage grown'],
    watermelonSeed: ['Watermelon Seed', 'Plant 1 watermelon (2×2)', 'Breeding: watermelons planted today start one stage grown'],
    goldSeed: ['Golden Seed', 'Plant golden corn', 'Golden harvest: jackpot ×3'],
    rain: ['Rain', 'Cross: growth +1', 'Rainbow: all crops +1'],
    sun: ['Sun', 'Column: growth +1', 'Summer festival: prices ×2 today'],
    fertilizer: ['Fertilizer', 'Price ×1.5', 'Compost: fertilize every crop'],
    bee: ['Bee', 'Diagonals: growth +1', 'Honey: +4g per crop'],
    crow: ['Crow', 'Goes for your most valuable crop; eats it 1/2 of the time (pumpkins/melons get pecked: price −20%)', 'Flock: chance 1/2 → 3/4'],
    bug: ['Bug', 'Your most valuable crop: growth −1', 'Swarm: growth −2'],
    coin: ['Coin', '+gold', 'Jackpot ×3'],
    merchant: ['Merchant', 'Prices ×1.5 today', 'Big deal: buys all ripe crops now at ×2'],
    clover: ['Clover', 'Golden seed more likely tomorrow', 'Luck: pick a charm'],
    thunder: ['Thunder', 'Row: growth +2', 'Great thunder: all crops +1'],
    hoe: ['Hoe', 'Clears weeds/frost in a row and tills (next crop +1)', 'Great tilling: till the whole field'],
    blessRain: ['Bountiful Rain', 'Whole field +1', 'Rainbow: all crops +1'],
    amaterasu: ['Amaterasu', 'Full row and column +2', 'Festival: today ×2'],
    mallet: ['Lucky Mallet', "Today's prices ×2", 'Jackpot ×3'],
    moon: ['Moon', 'Waxes each time it appears (new → crescent → half → full). Only a full moon works: all crops +1, then back to new', 'Moon feast: all crops +1 more'],
    weed: ['Weed', 'Blocks empty plots next to crops and spreads', 'Overgrowth: sprouts in 2 places'],
    tanuki: ['Tanuki', 'Steals ripe crops', 'Pack: takes 2'],
    frost: ['Frost', 'Freezes a plot for 3 days', 'Cold snap: freezes 2 plots'],
    mole: ['Mole', 'Pushes a crop into a nearby empty plot', 'Pack: pushes 2'],
    locust: ['Locust', 'Each time it appears, 1/2 chance another joins your bag (never eats crops)', 'Plague: 2 join instead of 1'],
    oniSeed: ['Ogre Tomato Seed', 'Plant 3–5 Ogre Tomatoes (price 12)', 'Breeding: Ogre Tomatoes planted today start +1'],
    heartSeed: ['Heart Berry Seed', 'Plant 4–6 Heart Berries (price 9)', 'Breeding: Heart Berries planted today start +1'],
    lanternSeed: ['Lantern Pumpkin Seed', 'Plant 1 Lantern Pumpkin (ripe in 4, price 60)', 'Breeding: Lantern Pumpkins planted today start +1'],
    boxSeed: ['Square Melon Seed', 'Plant 1 Square Melon (2×2, ripe in 5, price 220)', 'Breeding: Square Melons planted today start +1'],
    bigRain: ['Downpour', 'Cross: growth +1 (center +2)', 'Rainbow: all crops +1'],
    bigSun: ['Midsummer Sun', '3 columns: growth +1', 'Summer festival: prices ×2 today'],
    raijin: ['Thunder God', 'Row: growth +3', 'Great thunder: all crops +1'],
    queenBee: ['Queen Bee', 'Full diagonals: growth +1', 'Honey: +4g per crop'],
    superFert: ['Premium Fertilizer', 'Crops in a plus (5): price ×1.5', 'Compost: fertilize every crop'],
    can: ['Watering Can', '1 plot: growth +2', 'Jackpot ×3'],
    egg: ['Egg', 'Hatches into a swallow after appearing 3 times', 'Jackpot ×3'],
    swallow: ['Swallow', 'Drives 1 bug out of your bag (+2g if none)', 'Jackpot ×3'],
    hawk: ['Hawk', 'Drives 1 crow out of your bag (+2g if none)', 'Jackpot ×3'],
    koban: ['Gold Koban', '+12g (+3g per tax paid)', 'Jackpot ×3'],
  };
  (Object.keys(sym) as SymbolId[]).forEach((id) => {
    const [name, desc, feverDesc] = sym[id]!;
    Object.assign(SYMBOLS[id], { name, desc, feverDesc });
  });
  const crop: Record<CropKind, string> = { strawberry: 'Strawberry', tomato: 'Tomato', pumpkin: 'Pumpkin', melon: 'Melon', corn: 'Golden Corn', watermelon: 'Watermelon', oniTomato: 'Ogre Tomato', heartBerry: 'Heart Berry', lanternPumpkin: 'Lantern Pumpkin', boxMelon: 'Square Melon' };
  (Object.keys(crop) as CropKind[]).forEach((k) => (CROPS[k].name = crop[k]));
  Object.assign(SHAPE_NAMES, { cross: 'Cross', column: 'Column', row: 'Row', x: 'Diagonals', all: 'Whole field', one: '1 square', col3: '3 columns', xline: 'Diagonal lines', box: '3×3', plus: 'Plus (5)' });
  const place: Record<PlaceId, [string, string]> = {
    scarecrow: ['Scarecrow', 'Guards the 8 plots around it from crows, bugs and weeds'],
    bigScarecrow: ['Big Scarecrow', 'Guards everything within 2 plots from crows, bugs and weeds. Drives 1 crow out of your bag on days a crow appears'],
    well: ['Well', 'Up/down/left/right +1 growth each day'],
    goldenWell: ['Golden Well', 'The 8 plots around +1 growth each day'],
    hive: ['Beehive', '8 plots around: price +20%; strawberries grow nightly'],
    queenHive: ['Queen Hive', '8 plots around: price +50%; strawberries grow nightly'],
    henhouse: ['Henhouse', '+3g daily; eats nearby bugs (+3g), scares off moles'],
    cowshed: ['Cowshed', '+4g daily; +2 next to water'],
    compost: ['Compost Plot', 'Price ×2'],
    water: ['Water Plot', '+1 daily; 3 in a row = waterwheel; surround a plot = fishing pond'],
    sprinkler: ['Sprinkler', 'Its row +1 every night'],
    reservoir: ['Reservoir', 'Its column +1 every night'],
    windmill: ['Windmill', 'Its row and column +1 every night'],
  };
  (Object.keys(place) as PlaceId[]).forEach((id) => Object.assign(PLACES[id], { name: place[id][0], desc: place[id][1] }));
  Object.assign(CONFIG.pivotAdds, {
    addBerrySeed: 'Strawberry: ripens in 2 days, grows near hives',
    addPumpkinSeed: 'Pumpkin: pricey and crow-proof',
    addMelonSeed: 'Melon: one big earner',
    addWatermelonSeed: 'Watermelon: a 2×2 heavy hitter',
    addGoldSeed: 'Golden corn: rare and valuable',
    addHoe: 'Hoe: till for faster crops',
    addThunder: 'Thunder: grow a whole row at once',
    addMerchant: 'Merchant: pick your day to sell high',
  });
  Object.assign(CONFIG.pivotPlaces, {
    henhouse: 'Henhouse: nightly gold + pest control',
    cowshed: 'Cowshed: earn gold every night',
    hive: 'Beehive: higher prices + strawberries',
    water: 'Water: wheels in a row, ponds when enclosed',
    well: 'Well: grows its neighbours nightly',
  });
  const up: Partial<Record<UpgradeId, string>> = {
    addSeed: 'Tomato Seed', addBerrySeed: 'Strawberry Seed', addPumpkinSeed: 'Pumpkin Seed', addRain: 'Rain', addSun: 'Sun', addFertilizer: 'Fertilizer',
    addGoldSeed: 'Golden Seed', addMelonSeed: 'Melon Seed', addThunder: 'Thunder', addWatermelonSeed: 'Watermelon Seed', addHoe: 'Hoe', addBee: 'Bee',
    addMerchant: 'Merchant', addClover: 'Clover', addMoon: 'Moon', addBlessRain: 'Bountiful Rain', addAmaterasu: 'Amaterasu', addMallet: 'Lucky Mallet', addCan: 'Watering Can', addEgg: 'Egg', addHawk: 'Hawk',
    removeCrow: 'Crow', removeBug: 'Bug', removeWeed: 'Weed', removeTanuki: 'Tanuki', removeFrost: 'Frost', removeMole: 'Mole', removeLocust: 'Locust',
  };
  UPGRADES.forEach((u) => {
    const what = up[u.id]!;
    const remove = u.id.startsWith('remove');
    u.name = remove ? `Remove ${what}` : `Add ${what}`;
    u.desc = remove ? `Remove one ${what} from the bag` : u.id === 'addMoon' ? 'Add one Full Moon (all crops +1) to the bag. Costs more each time' : `Add one ${what} to the bag`;
  });
  Object.assign(CHARM_TIER_NAMES, { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' });
  const curse: Partial<Record<CharmId, (n: number) => string>> = {
    gentleRain: () => '+1 crow in your bag', aging: () => 'Crows eat ripe crops more (×1.5)', seedSack: (n) => `Tax +${10 * n}%`,
    sunBlessing: () => '+2 crows in your bag', queenHive: () => '+2 bugs in your bag', scarecrow: (n) => `Tax +${5 * n}%`, bumper: (n) => `Tax +${10 * n}%`,
    bugWard: () => 'Singles sell for half again', artisan: () => 'Tax +20%', rancher: (n) => `Crop prices −${10 * n}%`, bigGame: (n) => `Line multiplier −${(0.2 * n).toFixed(1)}`,
    taxRelief: (n) => `Market prices +${30 * n}%`, crowFriend: () => 'Bugs hit twice as hard', greedy: () => 'Singles can’t be sold (lines or big crops only)', earlyCrop: () => 'Crop prices −25%',
    autumnHarvest: (n) => `Strawberry & tomato prices −${20 * n}%`, thunderGod: () => '+2 weeds in your bag', moonViewing: () => 'Prices −20% on the day you use a full moon', bigSpender: () => 'Prices −10% on days without a fever', declutter: () => 'Daily pick shows only 2 choices', farmMaster: () => 'Placeable prices +40%',
  };
  (Object.keys(curse) as CharmId[]).forEach((id) => CHARM_CURSE[id] && (CHARM_CURSE[id]!.text = curse[id]!));
  const charm: Partial<Record<CharmId, [string, (n: number) => string, string?]>> = {
    coinPurse: ['Coin Purse', (n) => `Coins +${2 * n}g`],
    gentleRain: ['Gentle Rain', (n) => `Rain center +${2 * n} more growth`],
    crowToll: ['Crow Toll', (n) => `+${2 * n}g whenever a crow comes`],
    aging: ['Aging', (n) => `Ripe crops gain +${10 * n}% price per day (up to 3 days)`],
    seedSack: ['Big Seed Sack', (n) => `Every seed plants +${n} more`],
    sunBlessing: ['Sunny Spot', (n) => `Sun growth +${n}`],
    goldenWell: ['Golden Well', () => 'Place a Golden Well (8 around +1 daily)'],
    queenHive: ['Queen Hive', () => 'Place a Queen Hive (8 around price +50%)'],
    bargain: ['Haggler', (n) => `Shop prices −${Math.min(50, 10 * n)}%`],
    scarecrow: ['Big Scarecrow', () => 'Place a Big Scarecrow (guards within 2)'],
    bumper: ['Good Harvest', (n) => `Non-gold crops price +${15 * n}%`],
    goldLuck: ['Lucky Cat', (n) => `Golden corn price +${10 * n}`],
    bugWard: ['Pest Ward', (n) => `Blocks ${Math.round((1 - Math.pow(0.5, n)) * 100)}% of bugs/weeds; free weeding`],
    heater: ['Hot Water Bottle', () => 'Frost melts in 1 day'],
    artisan: ['Clockmaker', (n) => `Reels +${n}`],
    rancher: ['Rancher', (n) => `Henhouse/cowshed income +${2 * n}`],
    bigGame: ['Big Game', (n) => `Watermelon price +${50 * n}`],
    wheelwright: ['Wheelwright', () => 'Waterwheel gold ×2'],
    tillMaster: ['Master Tiller', () => 'Planting on tilled soil gives +2 growth'],
    taxRelief: ['Tax Relief', (n) => `Taxes −${Math.min(30, 10 * n)}%`],
    thunderstorm: ['Thunderstorm', () => 'Today rain also reaches diagonals', 'Two rains and a thunder…?'],
    tomatoFest: ['Tomato Festival', () => 'Today tomato-only lines ×1.5 more', 'Two tomato seeds…?'],
    sunshower: ['Sunshower', () => 'Today plots hit by both rain and sun +1', 'Rain, sun and a tomato seed…?'],
    moonFeast: ['Moon Feast', () => 'Today the full moon gives +1 more', 'Full moon, sun and a coin…?'],
    flowerField: ['Flower Field', () => 'Today strawberry-only lines ×1.5 more', 'Bee, strawberry seed and sun…?'],
    bolt: ['Bolt from the Blue', () => 'Today thunder also hits its column (cross)', 'Thunder and two suns…?'],
    sowing: ['Sowing Day', () => 'Crops planted today start at +1 growth', 'A hoe and two tomato seeds…?'],
    harvestMoon: ['Harvest Moon', () => 'Today pumpkin price ×2', 'Pumpkin seed, full moon and rain…?'],
    prosperity: ['Prosperity', () => 'Today coins are worth ×2', 'A merchant and two coins…?'],
    festival: ['Harvest Festival', () => 'Today all prices ×1.5', 'Rain, sun and full moon all at once…?'],
    bumperHarvest: ['Big Harvest', () => 'Sold a full field at once! (one-time jackpot)', 'Sell a full field at once…?'],
    crowReturn: ['Crow Payback', () => '+3g whenever a crow comes', 'If crows eat a lot…?'],
    lastStraw: ['By a Thread', () => 'Next tax is halved', 'Pay a tax with almost nothing left…?'],
    crowFriend: ['Crow Friend', () => 'Crows never eat crops; +3g each visit'],
    greedy: ['Greedy', () => 'Line multiplier +0.2'],
    earlyCrop: ['Early Crop', () => 'Planted crops start 1 stage grown'],
    autumnHarvest: ['Autumn Harvest', (n) => `Pumpkin & watermelon prices +${50 * n}%`],
    thunderGod: ['Thunder God', (n) => `Thunder growth +${n}`],
    moonViewing: ['Moon Viewing', () => 'The moon waxes 2 steps at a time'],
    bigSpender: ['Big Spender', () => 'Fever jackpots ×2'],
    declutter: ['Declutter', () => 'Discarding costs half, twice per market'],
    farmMaster: ['Master Farmer', () => 'Field expansion −40%'],
    exhibition: ['Fair Prize', () => 'Crop prices +20%', 'Sell every kind of crop…?'],
  };
  (Object.keys(charm) as CharmId[]).forEach((id) => {
    const [name, desc, hint] = charm[id]!;
    Object.assign(CHARMS[id], { name, desc });
    if (hint && CHARMS[id].special) CHARMS[id].special!.hint = hint;
  });
  Object.assign(TOOL_EVOLVE.scarecrow!, { what: 'Guard' });
  Object.assign(TOOL_EVOLVE.well!, { what: 'Grow' });
  Object.assign(TOOL_EVOLVE.hive!, { what: 'Line sale' });
  const farmer: Record<string, [string, string]> = {
    basic: ['Farmer', 'The usual bag; grow anything'],
    berry: ['Berry Farmer', 'Sell strawberries in lines. The market always has a beehive'],
    pumpkin: ['Pumpkin Farmer', 'Sell big crops one by one. Starts with a pumpkin seed'],
    rain: ['Rainmaker', 'Grow fast with rain. Starts with Gentle Rain'],
    rancher: ['Rancher', 'Earn gold every night. The market always has a henhouse'],
  };
  const farmerTip: Record<string, string> = {
    berry: 'Strawberries ripen in 2 days. Put the market beehive near them: they grow nightly and sell higher',
    pumpkin: "Pumpkins sell high and crows can't eat them. Pair them with fertilizer",
    rancher: 'The market always has a henhouse. Buy one early for gold every night',
    rain: 'The center of rain gets +1 more (Gentle Rain). Build around rain',
  };
  FARMERS.forEach((f) => Object.assign(f, { name: farmer[f.id][0], desc: farmer[f.id][1] }, farmerTip[f.id] ? { tip: farmerTip[f.id] } : {}));
  const diff = [['Normal', ''], ['Hard 1', 'Tax ×1.1'], ['Hard 2', 'Shop ×1.3 · Tax ×1.2'], ['Hard 3', 'Pests earlier and more · Tax ×1.3'], ['Hard 4', 'Singles ×0.3 · Tax ×1.4'], ['Hard 5', 'Multiplying locusts · Tax ×1.5']];
  DIFFICULTIES.forEach((d, i) => Object.assign(d, { name: diff[i][0], desc: diff[i][1] }));
  Object.assign(ACHIEVE_ADDS.addMelonSeed!, { hint: 'Clear the game once…?', done: 'First clear' });
  Object.assign(ACHIEVE_ADDS.addThunder!, { hint: 'Sell lots of lines…?', done: 'Sell 100 lines in total' });
}
