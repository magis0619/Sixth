// 長押しで詳しい説明の吹き出しを出す

import { gold, L } from '../i18n.ts';
import {
  CHARM_TIER_NAMES, type CharmId, CHARMS, CONFIG, CROPS, type PlaceId, PLACES, SHAPE_NAMES, type SymbolId, SYMBOLS, TOOL_EVOLVE, UPGRADE_SYMBOL, UPGRADES,
} from '../config.ts';
import { animalGold, cropPrice, hasRanch, inField, isGolden, isPond, isRipe, multSteps, rootOf, waterWheels, weedCost } from '../game.ts';
import { art } from '../art.ts';
import { fmtMult, vibrate } from '../fx.ts';
import { $, el, state } from './store.ts';
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

/** なぞって植えるなど、押した瞬間に操作が起きたときは長押しの説明を出さない */
let lpBlockUntil = 0;
export function blockLongPress(): void {
  lpBlockUntil = performance.now() + 600;
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
      if (performance.now() < lpBlockUntil) return;
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
  return `${infoHead(symHtml(id), d.name, d.kind === 'manual' ? L('手動', 'Tap') : L('自動', 'Auto'))}<p>${d.desc}</p>${shape}<p class="sub">🔥 ${d.feverDesc}</p>${extra}`;
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
    parts.push(`${infoHead(art(PLACE_ART[tool]), PLACES[tool].name, L('道具', 'Tool'))}<p>${PLACES[tool].desc}</p>${ev ? `<p class="sub">${L('進化', 'Evolves')}：${ev.what} ${state.toolXp[cell]}/${ev.need} → ${PLACES[ev.to].name}</p>` : ''}`);
  } else if (crop) {
    const def = CROPS[crop.kind];
    const ripe = isRipe(crop);
    const base = cropPrice(state, crop, root);
    let sellLine = '';
    if (ripe) {
      const steps = multSteps(state, root);
      const mult = steps.reduce((m, x) => m * x.x, 1);
      sellLine = `<p>${L('今売ると', 'Sell now for')} <b>${gold(Math.round(base * mult))}</b></p><p class="sub">${gold(base)} ${steps.map((x) => `×${fmtMult(x.x)}（${x.label}）`).join(' ')}</p>`;
    }
    parts.push(`${infoHead(art(FRUIT[crop.kind]), def.name, ripe ? L('実り', 'Ripe') : `${crop.growth}/${def.ripe}`)}<p>${L('売値', 'Price')} ${gold(def.price)}${crop.fertilized ? L('・肥料×2', ' · fertilized ×2') : ''}${def.big ? L('・2×2マス（列には入らない）', ' · 2×2 (not part of lines)') : ''}</p>${sellLine}`);
  } else if (state.weeds[cell]) {
    parts.push(`${infoHead(art('weed'), L('雑草', 'Weed'), L('お邪魔', 'Pest'))}<p>${L('タップで抜く', 'Tap to pull')}（${gold(weedCost(state))}）</p>`);
  } else if (isPond(state, cell)) {
    parts.push(`${infoHead(art('fish'), L('釣り堀', 'Fishing pond'))}<p>${L('毎晩', 'Nightly')} +${gold(CONFIG.fishGold)}</p><p class="sub">${L('ときどき大物', 'Sometimes a big catch')} +${gold(CONFIG.bigFishGold)}</p>`);
  } else {
    parts.push(infoHead(art('sprout'), state.tilled[cell] ? L('耕した土', 'Tilled soil') : L('空きマス', 'Empty plot')));
    if (state.tilled[cell]) parts.push(`<p class="sub">${L('植えると成長+1', 'Planting here gives +1 growth')}</p>`);
  }
  const wheel = waterWheels(state).find((w) => w.includes(cell));
  if (wheel) parts.push(`<p class="sub">${art('waterwheel')} ${L(`水車：水路${wheel.length}つ → 毎晩 +${wheel.length * CONFIG.wheelGold * (state.charms.wheelwright ? 2 : 1)}・隣のマスも毎晩+1`, `Waterwheel: ${wheel.length} water → +${wheel.length * CONFIG.wheelGold * (state.charms.wheelwright ? 2 : 1)}g nightly, neighbours +1 growth`)}</p>`);
  if (tool === 'henhouse' || tool === 'cowshed') parts.push(`<p class="sub">${L('今の収入 毎晩', 'Income now: nightly')} +${gold(animalGold(state, cell))}${hasRanch(state) ? L('（牧場 ×2）', ' (ranch ×2)') : ''}</p>`);
  if (tile) parts.push(`<p class="sub">${art(PLACE_ART[tile])} ${PLACES[tile].name}：${PLACES[tile].desc}</p>`);
  if (state.frost[cell]) parts.push(`<p class="sub">❄️ ${L(`あと${state.frost[cell]}日凍っている`, `Frozen for ${state.frost[cell]} more day(s)`)}</p>`);
  return parts.join('');
}

