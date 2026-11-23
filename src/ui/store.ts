// 画面の要素と、モジュールの間で共有する状態（ゲームの状態・操作中フラグ・演出の呼び出し口）

import { type GameSetup, type GameState, newGame, nextRand } from '../game.ts';
import { loadMeta, type MetaState, setupFrom } from '../meta.ts';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** ゲームの乱数：今のプレイの種から（保存して続きから遊んでも同じ流れ）。演出の見た目には使わない（使うと出目がずれる）。演出は Math.random */
export const rng = (): number => nextRand(state);

export const el = {
  app: $('app'),
  gold: $('gold'),
  goldBox: $('gold-box'),
  week: $('week'),
  day: $('day'),
  tax: $('tax'),
  mute: $<HTMLButtonElement>('mute'),
  help: $<HTMLButtonElement>('help'),
  goal: $('goal'),
  status: $('status'),
  charms: $('charms'),
  charmPanel: $('charm-panel'),
  machine: $('machine'),
  reels: $('reels'),
  spin: $<HTMLButtonElement>('spin'),
  msg: $('msg'),
  field: $('field'),
  shop: $('shop'),
  farmShop: $('farm-shop'),
  bag: $('bag'),
  bagTotal: $('bag-total'),
  overlay: $('overlay'),
  charmCount: $('charm-count'),
  order: $('order'),
  sheet: $('sheet'),
  sheetBackdrop: $('sheet-backdrop'),
  sheetTitle: $('sheet-title'),
};


export const meta: MetaState = loadMeta();
/** 今遊んでいるゲーム。差し替えは setState で（読む側はいつも最新を見る） */
export let state: GameState = newGame(setupFrom(meta));

/** 毎週払うお金の呼び名：ふつうは「ノルマ」、殿様モードは「年貢」 */
export const TW = (): string => (state.lordLevel ? '年貢' : 'ノルマ');
export function setState(s: GameState): void {
  state = s;
}

/** busy：回転・年貢などの演出中（操作と保存を止める） */
export const ui = { busy: false };

/** 画面のモジュールから呼ぶ main 側の処理（main が起動時に入れる） */
export const hooks = {
  render: (): void => {},
  startGame: (_resume: GameState | null = null, _setup?: GameSetup): void => {},
  setGold: (_value: number): void => {},
};
