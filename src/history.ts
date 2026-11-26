// 自分の記録：プレイが終わるたびに1回分の要約を端末に残し、記録の画面で自動で分析する。
// 送るプレイ記録（telemetry）とは別。端末の中だけに置く（サーバーには送らない）。
// 分析（analyzeHistory）は画面に触らないので単体テストから使える。画面は src/ui/records.ts

import { CONFIG } from './config.ts';
import { rateRun, type GameState } from './game.ts';

export const HISTORY_KEY = 'hatake-slot:history';
/** 残す回数（古いものから消す） */
export const HISTORY_MAX = 300;

export interface RunRecord {
  v: 1;
  at: string;
  runId: string;
  seed: number;
  diff: number;
  lord: number;
  /** 裏の段（0か無し＝裏ではない） */
  ura?: number;
  farmer: string;
  day: number;
  taxes: number;
  cleared: boolean;
  /** 負けたとき：足りなかった額と、そのときのノルマ */
  short: number;
  tax: number;
  earned: number;
  rank: string;
  score: number;
  /** 評価の4つ（列で売った・出目を使い切った・作物を守った・稼ぎの余裕） */
  parts: Record<'line' | 'use' | 'guard' | 'margin', number>;
  /** 週ごとの稼ぎ */
  weeks: number[];
  /** 稼ぎの中身（列で売る・注文・単品 など） */
  income: Record<string, number>;
  lines: number;
  expired: number;
  eaten: number;
  /** 市で買った置き物の数・畑を広げた回数・取ったお守りの数・見送ったお守りの数 */
  places: number;
  expand: number;
  charms: number;
  charmSkips: number;
  challenge: boolean;
}

/** このプレイを1回分の要約にする（結果画面を出すときに呼ぶ） */
export function makeRunRecord(state: GameState, taxAmount: number): RunRecord {
  const r = rateRun(state);
  const parts = Object.fromEntries(r.parts.map((p) => [p.key, p.value])) as RunRecord['parts'];
  const weeks: number[] = [];
  (state.stats.earnedByDay ?? []).forEach((v, d) => {
    if (d < 1) return;
    const w = Math.floor((d - 1) / CONFIG.taxPeriod);
    weeks[w] = (weeks[w] ?? 0) + (v ?? 0);
  });
  const income: Record<string, number> = {};
  Object.entries(state.logStats?.total ?? {}).forEach(([k, v]) => {
    if (k.startsWith('収入:')) income[k.slice(3)] = v;
  });
  const bought = state.bought ?? {};
  return {
    v: 1,
    at: new Date().toISOString(),
    runId: state.runId,
    seed: state.seed ?? 0,
    diff: state.difficulty,
    lord: state.lordLevel ?? 0,
    ura: state.ura?.level ?? 0,
    farmer: state.farmer,
    day: state.day,
    taxes: state.taxesPaid,
    cleared: state.cleared,
    short: state.cleared ? 0 : Math.max(0, taxAmount - state.gold),
    tax: taxAmount,
    earned: state.stats.totalEarned,
    rank: r.rank,
    score: r.score,
    parts,
    weeks: Array.from({ length: weeks.length }, (_, i) => weeks[i] ?? 0),
    income,
    lines: state.stats.lineHarvests,
    expired: state.stats.expired,
    eaten: state.stats.cropsEaten,
    places: Object.entries(bought).filter(([k]) => k !== 'expand').reduce((n, [, v]) => n + (v ?? 0), 0),
    expand: bought.expand ?? 0,
    charms: state.stats.charms.length,
    charmSkips: (state.log ?? []).filter((l) => l.includes('お守り 取らない')).length,
    challenge: !!state.challenge,
  };
}

export function loadHistory(): RunRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as RunRecord[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && r.v === 1) : [];
  } catch {
    return [];
  }
}

/** 1回分を足す（同じ回は2回入れない） */
export function addRunRecord(rec: RunRecord): void {
  try {
    const list = loadHistory().filter((r) => r.runId !== rec.runId);
    list.push(rec);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-HISTORY_MAX)));
  } catch {
    // 保存できなくても遊べる
  }
}

// ---- 分析 ----

export interface WinLoss {
  plays: number;
  wins: number;
}

