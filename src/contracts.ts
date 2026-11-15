// 週契約：毎週月曜の朝に3つ並ぶ「今週だけの縛り」。受けると、日曜の年貢を納めたあとに見返りがもらえる
import { L } from './i18n.ts';
import type { PlaceId, SymbolId } from './config.ts';

export type ContractId =
  | 'cloudy'
  | 'seedThrift'
  | 'crowFlock'
  | 'pricey'
  | 'longRain'
  | 'drought'
  | 'diagWind'
  | 'connoisseur'
  | 'marketClosed'
  | 'bugBloom'
  | 'brokenReel'
  | 'busyWeek'
  | 'sellWeekend'
  | 'fog';

export type ContractReward =
  | { kind: 'gold'; n: number }
  | { kind: 'remove'; symbol: SymbolId }
  | { kind: 'place'; id: PlaceId }
  | { kind: 'moon' }
  | { kind: 'charms'; rare: boolean }
  | { kind: 'taxCut'; pct: number }
  | { kind: 'expand' }
  | { kind: 'reel' };

export interface ContractDef {
  id: ContractId;
  stars: 1 | 2 | 3;
  name: string;
  /** 縛りの中身（今週ずっと） */
  rule: string;
  /** 札に描く絵（art のキー） */
  icon: string;
  reward: ContractReward;
}

const def = (id: ContractId, stars: 1 | 2 | 3, name: string, rule: string, icon: string, reward: ContractReward): ContractDef => ({ id, stars, name, rule, icon, reward });

export const CONTRACTS: Record<ContractId, ContractDef> = {
  cloudy: def('cloudy', 1, L('曇り続き', 'Overcast'), L('太陽は<b>1マス</b>だけ育てる', 'Sun grows <b>1 square</b> only'), 'sun', { kind: 'gold', n: 30 }),
  seedThrift: def('seedThrift', 1, L('種の節約', 'Seed Thrift'), L('種は1枚で<b>2個まで</b>', 'Seeds plant <b>2 max</b>'), 'seed', { kind: 'gold', n: 30 }),
  crowFlock: def('crowFlock', 1, L('カラスの渡り', 'Crow Migration'), L('カラスの食べる確率が<b>2倍</b>', 'Crows eat <b>twice as often</b>'), 'crow', { kind: 'remove', symbol: 'crow' }),
  pricey: def('pricey', 1, L('物価高', 'Inflation'), L('市の値段が<b>×1.5</b>', 'Market prices <b>×1.5</b>'), 'bargain', { kind: 'gold', n: 30 }),
  longRain: def('longRain', 1, L('長雨', 'Long Rain'), L('畑の<b>右端の1列</b>が水びたし（植えられない）', 'The <b>rightmost column</b> is flooded (no planting)'), 'rain', { kind: 'place', id: 'compost' }),
  drought: def('drought', 2, L('日照りの誓い', 'Drought Vow'), L('<b>雨が効かない</b>', '<b>Rain does nothing</b>'), 'rain', { kind: 'moon' }),
  diagWind: def('diagWind', 2, L('斜めの風', 'Slanted Wind'), L('列は<b>斜めだけ</b>数える', 'Only <b>diagonal</b> lines count'), 'bee', { kind: 'charms', rare: false }),
  connoisseur: def('connoisseur', 2, L('目利きの客', 'Picky Buyers'), L('<b>単品は売れない</b>（列か大物だけ）', '<b>No singles</b> (lines or big crops only)'), 'merchant', { kind: 'gold', n: 60 }),
  marketClosed: def('marketClosed', 2, L('市が閉まる', 'Market Closed'), L('今週の<b>市が開かない</b>', '<b>No market</b> this week'), 'lock', { kind: 'taxCut', pct: 30 }),
  bugBloom: def('bugBloom', 2, L('虫の大発生', 'Bug Boom'), L('毎朝、袋に<b>虫が1枚</b>入る（日曜に全部いなくなる）', 'A <b>bug</b> enters the bag each morning (all leave Sunday)'), 'bug', { kind: 'place', id: 'henhouse' }),
  brokenReel: def('brokenReel', 3, L('壊れたリール', 'Broken Reel'), L('リールが<b>1本少ない</b>', '<b>One reel fewer</b>'), 'gear', { kind: 'charms', rare: true }),
  busyWeek: def('busyWeek', 3, L('忙しい週', 'Busy Week'), L('使える出目は<b>1日2つまで</b>', 'Use <b>2 reels a day</b> at most'), 'calendar', { kind: 'expand' }),
  sellWeekend: def('sellWeekend', 3, L('市場休み', 'Weekday Closure'), L('作物を売れるのは<b>土日だけ</b>', 'Sell crops on <b>Sat/Sun only</b>'), 'coin', { kind: 'gold', n: 100 }),
  fog: def('fog', 3, L('霧の週', 'Foggy Week'), L('毎日リールが1つ霧に隠れ、<b>半分の日は使えない</b>', 'A reel is fogged daily; <b>lost half the days</b>'), 'puff', { kind: 'reel' }),
};

export const CONTRACT_ORDER = Object.keys(CONTRACTS) as ContractId[];

/** ★ごとの出やすさ（★1が多く、★3はまれ） */
export const CONTRACT_STAR_WEIGHTS: Record<1 | 2 | 3, number> = { 1: 6, 2: 3, 3: 1 };

/** 難しさごとに出る★の上限（ふつうは出ない） */
export function contractMaxStars(difficulty: number): number {
  return difficulty <= 0 ? 0 : Math.min(3, difficulty);
}

/** お金の見返りは週が進むほど増える（年貢が大きくなっても意味が残るように） */
export function contractGold(base: number, taxesPaid: number): number {
  return Math.round((base * (1 + 0.5 * taxesPaid)) / 5) * 5;
}
