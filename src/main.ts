import './style.css';
import {
  CHARMS, CHARM_ORDER, CHARM_PLACE, CHARM_TIER_NAMES, CONFIG, CROPS, FEEDBACK_URL, META, PLACES, PLACE_ORDER, SEEDS, SHAPE_NAMES, SHARE_URL, SYMBOLS, SYMBOL_ORDER, UPGRADES, UPGRADE_SYMBOL,
  type CharmId, type CropKind, type PlaceId, type SymbolId, type UpgradeId,
} from './config.ts';
import {
  bagTotal, buy, buyPlace, canBuy, canBuyPlace, canExpand, canPlace, canUse, cellMultiplier, chooseCharm, cropPrice, drawDay, drawSymbol, endDay,
  expand, expandPrice, inField, inSameCropLine, isRipe, place, placePrice, shapeCells,
  ripeGroup, newGame, nextTax, pullWeed, weedCost, resolveFever, type FeverEvent, resolveAuto, sell, upgradeAvailable, upgradePrice, useSymbol, validTargets, type GameState,
} from './game.ts';
import { isMuted, sfx, toggleMute, unlockAudio } from './audio.ts';
import {
  awardPoints, buyCapacity, capacity, loadMeta, loadoutCost, nextCapacityPrice, setupFrom, toggleLoadout, unlockAdd,
  unlockCharm, type MetaState,
} from './meta.ts';
import { art, type ArtId } from './art.ts';
import type { Crop } from './game.ts';
import { burst, center, confetti, flash, floatText, flyTo, isCalm, pop, shake, sleep, toggleCalm, vibrate } from './fx.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const rng = Math.random;

const el = {
  app: $('app'),
  gold: $('gold'),
  goldBox: $('gold-box'),
  day: $('day'),
  tax: $('tax'),
  mute: $<HTMLButtonElement>('mute'),
  help: $<HTMLButtonElement>('help'),
  goal: $('goal'),
  status: $('status'),
  charms: $('charms'),
  charmPanel: $('charm-panel'),
  hint: $('hint'),
  machine: $('machine'),
  reels: $('reels'),
  spin: $<HTMLButtonElement>('spin'),
  msg: $('msg'),
  field: $('field'),
  shop: $('shop'),
  farmShop: $('farm-shop'),
  bag: $('bag'),
  bagTotal: $('bag-total'),
  overlay: $('overlay'),
  charmCount: $('charm-count'),
  order: $('order'),
  sheet: $('sheet'),
  sheetBackdrop: $('sheet-backdrop'),
  sheetTitle: $('sheet-title'),
};

// ---- 引き出し（ショップ・絵柄袋・お守り） ----

type SheetName = 'shop' | 'bag' | 'charms';
const SHEET_TITLES: Record<SheetName, string> = { shop: 'ショップ', bag: '絵柄袋', charms: 'お守り' };
let openSheetName: SheetName | null = null;

function openSheet(name: SheetName): void {
  openSheetName = name;
  el.sheetTitle.textContent = SHEET_TITLES[name];
  el.sheet.querySelectorAll<HTMLElement>('.sheet-pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.classList.toggle('on', t.dataset.sheet === name));
  el.sheet.classList.add('open');
  el.sheetBackdrop.classList.add('open');
  el.sheet.setAttribute('aria-hidden', 'false');
}

function closeSheet(): void {
  openSheetName = null;
  el.sheet.classList.remove('open');
  el.sheetBackdrop.classList.remove('open');
  el.sheet.setAttribute('aria-hidden', 'true');
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.classList.remove('on'));
}

/** 引き出しが閉じていて見えない要素は、代わりにそのタブを演出の的にする */
function visibleOr(target: Element | null, sheet: SheetName): Element {
  if (target && (target as HTMLElement).offsetParent !== null) return target;
  return document.querySelector(`.tab[data-sheet="${sheet}"]`)!;
}

/** 絵柄の役割ごとの色分け（手動＝緑・自動の良いもの＝青・外れ＝赤紫） */
function roleClass(id: SymbolId): string {
  const d = SYMBOLS[id];
  return d.kind === 'manual' ? 'role-manual' : d.rarity === 'bad' ? 'role-bad' : 'role-good';
}

const CROP_STAGES: ArtId[] = ['sprout', 'leaf', 'bud'];
const FRUIT: Record<CropKind, ArtId> = { tomato: 'tomato', strawberry: 'strawberry', pumpkin: 'pumpkin', corn: 'corn' };
const STAGE_NAMES = ['芽', '若葉', 'つぼみ', '実'];

/** 実るまでの成長は作物ごとに違うので、見た目の段階（芽・若葉・つぼみ・実）に割り当てる */
function stageOf(crop: Crop): number {
  const ripe = CROPS[crop.kind].ripe;
  return crop.growth >= ripe ? 3 : Math.min(2, Math.floor((crop.growth * 3) / ripe));
}

const meta: MetaState = loadMeta();
let state: GameState = newGame(setupFrom(meta));
let busy = false;
let selected: number | null = null;
let armedNextDay = false;
let shownGold = state.gold;
let goldTween = 0;
let combo = 0;
let lastSellAt = 0;
let msgTimer = 0;
/** 一度でもやった操作。ヒントを順に出すため */
const done = { spin: false, use: false, sell: false, buy: false, next: false, line: false };
/** その日の自動の絵柄の結果表示（リール番号ごと） */
let autoOutcome: Record<number, string> = {};

// ---- 表示ヘルパー ----

function symHtml(id: SymbolId): string {
  return art(id);
}

/** ショップ・準備画面の強化アイコン（増減させる絵柄のイラスト） */
function upgradeArt(id: UpgradeId): string {
  return symHtml(UPGRADE_SYMBOL[id]!.symbol);
}

function cropEmoji(crop: Crop): string {
  const stage = stageOf(crop);
  return art(stage === 3 ? FRUIT[crop.kind] : CROP_STAGES[stage]);
}

function say(text: string, ms = 2200): void {
  el.msg.textContent = text;
  clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => (el.msg.textContent = ''), ms);
}

function setGold(value: number): void {
  const from = shownGold;
  shownGold = value;
  cancelAnimationFrame(goldTween);
  const start = performance.now();
  const dur = Math.min(700, 200 + Math.abs(value - from) * 15);
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / dur);
    el.gold.textContent = String(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) goldTween = requestAnimationFrame(step);
  };
  goldTween = requestAnimationFrame(step);
  if (value !== from) pop(el.goldBox, value > from ? 1.15 : 0.9);
}

// ---- 描画 ----

// ---- 中断セーブ（日をまたぐ処理の途中は保存しない） ----

const RUN_KEY = 'hatake-slot:run';

function saveRun(): void {
  if (busy || state.over || state.day === 0) return;
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても遊べる
  }
}

function loadRun(): GameState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    // 作物の種類・注文を入れる前の保存データを読み替える
    const old: Record<string, CropKind> = { normal: 'tomato', gold: 'corn' };
    s.field = s.field.map((c) => (c ? { ...c, kind: old[c.kind] ?? c.kind } : null));
    SYMBOL_ORDER.forEach((id) => (s.bag[id] ??= 0));
    s.order ??= null;
    s.stats.ordersDone ??= 0;
    // お邪魔系・週替わりを入れる前の保存データ
    s.weeds ??= s.field.map(() => false);
    s.frost ??= s.field.map(() => 0);
    s.pool ??= [...s.shop];
    s.weekly ??= [];
    s.bred ??= [];
    s.lastObstacle ??= null;
    s.removed ??= {};
    // 畑の広さを変えられるようにする前（3×3固定）の保存データは、マスの番号を5×5の数え方に直す
    if (s.cols === undefined) {
      const size = CONFIG.fieldCols * CONFIG.fieldRows;
      const remap = <T>(a: T[], empty: T): T[] => {
        const out = Array.from({ length: size }, () => empty);
        a.forEach((v, i) => (out[Math.floor(i / 3) * CONFIG.fieldCols + (i % 3)] = v));
        return out;
      };
      s.field = remap(s.field, null);
      s.weeds = remap(s.weeds, false);
      s.frost = remap(s.frost, 0);
      s.cols = CONFIG.startCols;
      s.rows = CONFIG.startRows;
      s.tools = Array.from({ length: size }, () => null);
      s.tiles = Array.from({ length: size }, () => null);
      s.stock = [];
      s.bought = {};
    }
    return s;
  } catch {
    return null;
  }
}

function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // 何もしない
  }
}

function render(): void {
  el.day.textContent = String(state.day);
  if (shownGold !== state.gold) setGold(state.gold);
  renderTax();
  renderOrder();
  renderGoal();
  renderStatus();
  renderHint();
  renderReelStates();
  renderSpinButton();
  renderField();
  renderShop();
  renderFarmShop();
  renderBag();
  renderCharms();
  saveRun();
  fitLayout();
}

// ---- 画面の高さに合わせて畑のマスの大きさを決める（まわすボタンが必ず画面内に入るように） ----

const WIDE = window.matchMedia('(min-width: 860px) and (orientation: landscape)');
let fitRaf = 0;

function fitLayout(): void {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => {
    const root = document.documentElement;
    const colWidth = WIDE.matches ? el.app.clientWidth / 2 - 18 : el.app.clientWidth - 24;
    // 畑の枠（左右の余白・溝）を除いた幅を列の数で割る
    let cell = Math.min(124, Math.floor((colWidth - 48 - 5 * (state.cols - 3)) / state.cols));
    root.style.setProperty('--cell', `${cell}px`);
    for (let k = 0; k < 3; k++) {
      const excess = root.scrollHeight - window.innerHeight;
      if (excess <= 0) break;
      cell = Math.max(40, cell - Math.ceil(excess / state.rows));
      root.style.setProperty('--cell', `${cell}px`);
    }
  });
}

window.addEventListener('resize', fitLayout);

/** 今日だけ・明日だけの効果 */
function renderStatus(): void {
  const chips: string[] = [];
  const good = state.fever.filter((s) => SYMBOLS[s].rarity !== 'bad');
  const bad = state.fever.filter((s) => SYMBOLS[s].rarity === 'bad');
  if (good.length) chips.push(`<span class="st fever">🔥 フィーバー：${good.map((s) => SYMBOLS[s].name).join('・')}</span>`);
  if (bad.length) chips.push(`<span class="st danger">⚠️ ${bad.map((s) => `${SYMBOLS[s].name}の群れ`).join('・')}</span>`);
  if (state.priceMult > 1) chips.push(`<span class="st merchant">🧑‍🌾 今日の売値 ×${state.priceMult}</span>`);
  if (state.cloverBoost > 1) chips.push(`<span class="st clover">🍀 明日は金の種が出やすい（×${state.cloverBoost}）</span>`);
  el.status.innerHTML = chips.join('');
}

function renderCharms(): void {
  const owned = CHARM_ORDER.filter((id) => state.charms[id] > 0);
  el.charmPanel.hidden = owned.length > 0;
  el.charmCount.textContent = owned.length ? `${owned.reduce((n, id) => n + state.charms[id], 0)}個` : '';
  el.charms.innerHTML = owned
    .map((id) => {
      const c = CHARMS[id];
      const n = state.charms[id];
      return `<span class="charm tier-${c.tier}" data-charm="${id}"><span class="e">${art(id)}</span><span><b>${c.name}${n > 1 ? ` ×${n}` : ''}</b><small>${c.desc(n)}</small></span></span>`;
    })
    .join('');
}

