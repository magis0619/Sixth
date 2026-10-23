// 押した瞬間の手応え：指が触れた時点でへこみ、離すと跳ね返る（click は指を離してから来るので、それを待たない）

import { isCalm, vibrate } from '../fx.ts';

/** root の中の selector に当たる要素に、押している間 .pressing、離したら .released を付ける */
export function pressable(root: HTMLElement, selector: string): void {
  let held: HTMLElement | null = null;
  const release = () => {
    if (!held) return;
    const el = held;
    held = null;
    el.classList.remove('pressing');
    el.classList.remove('released');
    // 付け直すと跳ね返りのアニメが最初から再生される
    void el.offsetWidth;
    el.classList.add('released');
    window.setTimeout(() => el.classList.remove('released'), 260);
  };
  root.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element).closest<HTMLElement>(selector);
    if (!el || !root.contains(el) || (el as HTMLButtonElement).disabled) return;
    release();
    held = el;
    el.classList.add('pressing');
    if (!isCalm()) vibrate(6);
  });
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('pointerleave', release);
}
