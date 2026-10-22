// 中断セーブ（途中から続ける）と最高記録

import { CHARM_ORDER, CONFIG, type CropKind, SYMBOL_ORDER } from '../config.ts';
import { type GameState } from '../game.ts';
import { state, ui } from './store.ts';

export const RUN_KEY = 'hatake-slot:run';

/** 日をまたぐ処理の途中は保存しない */
export function saveRun(): void {
  if (ui.busy || state.over || state.day === 0) return;
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても遊べる
  }
}

export function loadRun(): GameState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    // 作物の種類・注文を入れる前の保存データを読み替える
    const old: Record<string, CropKind> = { normal: 'tomato', gold: 'corn' };
    s.field = s.field.map((c) => (c ? { ...c, kind: old[c.kind] ?? c.kind } : null));
    SYMBOL_ORDER.forEach((id) => (s.bag[id] ??= 0));
    s.order ??= null;
    s.stats.ordersDone ??= 0;
    // お邪魔系・週替わりを入れる前の保存データ
    s.weeds ??= s.field.map(() => false);
    s.frost ??= s.field.map(() => 0);
    s.pool ??= [...s.shop];
    s.weekly ??= [];
    s.bred ??= [];
    s.lastObstacles ??= [];
    s.runId ??= Math.random().toString(36).slice(2, 10);
    // 特別なお守り・道具の進化を入れる前の保存データ
    s.ready ??= [];
    s.specials ??= [];
    s.difficulty ??= 0;
    s.toolXp ??= s.field.map(() => 0);
    s.today ??= { rain: [], sun: [], boosted: [] };
    s.halfTax ??= false;
    s.notices ??= [];
    s.stats.crowEaten ??= 0;
    // スイカ・鍬・水路のつながり・相場・品評会を入れる前の保存データ
    s.tilled ??= s.field.map(() => false);
    s.market ??= null;
    // 相場は難しいモードだけ（ふつうで遊んでいた途中の相場は消す）
    if (s.difficulty < CONFIG.marketFrom) s.market = null;
    s.nightIncome ??= null;
    s.stats.soldKinds ??= [];
    CHARM_ORDER.forEach((id) => (s.charms[id] ??= 0));
    s.removed ??= {};
    // 畑の広さを変えられるようにする前（3×3固定）の保存データは、マスの番号を5×5の数え方に直す
    if (s.cols === undefined) {
      const size = CONFIG.fieldCols * CONFIG.fieldRows;
      const remap = <T>(a: T[], empty: T): T[] => {
        const out = Array.from({ length: size }, () => empty);
        a.forEach((v, i) => (out[Math.floor(i / 3) * CONFIG.fieldCols + (i % 3)] = v));
        return out;
      };
      s.field = remap(s.field, null);
      s.weeds = remap(s.weeds, false);
      s.frost = remap(s.frost, 0);
      s.cols = CONFIG.startCols;
      s.rows = CONFIG.startRows;
      s.tools = Array.from({ length: size }, () => null);
      s.tiles = Array.from({ length: size }, () => null);
      s.stock = [];
      s.bought = {};
    }
    return s;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // 何もしない
  }
}

// ---- 最高記録 ----

export interface Best {
  day: number;
  taxes: number;
}

export function loadBest(): Best {
  try {
    return JSON.parse(localStorage.getItem('hatake-slot:best') ?? '') as Best;
  } catch {
    return { day: 0, taxes: 0 };
  }
}

export function saveBest(b: Best): void {
  try {
    localStorage.setItem('hatake-slot:best', JSON.stringify(b));
  } catch {
    // 保存できなくても続ける
  }
}
