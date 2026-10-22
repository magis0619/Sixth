// 長押しで詳しい説明の吹き出しを出す

import {
  CHARM_TIER_NAMES, type CharmId, CHARMS, CONFIG, CROPS, type PlaceId, PLACES, SHAPE_NAMES, type SymbolId, SYMBOLS, TOOL_EVOLVE, UPGRADE_SYMBOL, UPGRADES,
} from '../config.ts';
import { cropPrice, inField, isGolden, isPond, isRipe, multSteps, rootOf, waterWheels, weedCost } from '../game.ts';
import { art } from '../art.ts';
import { fmtMult, vibrate } from '../fx.ts';
import { el, state } from './store.ts';
import { FRUIT, PLACE_ART, shapeIcon, symHtml, upgradeEffect } from './view.ts';

// ---- 長押しで詳しく ----

export let lpTimer = 0;
export let lpFired = false;
export let infoEl: HTMLElement | null = null;

export function closeInfo(): void {
  infoEl?.remove();
  infoEl = null;
}

/** anchor の近く（上に余裕があれば上、なければ下）に詳しい説明の吹き出しを出す */
export function showInfo(anchor: Element, html: string): void {
  closeInfo();
  const pop = document.createElement('div');
  pop.className = 'info-pop';
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  const top = r.top - h - 10 > 8 ? r.top - h - 10 : Math.min(window.innerHeight - h - 8, r.bottom + 10);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  infoEl = pop;
  // 次にどこかを触ったら閉じる
  window.setTimeout(() => document.addEventListener('pointerdown', closeInfo, { once: true }), 0);
}

