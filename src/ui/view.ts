// 表示の部品：絵柄・作物の絵、引き出し、ひとこと、値札など（状態は読むだけ）

import { CONFIG, type CropKind, CROPS, type PlaceId, SHAPE_NAMES, type SymbolId, SYMBOLS, UPGRADE_SYMBOL, type UpgradeId } from '../config.ts';
import { bagTotal, type Crop, removeLimitReached } from '../game.ts';
import { art, type ArtId } from '../art.ts';
import { el, state } from './store.ts';




// ---- 引き出し（ショップ・絵柄袋・お守り） ----

export type SheetName = 'shop' | 'bag' | 'charms';
export const SHEET_TITLES: Record<SheetName, string> = { shop: 'ショップ', bag: '絵柄袋', charms: 'お守り' };
export let openSheetName: SheetName | null = null;

export function openSheet(name: SheetName): void {
  openSheetName = name;
  el.sheetTitle.textContent = SHEET_TITLES[name];
  el.sheet.querySelectorAll<HTMLElement>('.sheet-pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
  el.sheet.dataset.pane = name;
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.classList.toggle('on', t.dataset.sheet === name));
  el.sheet.classList.add('open');
  el.sheetBackdrop.classList.add('open');
  el.sheet.setAttribute('aria-hidden', 'false');
}

export function closeSheet(): void {
  openSheetName = null;
  el.sheet.classList.remove('open');
  el.sheetBackdrop.classList.remove('open');
  el.sheet.setAttribute('aria-hidden', 'true');
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.classList.remove('on'));
}

/** 引き出しが閉じていて見えない要素は、代わりにそのタブを演出の的にする */
export function visibleOr(target: Element | null, sheet: SheetName): Element {
  if (target && (target as HTMLElement).offsetParent !== null) return target;
  return document.querySelector(`.tab[data-sheet="${sheet}"]`)!;
}

/** 絵柄の役割ごとの色分け（手動＝緑・自動の良いもの＝青・外れ＝赤紫） */
export function roleClass(id: SymbolId): string {
  const d = SYMBOLS[id];
  return d.kind === 'manual' ? 'role-manual' : d.rarity === 'bad' ? 'role-bad' : 'role-good';
}

export const CROP_STAGES: ArtId[] = ['sprout', 'leaf', 'bud'];
export const FRUIT: Record<CropKind, ArtId> = { tomato: 'tomato', strawberry: 'strawberry', pumpkin: 'pumpkin', melon: 'melon', corn: 'corn', watermelon: 'watermelon' };
export const STAGE_NAMES = ['芽', '若葉', 'つぼみ', '実'];

/** 実るまでの成長は作物ごとに違うので、見た目の段階（芽・若葉・つぼみ・実）に割り当てる */
export function stageOf(crop: Crop): number {
  const ripe = CROPS[crop.kind].ripe;
  return crop.growth >= ripe ? 3 : Math.min(2, Math.floor((crop.growth * 3) / ripe));
}

export function symHtml(id: SymbolId): string {
  return art(id);
}

/** ショップ・準備画面の強化アイコン（増減させる絵柄のイラスト） */
export function upgradeArt(id: UpgradeId): string {
  return symHtml(UPGRADE_SYMBOL[id]!.symbol);
}

export function cropEmoji(crop: Crop): string {
  const stage = stageOf(crop);
  return art(stage === 3 ? FRUIT[crop.kind] : CROP_STAGES[stage]);
}

/** 最後に書いた中身。同じなら書き換えない（毎回書き換えると、そのたびに中身を作り直して配置し直しになる） */
const lastHtml = new WeakMap<Element, string>();

export function setHtml(node: Element, html: string): void {
  if (lastHtml.get(node) === html) return;
  lastHtml.set(node, html);
  node.innerHTML = html;
}

let msgTimer = 0;

export function say(text: string, ms = 2200): void {
  el.msg.textContent = text;
  clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => (el.msg.textContent = ''), ms);
}

export function shapeIcon(shape: string): string {
  const on = (x: number, y: number): boolean =>
    shape === 'all' ||
    (shape === 'cross' && (x === 1 || y === 1)) ||
    (shape === 'column' && x === 1) ||
    (shape === 'row' && y === 1) ||
    (shape === 'x' && (x === y || x + y === 2));
  const cells = Array.from({ length: 9 }, (_, k) => `<i class="${on(k % 3, Math.floor(k / 3)) ? 'on' : ''}"></i>`).join('');
  return `<span class="shape-icon" aria-label="${SHAPE_NAMES[shape as keyof typeof SHAPE_NAMES]}">${cells}</span>`;
}


export const PLACE_ART: Record<PlaceId, ArtId> = {
  scarecrow: 'scarecrow', bigScarecrow: 'bigScarecrow', well: 'well', goldenWell: 'goldenWell',
  hive: 'hive', queenHive: 'queenHive', henhouse: 'henhouse', cowshed: 'cowshed', compost: 'compost', water: 'water',
};


export function costHtml(price: number | null, affordable: boolean, doneText = '完了'): string {
  if (price === null) return `<span class="cost done">${doneText}</span>`;
  return affordable
    ? `<span class="cost"><b>${price}金</b></span>`
    : `<span class="cost"><b>${price}金</b>${price > state.gold ? `<small>あと${price - state.gold}</small>` : ''}</span>`;
}

export function bagPct(bag: Record<SymbolId, number>, id: SymbolId): number {
  const total = bagTotal(bag);
  return total ? Math.round((bag[id] / total) * 100) : 0;
}

export function upgradeEffect(id: UpgradeId): string {
  const { symbol, delta } = UPGRADE_SYMBOL[id]!;
  if (delta < 0 && state.bag[symbol] === 0) return `${SYMBOLS[symbol].name}はもういない！`;
  if (delta < 0 && removeLimitReached(state)) return `今週はもう消した（来週また消せる）`;
  const after = { ...state.bag, [symbol]: state.bag[symbol] + delta };
  // 袋の絵と「今→買ったあと」の数字だけで、出やすさの変化を見せる
  return `<span class="odds">${art('seed')} ${bagPct(state.bag, symbol)}% → <b>${bagPct(after, symbol)}%</b></span>`;
}
