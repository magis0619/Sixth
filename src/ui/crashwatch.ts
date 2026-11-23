// 画面が落ちたかどうかを、次に開いたときに調べて記録に送る。
// スマホのブラウザが記憶不足でページを落とすと、エラーは何も残らない。そこで「開いている」の印を置き、
// 画面を離れる（隠れる・閉じる）ときに外す。次に開いたとき印が残っていれば、前は途中で落ちたと見なす。
// 落ちる直前に何をしていたかは、演出の名前などを「足あと」として残しておく

import type { GameState } from '../game.ts';
import { reportError } from '../telemetry.ts';

const KEY = 'hatake-slot:alive';
const MAX_CRUMBS = 10;

interface Alive {
  at: number;
  build: string;
  crumbs: string[];
}

let alive: Alive | null = null;

function write(): void {
  try {
    if (alive) localStorage.setItem(KEY, JSON.stringify(alive));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくても続ける
  }
}

/** 足あとを残す（大きな演出の始まりなど） */
export function breadcrumb(what: string): void {
  if (!alive) return;
  const t = Math.round((Date.now() - alive.at) / 1000);
  alive.crumbs = [...alive.crumbs, `${t}s ${what}`].slice(-MAX_CRUMBS);
  write();
}

export function installCrashWatch(getState: () => GameState): void {
  try {
    const raw = localStorage.getItem(KEY);
    const prev = raw ? (JSON.parse(raw) as Alive) : null;
    // 30分以内に開いていたのに、離れる印がないまま終わっていた＝落ちた
    if (prev && Date.now() - prev.at < 30 * 60_000) {
      reportError(getState(), 'crash', 'page ended without leaving', { prevBuild: prev.build, crumbs: prev.crumbs.join(' / '), secs: Math.round((Date.now() - prev.at) / 1000) });
    }
  } catch {
    // 読めなければ何もしない
  }
  const start = (): void => {
    alive = { at: Date.now(), build: __BUILD__, crumbs: [] };
    write();
  };
  const stop = (): void => {
    alive = null;
    write();
  };
  start();
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? stop() : start()));
  window.addEventListener('pagehide', stop);
}
