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

/** spawn した位置 from から p までの移動量。left/top を動かすと毎コマ配置し直しになるので translate で動かす */
function offset(from: { x: number; y: number }, p: { x: number; y: number }): Keyframe {
  return { translate: `${p.x - from.x}px ${p.y - from.y}px` };
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
  const size = (opts.size ?? 1) * (calm ? 1 : BIG);
  el.style.fontSize = `${1.4 * size}rem`;
  const rise = (opts.rise ?? 70) * (calm ? 1 : BIG);
  // 時間の大半は止まって読める状態にする（全体に強い緩急をかけると、すぐ消え始めて読めない）。
  // 緩急は区間ごとに：ポンと出る → ゆっくり浮かぶ → 最後に薄れて上へ
  el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0, easing: 'cubic-bezier(.2,1.6,.4,1)' },
      { transform: 'translate(-50%, -80%) scale(1.2)', opacity: 1, offset: 0.1, easing: 'ease-out' },
      { transform: 'translate(-50%, -85%) scale(1)', opacity: 1, offset: 0.18 },
      { transform: `translate(-50%, calc(-85% - ${rise * 0.35}px)) scale(1)`, opacity: 1, offset: 0.78, easing: 'ease-in' },
      { transform: `translate(-50%, calc(-85% - ${rise}px)) scale(0.9)`, opacity: 0 },
    ],
    { duration: (opts.dur ?? 1100) * 1.25, easing: 'linear' },
  ).onfinish = () => el.remove();
}

/** 中心から粒子を散らす */
export function burst(x: number, y: number, chars: string[], count = 10, spread = 90): void {
  const n = calm ? Math.min(count, 4) : count;
  for (let i = 0; i < n; i++) {
    const el = spawn(glyph(chars[i % chars.length]), 'fx-particle', x, y);
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = spread * (calm ? 1 : BIG + 0.1) * (0.5 + Math.random() * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 20;
    el.style.fontSize = `${(0.8 + Math.random() * 0.8) * (calm ? 1 : BIG)}rem`;
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
        { transform: 'translate(-50%, -50%) scale(1)', ...offset(from, from) },
        { transform: 'translate(-50%, -50%) scale(1.3)', ...offset(from, { x: mx, y: my }), offset: 0.45 },
        { transform: 'translate(-50%, -50%) scale(0.6)', ...offset(from, to) },
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
  const s = strength * 1.5;
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
  // 大げさに：跳ねる大きさを伸ばし、少し戻り過ぎてから落ち着く
  const s = calm ? scale : 1 + (scale - 1) * 1.6;
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${s})`, offset: 0.4 }, { transform: `scale(${1 - (s - 1) * 0.25})`, offset: 0.75 }, { transform: 'scale(1)' }], {
    duration: 360,
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
  const n = calm ? 8 : Math.round(count * 1.4);
  // 画面の大きさは先に1回だけ読む（足すたびに読むと、そのたびに配置し直しになる）
  const W = window.innerWidth;
  const H = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * W;
    const el = spawn(glyph(chars[i % chars.length]), 'fx-particle', x, -20);
    el.style.fontSize = `${1 + Math.random()}rem`;
    const dx = (Math.random() - 0.5) * 160;
    el.animate(
      [
        { transform: 'translate(-50%, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), ${H + 40}px) rotate(${720 * Math.random()}deg)`, opacity: 0.9 },
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

/** 倍率の表示：小数は1桁に丸める（1.690000… → 1.7、2.0 → 2） */
export function fmtMult(x: number): string {
  return String(Math.round(x * 10) / 10);
}

// ---- 早送り：演出の最中に画面をタップすると、残りの演出を速く流す ----

const HURRY_RATE = 4;
/** 演出全体の速さ。1より小さいとゆっくり（何が起きたか見て分かるように） */
const SPEED = 0.85;
/** 演出の大げささ（文字・粒・跳ね・揺れの大きさにかける） */
const BIG = 1.3;
let hurry = false;

/** 今の再生速度（ふだんは SPEED、早送り中はその4倍） */
function rate(): number {
  return SPEED * (hurry ? HURRY_RATE : 1);
}

export function isHurry(): boolean {
  return hurry;
}

/** 早送りを始める（いま動いている演出も速める）／止める */
export function setHurry(on: boolean): void {
  if (hurry === on) return;
  hurry = on;
  document.documentElement.classList.toggle('hurry', on);
  document.getAnimations().forEach((a) => (a.playbackRate = rate()));
}

// 演出の速さは1か所で決める：Element.animate で作る演出はすべてこの速さで流す
// （CSS のアニメには掛けない。始まるたびに調べると重い。CSS 側は押す・光るなどの短い物だけ）
const baseAnimate = Element.prototype.animate;
Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
  const a = baseAnimate.apply(this, args);
  a.playbackRate = rate();
  return a;
};