/** 今週の注文。何を何個・報酬・期日を1行で */
function renderOrder(): void {
  const o = state.order;
  el.order.hidden = !o;
  if (!o) return;
  const def = CROPS[o.crop];
  const left = o.dueDay - state.day;
  el.order.className = `order${o.done ? ' done' : ''}`;
  el.order.innerHTML = o.done
    ? `<span class="order-ico">${art(FRUIT[o.crop])}</span><b>注文達成！</b><span class="order-reward">+${o.reward}金 ✓</span>`
    : `<span class="order-ico">${art(FRUIT[o.crop])}</span><span class="order-text">注文：<b>${def.name}</b> ${o.have}/${o.need}</span>` +
      `<span class="order-bar"><i style="width:${(o.have / o.need) * 100}%"></i></span>` +
      `<span class="order-reward">${o.reward}金・${left > 0 ? `あと${left}日` : '今日まで'}</span>`;
}

function renderTax(): void {
  const t = nextTax(state);
  const short = state.gold < t.amount;
  const warn = short && t.daysLeft <= CONFIG.taxWarnDays;
  const when = t.daysLeft === 0 ? '今日の終わり' : `あと${t.daysLeft}日`;
  el.tax.className = `tax${warn ? ' warn' : ''}`;
  el.tax.innerHTML = `${warn ? '⚠️' : art('bale')} 年貢 <b>${t.amount}金</b>（${when}）<span class="tax-state">${short ? `不足 ${t.amount - state.gold}金` : '払える ✓'}</span>`;
}

/** 列（縦・横・斜めに3つ以上）にそろった実があるか */
function hasRipeGroup(): boolean {
  return state.field.some((_, i) => ripeGroup(state, i).length >= 3);
}

function renderGoal(): void {
  const available = UPGRADES.filter((u) => upgradeAvailable(state, u.id));
  const tab = document.querySelector('.tab[data-sheet="shop"]')!;
  const ready = available.some((u) => canBuy(state, u.id));
  tab.classList.toggle('ready', ready);
  if (ready) {
    el.goal.textContent = '買える！';
    return;
  }
  const next = available.sort((a, b) => upgradePrice(state, a.id) - upgradePrice(state, b.id))[0];
  el.goal.textContent = next ? `あと${upgradePrice(state, next.id) - state.gold}金` : '';
}

function usableReels(): number[] {
  return state.results.flatMap((_, i) => (canUse(state, i, null) ? [i] : []));
}

function renderHint(): void {
  const t = nextTax(state);
  el.hint.className = 'hint';
  if (state.stock.length && selected === null) {
    const d = PLACES[state.stock[0]];
    el.hint.className = 'hint place';
    el.hint.textContent = `👆 ${d.name}を置くマスをタップ（${d.desc}）`;
    return;
  }
  if (state.day > 0 && t.daysLeft <= CONFIG.taxWarnDays && state.gold < t.amount) {
    // 不足は年貢の札が示すので、ここでは打てる手だけを言う
    const ripe = state.field.some(isRipe);
    el.hint.className = ripe ? 'hint danger' : 'hint';
    el.hint.textContent = ripe ? '実った作物を売って年貢に備えよう' : '';
    if (ripe) return;
  }
  if (state.day > CONFIG.hintUntilDay) {
    el.hint.textContent = !done.line && hasRipeGroup() ? '✨ 列がそろった！ タップで列ごとまとめて売れる' : '';
    return;
  }
  const anyRipe = state.field.some(isRipe);
  let text = '';
  if (!done.spin) text = '👇「まわす！」でスロットを回そう（1回転＝畑の1日）';
  else if (selected !== null) {
    const r = state.results[selected];
    const shape = SYMBOLS[r.symbol].shape;
    text = r.total > 1
      ? `👆 光っている空きマスをタップ（あと${r.left}個 植えられる）。縦・横・斜めに3つそろえると高く売れる`
      : shape
        ? `👆 マスをタップ：そこを中心に${SHAPE_NAMES[shape]}の作物が育つ`
        : '👆 光っているマスをタップ（出目をもう一度タップで取り消し）';
  }
  else if (!done.line && hasRipeGroup()) text = '✨ 列がそろった！ 縦・横・斜めに3つそろった実はタップで列ごと売れる（単品は半値）';
  else if (!done.use && usableReels().length > 0) text = '✨ 光っている出目をタップ → 畑のマスをタップで使える';
  else if (!done.sell && anyRipe) text = '🍅 実った作物をタップすると売れる。単品は半値なので、列がそろうまで待つのもあり';
  else if (!done.buy && UPGRADES.some((u) => canBuy(state, u.id))) text = '💰 お金がたまった！ ショップでスロットを強化しよう';
  else if (!done.next && done.spin && usableReels().length === 0) text = '▶ 次の日へ進もう。作物は雨と太陽でしか育たない';
  el.hint.textContent = text;
}

function reelTag(i: number): { text: string; cls: string } {
  const r = state.results[i];
  if (!r) return { text: '—', cls: '' };
  const def = SYMBOLS[r.symbol];
  if (def.kind === 'auto') {
    // 絵柄はイラストで分かるので、札には結果だけを短く書く
    const text = autoOutcome[i] ?? '自動';
    return { text, cls: def.rarity === 'bad' ? 'auto-bad used' : 'used' };
  }
  if (r.used) return { text: '使った ✓', cls: 'used' };
  if (selected === i) return { text: '選択中', cls: 'selected' };
  if (canUse(state, i, null)) {
    const shape = SYMBOLS[r.symbol].shape;
    return { text: shape ? `▶ ${SHAPE_NAMES[shape]}` : '▶ 使う', cls: 'usable' };
  }
  return { text: '使えない', cls: 'dead' };
}

function buildReels(): void {
  const existing = el.reels.children.length;
  while (el.reels.children.length > state.reels) el.reels.lastElementChild!.remove();
  for (let i = existing; i < state.reels; i++) {
    const b = document.createElement('button');
    b.className = 'reel';
    b.dataset.i = String(i);
    const prev = state.results[i]?.symbol ?? drawSymbol(state.bag, rng);
    b.innerHTML = `<div class="window"><div class="strip"><div class="cell-sym">${symHtml(prev)}</div></div></div><div class="tag">—</div>`;
    b.addEventListener('click', () => onReelTap(i));
    el.reels.appendChild(b);
    if (state.day > 0) b.classList.add('enter');
  }
}

function renderReelStates(): void {
  buildReels();
  [...el.reels.children].forEach((node, i) => {
    const b = node as HTMLButtonElement;
    if (b.classList.contains('spinning')) return;
    const r = state.results[i];
    const tag = reelTag(i);
    const fever = r && r.power > 1;
    const badFever = fever && SYMBOLS[r.symbol].rarity === 'bad';
    b.className = `reel ${r ? roleClass(r.symbol) : ''} ${tag.cls}${r?.symbol === 'goldSeed' ? ' rare' : ''}${fever ? (badFever ? ' fever-bad' : ' fever') : ''}${r && el.machine.classList.contains('rainbow') && state.fever.includes(r.symbol) ? ' rainbow-sym' : ''}`;
    b.querySelector('.tag')!.textContent = fever ? `${badFever ? '⚠️' : '🔥'}${tag.text}` : tag.text;
    renderCount(b, i);
    b.setAttribute('aria-label', r ? `${SYMBOLS[r.symbol].name}: ${tag.text}` : 'リール');
  });
}

/** 種の残り個数バッジ（×2・×3） */
function renderCount(reel: HTMLElement, i: number): void {
  const r = state.results[i];
  const win = reel.querySelector('.window')!;
  let badge = win.querySelector('.count');
  if (!r || r.total <= 1 || r.left <= 0) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'count';
    win.appendChild(badge);
  }
  badge.textContent = `×${r.left}`;
}

function renderSpinButton(): void {
  const t = nextTax(state);
  el.spin.disabled = busy || state.over;
  el.spin.classList.toggle('armed', armedNextDay);
  if (state.day === 0) {
    el.spin.innerHTML = 'まわす！';
  } else if (armedNextDay) {
    el.spin.innerHTML = `本当に次の日へ？<small>使える出目が${usableReels().length}つ残っています（消えます）</small>`;
  } else if (t.daysLeft === 0) {
    el.spin.innerHTML = `年貢を納めて 次の日へ<small>${art('bale')} ${t.amount}金を徴収されます</small>`;
  } else {
    el.spin.innerHTML = `次の日へ ▶ まわす<small>${state.day + 1}日目</small>`;
  }
}

/** 道具・特別なマスの絵 */
const PLACE_ART: Record<PlaceId, ArtId> = {
  scarecrow: 'scarecrow', bigScarecrow: 'bigScarecrow', well: 'well', goldenWell: 'goldenWell',
  hive: 'hive', queenHive: 'queenHive', compost: 'compost', water: 'water',
};

/** 形で効く出目を選んでいるとき、指しているマスに効く範囲を見せる */
let previewCell: number | null = null;

function previewCells(): number[] {
  if (selected === null || previewCell === null) return [];
  const shape = SYMBOLS[state.results[selected].symbol].shape;
  return shape ? shapeCells(state, shape, previewCell) : [];
}

function renderField(): void {
  const targets = selected !== null ? validTargets(state, selected) : state.stock.length ? state.field.flatMap((_, i) => (canPlace(state, i) ? [i] : [])) : null;
  const preview = previewCells();
  el.field.style.setProperty('--cols', String(state.cols));
  if (el.field.children.length !== state.field.length) {
    el.field.innerHTML = '';
    state.field.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'plot';
      b.addEventListener('click', () => onPlotTap(i));
      b.addEventListener('pointerenter', () => {
        previewCell = i;
        if (selected !== null && SYMBOLS[state.results[selected].symbol].shape) renderField();
      });
      b.addEventListener('pointerleave', () => {
        if (previewCell !== i) return;
        previewCell = null;
        if (selected !== null) renderField();
      });
      el.field.appendChild(b);
    });
  }
  state.field.forEach((crop, i) => {
    const b = el.field.children[i] as HTMLButtonElement;
    if (!inField(state, i)) {
      b.className = 'plot off';
      return;
    }
    const cls = ['plot'];
    let html = '';
    let label = '空きマス';
    const tool = state.tools[i];
    const tile = state.tiles[i];
    if (tile) {
      cls.push(`tile-${tile}`);
      html += `<span class="badge-tile">${art(PLACE_ART[tile])}</span>`;
    }
    if (tool) {
      cls.push('tool');
      html += `<span class="crop">${art(PLACE_ART[tool])}</span><span class="tool-name">${PLACES[tool].name}</span>`;
      label = `${PLACES[tool].name}：${PLACES[tool].desc}`;
    } else if (crop) {
      const ripe = isRipe(crop);
      const def = CROPS[crop.kind];
      cls.push(`g${stageOf(crop)}`, `crop-${crop.kind}`);
      if (ripe) cls.push('ripe');
      if (def.gold) cls.push('goldcrop');
      html += `<span class="crop">${cropEmoji(crop)}</span>`;
      // 育っている間も何の作物か分かるように小さな札を出す
      if (!ripe) html += `<span class="badge-kind">${art(FRUIT[crop.kind])}</span>`;
      if (crop.fertilized) html += '<span class="badge-fert">肥×2</span>';
      if (ripe) {
        // 列に入っていれば倍率、入っていなければ単品（半値）
        const mult = cellMultiplier(state, i);
        const inLine = mult > CONFIG.singleMult;
        const price = Math.round(cropPrice(state, crop, i) * mult);
        if (inLine) cls.push('line', inSameCropLine(state, i) ? 'lines-3' : 'lines-1');
        else cls.push('single');
        html += `<span class="price">${price}金</span>`;
        html += inLine ? `<span class="badge-line">列 ×${mult}</span>` : `<span class="badge-single">単品 ×${CONFIG.singleMult}</span>`;
        label = `${def.name} 実、タップで${price}金で売る${inLine ? '（列ごと）' : '（単品は半値）'}`;
      } else {
        html += `<span class="pips">${Array.from({ length: def.ripe }, (_, k) => `<i class="pip${k < crop.growth ? ' on' : ''}"></i>`).join('')}</span>`;
        label = `${def.name} ${STAGE_NAMES[stageOf(crop)]}`;
      }
    } else if (state.weeds[i]) {
      cls.push('weedy');
      html += `<span class="crop">${art('weed')}</span><span class="pull">${weedCost(state) ? `抜く ${weedCost(state)}金` : '抜く'}</span>`;
      label = `雑草、タップで抜く（${weedCost(state)}金）`;
    } else {
      html += '<span class="empty">空き</span>';
    }
    if (tile) label += `、${PLACES[tile].name}（${PLACES[tile].desc}）`;
    if (state.frost[i]) {
      cls.push('frozen');
      html += `<span class="ice"></span><span class="badge-frost">${art('frost')}あと${state.frost[i]}日</span>`;
      label += `、凍っている（あと${state.frost[i]}日）`;
    }
    if (targets) cls.push(targets.includes(i) ? 'target' : 'dim');
    if (preview.includes(i)) cls.push('preview');
    b.className = cls.join(' ');
    if (b.innerHTML !== html) b.innerHTML = html;
    b.setAttribute('aria-label', label);
  });
}

