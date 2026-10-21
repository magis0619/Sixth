// 背景：空の時間帯と季節、舞うもの、年貢前の鼓動、横切る生き物

import { CONFIG } from '../config.ts';
import { nextTax } from '../game.ts';
import { art, type ArtId } from '../art.ts';
import { sfx } from '../audio.ts';
import { isCalm } from '../fx.ts';
import { $, state, ui } from './store.ts';

// ---- 空（昼夜と季節）・年貢前の鼓動 ----

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export let heartTimer = 0;

/** 1週（年貢1回分）で季節が進み、週の中で朝→昼→夕方→夜（年貢の日）と空が変わる */
export function renderSky(): void {
  const root = document.documentElement;
  const week = Math.floor(Math.max(0, state.day - 1) / CONFIG.taxPeriod);
  const season = SEASONS[week % SEASONS.length];
  const d = state.day === 0 ? 1 : ((state.day - 1) % CONFIG.taxPeriod) + 1;
  root.dataset.time = d >= CONFIG.taxPeriod ? 'night' : d >= CONFIG.taxPeriod - 1 ? 'evening' : d <= 1 ? 'morning' : 'noon';
  if (root.dataset.season !== season) {
    root.dataset.season = season;
    buildAmbient(season);
  }
}

/** 季節の舞うもの（花びら・落ち葉・雪。夏は無し） */
export function buildAmbient(season: (typeof SEASONS)[number]): void {
  let layer = document.getElementById('ambient');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'ambient';
    layer.setAttribute('aria-hidden', 'true');
    document.body.prepend(layer);
  }
  layer.className = season;
  const n = season === 'summer' ? 0 : 14;
  layer.innerHTML = Array.from({ length: n }, () => {
    const left = Math.random() * 100;
    const dur = 7 + Math.random() * 7;
    const delay = -Math.random() * dur;
    return `<i style="left:${left.toFixed(1)}%;animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s"></i>`;
  }).join('');
}

/** 鼓動を止める（結果画面へ移るとき） */
export function stopHeartbeat(): void {
  clearInterval(heartTimer);
  heartTimer = 0;
}

/** 年貢が明日までなのにお金が足りないとき：画面のふちが赤く脈打ち、鼓動が鳴る */
export function renderDanger(): void {
  const t = nextTax(state);
  const danger = state.day > 0 && !state.over && t.daysLeft <= 1 && state.gold < t.amount;
  document.documentElement.classList.toggle('tax-danger', danger);
  if (danger && !heartTimer) {
    sfx.heartbeat();
    heartTimer = window.setInterval(() => {
      if (!ui.busy) sfx.heartbeat();
    }, 1100);
  } else if (!danger && heartTimer) {
    clearInterval(heartTimer);
    heartTimer = 0;
  }
}

// ---- 背景の景色：小屋の煙・流れる雲・ときどき横切る生き物 ----

export function setupScene(): void {
  $('scene-hut').insertAdjacentHTML('afterbegin', art('hut'));
  const spawn = () => {
    window.setTimeout(spawn, 7000 + Math.random() * 9000);
    const scene = $('scene');
    if (isCalm() || scene.clientHeight < 40 || document.hidden) return;
    const kinds = [
      { id: 'cat' as ArtId, cls: 'walk', y: 0.72, dur: 9000 },
      { id: 'bird' as ArtId, cls: 'flyby', y: 0.25, dur: 5000 },
      { id: 'butterfly' as ArtId, cls: 'flutter', y: 0.45, dur: 8000 },
    ];
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    const ltr = Math.random() < 0.5;
    const c = document.createElement('div');
    c.className = `critter ${k.cls}${ltr ? '' : ' flip'}`;
    c.innerHTML = art(k.id);
    c.style.top = `${Math.round(scene.clientHeight * k.y)}px`;
    $('critters').appendChild(c);
    const w = scene.clientWidth + 80;
    c.animate([{ transform: `translateX(${ltr ? -40 : w}px)` }, { transform: `translateX(${ltr ? w : -40}px)` }], { duration: k.dur, easing: 'linear' }).onfinish = () => c.remove();
  };
  window.setTimeout(spawn, 3000);
}
