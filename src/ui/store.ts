// 画面の要素と、モジュールの間で共有する状態（ゲームの状態・操作中フラグ・演出の呼び出し口）

import { type GameState, newGame } from '../game.ts';
import { loadMeta, type MetaState, setupFrom } from '../meta.ts';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const rng = Math.random;

export const el = {
  app: $('app'),
  gold: $('gold'),
  goldBox: $('gold-box'),
  day: $('day'),
  tax: $('tax'),
  mute: $<HTMLButtonElement>('mute'),
  help: $<HTMLButtonElement>('help'),
  goal: $('goal'),
  status: $('status'),
  charms: $('charms'),
  charmPanel: $('charm-panel'),
  hint: $('hint'),
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
export function setState(s: GameState): void {
  state = s;
}

/** busy：回転・年貢などの演出中（操作と保存を止める） */
export const ui = { busy: false };

/** 画面のモジュールから呼ぶ main 側の処理（main が起動時に入れる） */
export const hooks = {
  render: (): void => {},
  startGame: (_resume: GameState | null = null): void => {},
  setGold: (_value: number): void => {},
};