function bagPct(bag: Record<SymbolId, number>, id: SymbolId): number {
  const total = bagTotal(bag);
  return total ? Math.round((bag[id] / total) * 100) : 0;
}

function upgradeEffect(id: UpgradeId): string {
  const { symbol, delta } = UPGRADE_SYMBOL[id]!;
  if (delta < 0 && state.bag[symbol] === 0) return `${SYMBOLS[symbol].name}はもういない！`;
  const after = { ...state.bag, [symbol]: state.bag[symbol] + delta };
  const odds = `出る確率 ${bagPct(state.bag, symbol)}% → ${bagPct(after, symbol)}%`;
  return delta < 0 ? `${odds}（消すたび価格×${CONFIG.removeGrowth}）` : odds;
}

/** このゲームのショップに並ぶもの（選んだ「足す」強化＋消す＋リール） */
/** いつも並ぶ品・週替わり・袋に入っているお邪魔を消す品 */
function shopItems(): typeof UPGRADES {
  return UPGRADES.filter((u) => {
    if (u.id.startsWith('add')) return state.shop.includes(u.id as never) || state.weekly.includes(u.id as never);
    return state.bag[UPGRADE_SYMBOL[u.id]!.symbol] > 0;
  });
}

function renderShop(): void {
  const items = shopItems();
  const key = items.map((u) => u.id).join(',');
  // 新しいゲームで中身を空にした場合も作り直す
  if (el.shop.dataset.key !== key || el.shop.children.length !== items.length) {
    el.shop.dataset.key = key;
    el.shop.innerHTML = '';
    items.forEach((u) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.dataset.id = u.id;
      b.addEventListener('click', () => onBuy(u.id));
      el.shop.appendChild(b);
    });
  }
  items.forEach((u, i) => {
    const b = el.shop.children[i] as HTMLButtonElement;
    const available = upgradeAvailable(state, u.id);
    const price = upgradePrice(state, u.id);
    const affordable = canBuy(state, u.id);
    const weekly = state.weekly.includes(u.id as never);
    b.className = `item${affordable ? ' affordable' : ''}${available ? '' : ' soldout'}${weekly ? ' weekly' : ''}`;
    const cost = !available ? '完了' : affordable ? `${price}金で買う` : `${price}金（あと${price - state.gold}）`;
    const ico = upgradeArt(u.id);
    const html = `${weekly ? '<span class="weekly-tag">週替わり</span>' : ''}<span class="ico">${ico}</span><span class="name">${u.name}</span><span class="effect">${upgradeEffect(u.id)}</span><span class="cost">${cost}</span>`;
    if (b.innerHTML !== html) b.innerHTML = html;
  });
}

/** 畑のショップ：広げる・道具・特別なマス */
function renderFarmShop(): void {
  const items: { key: string; ico: string; name: string; effect: string; price: number | null; ok: boolean }[] = [];
  const ep = expandPrice(state);
  items.push({
    key: 'expand',
    ico: art('expand'),
    name: '畑を広げる',
    effect: ep === null ? 'これ以上は広げられない（5×5）' : `${state.cols}×${state.rows} → ${state.cols <= state.rows ? state.cols + 1 : state.cols}×${state.cols <= state.rows ? state.rows : state.rows + 1}`,
    price: ep,
    ok: canExpand(state),
  });
  PLACE_ORDER.filter((id) => PLACES[id].price !== null).forEach((id) =>
    items.push({ key: id, ico: art(PLACE_ART[id]), name: PLACES[id].name, effect: PLACES[id].desc, price: placePrice(state, id), ok: canBuyPlace(state, id) }),
  );
  if (el.farmShop.children.length !== items.length) {
    el.farmShop.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.dataset.id = it.key;
      b.addEventListener('click', () => onBuyFarm(it.key as PlaceId | 'expand'));
      el.farmShop.appendChild(b);
    });
  }
  items.forEach((it, i) => {
    const b = el.farmShop.children[i] as HTMLButtonElement;
    b.className = `item${it.ok ? ' affordable' : ''}${it.price === null ? ' soldout' : ''}`;
    const cost = it.price === null ? '完了' : it.ok ? `${it.price}金で買う` : `${it.price}金（あと${it.price - state.gold}）`;
    const html = `<span class="ico">${it.ico}</span><span class="name">${it.name}</span><span class="effect">${it.effect}</span><span class="cost">${cost}</span>`;
    if (b.innerHTML !== html) b.innerHTML = html;
  });
}

function onBuyFarm(key: PlaceId | 'expand'): void {
  unlockAudio();
  if (busy || state.over) return;
  const card = el.farmShop.querySelector(`[data-id="${key}"]`) as HTMLElement;
  if (key === 'expand') {
    const price = expandPrice(state);
    if (price === null || !expand(state)) {
      sfx.error();
      shake(card, 4);
      say(price === null ? 'これ以上は広げられない' : `あと${price - state.gold}金 足りない`);
      return;
    }
    sfx.bigBuy();
    closeSheet();
    render();
    flash('#c8f0a0', 400);
    const f = center(el.field);
    burst(f.x, f.y, ['🌱', '✨', '⭐'], 18, 160);
    floatText(f.x, f.y, `畑が広がった！ ${state.cols}×${state.rows}`, { cls: 'good', size: 1.2, dur: 1500 });
    fieldCells().forEach((c) => pop(el.field.children[c], 1.08));
    return;
  }
  if (!buyPlace(state, key)) {
    sfx.error();
    shake(card, 4);
    say(`あと${(placePrice(state, key) ?? 0) - state.gold}金 足りない`);
    return;
  }
  sfx.buy();
  selected = null;
  closeSheet();
  render();
  say(`${PLACES[key].name}を置くマスをタップ`);
}

function fieldCells(): number[] {
  return state.field.flatMap((_, i) => (inField(state, i) ? [i] : []));
}

function renderBag(): void {
  el.bagTotal.textContent = `${bagTotal(state.bag)}枚`;
  el.bag.innerHTML = SYMBOL_ORDER.filter((id) => state.bag[id] > 0 || id === 'crow')
    .map((id) => {
      const def = SYMBOLS[id];
      const cls = `chip${def.rarity === 'bad' ? ' bad' : ''}${state.bag[id] === 0 ? ' zero' : ''}`;
      return `<span class="${cls}" data-sym="${id}" title="${def.desc}（フィーバー：${def.feverDesc}）"><span class="e">${symHtml(id)}</span>${def.name}×${state.bag[id]} <span class="pct">${bagPct(state.bag, id)}%</span></span>`;
    })
    .join('');
}

// ---- スロットを回す ----

async function onSpin(): Promise<void> {
  unlockAudio();
  if (busy || state.over) return;
  if (openSheetName) closeSheet();
  const leftover = state.day > 0 ? usableReels().length : 0;
  if (leftover > 0 && !armedNextDay) {
    armedNextDay = true;
    sfx.error();
    shake(el.spin, 4);
    renderSpinButton();
    return;
  }
  if (state.day > 0) done.next = true;
  armedNextDay = false;
  el.spin.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(6px) scale(0.97)' }, { transform: 'translateY(0)' }], { duration: 220 });
  // 前の日のフリーズの名残（虹の枠・ひび）を片付ける
  el.machine.classList.remove('rainbow');
  el.machine.querySelector('.crack')?.remove();
  selected = null;
  busy = true;
  done.spin = true;
  renderSpinButton();
  renderReelStates();

  const res = endDay(state, rng);
  autoOutcome = {};
  if (res.tax !== null) {
    await showTaxStamp(res.tax, res.ok);
    if (!res.ok) {
      busy = false;
      showGameOver();
      return;
    }
  }
  if (state.charmOffer) {
    render();
    await showCharmOffer();
  }
  if (res.cleared && !(await showClear())) {
    busy = false;
    showGameOver(true);
    return;
  }
  drawDay(state, rng);
  // フリーズ中に結果が見えないよう、描き直すのは演出のあと
  const show = planShow();
  if (show.freeze) await playFreeze();
  render();
  await spinReels(show);
  if (state.fever.length) {
    await showFever();
    await playFeverRoles(resolveFever(state, rng));
    if (state.charmOffer) {
      render();
      await showCharmOffer();
    }
  }
  await resolveAutos();
  busy = false;
  render();
}

