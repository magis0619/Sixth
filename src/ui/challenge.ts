// 挑戦状リンク：自分の結果と「種」（出目の流れ）を URL に入れて送る。受け取った人は同じ種・難しさ・農家で遊び、
// 結果画面で送ってきた人の記録と比べる。サーバーは使わない（記録は URL の中だけ）。
// 同じ種でも、選んだ操作が違えばそこから先の出目は変わる（最初の袋と最初の出目は同じ）

import { art, type ArtId } from '../art.ts';
import { DIFFICULTIES, FARMERS, SHARE_URL } from '../config.ts';
import { rateRun, type ChallengeFrom, type GameState } from '../game.ts';
import { decodeChallenge, encodeChallenge, type ChallengeLink } from '../challenge-code.ts';

export { decodeChallenge, encodeChallenge, type ChallengeLink };
import { L } from '../i18n.ts';
import { challengeSetup } from '../meta.ts';
import { sfx } from '../audio.ts';
import { hooks, meta } from './store.ts';
import { explainOnce, overviewCard } from './explain.ts';


const KEY = 'hatake-slot:challenge';

/** 挑戦状の URL */
export function challengeUrl(state: GameState): string {
  return `${SHARE_URL}?c=${encodeChallenge(state)}`;
}

let pending: ChallengeLink | null = null;

/** 起動したとき：URL の挑戦状を読んで取っておく（URL からは消す。開き直しても残るよう、この画面の間は保存） */
export function readChallengeFromUrl(): void {
  try {
    const params = new URLSearchParams(location.search);
    const code = params.get('c');
    if (code) {
      pending = decodeChallenge(code);
      if (pending) sessionStorage.setItem(KEY, code);
      params.delete('c');
      const q = params.toString();
      history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
    } else {
      const saved = sessionStorage.getItem(KEY);
      if (saved) pending = decodeChallenge(saved);
    }
  } catch {
    pending = null;
  }
}

export const pendingChallenge = (): ChallengeLink | null => pending;

function dropChallenge(): void {
  pending = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 消せなくても続ける
  }
}

/** 難しさ（殿様モードは段）の名前 */
export const modeLabel = (c: { difficulty: number; lord: number }): string => (c.lord ? L(`殿様モード 段${c.lord}`, `Lord mode ${c.lord}`) : DIFFICULTIES[c.difficulty]?.name ?? '');

/** 結果の短い言い方（クリア／◯日目まで） */
export const resultLabel = (f: ChallengeFrom): string => (f.cleared ? (f.day > 49 ? L(`クリア・${f.day}日目`, `Cleared · day ${f.day}`) : L('クリア', 'Cleared')) : L(`${f.day}日目まで`, `Day ${f.day}`));

/** タイトルに出す挑戦状のカード */
export function challengeTitleHtml(): string {
  const c = pending;
  if (!c) return '';
  const farmer = FARMERS.find((f) => f.id === c.farmer);
  const row = (ico: string, label: string, value: string) => `<p class="ch-row">${ico}<span>${label}</span><b>${value}</b></p>`;
  return `<div class="ch-card" role="group" aria-label="${L('挑戦状', 'Challenge')}">
      <p class="ch-head">${art('mail')}<b>${L('挑戦状が届いた', 'You got a challenge')}</b></p>
      ${row(art('skull'), L('難しさ', 'Mode'), modeLabel(c))}
      ${row(art((farmer?.art ?? 'sprout') as ArtId), L('農家', 'Farmer'), farmer?.name ?? '')}
      ${row(art('trophy'), L('相手の結果', 'Their result'), resultLabel(c.from))}
      ${row(art('star'), L('相手の評価', 'Their rank'), `${c.from.rank}（${c.from.score}${L('点', '')}）`)}
      <p class="ch-note">${L('同じ畑・同じ出目の流れで始まる', 'Same farm, same reels to start')}</p>
      <div class="ch-btns"><button class="primary ch-go" id="ch-go">${L('受けて立つ', 'Accept')}</button><button class="ch-later" id="ch-later">${L('あとで', 'Later')}</button></div>
    </div>`;
}