/** root の中の selector に合う要素を長押し（0.45秒）すると info の内容を出す。長押しのあとのタップは無視する */
export function longPress(root: HTMLElement, selector: string, info: (target: HTMLElement) => string | null): void {
  root.addEventListener('pointerdown', (e) => {
    const target = (e.target as Element).closest(selector) as HTMLElement | null;
    if (!target || !root.contains(target)) return;
    lpFired = false;
    clearTimeout(lpTimer);
    const sx = e.clientX;
    const sy = e.clientY;
    lpTimer = window.setTimeout(() => {
      const html = info(target);
      if (!html) return;
      lpFired = true;
      vibrate(15);
      showInfo(target, html);
    }, 450);
    const cancel = () => clearTimeout(lpTimer);
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 12) cancel();
    };
    root.addEventListener('pointermove', move);
    const end = () => {
      cancel();
      root.removeEventListener('pointermove', move);
    };
    root.addEventListener('pointerup', end, { once: true });
    root.addEventListener('pointercancel', end, { once: true });
    root.addEventListener('pointerleave', end, { once: true });
  });
  root.addEventListener(
    'click',
    (e) => {
      if (!lpFired) return;
      lpFired = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  root.addEventListener('contextmenu', (e) => e.preventDefault());
}

export const infoHead = (ico: string, name: string, tag = '') => `<div class="info-head"><span class="info-ico">${ico}</span><b>${name}</b>${tag ? `<em>${tag}</em>` : ''}</div>`;

export function symbolInfo(id: SymbolId, extra = ''): string {
  const d = SYMBOLS[id];
  const shape = d.shape ? `<p>${shapeIcon(d.shape)} ${SHAPE_NAMES[d.shape]}</p>` : '';
  return `${infoHead(symHtml(id), d.name, d.kind === 'manual' ? '手動' : '自動')}<p>${d.desc}</p>${shape}<p class="sub">🔥 ${d.feverDesc}</p>${extra}`;
}

export function plotInfo(cell: number): string | null {
  if (!inField(state, cell)) return null;
  const parts: string[] = [];
  // 大物（スイカ）の右・下・右下は本体の説明を出す
  const root = rootOf(state, cell);
  const crop = state.field[root];
  const tool = state.tools[cell];
  const tile = state.tiles[cell];
  if (tool) {
    const ev = TOOL_EVOLVE[tool];
    parts.push(`${infoHead(art(PLACE_ART[tool]), PLACES[tool].name, '道具')}<p>${PLACES[tool].desc}</p>${ev ? `<p class="sub">進化：${ev.what} ${state.toolXp[cell]}/${ev.need} → ${PLACES[ev.to].name}</p>` : ''}`);
  } else if (crop) {
    const def = CROPS[crop.kind];
    const ripe = isRipe(crop);
    const base = cropPrice(state, crop, root);
    let sellLine = '';
    if (ripe) {
      const steps = multSteps(state, root);
      const mult = steps.reduce((m, x) => m * x.x, 1);
      sellLine = `<p>今売ると <b>${Math.round(base * mult)}金</b></p><p class="sub">${base}金 ${steps.map((x) => `×${fmtMult(x.x)}（${x.label}）`).join(' ')}</p>`;
    }
    parts.push(`${infoHead(art(FRUIT[crop.kind]), def.name, ripe ? '実り' : `${crop.growth}/${def.ripe}`)}<p>売値 ${def.price}金${crop.fertilized ? '・肥料×2' : ''}${def.big ? '・2×2マス（列には入らない）' : ''}</p>${sellLine}`);
  } else if (state.weeds[cell]) {
    parts.push(`${infoHead(art('weed'), '雑草', 'お邪魔')}<p>タップで抜く（${weedCost(state)}金）</p>`);
  } else if (isPond(state, cell)) {
    parts.push(`${infoHead(art('fish'), '釣り堀')}<p>毎晩 +${CONFIG.fishGold}金</p><p class="sub">ときどき大物 +${CONFIG.bigFishGold}金</p>`);
  } else {
    parts.push(infoHead(art('sprout'), state.tilled[cell] ? '耕した土' : '空きマス'));
    if (state.tilled[cell]) parts.push('<p class="sub">植えると成長+1</p>');
  }
  const wheel = waterWheels(state).find((w) => w.includes(cell));
  if (wheel) parts.push(`<p class="sub">${art('waterwheel')} 水車：水路${wheel.length}つ → 毎晩 +${wheel.length * CONFIG.wheelGold}金</p>`);
  if (tile) parts.push(`<p class="sub">${art(PLACE_ART[tile])} ${PLACES[tile].name}：${PLACES[tile].desc}</p>`);
  if (state.frost[cell]) parts.push(`<p class="sub">❄️ あと${state.frost[cell]}日凍っている</p>`);
  return parts.join('');
}

export function charmInfo(id: CharmId): string {
  const c = CHARMS[id];
  const n = state.charms[id];
  const gold = isGolden(state, id);
  const tag = c.special ? '特別' : CHARM_TIER_NAMES[c.tier];
  const stack = c.max >= CONFIG.goldenAt ? `<p class="sub">${gold ? '✦ 金色（効果2倍）' : `${CONFIG.goldenAt}個で金色（効果2倍）`}</p>` : '';
  return `${infoHead(art(id), `${c.name}${n > 1 ? ` ×${n}` : ''}`, tag)}<p>${c.desc(gold ? n * 2 : Math.max(1, n))}</p>${stack}`;
}

/** 長押しの詳しい説明を、畑・リール・お守り・袋・ショップにつける */
export function setupLongPress(): void {
  longPress(el.field, '.plot', (t) => plotInfo([...el.field.children].indexOf(t)));
  longPress(el.reels, '.reel', (t) => {
    const r = state.results[Number(t.dataset.i)];
    return r ? symbolInfo(r.symbol, r.total > 1 ? `<p class="sub">残り ${r.left}/${r.total}</p>` : '') : null;
  });
  longPress(el.charms, '[data-charm]', (t) => charmInfo(t.dataset.charm as CharmId));
  longPress(el.bag, '[data-sym]', (t) => symbolInfo(t.dataset.sym as SymbolId, `<p class="sub">袋に${state.bag[t.dataset.sym as SymbolId]}枚</p>`));
  longPress(el.shop, '[data-id]', (t) => {
    const u = UPGRADES.find((x) => x.id === t.dataset.id);
    if (!u) return null;
    return symbolInfo(UPGRADE_SYMBOL[u.id]!.symbol, `<p class="sub">${u.name}：${upgradeEffect(u.id)}</p>`);
  });
  longPress(el.farmShop, '[data-id]', (t) => {
    const id = t.dataset.id!;
    if (id === 'expand') return `${infoHead(art('expand'), '畑を広げる')}<p>列→行の順に1つ広がる（最大5×5）</p>`;
    const d = PLACES[id as PlaceId];
    const ev = TOOL_EVOLVE[id as PlaceId];
    return `${infoHead(art(PLACE_ART[id as PlaceId]), d.name, d.kind === 'tool' ? '道具' : 'マス')}<p>${d.desc}</p>${d.kind === 'tool' ? '<p class="sub">マスを1つ使う（植えられない・列に入らない）</p>' : '<p class="sub">作物と重ねられる</p>'}${ev ? `<p class="sub">${ev.what}と ${ev.need}回で${PLACES[ev.to].name}に進化</p>` : ''}`;
  });
}
