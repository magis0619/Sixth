// 急いで連打する人の誤操作を防ぐ
// ① 演出の最中のタップは早送り。同じ調子で押し続けている間は、演出が終わってもその続きとして飲み込む
//    （終わった瞬間のタップで、勝手に植える・仕入れを選ぶ・市で買う、が起きていた）
// ② 新しく出た画面（仕入れ・市・確認・説明のカード）は、出てから少しの間は押せない

import { setHurry } from '../fx.ts';
import { ui } from './store.ts';

/** 早送りの連打とみなすタップの間（これより速く押し続けている間は飲み込む） */
const STREAK_GAP = 350;
/** 新しく出た画面が押せるようになるまで */
const FRESH_MS = 400;

let streakAt = -Infinity;
let streakTimer = 0;
let swallowNextClick = false;

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

/** 連打の続きとして飲み込む時刻を延ばす。演出からの続きなら、早送りの札も出したままにする */
function holdStreak(now: number, badge = true): void {
  streakAt = now;
  window.clearTimeout(streakTimer);
  const root = document.documentElement;
  // tap-hold：今はタップを飲み込む間（通しのテストはこれが外れるのを待ってから押す）
  root.classList.add('tap-hold');
  if (badge || root.classList.contains('hurry-hold')) root.classList.add('hurry-hold');
  streakTimer = window.setTimeout(() => root.classList.remove('tap-hold', 'hurry-hold'), STREAK_GAP);
}

function swallow(e: Event): void {
  e.stopImmediatePropagation();
  e.preventDefault();
}

export function installTapGuards(): void {
  document.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    swallowNextClick = false;
    const now = performance.now();
    const target = e.target as Element | null;
    if (ui.busy) {
      // 窓（お守り選び・確認など）や案内の吹き出しを押したときは、選ぶための操作なので早送りにしない
      if (target?.closest('#overlay.show, .coach, .sheet, .explain-layer')) return;
      setHurry(true);
      holdStreak(now);
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
      holdStreak(now, false);
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
  document.addEventListener('pointercancel', () => (swallowNextClick = false), { capture: true });
  // 飲み込んだ押し始めのあとは、なぞる・引っぱる操作にもしない
  for (const type of ['pointermove', 'pointerup'] as const) {
    document.addEventListener(type, (e) => {
      if (swallowNextClick) swallow(e);
    }, { capture: true });
  }
}
