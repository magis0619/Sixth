// 遊んでいる間だけ使う、画面の操作の状態（選んでいる出目・チュートリアルの段・見せている所持金など）。
// いくつもの画面の部品から読み書きするので、1つの入れ物にまとめておく（保存はしない）

import { state } from './store.ts';

export const play = {
  /** 選んでいるリールの番号 */
  selected: null as number | null,
  /** 次の日へ進む札を一度押した（もう一度で進む） */
  armedNextDay: false,
  /** 列で売る・列ができたの演出の数（0より多い間は、チュートリアルの吹き出しを隠し、その手順を先へ進めない） */
  fxRunning: 0,
  /** 左上に今見せている所持金 */
  shownGold: state.gold,
  /**
   * まだ財布に届いていないお金（金貨や作物が飛んでいる途中の分）。
   * 左上の所持金は「本当の額 − 届いていない分」を出し、届いたときに増やす
   */
  goldInFlight: 0,
  /**
   * 引かれたけれど、まだ判子を押していない年貢。夜の収入（飛んでいる金貨）が届いてから引いて見せる
   * （先に引くと、届く前の表示がマイナスになったり、足りないように見えたまま通ったりする）
   */
  taxPending: 0,
  goldTween: 0,
  /** 続けて売った数（売る音が上がっていく） */
  combo: 0,
  lastSellAt: 0,
  /** その日の自動の絵柄の結果表示（リール番号ごと） */
  autoOutcome: {} as Record<number, string>,
  /** 大豊作の締めの額を出す（列の金貨が届いたときに呼ぶ） */
  landBumper: (() => {}) as () => void,
  /** 注文の達成の演出が終わるまでは、札をまだ「達成」にしない（報酬の金貨が届くのと同じときに） */
  orderRevealPending: false,
  /** なぞる・引っぱる操作のあとに1回だけ来る click（押し始めた要素のもの）は無視する */
  suppressClick: null as { kind: 'plot' | 'reel'; until: number } | null,
  /** 今選ばれているリールは、自動で選んだもの */
  autoSelected: false,
  /** チュートリアルの何段目か（していないときは null） */
  tut: null as { step: number } | null,
  tutFocus: [] as Element[],
  /** 暗幕の指の動きの合図 */
  tutSpotTimer: 0,
};

/** 列で売る・列ができたの演出の最中か */
export const harvestPlaying = (): boolean => play.fxRunning > 0;

/** 一度でもやった操作。ヒントを順に出すため */
export const done = { spin: false, use: false, sell: false, buy: false, next: false, line: false };