async function showTaxStamp(amount: number, ok: boolean): Promise<void> {
  sfx.tax();
  shake(el.app, 8);
  const stamp = document.createElement('div');
  stamp.className = `stamp${ok ? ' ok' : ''}`;
  stamp.innerHTML = ok
    ? `${art('bale')} 年貢 納付！<small>−${amount}金</small>`
    : `${art('bale')} 年貢 未納…<small>${amount}金 払えなかった</small>`;
  document.body.appendChild(stamp);
  stamp.animate(
    [
      { transform: 'translate(-50%, -50%) scale(2.5) rotate(-12deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(0.95) rotate(-6deg)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(-6deg)', opacity: 1 },
    ],
    { duration: 500, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' },
  );
  vibrate(ok ? 60 : [80, 60, 160]);
  if (ok) {
    sfx.taxPaid();
    const c = center(el.goldBox);
    floatText(c.x, c.y + 30, `−${amount}`, { cls: 'bad', size: 1.1 });
    setGold(state.gold);
  } else {
    sfx.gameOver();
  }
  await sleep(ok ? 1300 : 1800);
  stamp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => stamp.remove();
  if (ok) {
    burst(window.innerWidth / 2, window.innerHeight * 0.4, ['🎊', '✨', '🌾'], 14, 140);
    floatText(window.innerWidth / 2, window.innerHeight * 0.4, `年貢${state.taxesPaid}回 クリア！`, { cls: 'good', size: 1.2 });
    await sleep(500);
    const added = state.lastObstacle;
    if (added) {
      render();
      const c = center(visibleOr(el.bag.querySelector(`[data-sym="${added}"]`), 'bag'));
      floatText(c.x, c.y - 20, `${SYMBOLS[added].name}が袋に増えた…`, { cls: 'bad', size: 0.8 });
    }
  }
}

/** 年貢を納めたあとのお守り3択。選ぶまで待つ */
function showCharmOffer(): Promise<void> {
  const offer = state.charmOffer!;
  sfx.charmOffer();
  // レアが混ざっていたら当たりの合図
  if (offer.some((id) => CHARMS[id].tier === 'rare')) window.setTimeout(() => sfx.rare(), 450);
  el.overlay.innerHTML = `
    <div class="modal charm-modal" role="dialog" aria-label="お守りを選ぶ">
      <h2>🎁 お守りを1つ選ぼう</h2>
      <p class="sub">年貢${state.taxesPaid}回 納付のごほうび。同じお守りは重ねるほど強くなる</p>
      <div class="charm-choices">
        ${offer
          .map((id) => {
            const c = CHARMS[id];
            const n = state.charms[id];
            return `<button class="charm-card tier-${c.tier}" data-charm="${id}" disabled>
              <span class="tier">${CHARM_TIER_NAMES[c.tier]}</span>
              <span class="e">${art(id)}</span>
              <b>${c.name}${n > 0 ? ` <span class="lv">${n}→${n + 1}</span>` : ''}</b>
              <small>${c.desc(n + 1)}</small>
            </button>`;
          })
          .join('')}
      </div>
    </div>`;
  el.overlay.classList.add('show');
  const cards = [...el.overlay.querySelectorAll<HTMLButtonElement>('.charm-card')];
  cards.forEach((card, k) => {
    card.animate([{ transform: 'translateY(30px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
      duration: 400,
      delay: 150 + k * 120,
      easing: 'cubic-bezier(.3,1.5,.5,1)',
      fill: 'backwards',
    });
  });
  // 連打で意図しない選択をしないよう少し待ってから押せるようにする
  window.setTimeout(() => cards.forEach((c) => (c.disabled = false)), 700);
  return new Promise((resolve) => {
    cards.forEach((card) =>
      card.addEventListener('click', () => {
        const id = card.dataset.charm as CharmId;
        chooseCharm(state, id);
        sfx.charmGet();
        const c = center(card);
        burst(c.x, c.y, [art(id), '✨', '⭐'], 14, 90);
        vibrate(40);
        cards.forEach((other) => other !== card && other.animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 200, fill: 'forwards' }));
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 400 });
        window.setTimeout(() => {
          el.overlay.classList.remove('show');
          el.overlay.innerHTML = '';
          render();
          if (id === 'artisan') {
            sfx.newReel();
            flash('#ffffff', 300);
            const r = el.reels.lastElementChild as HTMLElement;
            burst(center(r).x, center(r).y, ['✨', '🎰', '⭐'], 14, 80);
            floatText(center(r).x, center(r).y - 40, 'リール+1！', { cls: 'good', size: 1 });
          }
          const got = visibleOr(el.charms.querySelector(`[data-charm="${id}"]`), 'charms');
          if (got) pop(got, 1.2);
          if (CHARM_PLACE[id]) say(`${PLACES[CHARM_PLACE[id]!].name}を置くマスをタップ`, 3000);
          resolve();
        }, 650);
      }),
    );
  });
}

/** ゾロ目の演出。良い絵柄はフィーバー、カラス・虫は「群れ」として不吉に見せる */
async function showFever(): Promise<void> {
  const good = state.fever.filter((s) => SYMBOLS[s].rarity !== 'bad');
  const bad = state.fever.filter((s) => SYMBOLS[s].rarity === 'bad');
  renderReelStates();
  renderStatus();
  if (good.length) await feverBanner(good, false);
  if (bad.length) await feverBanner(bad, true);
}

async function feverBanner(symbols: SymbolId[], bad: boolean): Promise<void> {
  const lines = symbols
    .map((s) => `${symHtml(s)}${SYMBOLS[s].name}：${SYMBOLS[s].feverDesc}${SYMBOLS[s].rarity === 'bad' ? '' : '＋大当たり'}`)
    .join('<br>');
  const banner = document.createElement('div');
  if (bad) {
    sfx.danger();
    flash('#2a0010', 700);
    vibrate([200, 80, 200]);
    shake(el.app, 10);
    const c = center(el.machine);
    burst(c.x, c.y, ['🪶', '💀', '🖤'], 16, 140);
    banner.className = 'fever-banner bad';
    banner.innerHTML = `⚠️ ${symbols.map((s) => `${SYMBOLS[s].name}の群れ`).join('・')}！<small>${lines}</small>`;
  } else {
    sfx.fever();
    flash('#ff9ad5', 600);
    vibrate([50, 40, 50, 40, 120]);
    confetti(30);
    shake(el.machine, 8);
    banner.className = 'fever-banner';
    banner.innerHTML = `🔥 FEVER！ 🔥<small>${lines}</small>`;
  }
  document.body.appendChild(banner);
  banner.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.2) rotate(-8deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.15) rotate(3deg)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
    ],
    { duration: 500, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'forwards' },
  );
  await sleep(1500);
  banner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => banner.remove();
}

/** フィーバーの役と大当たりの演出 */
async function playFeverRoles(events: FeverEvent[]): Promise<void> {
  for (const ev of events) {
    const name = SYMBOLS[ev.symbol].feverDesc.split('：')[0];
    const mid = center(el.field);
    switch (ev.role) {
      case 'breed':
        sfx.plant();
        floatText(mid.x, mid.y, `${name}！ 今日植える${CROPS[ev.crop].name}は育った状態から`, { cls: 'good', size: 1 });
        break;
      case 'grow':
        render();
        sfx.sun();
        flash('#bff3ff', 400);
        afterGrowth(ev.cells, '+1');
        floatText(mid.x, mid.y, `${name}！ 全作物＋1`, { cls: 'good', size: 1.1 });
        break;
      case 'festival':
        sfx.merchant();
        render();
        floatText(mid.x, mid.y, `${name}！ 今日の売値×${ev.mult}`, { cls: 'gold', size: 1.1 });
        el.field.querySelectorAll('.plot.ripe').forEach((p) => pop(p, 1.15));
        break;
      case 'compost':
        sfx.fertilizer();
        render();
        ev.cells.forEach((c) => {
          const q = center(el.field.children[c]);
          burst(q.x, q.y, ['✨', '💜'], 5, 40);
        });
        floatText(mid.x, mid.y, `${name}！ ${ev.cells.length}つに肥料`, { cls: 'combo', size: 1.1 });
        break;
      case 'honey':
        sfx.coin();
        floatText(mid.x, mid.y, `${name}！ +${ev.amount}金`, { cls: 'gold', size: 1.1 });
        flyTo(mid, el.goldBox, '🪙', 5);
        break;
      case 'bigsale': {
        sfx.lineHarvest();
        const total = ev.sold.reduce((n, r) => n + r.total, 0);
        render();
        floatText(mid.x, mid.y, ev.sold.length ? `${name}！ ${ev.sold.length}個を×2で +${total}金` : `${name}！（実りなし→大当たり2倍）`, { cls: 'gold', size: 1.1 });
        if (ev.sold.length) flyTo(mid, el.goldBox, '🪙', 8);
        break;
      }
      case 'luck':
        sfx.charmGet();
        floatText(mid.x, mid.y, `${name}！ お守りを1つ選べる`, { cls: 'good', size: 1.1 });
        break;
      case 'jackpot':
        break;
    }
    await sleep(700);
    // どの役にも大当たりの金貨が付く
    sfx.rare();
    const g = center(el.goldBox);
    floatText(g.x, g.y + 40, `大当たり +${ev.jackpot}金`, { cls: 'gold', size: ev.role === 'jackpot' ? 1.5 : 1.1, dur: 1400 });
    flyTo(center(el.machine), el.goldBox, '🪙', Math.min(12, 3 + Math.ceil(ev.jackpot / 8)), () => setGold(state.gold));
    if (ev.role === 'jackpot') confetti(50);
    await sleep(600);
  }
  render();
}

/** 回す前に決める見せ方。結果はもう決まっているので、それに合わせて煽る */
interface SpinShow {
  freeze: boolean;
  /** カットインの色（0 青・1 緑・2 赤・3 虹）。null は出さない */
  cutIn: number | null;
}

const CUTIN_TEXT = ['チャンス？', 'チャンス！', '激アツ!!', '確定!!!'];
const CUTIN_MS = 1500;

function planShow(): SpinShow {
  const goodFever = state.fever.some((s) => SYMBOLS[s].rarity !== 'bad');
  const hot = goodFever || state.results.some((r) => r.symbol === 'goldSeed');
  // フリーズは良いフィーバーの一部（全体でおよそ100回に1回）
  if (goodFever && rng() < 0.4) return { freeze: true, cutIn: null };
  // 当たりの日は多めに、外れの日もたまに出す（ガセ）。色が強いほど当たりやすい
  if (rng() >= (hot ? 0.6 : 0.08)) return { freeze: false, cutIn: null };
  const weights = hot ? [1, 2, 3, goodFever ? 1.5 : 0] : [6, 3, 1, 0];
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  const level = weights.findIndex((w) => (r -= w) < 0);
  return { freeze: false, cutIn: level < 0 ? 0 : level };
}

/** 予告のカットイン：キャラが斜めに飛び込んで期待度の色を見せる */
async function playCutIn(level: number): Promise<void> {
  const who: ArtId = level === 3 ? 'bee' : (['crow', 'tanuki', 'bee'] as ArtId[])[Math.floor(rng() * 3)];
  const node = document.createElement('div');
  node.className = `cutin lv-${level}`;
  node.innerHTML = `<div class="cutin-band"><span class="cutin-face">${art(who)}</span><b>${CUTIN_TEXT[level]}</b></div>`;
  document.body.appendChild(node);
  sfx.cutIn(level);
  vibrate(level >= 2 ? [40, 30, 80] : 30);
  if (level === 3) flash('#ffffff', 300);
  const band = node.firstElementChild as HTMLElement;
  band.animate(
    [
      { transform: 'translate(-120%, 40%) skewY(-8deg)' },
      { transform: 'translate(0, 0) skewY(-8deg)', offset: 0.12 },
      { transform: 'translate(3%, 0) skewY(-8deg)', offset: 0.85 },
      { transform: 'translate(130%, -40%) skewY(-8deg)' },
    ],
    { duration: CUTIN_MS, easing: 'linear', fill: 'forwards' },
  );
  node.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: CUTIN_MS, fill: 'forwards' }).onfinish = () =>
    node.remove();
  await sleep(CUTIN_MS);
}

/** フリーズ：暗転 → 無音 → 白い閃光 → 鐘 → 筐体が割れる → ファンファーレ */
async function playFreeze(): Promise<void> {
  const calm = isCalm();
  const black = document.createElement('div');
  black.className = 'freeze-black';
  black.innerHTML = '<div class="crt-line"></div>';
  document.body.appendChild(black);
  black.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: 'forwards' });
  vibrate(200);
  await sleep(calm ? 500 : 1500);
  sfx.crt();
  (black.firstElementChild as HTMLElement).animate(
    [
      { transform: 'scale(0, 0.004)', opacity: 1 },
      { transform: 'scale(1, 0.004)', opacity: 1, offset: 0.4 },
      { transform: 'scale(1, 1)', opacity: calm ? 0.3 : 1, offset: 0.6 },
      { transform: 'scale(1, 1)', opacity: 0 },
    ],
    { duration: 700, fill: 'forwards' },
  );
  await sleep(800);
  sfx.bell();
  await sleep(calm ? 700 : 1400);
  black.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).onfinish = () => black.remove();
  // 筐体のガラスが割れる
  sfx.glass();
  vibrate([100, 40, 200]);
  el.machine.insertAdjacentHTML('beforeend', crackSvg());
  shake(el.app, 16);
  flash('#ffffff', 400);
  const c = center(el.reels);
  burst(c.x, c.y, ['💎', '✨', '⭐'], 24, 180);
  el.machine.classList.add('rainbow');
  await sleep(350);
  sfx.fanfare();
  confetti(40);
  floatText(c.x, c.y - 30, 'フリーズ!!', { cls: 'gold', size: 1.8, dur: 1600 });
  await sleep(1200);
}

