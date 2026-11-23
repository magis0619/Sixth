// 挑戦状の文字列（URL の ?c=）の書き方と読み方。画面に触らないので単体テストから使える（画面は src/ui/challenge.ts）

import { DIFFICULTIES, FARMERS } from './config.ts';
import { rateRun, type ChallengeFrom, type GameState } from './game.ts';

export interface ChallengeLink {
  seed: number;
  difficulty: number;
  lord: number;
  farmer: string;
  from: ChallengeFrom;
}

const VERSION = 1;

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** このプレイを挑戦状の文字列にする */
export function encodeChallenge(state: GameState): string {
  const r = rateRun(state);
  return b64(JSON.stringify([VERSION, state.seed ?? 0, state.difficulty, state.lordLevel, state.farmer, state.day, state.taxesPaid, state.stats.totalEarned, state.cleared ? 1 : 0, r.rank, r.score, state.runId]));
}

/** 挑戦状の文字列を読む（形がおかしければ null） */
export function decodeChallenge(code: string): ChallengeLink | null {
  try {
    const a = JSON.parse(unb64(code)) as unknown[];
    if (!Array.isArray(a) || a[0] !== VERSION) return null;
    const [, seed, difficulty, lord, farmer, day, taxes, earned, cleared, rank, score, runId] = a;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    if (num(seed) === null || num(difficulty) === null || num(day) === null || typeof farmer !== 'string') return null;
    if (!FARMERS.some((f) => f.id === farmer)) return null;
    return {
      seed: (seed as number) >>> 0,
      difficulty: Math.max(0, Math.min(difficulty as number, DIFFICULTIES.length - 1)),
      lord: Math.max(0, Math.min(num(lord) ?? 0, 3)),
      farmer,
      from: { day: day as number, taxes: num(taxes) ?? 0, earned: num(earned) ?? 0, cleared: cleared === 1, rank: String(rank ?? '').slice(0, 2), score: num(score) ?? 0, runId: String(runId ?? '').slice(0, 12) },
    };
  } catch {
    return null;
  }
}