export function charmInfo(id: CharmId): string {
  const c = CHARMS[id];
  const n = state.charms[id];
  const gold = isGolden(state, id);
  const tag = c.special ? L('特別', 'Special') : CHARM_TIER_NAMES[c.tier];
  const stack = c.max >= CONFIG.goldenAt ? `<p class="sub">${gold ? L('✦ 金色（効果2倍）', '✦ Golden (double effect)') : L(`${CONFIG.goldenAt}個で金色（効果2倍）`, `${CONFIG.goldenAt} to turn golden (double effect)`)}</p>` : '';
  return `${infoHead(art(id), `${c.name}${n > 1 ? ` ×${n}` : ''}`, tag)}<p>${c.desc(gold ? n * 2 : Math.max(1, n))}</p>${stack}`;
}

/** 長押しの詳しい説明を、畑・リール・お守り・袋・ショップにつける */
export function setupLongPress(): void {
  longPress(el.field, '.plot', (t) => plotInfo([...el.field.children].indexOf(t)));
  longPress(el.reels, '.reel', (t) => {
    const r = state.results[Number(t.dataset.i)];
    return r ? symbolInfo(r.symbol, r.total > 1 ? `<p class="sub">${L('残り', 'Left')} ${r.left}/${r.total}</p>` : '') : null;
  });
  longPress(el.charms, '[data-charm]', (t) => charmInfo(t.dataset.charm as CharmId));
  longPress(el.bag, '[data-sym]', (t) => symbolInfo(t.dataset.sym as SymbolId, `<p class="sub">${L(`袋に${state.bag[t.dataset.sym as SymbolId]}枚`, `${state.bag[t.dataset.sym as SymbolId]} in the bag`)}</p>`));
  longPress($('stall'), '#shop [data-id], #remove-shop [data-id]', (t) => {
    const u = UPGRADES.find((x) => x.id === t.dataset.id);
    if (!u) return null;
    return symbolInfo(UPGRADE_SYMBOL[u.id]!.symbol, `<p class="sub">${u.name}：${upgradeEffect(u.id)}</p>`);
  });
  longPress(el.farmShop, '[data-id]', (t) => {
    const id = t.dataset.id!;
    if (id === 'expand') return `${infoHead(art('expand'), L('畑を広げる', 'Expand field'))}<p>${L('列→行の順に1つ広がる（最大5×5）', 'Adds a column, then a row (up to 5×5)')}</p>`;
    const d = PLACES[id as PlaceId];
    const ev = TOOL_EVOLVE[id as PlaceId];
    return `${infoHead(art(PLACE_ART[id as PlaceId]), d.name, d.kind === 'tool' ? L('道具', 'Tool') : L('マス', 'Plot'))}<p>${d.desc}</p>${d.kind === 'tool' ? `<p class="sub">${L('マスを1つ使う（植えられない・列に入らない）', 'Takes a plot (no planting, not part of lines)')}</p>` : `<p class="sub">${L('作物と重ねられる', 'Can share a plot with crops')}</p>`}${ev ? `<p class="sub">${L(`${ev.what}と ${ev.need}回で${PLACES[ev.to].name}に進化`, `${ev.what} ${ev.need} times to evolve into ${PLACES[ev.to].name}`)}</p>` : ''}`;
  });
}
