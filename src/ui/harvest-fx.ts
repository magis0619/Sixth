// 列で売ったときの演出：作物が金貨になって財布へ飛び、合計が回って止まる。大豊作の始まりと締め

import { activeLineFx, lineFxBits, playLineFx } from './linefx.ts';
import { EN, L } from '../i18n.ts';
import { type SellResult } from '../game.ts';
import { duckBgm, sfx } from '../audio.ts';
import { art } from '../art.ts';
import {
  burst, center, coinRain, rays, dim, firework, confetti, flash, floatText, flyTo, hitStop, pop, rollNumber, scanlines, shake, shakeFor, sleep, slamText, slowFactor, speedLines, stackMultipliers, vibrate, later,
} from '../fx.ts';
import { FRUIT } from './view.ts';
import { $, el } from './store.ts';
import { play } from './play.ts';

/** 大豊作の幕開け：畑いっぱいの実が真ん中から順に跳ね、後光とともに「大豊作！」 */
export async function bigHarvestIntro(ghosts: HTMLElement[]): Promise<void> {
  const f = center(el.field);
  duckBgm(7000);
  sfx.reach();
  await hitStop(220);
  const order = ghosts
    .map((g) => ({ g, d: Math.hypot(parseFloat(g.style.left) - f.x, parseFloat(g.style.top) - f.y) }))
    .sort((a, b) => a.d - b.d);
  order.forEach(({ g }, k) => {
    later(() => {
      g.animate([{ scale: 1 }, { scale: 1.6, offset: 0.4 }, { scale: 0.9, offset: 0.75 }, { scale: 1.1 }], { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)', fill: 'forwards' });
      burst(parseFloat(g.style.left), parseFloat(g.style.top), ['🌾', '✨'], 4, 40);
      sfx.pon();
    }, k * 55);
  });
  await sleep(order.length * 55 + 300);
  dim(3400, 0.55);
  rays(3200);
  flash('#fff2a0', 600);
  shake(el.app, 16);
  vibrate([80, 40, 80, 40, 200]);
  sfx.fanfare();
  await slamText(L('大豊作！', 'BIG HARVEST!'), { cls: 'harvest', size: 1.5, dur: 2600 });
}

/** 大豊作の締め：花火・金貨の雨・紙吹雪の中で大当たりの額 */
export async function bigHarvestFinale(amount: number): Promise<void> {
  const f = center(el.field);
  sfx.fever();
  flash('#ffe680', 500);
  shake(el.app, 12);
  // 粒は合わせて80までに抑える（多すぎるとスマホで画面が落ちる）
  coinRain(40);
  confetti(30);
  const colors = ['#ffd84a', '#ff6a4a', '#7fe07f', '#6ac8ff', '#ff9ae0', '#ffd84a'];
  colors.forEach((c, i) =>
    later(() => {
      firework(window.innerWidth * (0.15 + (0.7 * ((i * 2) % 5)) / 4), window.innerHeight * (0.16 + 0.1 * (i % 2)), c);
      sfx.firework();
    }, i * 300),
  );
  flyTo(f, el.goldBox, '🪙', 16, () => play.landBumper(), true);
  await rollNumber(f.x, f.y, amount, { prefix: L('大豊作 +', 'Big harvest +'), size: 1.5, hold: 1400, rise: true });
}

/** お金の増減の表示：コインの絵と数字だけ（言葉は付けない） */
export function money(n: number): string {
  return `<span class="money">${art('coin')}${n >= 0 ? '+' : '−'}${Math.abs(n)}</span>`;
}

/**
 * 列の収穫：ヒットストップ → 倍率を1つずつ乗せる → 作物が跳ねて財布へ（大きいほどスロー）→ 合計が桁ごとに回る
 */
export async function playLineHarvest(res: SellResult, centers: { x: number; y: number }[], p: { x: number; y: number }, landSale: () => void): Promise<void> {
  const level = Math.min(res.lines, 4);
  const slow = slowFactor(level - 1);
  // 解放で選んだ列の演出（見た目だけ）
  const fx = activeLineFx();
  const f = center(el.field);
  // 売った実は畑から消えるので、跳ねるまでその場に残して見せる
  // 大きさは先にまとめて読む（足すたびに読むと、そのたびに配置し直しになる）
  const sizes = res.cells.map(({ cell: c }) => (el.field.children[c] as HTMLElement).clientWidth);
  const ghosts = res.cells.map(({ cell: c, kind }, k) => {
    const g = document.createElement('div');
    g.className = 'fx fx-ghost';
    g.innerHTML = art(FRUIT[kind]);
    g.style.left = `${centers[c].x}px`;
    g.style.top = `${centers[c].y}px`;
    g.style.fontSize = `${sizes[k] * 0.62}px`;
    $('fx').appendChild(g);
    return g;
  });
  if (level >= 2) {
    await hitStop(90);
    flash('#ffffff', 250);
    speedLines(1600 + level * 300, level >= 3 ? 'rgba(255,216,74,0.6)' : 'rgba(255,255,255,0.55)');
  }
  if (res.bumper) await bigHarvestIntro(ghosts);
  sfx.lineHarvest();
  const name = (EN ? ['', 'LINE!', 'DOUBLE LINE!!', 'GREAT HARVEST!!!', 'NEARLY ALL!!!!'] : ['', '一列そろい！', '二列そろい！！', '大収穫！！！', 'ほぼ全部！！！！'])[level];
  // 列の名前は畑の上、倍率の札は畑の下に出す（畑の上の作物から出る「+10」と重ならないように）
  const box = el.field.getBoundingClientRect();
  if (!res.bumper) floatText(f.x, Math.max(70, box.top - 4), name, { cls: 'combo', size: 1.1 + level * 0.2, rise: 40, dur: 1500 + level * 300 });
  await stackMultipliers(f.x, box.bottom + 26, res.steps);
  // 作物がポポポポと一定の調子で財布に吸い込まれる（1つずつの間は最大0.05秒、全部で0.4秒まで）
  const gap = Math.min(50, 400 / Math.max(1, res.cells.length));
  const arrivals = res.cells.map(({ cell: c, price: each, kind }, k) =>
    new Promise<void>((resolve) => {
      later(() => {
        const q = centers[c];
        // 飛び出しの音は最初の1つだけ（続けて鳴らすと重なって濁る）。入るたびに「ポッ」
        if (k === 0) sfx.sell(each, play.combo);
        ghosts[k].remove();
        pop(el.field.children[c], 1.2);
        // 1つずつの額は短めに見せて、合計が出る前に消す（真ん中の数字と重ならないように）
        floatText(q.x, q.y - 10, money(each), { cls: 'gold', size: Math.min(1.4, 0.75 + each / 30), dur: 650 });
        burst(q.x, q.y, lineFxBits(fx), 6, 50);
        flyTo(q, el.goldBox, art(FRUIT[kind]), 1, () => {
          sfx.popIn(k);
          pop(el.goldBox, 1.2);
          resolve();
        }, 'snap');
      }, k * gap);
    }),
  );
  await Promise.all(arrivals);
  ghosts.forEach((g) => g.remove());
  await sleep(60);
  landSale();
  // 合計が桁ごとに回って止まる
  const amount = res.total;
  shake(el.app, shakeFor(amount));
  scanlines(Math.min(1, amount / 250));
  vibrate(level >= 2 ? [40, 30, 120] : [30, 20, 60]);
  if (level >= 2) confetti(20 + level * 20);
  if (level >= 3 && fx !== 'coins') coinRain(30 + level * 10);
  playLineFx(fx, level, f);
  await rollNumber(f.x, f.y, amount, { prefix: '+', size: 0.9 + level * 0.15, hold: 700 + level * 200, tier: level });
  if (res.bumper) await bigHarvestFinale(res.bumper);
}