/** 割れたガラスのひび。中央付近の1点から放射状に走らせる */
function crackSvg(): string {
  const cx = 40 + rng() * 20;
  const cy = 40 + rng() * 20;
  const lines: string[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (Math.PI * 2 * k) / 9 + rng() * 0.5;
    let x = cx;
    let y = cy;
    const pts = [`${x},${y}`];
    for (let j = 0; j < 4; j++) {
      const len = 8 + rng() * 14;
      const aa = a + (rng() - 0.5) * 0.7;
      x += Math.cos(aa) * len;
      y += Math.sin(aa) * len;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    lines.push(`<polyline points="${pts.join(' ')}"/>`);
  }
  return `<svg class="crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}<circle cx="${cx}" cy="${cy}" r="3"/></svg>`;
}

function spinReels(show: SpinShow = { freeze: false, cutIn: null }): Promise<void> {
  const reels = [...el.reels.children] as HTMLElement[];
  const h = reels[0].querySelector('.window')!.clientHeight;
  const last = state.results.length - 1;
  // リーチ：最後のリールより前で良い絵柄があと1つでそろう
  const counts = new Map<SymbolId, number>();
  state.results.slice(0, last).forEach((r) => counts.set(r.symbol, (counts.get(r.symbol) ?? 0) + 1));
  const reach = [...counts].some(([s, n]) => n >= CONFIG.feverCount - 1 && SYMBOLS[s].rarity !== 'bad');
  // 最後のリールが金の種なら溜めを入れる。外れでもたまに溜めて読めないようにする
  const suspense = reach || state.results[last].symbol === 'goldSeed' || state.fever.some((s) => SYMBOLS[s].rarity !== 'bad') || (state.bag.goldSeed > 0 && rng() < 0.15);
  // カットインが出る日は、出ている間リールを回し続ける
  const extra = show.cutIn !== null ? CUTIN_MS : 0;
  const hold = reach ? 1900 : 900;
  if (show.cutIn !== null) window.setTimeout(() => void playCutIn(show.cutIn!), 150);
  el.machine.classList.add('rumble');
  let tick = window.setInterval(() => sfx.tick(), 70);
  const promises = reels.map((reel, i) => {
    const strip = reel.querySelector('.strip') as HTMLElement;
    const prevSym = reel.querySelector('.cell-sym')!.innerHTML;
    const dur = CONFIG.timing.spinBase + i * CONFIG.timing.spinStagger + extra + (suspense && i === last ? hold : 0);
    const fillers = Math.max(8, Math.round(dur / 40));
    const items = [prevSym, ...Array.from({ length: fillers }, () => symHtml(drawSymbol(state.bag, rng))), symHtml(state.results[i].symbol)];
    strip.innerHTML = items.map((s) => `<div class="cell-sym">${s}</div>`).join('');
    reel.className = 'reel spinning';
    reel.querySelector('.tag')!.textContent = '…';
    if (suspense && i === last) {
      // ひとつ前のリールが止まったところから溜める
      window.setTimeout(() => {
        reel.classList.add('suspense');
        if (reach) {
          reel.classList.add('reach');
          el.machine.classList.add('spotlight');
          sfx.reach();
          vibrate([30, 290, 30, 290, 30]);
        }
      }, dur - hold);
    }
    const anim = strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-(items.length - 1) * h}px)` }], {
      duration: dur,
      easing: 'cubic-bezier(.15,.55,.25,1.04)',
      fill: 'forwards',
    });
    return anim.finished.then(() => {
      anim.cancel();
      strip.innerHTML = `<div class="cell-sym">${symHtml(state.results[i].symbol)}</div>`;
      reel.classList.remove('spinning', 'suspense', 'reach');
      sfx.reelStop(i);
      // 行き過ぎて戻る「ガコッ」
      strip.firstElementChild!.animate(
        [
          { transform: 'translateY(-22%) scale(1, 1.08)' },
          { transform: 'translateY(9%) scale(1.08, 0.92)', offset: 0.45 },
          { transform: 'translateY(-3%) scale(1)', offset: 0.75 },
          { transform: 'translateY(0)' },
        ],
        { duration: 260, easing: 'ease-out' },
      );
      if (i === reels.length - 1) clearInterval(tick);
      onReelLanded(i, reel);
      if (show.freeze && state.fever.includes(state.results[i].symbol)) reel.classList.add('rainbow-sym');
    });
  });
  return Promise.all(promises).then(() => {
    clearInterval(tick);
    tick = 0;
    el.machine.classList.remove('rumble', 'spotlight');
  });
}

function onReelLanded(i: number, reel: HTMLElement): void {
  const sym = state.results[i].symbol;
  const c = center(reel);
  if (sym === 'goldSeed') {
    sfx.rare();
    flash('#ffe680', 500);
    burst(c.x, c.y, ['✨', '🌟', '💛'], 16, 110);
    floatText(c.x, c.y - 40, 'レア！金の種', { cls: 'gold', size: 1 });
    vibrate([30, 30, 60]);
  }
  const total = state.results[i].total;
  if (total > 1) {
    renderCount(reel, i);
    pop(reel.querySelector('.count')!, 1.6);
    if (total >= 3) {
      sfx.bonus();
      burst(c.x, c.y, ['🌰', '✨'], 12, 80);
      floatText(c.x, c.y - 40, `種×${total}！`, { cls: 'gold', size: 1 });
      vibrate(40);
    } else {
      floatText(c.x, c.y - 40, `×${total}`, { cls: 'good', size: 0.8 });
    }
  }
  const tag = reelTag(i);
  reel.className = `reel ${roleClass(sym)} ${sym === 'goldSeed' ? 'rare ' : ''}${SYMBOLS[sym].kind === 'auto' ? '' : tag.cls}`;
  reel.querySelector('.tag')!.textContent = SYMBOLS[sym].kind === 'auto' ? '…' : tag.text;
}

async function resolveAutos(): Promise<void> {
  const reels = [...el.reels.children] as HTMLElement[];
  for (let i = 0; i < state.results.length; i++) {
    if (SYMBOLS[state.results[i].symbol].kind !== 'auto') continue;
    const ev = resolveAuto(state, i, rng);
    if (!ev) continue;
    const from = center(reels[i]);
    if (ev.type === 'coin') {
      autoOutcome[i] = `+${ev.amount}金`;
      await new Promise<void>((r) => flyTo(from, el.goldBox, '🪙', Math.min(8, 2 + Math.ceil(ev.amount / 3)), r));
      sfx.coin();
      floatText(center(el.goldBox).x, center(el.goldBox).y + 28, `+${ev.amount}`, { cls: 'gold', size: 0.9 });
      setGold(state.gold);
    } else if (ev.type === 'merchant') {
      autoOutcome[i] = `売値×${ev.mult}`;
      sfx.merchant();
      burst(from.x, from.y, ['💰', '✨', '🪙'], 10, 70);
      floatText(from.x, from.y - 40, `今日の売値 ×${ev.mult}！`, { cls: 'gold', size: 0.9 });
      render();
      el.field.querySelectorAll('.plot.ripe').forEach((p) => pop(p, 1.12));
    } else if (ev.type === 'clover') {
      autoOutcome[i] = '明日 金の種↑';
      sfx.rare();
      burst(from.x, from.y, ['🍀', '✨', '🌟'], 12, 80);
      floatText(from.x, from.y - 40, '明日は金の種が出やすい！', { cls: 'good', size: 0.8 });
      renderStatus();
    } else if (ev.type === 'bug') {
      if (ev.cell === null) {
        autoOutcome[i] = '空振り';
        floatText(from.x, from.y - 30, '虫は空振り', { size: 0.6 });
      } else {
        const plot = el.field.children[ev.cell] as HTMLElement;
        await new Promise<void>((r) => flyTo(from, plot, '🐛', 1, r));
        const p = center(plot);
        if (ev.warded) {
          autoOutcome[i] = 'よけた';
          sfx.shoo();
          burst(p.x, p.y, ['🌿', '✨'], 8, 50);
          floatText(p.x, p.y - 20, '虫よけ成功！', { cls: 'good', size: 0.8 });
        } else {
          autoOutcome[i] = `成長−${ev.damage}`;
          sfx.bug();
          burst(p.x, p.y, ['🐛', '🍂'], 6, 40);
          floatText(p.x, p.y - 20, `かじられた！ 成長−${ev.damage}`, { cls: 'bad', size: 0.8 });
          shake(plot, 6);
          renderField();
        }
      }
    } else if (ev.type === 'weed') {
      if (ev.warded) {
        autoOutcome[i] = 'よけた';
        sfx.shoo();
        floatText(from.x, from.y - 30, '草よけ成功！', { cls: 'good', size: 0.7 });
      } else if (!ev.cells.length) {
        autoOutcome[i] = '空振り';
        floatText(from.x, from.y - 30, '生える場所がない', { size: 0.6 });
      } else {
        autoOutcome[i] = `${ev.cells.length}か所`;
        sfx.bug();
        for (const c of ev.cells) {
          const plot = el.field.children[c] as HTMLElement;
          await new Promise<void>((r) => flyTo(from, plot, symHtml('weed'), 1, r));
          renderField();
          pop(plot, 1.15);
          const q = center(plot);
          floatText(q.x, q.y - 20, '雑草が生えた…', { cls: 'bad', size: 0.7 });
        }
      }
    } else if (ev.type === 'tanuki') {
      if (ev.escaped) {
        autoOutcome[i] = '逃げた';
        sfx.shoo();
        floatText(from.x, from.y - 30, 'かかしがいてタヌキは近寄れない！', { cls: 'good', size: 0.7 });
        ev.guarded.forEach((c) => pop(el.field.children[c], 1.12));
      } else if (!ev.taken.length) {
        autoOutcome[i] = ev.stolen ? `−${ev.stolen}金` : '空振り';
        if (ev.stolen) {
          sfx.crow();
          const g = center(el.goldBox);
          floatText(g.x, g.y + 30, `タヌキにお金を盗まれた −${ev.stolen}`, { cls: 'bad', size: 0.9 });
          setGold(state.gold);
          shake(el.goldBox, 6);
        } else floatText(from.x, from.y - 30, '何も取れずに帰っていった', { size: 0.6 });
      } else {
        autoOutcome[i] = `−${ev.taken.reduce((n, t) => n + t.price, 0)}金分`;
        for (const t of ev.taken) {
          const plot = el.field.children[t.cell] as HTMLElement;
          await new Promise<void>((r) => flyTo(from, plot, symHtml('tanuki'), 1, r));
          sfx.crow();
          sfx.poof();
          const q = center(plot);
          burst(q.x, q.y, ['💨', '🍂'], 8, 50);
          floatText(q.x, q.y - 20, `持っていかれた！ ${t.price}金が…`, { cls: 'bad', size: 0.9 });
          shake(plot, 8);
          renderField();
        }
        shake(el.app, 5);
        vibrate(120);
      }
    } else if (ev.type === 'frost') {
      autoOutcome[i] = ev.cells.length ? `${ev.cells.length}マス` : '空振り';
      if (ev.cells.length) {
        sfx.tax();
        flash('#dff1ff', 400);
        renderField();
        ev.cells.forEach((c) => {
          const q = center(el.field.children[c]);
          burst(q.x, q.y, ['❄️', '✨'], 8, 40);
          floatText(q.x, q.y - 20, '凍った！', { cls: 'bad', size: 0.8 });
        });
      }
    } else if (ev.cell === null) {
      autoOutcome[i] = '空振り';
      sfx.crow();
      floatText(from.x, from.y - 30, 'カラスは空振り', { size: 0.6 });
    } else if (!ev.eaten) {
      autoOutcome[i] = 'セーフ';
      const plot = el.field.children[ev.cell] as HTMLElement;
      await new Promise<void>((r) => flyTo(from, plot, symHtml('crow'), 1, r));
      sfx.shoo();
      const p = center(plot);
      burst(p.x, p.y, ['💨', '🪶', '✨'], 8, 60);
      floatText(p.x, p.y - 20, ev.guarded ? 'かかしが追い払った！' : ev.crop && isRipe(ev.crop) ? 'セーフ！ 守った！' : 'セーフ！', { cls: 'good', size: ev.crop && isRipe(ev.crop) ? 1 : 0.8 });
      pop(plot, 1.12);
    } else {
      autoOutcome[i] = 'パクッ…';
      const plot = el.field.children[ev.cell] as HTMLElement;
      await new Promise<void>((r) => flyTo(from, plot, symHtml('crow'), 1, r));
      sfx.crow();
      sfx.poof();
      const p = center(plot);
      burst(p.x, p.y, ['🪶', '💨', '🍂'], 8, 50);
      const lost = ev.crop ? (isRipe(ev.crop) ? `${cropPrice(state, ev.crop)}金が…` : CROPS[ev.crop.kind].name) : '';
      floatText(p.x, p.y - 20, `パクッ！ ${lost}`, { cls: 'bad', size: ev.crop && isRipe(ev.crop) ? 1 : 0.8 });
      shake(plot, 8);
      if (ev.crop && isRipe(ev.crop)) {
        shake(el.app, 5);
        vibrate(120);
      }
      renderField();
    }
    if (ev.type === 'crow' && ev.toll > 0) {
      sfx.coin();
      floatText(center(el.goldBox).x, center(el.goldBox).y + 28, `通行料 +${ev.toll}`, { cls: 'gold', size: 0.8 });
      setGold(state.gold);
    }
    renderReelStates();
    await sleep(CONFIG.timing.autoStep);
  }
}

// ---- 出目を使う ----

function onReelTap(i: number): void {
  unlockAudio();
  if (busy || state.over) return;
  const r = state.results[i];
  if (!r) return;
  const def = SYMBOLS[r.symbol];
  const reel = el.reels.children[i] as HTMLElement;
  if (def.kind === 'auto') {
    say(`${def.name}は自動で効果が出る出目`);
    shake(reel, 3);
    return;
  }
  if (r.used) {
    say('この出目はもう使った');
    shake(reel, 3);
    return;
  }
  if (selected === i) {
    selected = null;
    sfx.cancel();
    render();
    return;
  }
  if (!canUse(state, i, null)) {
    sfx.error();
    shake(reel, 4);
    say(SEEDS[r.symbol] ? '空きマスがない！ 実った作物を売ろう' : r.symbol === 'fertilizer' ? '肥料をまける作物がない' : '育てる作物がない');
    return;
  }
  selected = i;
  armedNextDay = false;
  sfx.select();
  say(`${def.name}：${def.desc}`, 3200);
  render();
}

function onPlotTap(cell: number): void {
  unlockAudio();
  if (busy || state.over) return;
  const plot = el.field.children[cell] as HTMLElement;
  const p = center(plot);
  if (selected === null && state.stock.length && canPlace(state, cell)) {
    const id = place(state, cell)!;
    sfx.plant();
    sfx.charmGet();
    render();
    burst(p.x, p.y, ['✨', '⭐', '🌱'], 12, 60);
    pop(plot, 1.2);
    floatText(p.x, p.y - 20, `${PLACES[id].name}を置いた！`, { cls: 'good', size: 0.8 });
    return;
  }
  if (selected !== null) {
    const reel = selected;
    const sym = state.results[reel].symbol;
    if (!canUse(state, reel, cell)) {
      sfx.error();
      shake(plot, 5);
      const crop = state.field[cell];
      say(
        SEEDS[sym]
          ? 'そこにはもう作物がある'
          : SYMBOLS[sym].shape
            ? `その${SHAPE_NAMES[SYMBOLS[sym].shape!]}に育てる作物がない`
            : !crop
              ? '作物がないマスには使えない'
              : sym === 'rain'
                ? 'もう実っている'
                : 'もう肥料をまいた',
      );
      return;
    }
    const power = state.results[reel].power;
    const affected = useSymbol(state, reel, cell) ?? [];
    const left = state.results[reel].left;
    selected = left > 0 && canUse(state, reel, null) ? reel : null;
    done.use = true;
    armedNextDay = false;
    render();
    if (SEEDS[sym]) {
      sfx.plant();
      burst(p.x, p.y, sym === 'goldSeed' ? ['✨', '🌟'] : ['🌱', '·'], 8, 40);
      pop(plot, 1.15);
      const more = left > 0 ? `（あと${left}）` : '';
      const name = CROPS[SEEDS[sym]!.crop].name;
      floatText(p.x, p.y - 20, `${name}を植えた！${more}`, { size: 0.7, cls: sym === 'goldSeed' ? 'gold' : 'good' });
      if (left > 0 && selected === null) say('空きマスがないので残りの種は使えない');
    } else if (sym === 'fertilizer' && left > 0) {
      sfx.fertilizer();
      floatText(p.x, p.y - 20, '売値×2！（あと1つ）', { cls: 'combo', size: 0.9 });
    } else if (sym === 'rain') {
      sfx.rain();
      shapeCells(state, 'cross', cell).forEach((c) => rainDrops(el.field.children[c] as HTMLElement));
      afterGrowth(affected, `+${CONFIG.rainGrowth * power}`);
    } else if (sym === 'sun') {
      sfx.sun();
      shapeCells(state, 'column', cell).forEach((c, k) => {
        const q = center(el.field.children[c]);
        window.setTimeout(() => burst(q.x, q.y, ['☀️', '✨'], 4, 36), k * 70);
      });
      flash('#fff3a0', 300);
      afterGrowth(affected, `+${CONFIG.sunGrowth * power + state.charms.sunBlessing}`);
    } else if (sym === 'bee') {
      sfx.bee();
      shapeCells(state, 'x', cell).forEach((c, k) => {
        const q = center(el.field.children[c]);
        window.setTimeout(() => burst(q.x, q.y, ['🐝', '🌼'], 3, 30), k * 70);
      });
      afterGrowth(affected, `+${CONFIG.beeGrowth * power}`);
      if (left > 0 && selected === null) say('もう使える場所がない');
    } else if (sym === 'fertilizer') {
      sfx.fertilizer();
      burst(p.x, p.y, ['✨', '💜'], 10, 50);
      pop(plot, 1.15);
      floatText(p.x, p.y - 20, '売値×2！', { cls: 'combo', size: 0.9 });
    }
    return;
  }
  if (state.frost[cell]) {
    shake(plot, 3);
    say(`凍っている（あと${state.frost[cell]}日で溶ける）`);
    return;
  }
  if (state.weeds[cell]) {
    if (!pullWeed(state, cell)) {
      sfx.error();
      shake(plot, 4);
      say(`雑草を抜くには${weedCost(state)}金いる`);
      return;
    }
    sfx.poof();
    burst(p.x, p.y, ['🍃', '💨'], 8, 50);
    floatText(p.x, p.y - 20, weedCost(state) ? `草むしり −${weedCost(state)}金` : '草むしり！', { size: 0.8 });
    render();
    return;
  }
  const tool = state.tools[cell];
  if (tool) {
    say(`${PLACES[tool].name}：${PLACES[tool].desc}`);
    pop(plot, 1.08);
    return;
  }
  const crop = state.field[cell];
  if (isRipe(crop)) {
    sellCrop(cell);
    return;
  }
  if (crop) {
    shake(plot, 3);
    const def = CROPS[crop.kind];
    say(`${def.name}：あと${def.ripe - crop.growth}育つと実る（${def.price}金。列なら×${CONFIG.lineMult}〜、単品は半値）`);
  } else {
    say(state.stock.length ? `ここには${PLACES[state.stock[0]].name}を置けない` : '空きマス：種が出たら植えられる');
  }
}

function rainDrops(plot: HTMLElement): void {
  const r = plot.getBoundingClientRect();
  for (let k = 0; k < 6; k++) {
    const x = r.left + r.width * (0.2 + Math.random() * 0.6);
    window.setTimeout(() => burst(x, r.top + 10, ['💧'], 1, 30), k * 60);
  }
}

function afterGrowth(cells: number[], label: string): void {
  cells.forEach((cell, k) => {
    const plot = el.field.children[cell] as HTMLElement;
    const p = center(plot);
    const crop = state.field[cell];
    window.setTimeout(() => {
      pop(plot.querySelector('.crop') ?? plot, 1.35);
      if (crop && isRipe(crop)) {
        sfx.grow();
        const big = CROPS[crop.kind].price >= 20;
        burst(p.x, p.y, ['✨', big ? '🌟' : '⭐'], 8, 50);
        floatText(p.x, p.y - 20, big ? `実った！ ${cropPrice(state, crop, cell)}金` : '実った！', {
          cls: big ? 'gold' : 'good',
          size: big ? 1 : 0.8,
        });
      } else {
        floatText(p.x, p.y - 20, label, { cls: 'good', size: 0.7 });
      }
    }, 150 + k * 80);
  });
}

function sellCrop(cell: number): void {
  const plot = el.field.children[cell] as HTMLElement;
  const p = center(plot);
  const centers = state.field.map((_, i) => center(el.field.children[i]));
  const res = sell(state, cell);
  if (res === null) return;
  done.sell = true;
  const now = performance.now();
  combo = now - lastSellAt < CONFIG.timing.comboWindow ? combo + 1 : 1;
  lastSellAt = now;
  const price = res.total;
  const big = price >= CROPS.corn.price || res.line;
  render();
  if (res.orderReward) {
    // 注文達成：お客さんからまとめて代金
    window.setTimeout(() => {
      sfx.bigBuy();
      const o = center(el.order);
      floatText(o.x, o.y + 30, `注文達成！ +${res.orderReward}金`, { cls: 'gold', size: 1.3, dur: 1600 });
      burst(o.x, o.y, ['🪙', '✨', '⭐'], 16, 90);
      flyTo(o, el.goldBox, '🪙', 8, () => setGold(state.gold));
      pop(el.order, 1.1);
      vibrate([40, 30, 80]);
    }, 500);
  }
  if (res.line) {
    done.line = true;
    sfx.lineHarvest();
    if (res.lines >= 2) window.setTimeout(() => sfx.fever(), 200);
    res.cells.forEach(({ cell: c, price: each }, k) => {
      const q = centers[c];
      window.setTimeout(() => {
        sfx.sell(each, combo + k);
        burst(q.x, q.y, ['🪙', '✨', '🌟'], 10, 70);
        floatText(q.x, q.y - 10, `+${each}`, { cls: 'gold', size: Math.min(1.6, 0.8 + each / 25) });
        pop(el.field.children[c], 1.15);
      }, k * 140);
    });
    window.setTimeout(() => {
      const name = ['', '一列そろい！', '二列そろい！！', '大収穫！！！', 'ほぼ全部！！！！'][Math.min(res.lines, 4)];
      floatText(p.x, p.y - 70, `${name} ${res.size}個 最大×${res.mult} +${price}`, { cls: 'combo', size: 1.2 + res.lines * 0.2, rise: 120, dur: 1700 });
      if (res.lines >= 2) {
        confetti(30 + res.lines * 20);
        flash('#ff9ad5', 500);
        shake(el.app, 4 + res.lines * 2);
      }
    }, res.cells.length * 140);
  } else {
    sfx.sell(price, combo);
    const size = Math.min(2, 0.8 + price / 25);
    floatText(p.x, p.y - 10, `+${price}`, { cls: 'gold', size, rise: big ? 110 : 70 });
    floatText(p.x, p.y + 18, `単品（半値）`, { size: 0.6, dur: 900 });
    burst(p.x, p.y, big ? ['🪙', '✨', '🌟', '💰'] : ['🪙', '✨'], big ? 22 : 8, big ? 140 : 60);
  }
  if (combo >= 2) floatText(p.x, p.y - 60, `COMBO ×${combo}`, { cls: 'combo', size: 0.7 + Math.min(combo, 6) * 0.08, dur: 900 });
  flyTo(p, el.goldBox, '🪙', Math.min(10, Math.ceil(price / 6)), () => setGold(state.gold));
  if (big) {
    flash('#ffe680', 500);
    confetti(36);
    shake(el.app, 6);
    vibrate([40, 40, 80]);
  } else {
    vibrate(20);
  }
}

// ---- 強化 ----

function onBuy(id: UpgradeId): void {
  unlockAudio();
  if (busy || state.over) return;
  const card = el.shop.querySelector(`[data-id="${id}"]`) as HTMLElement;
  if (!upgradeAvailable(state, id)) {
    say('これ以上は強化できない');
    shake(card, 3);
    return;
  }
  if (!canBuy(state, id)) {
    sfx.error();
    shake(card, 4);
    say(`あと${upgradePrice(state, id) - state.gold}金 足りない`);
    return;
  }
  const first = state.stats.purchases.length === 0;
  const from = center(card);
  buy(state, id);
  done.buy = true;
  render();
  pop(card, 1.1);
  if (UPGRADE_SYMBOL[id]!.delta < 0) {
    const sym = UPGRADE_SYMBOL[id]!.symbol;
    sfx.buy();
    sfx.poof();
    const chip = visibleOr(el.bag.querySelector(`[data-sym="${sym}"]`), 'bag');
    const c = center(chip);
    burst(c.x, c.y, ['💨', sym === 'crow' ? '🪶' : '🍃', '✨'], 12, 60);
    floatText(c.x, c.y - 20, `${SYMBOLS[sym].name} −1！`, { cls: 'good', size: 0.9 });
    pop(chip, 1.3);
  } else {
    sfx.buy();
    const sym = UPGRADE_SYMBOL[id]!.symbol;
    const chip = visibleOr(el.bag.querySelector(`[data-sym="${sym}"]`), 'bag');
    flyTo(from, chip, symHtml(sym), 1, () => {
      pop(chip, 1.35);
      burst(center(chip).x, center(chip).y, ['✨'], 6, 30);
    });
  }
  if (first) {
    sfx.bigBuy();
    confetti(24);
    floatText(window.innerWidth / 2, window.innerHeight * 0.35, 'はじめての強化！', { cls: 'gold', size: 1.3, dur: 1500 });
  }
}

// ---- ゲームオーバー ----

interface Best {
  day: number;
  taxes: number;
}

function loadBest(): Best {
  try {
    return JSON.parse(localStorage.getItem('hatake-slot:best') ?? '') as Best;
  } catch {
    return { day: 0, taxes: 0 };
  }
}

function saveBest(b: Best): void {
  try {
    localStorage.setItem('hatake-slot:best', JSON.stringify(b));
  } catch {
    // 保存できなくても続ける
  }
}

/** 結果画面。cleared=true はクリア後にここで終えたとき */
function showGameOver(endedAfterClear = false): void {
  clearRun();
  state.over = true;
  const best = loadBest();
  const isNew = state.day > (best.day ?? 0);
  if (isNew) saveBest({ day: state.day, taxes: state.taxesPaid });
  const name = (id: UpgradeId) => UPGRADES.find((u) => u.id === id)!.name;
  const first = state.stats.purchases[0];
  const t = nextTax(state);
  const earned = awardPoints(meta, state);
  el.overlay.innerHTML = `
    <div class="modal" role="dialog" aria-label="ゲームオーバー">
      <div class="big">${state.cleared ? '🏆' : '🏚️'}</div>
      <h2>${endedAfterClear ? 'クリア！ おつかれさま' : state.cleared ? 'エンドレス終了！' : '年貢が払えなかった…'}</h2>
      <div class="record">${state.day}日目まで / 年貢 ${state.taxesPaid}回 納付${isNew ? '<span class="newrec">最高記録！</span>' : ''}</div>
      <div class="points-earned">🌾 豊穣ポイント <b>+${earned}</b><small>（${state.day}日×${META.pointsPerDay} ＋ 年貢${state.taxesPaid}回×${META.pointsPerTax}${state.cleared ? ` ＋ クリア${META.clearBonus}` : ''}）所持 ${meta.points}pt</small></div>
      <table>
        <tr><td>最高記録</td><td>${Math.max(state.day, best.day ?? 0)}日目</td></tr>
        <tr><td>払えなかった年貢</td><td>${t.amount}金（所持 ${state.gold}金）</td></tr>
        <tr><td>回転数</td><td>${state.stats.spins}回</td></tr>
        <tr><td>総収入</td><td>${state.stats.totalEarned}金</td></tr>
        <tr><td>売った作物 / 食べられた作物</td><td>${state.stats.cropsSold} / ${state.stats.cropsEaten}</td></tr>
        <tr><td>追い払ったカラス</td><td>${state.stats.crowsMissed}回</td></tr>
        <tr><td>フィーバー / つながり収穫</td><td>${state.stats.fevers}回 / ${state.stats.lineHarvests}回</td></tr>
        <tr><td>最初の強化</td><td>${first ? `${first.day}日目（${name(first.id)}）` : 'なし'}</td></tr>
        <tr><td>リール本数</td><td>${state.reels}本</td></tr>
      </table>
      <h3>📝 強化の購入順（検証ログ）</h3>
      ${state.stats.purchases.length ? `<ol>${state.stats.purchases.map((p) => `<li>${p.day}日目 ${name(p.id)}</li>`).join('')}</ol>` : '<p>なし</p>'}
      <h3>🎁 選んだお守り</h3>
      ${state.stats.charms.length ? `<ol>${state.stats.charms.map((c) => `<li>${c.day}日目 ${art(c.id)}${CHARMS[c.id].name}</li>`).join('')}</ol>` : '<p>なし</p>'}
      <div class="share-row">
        <button class="secondary" id="share">${typeof navigator.share === 'function' ? '📤 結果をシェア' : '📋 結果をコピー'}</button>
        ${FEEDBACK_URL ? `<a class="secondary" href="${FEEDBACK_URL}" target="_blank" rel="noopener">✉️ 感想を送る</a>` : ''}
      </div>
      <button class="primary" id="restart" disabled>準備へ（解放・組み合わせ）</button>
    </div>`;
  el.overlay.classList.add('show');
  const btn = $<HTMLButtonElement>('restart');
  // 直前の連打で即リトライが暴発しないよう少し待つ
  window.setTimeout(() => (btn.disabled = false), 900);
  btn.addEventListener('click', restart);
  $('share').addEventListener('click', () => void shareResult(endedAfterClear));
  render();
}

function restart(): void {
  showPrep();
}

function resultText(endedAfterClear: boolean): string {
  const head = state.cleared ? (endedAfterClear ? '🏆 クリア！' : `🏆 クリア後エンドレスで${state.day}日目まで`) : `${state.day}日目まで`;
  const charms = state.stats.charms.map((c) => CHARMS[c.id].emoji).join('');
  return [
    `🌾畑スロット ${head}`,
    `年貢 ${state.taxesPaid}回納付 / 総収入 ${state.stats.totalEarned}金 / リール${state.reels}本`,
    charms ? `お守り ${charms}` : '',
    `フィーバー${state.stats.fevers}回・つながり${state.stats.lineHarvests}回`,
    SHARE_URL,
  ]
    .filter(Boolean)
    .join('\n');
}

async function shareResult(endedAfterClear: boolean): Promise<void> {
  const text = resultText(endedAfterClear);
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    say('結果をコピーした！');
    floatText(window.innerWidth / 2, window.innerHeight * 0.3, 'コピーした！', { cls: 'good', size: 1 });
  } catch {
    // 共有を閉じた・権限がない場合は何もしない
  }
}

// ---- 遊び方・図鑑 ----

type HelpTab = 'rules' | 'symbols' | 'charms';

/** onClose：閉じたあとに戻す画面（準備画面から開いたとき） */
function showHelp(tab: HelpTab = 'rules', onClose?: () => void): void {
  const tabs: [HelpTab, string][] = [['rules', '遊び方'], ['symbols', '絵柄'], ['charms', 'お守り']];
  const rules = `
    <ol class="help-list">
      <li><b>まわす</b>：1回転＝1日。リールの数だけ出来事が起きる</li>
      <li><b>手動の出目</b>はタップ → 畑のマスをタップで使う。使わずに次の日へ進むと消える</li>
      <li><b>自動の出目</b>（カラス・虫・金貨・商人・四つ葉）は止まった瞬間に効く</li>
      <li>作物は<b>雨・太陽・蜂</b>でしか育たない。実をタップで売る。<b>苺</b>は2段階で4金、<b>トマト</b>は3段階で6金、<b>かぼちゃ</b>は5段階で24金（カラスに食べられない）、<b>金のとうもろこし</b>は3段階で30金</li>
      <li><b>出目の形</b>：雨は<b>十字</b>、太陽は<b>縦一列</b>、蜂は<b>斜め</b>（選んだマスと斜め4マス）の作物を育てる。どこに落とすかで育つ数が変わる</li>
      <li><b>畑を広げる・道具</b>：ショップで畑を広げられる（最大5×5）。かかし・井戸・巣箱などの道具や、堆肥・水路のマスを買って好きな所に置ける。道具はマスを1つ使う（植えられず列にも入らない）</li>
      <li><b>お邪魔</b>：年貢を納めるたびに虫・雑草・タヌキ・霜のどれかが袋に増える。<b>雑草</b>は空きマスを塞いで広がる（タップ${CONFIG.weedPullCost}金で抜く）、<b>タヌキ</b>は実ったまま置いた一番高い作物を持っていく（実りがなければお金を盗む）、<b>霜</b>はマスを${CONFIG.frostDays}日凍らせる（植える・育つ・売るができない）。ショップで消せる（消すたび高くなる）</li>
      <li><b>注文</b>：週ごとにお客さんから「◯◯を△個」の注文が来る。期日までに売ると報酬の金がもらえる</li>
      <li><b>年貢</b>：${CONFIG.taxPeriod}日ごとに自動で徴収。払えないと終わり。${CONFIG.winTaxes}回納めるとクリア</li>
      <li>年貢を納めるたびに<b>お守り</b>を3つから1つ選べる。代わりに<b>虫</b>が1枚増える</li>
      <li><b>フィーバー</b>：同じ絵柄が${CONFIG.feverCount}つ以上そろうと、絵柄ごとの役（芽吹き・虹・夏祭り・はちみつ・大商い・幸運など）と金貨の大当たり。カラス・虫がそろうと「群れ」で危険</li>
      <li><b>列の収穫</b>：縦・横・斜めに3つ以上そろった実は、1つタップで列ごと売れて<b>×${CONFIG.lineMult}</b>。同じ作物だけの列ならさらに<b>×${CONFIG.sameCropMult}</b>、列が交わるマスはさらに上乗せ。<b>列に入らない単品は半値</b></li>
      <li><b>ショップ</b>：準備画面で選んだ「足す」強化と、カラス・虫を消す（消すたび価格×${CONFIG.removeGrowth}）</li>
      <li><b>豊穣ポイント</b>：遊び終わるたびに「日数＋年貢×${META.pointsPerTax}」（クリアで+${META.clearBonus}）。準備画面で解放に使う</li>
    </ol>`;
  const symbols = SYMBOL_ORDER.map((id) => {
    const d = SYMBOLS[id];
    return `<div class="dex-row${d.rarity === 'bad' ? ' bad' : ''}"><span class="e">${symHtml(id)}</span>
      <div><b>${d.name}</b> <span class="tag-k">${d.kind === 'manual' ? '手動' : '自動'}</span>
      <small>${d.desc}</small><small class="fv">フィーバー：${d.feverDesc}</small></div>
      <span class="own">袋に${state.bag[id]}枚</span></div>`;
  }).join('');
  const charms = CHARM_ORDER.map((id) => {
    const c = CHARMS[id];
    const locked = id in META.charmUnlock && !meta.unlockedCharms.includes(id);
    return `<div class="dex-row tier-${c.tier}${locked ? ' locked' : ''}"><span class="e">${art(id)}</span>
      <div><b>${c.name}</b> <span class="tag-k">${CHARM_TIER_NAMES[c.tier]}</span>
      <small>${c.desc(1)}${Number.isFinite(c.max) ? `（最大${c.max}個）` : ''}</small>
      ${locked ? `<small class="fv">🔒 準備画面で${META.charmUnlock[id]}ptで解放</small>` : ''}</div>
      <span class="own">${state.charms[id] ? `所持${state.charms[id]}` : ''}</span></div>`;
  }).join('');
  el.overlay.innerHTML = `
    <div class="modal help-modal" role="dialog" aria-label="遊び方と図鑑">
      <div class="help-tabs">${tabs.map(([k, label]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
      <div class="help-body">${tab === 'rules' ? rules : tab === 'symbols' ? symbols : charms}</div>
      <button class="secondary" id="calm-toggle">演出控えめ：${isCalm() ? 'オン' : 'オフ'}<small>揺れ・点滅・フリーズを弱める</small></button>
      <button class="primary" id="help-close">閉じる</button>
    </div>`;
  el.overlay.classList.add('show');
  $('calm-toggle').addEventListener('click', (e) => {
    const on = toggleCalm();
    (e.currentTarget as HTMLElement).firstChild!.textContent = `演出控えめ：${on ? 'オン' : 'オフ'}`;
    sfx.select();
  });
  el.overlay.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => showHelp(b.dataset.tab as HelpTab, onClose)),
  );
  $('help-close').addEventListener('click', () => {
    el.overlay.classList.remove('show');
    el.overlay.innerHTML = '';
    onClose?.();
  });
}

/** クリア画面。エンドレスで続けるなら true */
function showClear(): Promise<boolean> {
  sfx.bigBuy();
  confetti(80);
  flash('#ffe680', 700);
  vibrate([60, 40, 60, 40, 200]);
  el.overlay.innerHTML = `
    <div class="modal clear-modal" role="dialog" aria-label="クリア">
      <div class="big">🏆</div>
      <h2>年貢を${CONFIG.winTaxes}回 完納！ クリア！</h2>
      <div class="record">${state.day}日目でクリア / 総収入 ${state.stats.totalEarned}金</div>
      <p class="sub">クリアで豊穣ポイント +${META.clearBonus}。続けるとエンドレスになり、年貢はどんどん重くなる</p>
      <button class="primary" id="clear-continue" disabled>エンドレスで続ける</button>
      <button class="secondary" id="clear-end" disabled>ここで終えて結果を見る</button>
    </div>`;
  el.overlay.classList.add('show');
  window.setTimeout(() => el.overlay.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = false)), 900);
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      el.overlay.classList.remove('show');
      el.overlay.innerHTML = '';
      resolve(v);
    };
    $('clear-continue').addEventListener('click', () => close(true));
    $('clear-end').addEventListener('click', () => close(false));
  });
}

function startGame(resume: GameState | null = null): void {
  state = resume ?? newGame(setupFrom(meta));
  if (resume) Object.keys(done).forEach((k) => (done[k as keyof typeof done] = true));
  else clearRun();
  selected = null;
  armedNextDay = false;
  done.spin = false;
  el.overlay.classList.remove('show');
  el.overlay.innerHTML = '';
  el.reels.innerHTML = '';
  el.shop.innerHTML = '';
  render();
}

// ---- 準備画面（解放とショップの組み合わせ） ----

const ADD_EMOJI = Object.fromEntries(UPGRADES.map((u) => [u.id, upgradeArt(u.id)]));
const ADD_NAME = Object.fromEntries(UPGRADES.map((u) => [u.id, u.name]));

function showPrep(): void {
  const saved = loadRun();
  let confirmNew = false;
  const paint = () => {
    const cap = capacity(meta);
    const used = loadoutCost(meta.loadout.filter((id) => meta.unlockedAdds.includes(id)));
    const capPrice = nextCapacityPrice(meta);
    const adds = (Object.keys(META.adds) as (keyof typeof META.adds)[])
      .map((id) => {
        const def = META.adds[id];
        const unlocked = meta.unlockedAdds.includes(id);
        const on = unlocked && meta.loadout.includes(id);
        const fits = on || used + def.cost <= cap;
        if (!unlocked) {
          return `<button class="prep-item locked" data-unlock="${id}" ${meta.points < def.unlock ? 'disabled' : ''}>
            <span class="e">${ADD_EMOJI[id]}</span><b>${ADD_NAME[id]}</b>
            <small>🔒 ${def.unlock}pt で解放</small><span class="cost">コスト${def.cost}</span></button>`;
        }
        return `<button class="prep-item${on ? ' on' : ''}${fits ? '' : ' full'}" data-toggle="${id}">
          <span class="e">${ADD_EMOJI[id]}</span><b>${ADD_NAME[id]}</b>
          <small>${on ? '✅ ショップに並べる' : fits ? 'タップで並べる' : 'コストが足りない'}</small><span class="cost">コスト${def.cost}</span></button>`;
      })
      .join('');
    const charms = (Object.keys(META.charmUnlock) as (keyof typeof META.charmUnlock)[])
      .map((id) => {
        const c = CHARMS[id];
        const price = META.charmUnlock[id]!;
        const unlocked = meta.unlockedCharms.includes(id);
        return `<button class="prep-item charm-unlock${unlocked ? ' on' : ' locked'}" data-charm="${id}" ${unlocked || meta.points < price ? 'disabled' : ''}>
          <span class="e">${art(id as ArtId)}</span><b>${c.name}</b>
          <small>${unlocked ? '✅ 年貢のお守りに出る' : `🔒 ${price}pt で解放`}</small><span class="cost">${CHARM_TIER_NAMES[c.tier]}</span></button>`;
      })
      .join('');
    el.overlay.innerHTML = `
      <div class="modal prep-modal" role="dialog" aria-label="準備">
        <h2>${art('sprout')} 畑スロット ${art('sprout')}</h2>
        <div class="points">豊穣ポイント <b>${meta.points}pt</b><small>遊び終わるたびに「日数＋年貢×${META.pointsPerTax}」がたまる</small></div>
        <h3>🛠 ショップに並べる強化 <span class="cap${used > cap ? ' over' : ''}">コスト ${used} / ${cap}</span></h3>
        <div class="prep-grid">${adds}</div>
        ${capPrice !== null ? `<button class="secondary" id="prep-cap" ${meta.points < capPrice ? 'disabled' : ''}>コスト上限 +${META.capacityStep}（${capPrice}pt）</button>` : '<p class="sub">コスト上限は最大です</p>'}
        <h3>🎁 レアのお守り</h3>
        <div class="prep-grid">${charms}</div>
        <p class="sub">カラス・虫を消すは毎回ショップに並ぶ。リールはお守り「からくり職人」で増える</p>
        <button class="secondary" id="prep-help">📖 遊び方・図鑑</button>
        ${saved ? `<button class="primary" id="prep-resume">続きから（${saved.day}日目・${saved.gold}金）</button>` : ''}
        <button class="${saved ? 'secondary' : 'primary'}" id="prep-start">${saved ? (confirmNew ? '本当に新しく始める？（続きは消えます）' : '新しく始める') : 'はじめる！'}</button>
      </div>`;
    el.overlay.classList.add('show');
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        unlockAudio();
        if (toggleLoadout(meta, b.dataset.toggle as never)) sfx.select();
        else {
          sfx.error();
          shake(b, 4);
          return;
        }
        paint();
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-unlock]').forEach((b) =>
      b.addEventListener('click', () => {
        unlockAudio();
        if (!unlockAdd(meta, b.dataset.unlock as never)) return;
        sfx.charmGet();
        const c = center(b);
        paint();
        burst(c.x, c.y, ['✨', '🔓', '⭐'], 14, 80);
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('.charm-unlock[data-charm]').forEach((b) =>
      b.addEventListener('click', () => {
        unlockAudio();
        if (!unlockCharm(meta, b.dataset.charm as never)) return;
        sfx.charmGet();
        const c = center(b);
        paint();
        burst(c.x, c.y, ['✨', '🔓', '⭐'], 14, 80);
      }),
    );
    document.getElementById('prep-cap')?.addEventListener('click', () => {
      unlockAudio();
      if (!buyCapacity(meta)) return;
      sfx.buy();
      paint();
    });
    $('prep-start').addEventListener('click', () => {
      unlockAudio();
      if (saved && !confirmNew) {
        confirmNew = true;
        sfx.error();
        paint();
        return;
      }
      sfx.select();
      startGame();
    });
    $('prep-help').addEventListener('click', () => showHelp('rules', showPrep));
    document.getElementById('prep-resume')?.addEventListener('click', () => {
      unlockAudio();
      sfx.select();
      startGame(saved);
    });
  };
  paint();
}

// ---- 起動 ----

el.spin.addEventListener('click', () => void onSpin());
el.mute.textContent = isMuted() ? '🔇' : '🔊';
el.goldBox.querySelector('.stat-icon')!.innerHTML = art('coin');
document.querySelector('.stat-day .stat-icon')!.innerHTML = art('calendar');
document.querySelector('.machine-top')!.innerHTML = `${art('coin')} 畑スロット ${art('coin')}`;
document.querySelectorAll<HTMLElement>('.tab-ico[data-art]').forEach((n) => (n.innerHTML = art(n.dataset.art as ArtId)));
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    unlockAudio();
    if (busy) return;
    const name = t.dataset.sheet as SheetName;
    if (openSheetName === name) closeSheet();
    else {
      sfx.select();
      openSheet(name);
    }
  }),
);
el.sheetBackdrop.addEventListener('click', closeSheet);
$('sheet-close').addEventListener('click', closeSheet);
el.help.addEventListener('click', () => {
  // 年貢・お守り・結果などの画面の上には開かない
  if (busy || el.overlay.classList.contains('show')) return;
  unlockAudio();
  sfx.select();
  showHelp('rules');
});
el.mute.addEventListener('click', () => {
  unlockAudio();
  el.mute.textContent = toggleMute() ? '🔇' : '🔊';
});
render();
showPrep();