/** 演出の待ち（演出の速さに合わせて伸び縮みする） */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms / rate()));

/** 演出のための遅らせ（setTimeout の代わり。演出の速さに合わせる） */
export function later(fn: () => void, ms: number): number {
  return window.setTimeout(fn, ms / rate());
}

/**
 * 金額を桁ごとに回して止める（スロットのリールのように右の桁から止まる）。
 * 止まり切るまで待つ Promise を返す
 */
export function rollNumber(x: number, y: number, value: number, opts: { prefix?: string; size?: number; hold?: number; rise?: boolean } = {}): Promise<void> {
  const digits = String(Math.max(0, Math.round(value))).split('');
  const el = spawn('', 'fx-roll', x, y);
  el.style.fontSize = `${2.2 * (opts.size ?? 1)}rem`;
  el.innerHTML =
    (opts.prefix ? `<span class="roll-prefix">${opts.prefix}</span>` : '') +
    digits.map(() => `<span class="roll-digit"><span class="roll-strip">${'0123456789'.repeat(3).split('').map((d) => `<i>${d}</i>`).join('')}</span></span>`).join('') +
    '<span class="roll-unit">金</span>';
  // rise：下からせり上がって出る
  const from = opts.rise ? 'translate(-50%, calc(-50% + 70px)) scale(0.8)' : 'translate(-50%, -50%) scale(0.4)';
  el.animate([{ transform: from, opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }], {
    duration: opts.rise ? 380 : 180,
    easing: 'cubic-bezier(.3,1.6,.5,1)',
    fill: 'forwards',
  });
  const strips = [...el.querySelectorAll<HTMLElement>('.roll-strip')];
  const n = strips.length;
  const done = strips.map((strip, k) => {
    // 2周回してから目的の数字へ。右の桁ほど早く止まる
    const target = 20 + Number(digits[k]);
    const dur = calm ? 200 : 450 + (n - 1 - k) * 160;
    return strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-target}em)` }], {
      duration: dur,
      easing: 'cubic-bezier(.2,.7,.3,1.08)',
      fill: 'forwards',
    }).finished;
  });
  return Promise.all(done).then(async () => {
    el.animate([{ transform: 'translate(-50%, -50%) scale(1.25)' }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 200, fill: 'forwards' });
    await sleep(opts.hold ?? 700);
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -90%) scale(0.9)' }], { duration: 300, fill: 'forwards' }).onfinish = () => el.remove();
  });
}

/** 倍率を1つずつ乗せて見せる（×1.5 → ×1.5 → …） */
export async function stackMultipliers(x: number, y: number, steps: { label: string; x: number }[]): Promise<void> {
  const el = spawn('', 'fx-mults', x, y);
  let total = 1;
  for (const s of steps) {
    total *= s.x;
    const chip = document.createElement('span');
    chip.className = 'mult-chip';
    chip.innerHTML = `<small>${s.label}</small>×${fmtMult(s.x)}`;
    el.appendChild(chip);
    chip.animate([{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(0.9)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)' }], {
      duration: 260,
      easing: 'cubic-bezier(.3,1.5,.5,1)',
    });
    await sleep(calm ? 120 : 260);
  }
  if (steps.length > 1) {
    const sum = document.createElement('span');
    sum.className = 'mult-chip total';
    sum.textContent = `＝×${fmtMult(total)}`;
    el.appendChild(sum);
    sum.animate([{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    await sleep(calm ? 150 : 350);
  }
  later(() => {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => el.remove();
  }, 900);
}

/** ヒットストップ：画面のアニメーションを一瞬止める */
export async function hitStop(ms = 90): Promise<void> {
  if (calm) return;
  document.documentElement.classList.add('hitstop');
  await sleep(ms);
  document.documentElement.classList.remove('hitstop');
}

/** スロー：この間に出す演出の間隔を伸ばす倍率（控えめ設定では等速） */
export function slowFactor(level: number): number {
  return calm ? 1 : 1 + level * 0.35;
}

/** 集中線（中心から放射状の線が回る） */
export function speedLines(ms = 1400, color = 'rgba(255,255,255,0.55)'): void {
  if (calm) return;
  const el = spawn('', 'fx-speedlines', 0, 0);
  el.style.setProperty('--line', color);
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: ms }).onfinish = () => el.remove();
}

/** ブラウン管の走査線を一瞬強める。strength は 0〜1 */
export function scanlines(strength: number, ms = 600): void {
  if (calm) return;
  const el = spawn('', 'fx-scan', 0, 0);
  el.animate([{ opacity: Math.min(1, strength) }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }).onfinish = () => el.remove();
}

/** 金額に応じた揺れの強さ（大きいほど強いが上限あり） */
export function shakeFor(amount: number): number {
  return Math.min(16, 2 + Math.log2(Math.max(1, amount)) * 1.6);
}

/**
 * from から to へ「やって来る」動き。hop＝跳ねながら走る（タヌキ）、そうでなければ羽ばたいて飛ぶ（カラス）。
 * 着いたら resolve
 */
export function travel(from: { x: number; y: number }, toEl: Element, html: string, hop: boolean): Promise<void> {
  const to = center(toEl);
  const el = spawn(html, `fx-travel${hop ? ' hop' : ' fly'}`, from.x, from.y);
  // 動物は何か分かる大きさで
  el.style.fontSize = '3rem';
  // 左から右へ進むときは向きを反転（絵は右向き）
  if (to.x < from.x) el.classList.add('flip');
  const dur = calm ? 350 : hop ? 900 : 800;
  const mid = { x: (from.x + to.x) / 2, y: hop ? Math.max(from.y, to.y) : Math.min(from.y, to.y) - 40 };
  return el
    .animate(
      [
        offset(from, from),
        { ...offset(from, mid), offset: 0.55 },
        offset(from, to),
      ],
      { duration: dur, easing: hop ? 'linear' : 'cubic-bezier(.3,0,.4,1)', fill: 'forwards' },
    )
    .finished.then(() => {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => el.remove();
    });
}

/** 金貨の雨 */
export function coinRain(count = 40): void {
  const n = calm ? 8 : count;
  const W = window.innerWidth;
  const H = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * W;
    const el = spawn(glyph('🪙'), 'fx-particle', x, -30);
    el.style.fontSize = `${1.2 + Math.random() * 0.9}rem`;
    el.animate(
      [
        { transform: 'translate(-50%, 0) rotateY(0deg)' },
        { transform: `translate(-50%, ${H + 60}px) rotateY(${720 + Math.random() * 720}deg)` },
      ],
      { duration: 1100 + Math.random() * 900, delay: Math.random() * 600, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'backwards' },
    ).onfinish = () => el.remove();
  }
}

/** 叩きつける大きな文字 */
export function slamText(text: string, opts: { cls?: string; size?: number; dur?: number } = {}): Promise<void> {
  const el = spawn(text, `fx-slam ${opts.cls ?? ''}`, window.innerWidth / 2, window.innerHeight * 0.42);
  el.style.fontSize = `${3.2 * (opts.size ?? 1)}rem`;
  const dur = opts.dur ?? 1300;
  return el
    .animate(
      [
        { transform: 'translate(-50%, -50%) scale(4) rotate(-10deg)', opacity: 0, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { transform: 'translate(-50%, -50%) scale(0.9) rotate(-4deg)', opacity: 1, offset: 0.14, easing: 'ease-out' },
        { transform: 'translate(-50%, -50%) scale(1.05) rotate(-4deg)', opacity: 1, offset: 0.22 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.8, easing: 'ease-in' },
        { transform: 'translate(-50%, -50%) scale(1.3) rotate(-4deg)', opacity: 0 },
      ],
      { duration: dur, easing: 'linear' },
    )
    .finished.then(() => el.remove());
}

/** 雨：マスの上に斜めの雨筋を降らせ、最後にしぶき */
export function rainShower(plots: Element[]): void {
  // 先に全部の位置を読んでから足す（読み書きを交互にすると、そのたびに配置し直しになる）
  const rects = plots.map((p) => p.getBoundingClientRect());
  rects.forEach((r, k) => {
    const el = spawn('', 'fx-rainfall', r.left, r.top);
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
    el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 800, delay: k * 40, fill: 'backwards' }).onfinish = () => {
      el.remove();
      burst(r.left + r.width / 2, r.top + r.height * 0.75, ['💧'], calm ? 2 : 4, 26);
    };
  });
}

/** 太陽：空から光の柱がマスの列に差し込む */
export function sunBeam(plots: Element[]): void {
  if (!plots.length) return;
  const rects = plots.map((p) => p.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const el = spawn('', 'fx-sunbeam', left - 10, 0);
  el.style.width = `${right - left + 20}px`;
  el.style.height = `${bottom}px`;
  el.animate([{ opacity: 0, transform: 'scaleX(0.3)' }, { opacity: 1, transform: 'scaleX(1)', offset: 0.25 }, { opacity: 0.9, offset: 0.7 }, { opacity: 0 }], {
    duration: 1000,
    easing: 'ease-out',
  }).onfinish = () => el.remove();
}

/** 蜂：マスからマスへ飛び回る */
export function beeFlight(plots: Element[], beeHtml: string): void {
  if (!plots.length) return;
  const pts = plots.map((p) => center(p));
  const el = spawn(beeHtml, 'fx-bee', pts[0].x, pts[0].y);
  const frames = pts.flatMap((q, i) => {
    const next = pts[i + 1];
    const out: Keyframe[] = [offset(pts[0], q)];
    if (next) out.push(offset(pts[0], { x: (q.x + next.x) / 2 + (i % 2 ? 18 : -18), y: (q.y + next.y) / 2 - 24 }));
    return out;
  });
  el.animate(frames, { duration: 220 * pts.length + 200, easing: 'ease-in-out' }).onfinish = () => el.remove();
}

/** 花火：下から打ち上がって色つきの火花が広がる */
export function firework(x: number, y: number, color: string): void {
  const rocket = spawn('', 'fx-rocket', x, window.innerHeight + 10);
  rocket.style.background = color;
  rocket.animate([{ translate: '0 0' }, { translate: `0 ${y - window.innerHeight - 10}px` }], { duration: 600, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).onfinish = () => {
    rocket.remove();
    const n = calm ? 12 : 28;
    for (let i = 0; i < n; i++) {
      const spark = spawn('', 'fx-spark', x, y);
      spark.style.background = color;
      spark.style.boxShadow = `0 0 8px ${color}`;
      const a = (Math.PI * 2 * i) / n;
      const d = 70 + Math.random() * 60;
      spark.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.8)`, opacity: 1, offset: 0.6 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d * 1.1}px), calc(-50% + ${Math.sin(a) * d + 40}px)) scale(0.3)`, opacity: 0 },
        ],
        { duration: 1100 + Math.random() * 300, easing: 'cubic-bezier(.1,.7,.3,1)' },
      ).onfinish = () => spark.remove();
    }
  };
}
