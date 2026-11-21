// 左上の所持金の見せ方：飛んでいる途中のお金・まだ判子を押していない年貢を引いて、数字を回して合わせる

import { burst, center, pop } from '../fx.ts';
import { el, state } from './store.ts';
import { play } from './play.ts';

/**
 * 増えたお金を「飛んでいる途中」にしておく。返した関数を呼ぶと届いて、所持金が増える。
 * 呼び忘れても数秒で届いた扱いにする（表示がずれたままにならないように）
 */
export function holdGold(amount: number): () => void {
  if (amount <= 0) return () => {};
  play.goldInFlight += amount;
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    play.goldInFlight = Math.max(0, play.goldInFlight - amount);
    syncGold();
  };
  window.setTimeout(land, 8000);
  return land;
}

/** 所持金の表示を、届いた分までに合わせる */
export function syncGold(): void {
  const shown = state.gold - play.goldInFlight + play.taxPending;
  if (shown !== play.shownGold) setGold(shown);
}

export function setGold(value: number): void {
  const from = play.shownGold;
  play.shownGold = value;
  cancelAnimationFrame(play.goldTween);
  const start = performance.now();
  const dur = Math.min(700, 200 + Math.abs(value - from) * 15);
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / dur);
    el.gold.textContent = String(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) play.goldTween = requestAnimationFrame(step);
  };
  play.goldTween = requestAnimationFrame(step);
  if (value !== from) pop(el.goldBox, value > from ? 1.15 : 0.9);
  // お金が増えたら財布がジャラッと揺れて光る
  if (value > from) {
    el.goldBox.classList.remove('jingle');
    void el.goldBox.offsetWidth;
    el.goldBox.classList.add('jingle');
    const c = center(el.goldBox.querySelector('.stat-icon') ?? el.goldBox);
    burst(c.x, c.y, ['✨'], value - from >= 20 ? 6 : 3, 26);
  }
}
