// プレイ記録をサーバー（Googleスプレッドシート）へ送る。統計用。
// 失敗してもゲームには影響させない（送れなければ捨てる）。

import { TELEMETRY_URL } from './config.ts';
import type { GameState } from './game.ts';

/** 端末ごとの匿名ID（名前などの個人情報は送らない） */
function playerId(): string {
  const KEY = 'hatake-slot:pid';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 12);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

function summary(state: GameState): Record<string, unknown> {
  const count = <T extends string>(list: T[]) => list.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
  return {
    run: state.runId,
    day: state.day,
    taxes: state.taxesPaid,
    gold: state.gold,
    earned: state.stats.totalEarned,
    sold: state.stats.cropsSold,
    eaten: state.stats.cropsEaten,
    lines: state.stats.lineHarvests,
    fevers: state.stats.fevers,
    orders: state.stats.ordersDone,
    reels: state.reels,
    field: `${state.cols}x${state.rows}`,
    bag: JSON.stringify(Object.fromEntries(Object.entries(state.bag).filter(([, n]) => n > 0))),
    buys: JSON.stringify(count(state.stats.purchases.map((p) => p.id))),
    places: JSON.stringify(state.bought),
    charms: JSON.stringify(count(state.stats.charms.map((c) => c.id))),
    cleared: state.cleared,
  };
}

/** kind: progress＝年貢を納めたとき / result＝プレイが終わったとき */
export function track(kind: 'progress' | 'result', state: GameState, extra: Record<string, unknown> = {}): void {
  if (!TELEMETRY_URL) return;
  const body = JSON.stringify({ kind, pid: playerId(), build: __BUILD__, at: new Date().toISOString(), ...summary(state), ...extra });
  try {
    // 画面を閉じる直前でも届きやすいよう keepalive。Apps Script は CORS を返さないので no-cors で投げっぱなし
    void fetch(TELEMETRY_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body }).catch(() => {});
  } catch {
    // 送れなくても続ける
  }
}