/** タイトルの挑戦状のボタン */
export function bindChallengeTitle(rerender: () => void): void {
  document.getElementById('ch-go')?.addEventListener('click', () => void acceptChallenge());
  document.getElementById('ch-later')?.addEventListener('click', () => {
    sfx.cancel();
    dropChallenge();
    rerender();
  });
}

/** 挑戦を受ける：同じ種・難しさ・農家で始める（チュートリアルは出さず、初めての人には遊び方の一枚絵だけ） */
export async function acceptChallenge(): Promise<void> {
  const c = pending;
  if (!c) return;
  sfx.select();
  dropChallenge();
  if (!meta.tutorialDone) await explainOnce('ex:overview', overviewCard());
  hooks.startGame(null, { ...challengeSetup(meta, c), challenge: c.from });
}

/** 結果画面：挑戦状の相手との比べ（勝ち・負け・引き分け） */
export function challengeResultHtml(state: GameState): string {
  const them = state.challenge;
  if (!them) return '';
  const me: ChallengeFrom = { day: state.day, taxes: state.taxesPaid, earned: state.stats.totalEarned, cleared: state.cleared, rank: rateRun(state).rank, score: rateRun(state).score, runId: state.runId };
  // 比べる順：クリアしたか → 何日目まで → 稼いだ合計
  const key = (f: ChallengeFrom) => [f.cleared ? 1 : 0, f.day, f.earned];
  const cmp = key(me).map((v, i) => v - key(them)[i]).find((d) => d !== 0) ?? 0;
  const verdict = cmp > 0 ? ['win', L('勝ち！', 'You win!')] : cmp < 0 ? ['lose', L('負け', 'You lose')] : ['draw', L('引き分け', 'Draw')];
  const col = (who: string, f: ChallengeFrom, cls: string) => `<div class="vs-col ${cls}"><p class="vs-who">${who}</p><b class="vs-res">${resultLabel(f)}</b><p class="vs-line">${art('coin')}${f.earned}</p><p class="vs-line">${art('star')}${f.rank}（${f.score}）</p></div>`;
  return `<section class="rs-sec rs-vs ${verdict[0]}">
      <h3 class="rs-h">${L('挑戦状の結果', 'Challenge')}</h3>
      <p class="vs-verdict">${verdict[1]}</p>
      <div class="vs-cols">${col(L('相手', 'Them'), them, cmp < 0 ? 'top' : '')}<span class="vs-mid">VS</span>${col(L('あなた', 'You'), me, cmp > 0 ? 'top' : '')}</div>
      <p class="ch-note">${L('シェアから、この畑の挑戦状を返せる', 'Send this farm back as a challenge from Share')}</p>
    </section>`;
}

/** 挑戦状の文（送る・コピー用） */
export function challengeText(state: GameState): string {
  const farmer = FARMERS.find((f) => f.id === state.farmer);
  const me: ChallengeFrom = { day: state.day, taxes: state.taxesPaid, earned: state.stats.totalEarned, cleared: state.cleared, rank: rateRun(state).rank, score: rateRun(state).score, runId: state.runId };
  return [
    L('畑スロットの挑戦状！', 'A Farm Slots challenge!'),
    L(`同じ畑（${modeLabel({ difficulty: state.difficulty, lord: state.lordLevel })}・${farmer?.name ?? ''}）で、この記録を越えられる？`, `Same farm (${modeLabel({ difficulty: state.difficulty, lord: state.lordLevel })}, ${farmer?.name ?? ''}). Can you beat this?`),
    L(`記録：${resultLabel(me)}・評価${me.rank}（${me.score}点）・稼いだ合計 ${me.earned}`, `Record: ${resultLabel(me)} · rank ${me.rank} (${me.score}) · earned ${me.earned}`),
    challengeUrl(state),
  ].join('\n');
}

