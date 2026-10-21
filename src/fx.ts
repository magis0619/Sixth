// 画面演出（数字の飛び出し、粒子、揺れ、フラッシュ）。すべて fx レイヤー上に一時要素を出して消す。

import { glyph } from './art.ts';

const layer = (): HTMLElement => document.getElementById('fx')!;

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 「演出控えめ」：揺れ・点滅・フリーズを弱める。端末の「視差効果を減らす」設定でも有効 */
let calm = reduceMotion;
try {
  const saved = localStorage.getItem('hatake-slot:calm');
  if (saved !== null) calm = saved === '1';
} catch {
  // ストレージが使えない環境では既定値のまま
}
document.documentElement.classList.toggle('calm', calm);

export function isCalm(): boolean {
  return calm;
}

export function toggleCalm(): boolean {
  calm = !calm;
  document.documentElement.classList.toggle('calm', calm);
  try {
    localStorage.setItem('hatake-slot:calm', calm ? '1' : '0');
  } catch {
    // 保存できなくても動作は続ける
  }
  return calm;
}

export function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function spawn(html: string, cls: string, x: number, y: number): HTMLElement {
  const el = document.createElement('div');
  el.className = `fx ${cls}`;
  el.innerHTML = html;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer().appendChild(el);
  return el;
}

/** 浮かび上がって消える文字。size は 1 が標準 */
export function floatText(x: number, y: number, text: string, opts: { cls?: string; size?: number; rise?: number; dur?: number } = {}): void {
  const el = spawn(text, `fx-text ${opts.cls ?? ''}`, x, y);
  const size = opts.size ?? 1;
  el.style.fontSize = `${1.4 * size}rem`;
  const rise = opts.rise ?? 70;
  el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
      { transform: 'translate(-50%, -80%) scale(1.25)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -90%) scale(1)', opacity: 1, offset: 0.5 },
      { transform: `translate(-50%, calc(-90% - ${rise}px)) scale(0.9)`, opacity: 0 },
    ],
    { duration: opts.dur ?? 1100, easing: 'cubic-bezier(.2,.8,.3,1)' },
  ).onfinish = () => el.remove();
}

/** 中心から粒子を散らす */
export function burst(x: number, y: number, chars: string[], count = 10, spread = 90): void {
  const n = calm ? Math.min(count, 4) : count;
  for (let i = 0; i < n; i++) {
    const el = spawn(glyph(chars[i % chars.length]), 'fx-particle', x, y);
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = spread * (0.5 + Math.random() * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 20;
    el.style.fontSize = `${0.8 + Math.random() * 0.8}rem`;
    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 40}px)) scale(0.6)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.1,.7,.3,1)' },
    ).onfinish = () => el.remove();
  }
}

/** 要素から要素へ絵文字を飛ばす。最後の1つが着いたら onArrive */
export function flyTo(from: { x: number; y: number }, toEl: Element, char: string, count = 1, onArrive?: () => void): void {
  const to = center(toEl);
  for (let i = 0; i < count; i++) {
    const el = spawn(glyph(char), 'fx-fly', from.x, from.y);
    const mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 120;
    const my = Math.min(from.y, to.y) - 40 - Math.random() * 60;
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', left: `${from.x}px`, top: `${from.y}px` },
        { transform: 'translate(-50%, -50%) scale(1.3)', left: `${mx}px`, top: `${my}px`, offset: 0.45 },
        { transform: 'translate(-50%, -50%) scale(0.6)', left: `${to.x}px`, top: `${to.y}px` },
      ],
      { duration: 550 + i * 70, easing: 'cubic-bezier(.5,0,.5,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      el.remove();
      if (i === count - 1) onArrive?.();
    };
  }
}

export function shake(el: Element, strength = 6): void {
  if (calm) return;
  const s = strength;
  el.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-s}px, ${s / 2}px)` },
      { transform: `translate(${s}px, ${-s / 2}px)` },
      { transform: `translate(${-s / 2}px, ${s / 3}px)` },
      { transform: `translate(${s / 2}px, 0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 320 },
  );
}

export function pop(el: Element, scale = 1.25): void {
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }], {
    duration: 280,
    easing: 'cubic-bezier(.3,1.6,.5,1)',
  });
}

export function flash(color: string, dur = 350): void {
  const el = spawn('', 'fx-flash', 0, 0);
  el.style.background = color;
  el.animate([{ opacity: calm ? 0.2 : 0.7 }, { opacity: 0 }], { duration: dur }).onfinish = () => el.remove();
}

/** 画面上部から紙吹雪 */
export function confetti(count = 40): void {
  const chars = ['🎉', '✨', '💰', '🪙', '⭐'];
  const n = calm ? 8 : count;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * window.innerWidth;
    const el = spawn(glyph(chars[i % chars.length]), 'fx-particle', x, -20);
    el.style.fontSize = `${1 + Math.random()}rem`;
    const dx = (Math.random() - 0.5) * 160;
    el.animate(
      [
        { transform: 'translate(-50%, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), ${window.innerHeight + 40}px) rotate(${720 * Math.random()}deg)`, opacity: 0.9 },
      ],
      { duration: 1600 + Math.random() * 1200, delay: Math.random() * 400, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'backwards' },
    ).onfinish = () => el.remove();
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 振動非対応
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
