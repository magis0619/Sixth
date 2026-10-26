// ボタンの「成功」「失敗」：どの部品でも同じ見せ方にする（docs/references.md の「ボタンの状態」）

import { sfx } from '../audio.ts';
import { center, floatText, later, pop, shake, vibrate } from '../fx.ts';

/** 失敗：押した物が赤く光って小刻みに揺れ、真上に短い理由を出す */
export function reject(target: Element | null, reason: string): void {
  sfx.error();
  vibrate([20, 40, 20]);
  if (!target) return;
  target.classList.remove('is-ng');
  void (target as HTMLElement).offsetWidth;
  target.classList.add('is-ng');
  later(() => target.classList.remove('is-ng'), 520);
  shake(target, 4);
  const box = target.getBoundingClientRect();
  floatText(center(target).x, box.top + 6, reason, { cls: 'bad pill', size: 0.72, rise: 16, dur: 1200 });
}

/** 成功：押した物が緑に光って ✓、少し跳ねる */
export function accept(target: Element | null, label = '✓'): void {
  if (!target) return;
  target.classList.remove('is-ok');
  void (target as HTMLElement).offsetWidth;
  target.classList.add('is-ok');
  later(() => target.classList.remove('is-ok'), 620);
  pop(target, 1.08);
  const box = target.getBoundingClientRect();
  floatText(box.right - 18, box.top + 10, label, { cls: 'good pill', size: 0.7, rise: 18, dur: 900 });
}