export interface HistoryAnalysis {
  plays: number;
  wins: number;
  /** 新しい順の最近の回（最大20） */
  recent: RunRecord[];
  /** 難しさごと（殿様モード・裏は除く） */
  byDiff: (WinLoss & { diff: number })[];
  /** 農家ごと */
  byFarmer: (WinLoss & { farmer: string })[];
  /** 評価の4つの平均：最近10回と、その前 */
  partsRecent: RunRecord['parts'] | null;
  partsBefore: RunRecord['parts'] | null;
  /** 一番低い評価 */
  weakest: keyof RunRecord['parts'] | null;
  /** 稼ぎの中身（クリアした回の合計に対する割合、多い順） */
  incomeShare: [string, number][];
  /** 負けた回：何回目のノルマで負けたか（添え字＝払えた回数）・あと少し（1割以下）で負けた回数 */
  lossAtTax: number[];
  nearMiss: number;
  losses: number;
  /** 置き物を買った回・買わなかった回の勝ち */
  withPlaces: WinLoss;
  withoutPlaces: WinLoss;
  /** 自己ベスト */
  bestWeek: { gold: number; rec: RunRecord } | null;
  bestEarned: RunRecord | null;
  bestScore: RunRecord | null;
}

const avgParts = (list: RunRecord[]): RunRecord['parts'] | null => {
  if (!list.length) return null;
  const keys = ['line', 'use', 'guard', 'margin'] as const;
  return Object.fromEntries(keys.map((k) => [k, Math.round(list.reduce((n, r) => n + (r.parts[k] ?? 0), 0) / list.length)])) as RunRecord['parts'];
};

export function analyzeHistory(list: RunRecord[]): HistoryAnalysis {
  const normal = list.filter((r) => !r.lord && !r.ura);
  const wl = (rs: RunRecord[]): WinLoss => ({ plays: rs.length, wins: rs.filter((r) => r.cleared).length });
  const diffs = [...new Set(normal.map((r) => r.diff))].sort((a, b) => a - b);
  const farmers = [...new Set(list.map((r) => r.farmer))];
  // 評価は1回もノルマを払えずに終わった回を除く（評価が育っていない）
  const rated = list.filter((r) => r.taxes > 0);
  const partsRecent = avgParts(rated.slice(-10));
  const partsBefore = rated.length > 10 ? avgParts(rated.slice(0, -10)) : null;
  const weakest = partsRecent ? ((Object.entries(partsRecent).sort((a, b) => a[1] - b[1])[0][0] as keyof RunRecord['parts']) ?? null) : null;
  const inc: Record<string, number> = {};
  list.filter((r) => r.cleared).forEach((r) => Object.entries(r.income).forEach(([k, v]) => (inc[k] = (inc[k] ?? 0) + v)));
  const incTotal = Object.values(inc).reduce((a, b) => a + b, 0);
  const losses = list.filter((r) => !r.cleared);
  const lossAtTax: number[] = Array.from({ length: CONFIG.winTaxes }, () => 0);
  losses.forEach((r) => (lossAtTax[Math.min(r.taxes, CONFIG.winTaxes - 1)] += 1));
  let bestWeek: HistoryAnalysis['bestWeek'] = null;
  list.forEach((r) => r.weeks.forEach((g) => (!bestWeek || g > bestWeek.gold) && (bestWeek = { gold: g, rec: r })));
  const top = (key: (r: RunRecord) => number) => list.reduce<RunRecord | null>((b, r) => (!b || key(r) > key(b) ? r : b), null);
  return {
    plays: list.length,
    wins: list.filter((r) => r.cleared).length,
    recent: list.slice(-20).reverse(),
    byDiff: diffs.map((d) => ({ diff: d, ...wl(normal.filter((r) => r.diff === d)) })),
    byFarmer: farmers.map((f) => ({ farmer: f, ...wl(list.filter((r) => r.farmer === f)) })).sort((a, b) => b.plays - a.plays),
    partsRecent,
    partsBefore,
    weakest,
    incomeShare: Object.entries(inc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, incTotal ? Math.round((v / incTotal) * 100) : 0]),
    lossAtTax,
    nearMiss: losses.filter((r) => r.tax > 0 && r.short / r.tax <= 0.1).length,
    losses: losses.length,
    withPlaces: wl(list.filter((r) => r.places > 0)),
    withoutPlaces: wl(list.filter((r) => r.places === 0)),
    bestWeek,
    bestEarned: top((r) => r.earned),
    bestScore: top((r) => r.score),
  };
}

/** 勝ちの割合（％） */
export const winPct = (w: WinLoss): number => (w.plays ? Math.round((w.wins / w.plays) * 100) : 0);
