// プレイ記録をサーバー（Googleスプレッドシート）へ送る。統計用。
// 受け取り側は scripts/telemetry-apps-script.gs。失敗してもゲームには影響させない。
//
// 送る時と中身（名前などの個人情報は送らない。端末ごとの匿名IDだけ）
//   progress：年貢を納めたとき。まとめ1行（その週の収入・支出など）
//   result  ：プレイが終わったとき。まとめ1行＋プレイログ全文
//   quit    ：遊んでいる途中で画面を離れたとき（アプリを閉じた・切り替えた）。まとめ1行＋プレイログ全文。同じ日には1回だけ
// プレイログは「ログをコピー」で書き出すものと同じ中身（docs の確かめた記録に使っている形）

import { CONFIG, SEEDS, SYMBOLS, TELEMETRY_URL, type SymbolId } from './config.ts';
import type { GameState } from './game.ts';
import { lang } from './i18n.ts';
import { buildLogText } from './ui/save.ts';
import { settings } from './ui/settings.ts';
import { meta } from './ui/store.ts';
import { affordableUnlocks } from './meta.ts';

export type TrackKind = 'progress' | 'result' | 'quit' | 'error' | 'unlock';

const QUEUE_KEY = 'hatake-slot:telemetry-queue';
/** keepalive（画面を閉じる直前でも届く送り方）で送れる大きさの上限（64KB）より少し小さく */
const KEEPALIVE_MAX = 60_000;
const startedAt = Date.now();

/** 開発中・自動テストの記録は送らない（本番の記録が混ざらないように） */
function enabled(): boolean {
  if (!TELEMETRY_URL || !settings.telemetry) return false;
  if (import.meta.env.DEV || navigator.webdriver) return false;
  return !/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
}

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

const sum = (a: (number | undefined)[] | undefined, from: number, to: number) => (a ?? []).slice(Math.max(0, from), to + 1).reduce<number>((n, v) => n + (v ?? 0), 0);

/** まとめ1行。表で数えやすいよう、なるべく数字の列にする */
function summary(state: GameState): Record<string, unknown> {
  const ids = Object.keys(state.bag) as SymbolId[];
  const bagOf = (f: (id: SymbolId) => boolean) => ids.filter(f).reduce((n, id) => n + state.bag[id], 0);
  const bought = state.stats.purchases;
  // 今週（最後の年貢のあと）の収入と支出
  const weekFrom = state.day - ((state.day - 1) % CONFIG.taxPeriod);
  return {
    run: state.runId,
    // 種（同じ種なら同じ出目の流れ）と、挑戦状から始めたプレイか
    seed: state.seed ?? 0,
    challenge: state.challenge ? 1 : 0,
    day: state.day,
    taxes: state.taxesPaid,
    gold: state.gold,
    difficulty: state.difficulty,
    lord: state.lordLevel ?? 0,
    // 裏：段と倒した数（0＝裏ではない）
    ura: state.ura?.level ?? 0,
    uraDefeated: state.ura?.defeated ?? 0,
    farmer: state.farmer,
    mastery: meta.mastery[state.farmer] ?? 0,
    earned: state.stats.totalEarned,
    weekEarned: sum(state.stats.earnedByDay, weekFrom, state.day),
    weekSpent: sum(state.stats.spentByDay, weekFrom, state.day),
    spent3d: sum(state.stats.spentByDay, state.day - 2, state.day),
    sold: state.stats.cropsSold,
    lineCrops: state.stats.lineCrops ?? 0,
    eaten: state.stats.cropsEaten,
    lines: state.stats.lineHarvests,
    fevers: state.stats.fevers,
    expired: state.stats.expired,
    reels: state.reels,
    field: `${state.cols}x${state.rows}`,
    bagTotal: bagOf(() => true),
    bagSeeds: bagOf((id) => !!SEEDS[id]),
    bagPests: bagOf((id) => SYMBOLS[id]?.rarity === 'bad'),
    charms: Object.values(state.charms).reduce((n, v) => n + v, 0),
    boughtMarket: bought.filter((p) => !p.free).length,
    takenOffer: bought.filter((p) => p.free).length,
    places: Object.values(state.bought ?? {}).reduce<number>((n, v) => n + (v ?? 0), 0),
    cleared: state.cleared,
    // この画面を開いてからの分（続きから遊んだときは、開き直してからの分）
    sessionMin: Math.round((Date.now() - startedAt) / 6000) / 10,
    lang,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    tutorialDone: meta.tutorialDone,
    // 解放の画面：持っているポイント・今買える物の数・開いた回数・買った回数
    points: meta.points,
    canUnlock: affordableUnlocks(meta),
    unlockOpens: meta.unlockOpens ?? 0,
    unlockBuys: meta.unlockBuys ?? 0,
  };
}

function post(body: string): void {
  // Apps Script は CORS を返さないので no-cors で投げっぱなし。ネットにつながらなかったときだけ、取っておいて次に送る
  void fetch(TELEMETRY_URL, { method: 'POST', mode: 'no-cors', keepalive: body.length < KEEPALIVE_MAX, headers: { 'Content-Type': 'text/plain' }, body }).catch(() => enqueue(body));
}

function enqueue(body: string): void {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as string[];
    q.push(body);
    // 端末の保存を食いつぶさないよう、新しい10件まで
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-10)));
  } catch {
    // 取っておけなくても続ける
  }
}

/** 前に送れなかった記録を送り直す（起動したときに1回） */
export function flushTelemetry(): void {
  if (!enabled()) return;
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as string[];
    localStorage.removeItem(QUEUE_KEY);
    q.forEach(post);
  } catch {
    // 読めなければ捨てる
  }
}

export function track(kind: TrackKind, state: GameState, extra: Record<string, unknown> = {}): void {
  if (!enabled()) return;
  try {
    // id：記録ごとの番号。画面を閉じる間際に届いたのに失敗と見えて送り直した分を、受け取り側ではじく
    const data: Record<string, unknown> = { kind, id: Math.random().toString(36).slice(2, 10), pid: playerId(), build: __BUILD__, at: new Date().toISOString(), ...summary(state), ...extra };
    if (kind === 'result' || kind === 'quit') data.log = buildLogText(__BUILD__);
    post(JSON.stringify(data));
  } catch {
    // 送れなくても続ける
  }
}

let errorsSent = 0;
/** 画面のエラーを送る（同じ画面で5回まで）。where＝どこで起きたか、detail＝そのときの様子 */
export function reportError(state: GameState, where: string, err: unknown, detail: Record<string, unknown> = {}): void {
  if (errorsSent >= 5) return;
  errorsSent++;
  const e = err as { message?: string; stack?: string } | undefined;
  track('error', state, { where, message: String(e?.message ?? err ?? '').slice(0, 300), stack: String(e?.stack ?? '').slice(0, 1500), ...detail });
}

let quitSent = '';
/** 遊んでいる途中で画面を離れたら、1日に1回だけ記録を送る */
export function setupQuitTracking(getState: () => GameState): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    const s = getState();
    if (s.day === 0 || s.over) return;
    const key = `${s.runId}:${s.day}`;
    if (key === quitSent) return;
    quitSent = key;
    track('quit', s);
  });
}
