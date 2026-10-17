// 畑スロットの調整用パラメータ。数値はすべてここで変える。

export type SymbolId = 'seed' | 'goldSeed' | 'rain' | 'sun' | 'fertilizer' | 'crow' | 'coin';
export type UpgradeId = 'addSun' | 'addFertilizer' | 'addGoldSeed' | 'removeCrow' | 'addReel';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  emoji: string;
  /** manual: 出目をタップして使う / auto: 停止した瞬間に効果が出る */
  kind: 'manual' | 'auto';
  /** 対象マスの選択が要らない手動絵柄（太陽） */
  noTarget?: boolean;
  desc: string;
  /** 演出用のレア度 */
  rarity: 'normal' | 'rare' | 'bad';
}

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  seed: { id: 'seed', name: '種', emoji: '🌰', kind: 'manual', desc: '空きマスに作物を植える', rarity: 'normal' },
  goldSeed: { id: 'goldSeed', name: '金の種', emoji: '🌟', kind: 'manual', desc: '空きマスに金の作物を植える', rarity: 'rare' },
  rain: { id: 'rain', name: '雨', emoji: '🌧️', kind: 'manual', desc: '作物1つの成長＋2', rarity: 'normal' },
  sun: { id: 'sun', name: '太陽', emoji: '☀️', kind: 'manual', noTarget: true, desc: '畑の全作物の成長＋1', rarity: 'normal' },
  fertilizer: { id: 'fertilizer', name: '肥料', emoji: '🧪', kind: 'manual', desc: '作物1つの売値を2倍', rarity: 'normal' },
  crow: { id: 'crow', name: 'カラス', emoji: '🐦', kind: 'auto', desc: '作物を1つ食べてしまう', rarity: 'bad' },
  coin: { id: 'coin', name: '金貨', emoji: '🪙', kind: 'auto', desc: 'その場で金がもらえる', rarity: 'normal' },
};

/** 絵柄袋・ショップでの表示順 */
export const SYMBOL_ORDER: SymbolId[] = ['seed', 'goldSeed', 'rain', 'sun', 'fertilizer', 'coin', 'crow'];

export const CONFIG = {
  /** 畑のマス数（3×3） */
  fieldCols: 3,
  fieldRows: 3,
  /** 初期リール本数と上限 */
  initialReels: 3,
  maxReels: 5,
  /** 初期の絵柄袋 */
  initialBag: { seed: 3, goldSeed: 0, rain: 2, sun: 1, fertilizer: 0, crow: 2, coin: 1 } as Record<SymbolId, number>,
  initialGold: 0,
  /** 成長 */
  ripeGrowth: 3,
  rainGrowth: 2,
  sunGrowth: 1,
  /** 売値 */
  normalPrice: 6,
  goldPrice: 30,
  fertilizerMultiplier: 2,
  /** 金貨の額 */
  coinAmount: 3,
  /** カラスが1回に食べる作物の数 */
  crowEats: 1,

  /** 強化の価格 */
  upgradePrices: {
    addSun: 10,
    addFertilizer: 12,
    addGoldSeed: 25,
    removeCrow: 15,
  } as Record<Exclude<UpgradeId, 'addReel'>, number>,
  /** リール追加の価格 = reelPriceBase × (現在の本数 − 1) */
  reelPriceBase: 20,

  /** 年貢：taxPeriod 日ごとに、その日の終わり（次の回転前）に自動で徴収 */
  taxPeriod: 7,
  /** 1回目から順の年貢額。表を超えたら直前の額 × taxGrowth */
  taxSchedule: [5, 15, 35, 70, 130],
  taxGrowth: 1.5,
  /** 年貢が近いことを警告し始める残り日数 */
  taxWarnDays: 2,

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
  { id: 'addSun', name: '太陽を足す', emoji: '☀️', desc: '絵柄袋に太陽を1枚追加' },
  { id: 'addFertilizer', name: '肥料を足す', emoji: '🧪', desc: '絵柄袋に肥料を1枚追加' },
  { id: 'addGoldSeed', name: '金の種を足す', emoji: '🌟', desc: '絵柄袋に金の種を1枚追加' },
  { id: 'removeCrow', name: 'カラスを消す', emoji: '🐦', desc: '絵柄袋からカラスを1枚削除' },
  { id: 'addReel', name: 'リールを増やす', emoji: '🎰', desc: '1日に起きる出来事が1つ増える' },
];
