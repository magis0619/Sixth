// 急いで連打する人の誤操作を防ぐ
// ① 演出の最中に長押しすると、押している間だけ早送り（ふつうのタップでは速くしない。
//    てきとうに押しているうちに勝手に4倍速になっていた）。
//    演出の最中から同じ調子で押し続けている間は、演出が終わってもその続きとして飲み込む
//    （終わった瞬間のタップで、勝手に植える・仕入れを選ぶ・市で買う、が起きていた）
// ② 新しく出た画面（仕入れ・市・確認・説明のカード）は、出てから少しの間は押せない

import { setHurry } from '../fx.ts';
import { ui } from './store.ts';

/** 早送りの連打とみなすタップの間（これより速く押し続けている間は飲み込む） */
const STREAK_GAP = 350;
/** 新しく出た画面が押せるようになるまで */
const FRESH_MS = 400;
/** 演出の最中に、これより長く押していると早送り */
const HOLD_MS = 300;

let streakAt = -Infinity;
let streakTimer = 0;
let swallowNextClick = false;
let holdTimer = 0;

/** 新しく出た画面を、少しの間押せなくする（押せるようになると札が明るくなる） */
export function armFresh(node: HTMLElement, ms = FRESH_MS): void {
  node.dataset.readyAt = String(performance.now() + ms);
  node.classList.add('arming');
  window.setTimeout(() => {
    if (Number(node.dataset.readyAt) <= performance.now() + 1) node.classList.remove('arming');
  }, ms);
}

function freshBlocked(target: EventTarget | null): boolean {
  const f = (target as Element | null)?.closest?.<HTMLElement>('[data-ready-at]');
  return !!f && performance.now() < Number(f.dataset.readyAt);
}

/** 連打の続きとして飲み込む時刻を延ばす */
function holdStreak(now: number): void {
  streakAt = now;
  window.clearTimeout(streakTimer);
  const root = document.documentElement;
  // tap-hold：今はタップを飲み込む間（通しのテストはこれが外れるのを待ってから押す）
  root.classList.add('tap-hold');
  streakTimer = window.setTimeout(() => root.classList.remove('tap-hold'), STREAK_GAP);
}

/** 指を離した：長押しの早送りを止める */
function release(): void {
  window.clearTimeout(holdTimer);
  holdTimer = 0;
  setHurry(false);
}

function swallow(e: Event): void {
  e.stopImmediatePropagation();
  e.preventDefault();
}

/** onBusyTap：演出の最中に短く押した（長押しで早送りできると知らせる） */
export function installTapGuards(onBusyTap: () => void = () => {}): void {
  document.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    swallowNextClick = false;
    const now = performance.now();
    const target = e.target as Element | null;
    if (ui.busy) {
      // 窓（お守り選び・確認など）や案内の吹き出しを押したときは、選ぶための操作なので早送りにしない
      if (target?.closest('#overlay.show, .coach, .sheet, .explain-layer')) return;
      holdStreak(now);
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        if (ui.busy) setHurry(true);
      }, HOLD_MS);
      return;
    }
    // 演出は終わったが、早送りの連打がまだ続いている：操作にしない（指を一度止めれば次から効く）
    if (now - streakAt < STREAK_GAP) {
      holdStreak(now);
      swallowNextClick = true;
      swallow(e);
      return;
    }
    if (freshBlocked(target)) {
      // 出たばかりの画面を押した：そのまま速く押し続けている間も飲み込む（早送りの札は出さない）
      holdStreak(now);
      swallowNextClick = true;
      swallow(e);
    }
  }, { capture: true });

  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    if (swallowNextClick || freshBlocked(e.target)) {
      swallowNextClick = false;
      swallow(e);
    }
  }, { capture: true });
  document.addEventListener('pointercancel', () => {
    swallowNextClick = false;
    release();
  }, { capture: true });
  document.addEventListener('pointerup', (e) => {
    if (!e.isPrimary) return;
    // 早送りにならないうちに離した＝短いタップ
    if (holdTimer && ui.busy) onBusyTap();
    release();
  }, { capture: true });
  // 飲み込んだ押し始めのあとは、なぞる・引っぱる操作にもしない
  for (const type of ['pointermove', 'pointerup'] as const) {
    document.addEventListener(type, (e) => {
      if (swallowNextClick) swallow(e);
    }, { capture: true });
  }
}
