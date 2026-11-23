// エンドレスのランキングの素地。サーバー（RANKING_URL）が決まるまでは何も送らない。
// 方針は docs/ranking.md：
//   ・比べるのは「クリアしたあと、エンドレスで何日目まで行ったか」（同じなら稼いだ合計）
//   ・難しさごと（殿様モードは段ごと）に分ける
//   ・週替わりチャレンジは、全員が同じ種（weeklySeed）・同じ準備（解放の品・腕前なし）で遊ぶ
//   ・ずるの防ぎ方：種と操作の記録を一緒に送り、サーバーで遊び直して確かめる（あとで）

import { RANKING_URL, SHARE_URL } from './config.ts';
import { rateRun, weeklySeed, type GameState } from './game.ts';
import { endlessKey } from './meta.ts';

export interface RankingEntry {
  /** 送る形の版 */
  v: 1;
  /** 'd難しさ' または 'l段' */
  board: string;
  /** 週替わりチャレンジの週（ふつうのプレイは空） */
  week: string;
  seed: number;
  runId: string;
  farmer: string;
  day: number;
  taxes: number;
  earned: number;
  rank: string;
  score: number;
  cleared: boolean;
  build: string;
  at: string;
}

/** このプレイをランキングに送る形にする */
export function rankingEntry(state: GameState, build: string): RankingEntry {
  const r = rateRun(state);
  const weekly = weeklySeed();
  return {
    v: 1,
    board: endlessKey(state),
    week: state.seed === weekly.seed ? weekly.week : '',
    seed: state.seed ?? 0,
    runId: state.runId,
    farmer: state.farmer,
    day: state.day,
    taxes: state.taxesPaid,
    earned: state.stats.totalEarned,
    rank: r.rank,
    score: r.score,
    cleared: state.cleared,
    build,
    at: new Date().toISOString(),
  };
}

/** ランキングに出せるプレイか（クリアしたプレイだけ） */
export const rankable = (state: GameState): boolean => state.cleared && !state.challenge;

/** ランキングに送る（サーバーが決まるまでは何もしない。失敗してもゲームには影響させない） */
export async function submitRanking(state: GameState, build: string, name: string): Promise<boolean> {
  if (!RANKING_URL || !rankable(state)) return false;
  try {
    const res = await fetch(`${RANKING_URL}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rankingEntry(state, build), name: name.slice(0, 12), origin: SHARE_URL }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** ランキングを読む（サーバーが決まるまでは空） */
export async function fetchRanking(board: string, week = ''): Promise<{ name: string; day: number; earned: number }[]> {
  if (!RANKING_URL) return [];
  try {
    const res = await fetch(`${RANKING_URL}/top?board=${encodeURIComponent(board)}&week=${encodeURIComponent(week)}`);
    return res.ok ? ((await res.json()) as { name: string; day: number; earned: number }[]) : [];
  } catch {
    return [];
  }
}
