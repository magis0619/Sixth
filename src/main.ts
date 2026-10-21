import './style.css';
import {
  ACHIEVE_ADDS, CHARMS, CHARM_ORDER, CHARM_PLACE, DIFFICULTIES, THUNDER_LINES, TOOL_EVOLVE, CHARM_TIER_NAMES, CONFIG, CROPS, FEEDBACK_URL, META, PLACES, PLACE_ORDER, SEEDS, SHAPE_NAMES, SHARE_URL, SYMBOLS, SYMBOL_ORDER, UPGRADES, UPGRADE_SYMBOL,
  type CharmId, type CropKind, type PlaceId, type SymbolId, type UpgradeId,
} from './config.ts';
import {
  isGolden, singleMult, multSteps, type Notice, bagTotal, buy, buyPlace, canBuy, canBuyPlace, canExpand, canPlace, canUse, cellMultiplier, chooseCharm, cropPrice, drawDay, drawSymbol, endDay,
  expand, expandPrice, inField, inSameCropLine, isRipe, place, placePrice, shapeCells,
  ripeGroup, newGame, nextTax, pullWeed, weedCost, resolveFever, type FeverEvent, resolveAuto, sell, type SellResult, upgradeAvailable, upgradePrice, useSymbol, validTargets, type GameState,
} from './game.ts';
import { isMuted, sfx, toggleMute, unlockAudio } from './audio.ts';
import {
  awardPoints, isAchieveAdd, maxDifficulty, recordRun, saveMeta, buyCapacity, capacity, loadMeta, loadoutCost, nextCapacityPrice, setupFrom, toggleLoadout, unlockAdd,
  unlockCharm, type MetaState,
} from './meta.ts';
import { art, type ArtId } from './art.ts';
import { track } from './telemetry.ts';
import type { Crop } from './game.ts';
import {
  burst, center, coinRain, confetti, flash, floatText, flyTo, hitStop, isCalm, pop, rollNumber, scanlines, shake, shakeFor, sleep, slamText, slowFactor,
  speedLines, stackMultipliers, toggleCalm, vibrate, rainShower, fmtMult, sunBeam, beeFlight, firework,
} from './fx.ts';

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
const FRUIT: Record<CropKind, ArtId> = { tomato: 'tomato', strawberry: 'strawberry', pumpkin: 'pumpkin', melon: 'melon', corn: 'corn' };
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
/** 列の収穫の演出中は、作物が財布に届くまで所持金の表示を止めておく */
let goldHeld = 0;
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
    s.lastObstacles ??= [];
    s.runId ??= Math.random().toString(36).slice(2, 10);
    // 特別なお守り・道具の進化を入れる前の保存データ
    s.ready ??= [];
    s.specials ??= [];
    s.difficulty ??= 0;
    s.toolXp ??= s.field.map(() => 0);
    s.today ??= { rain: [], sun: [], boosted: [] };
    s.halfTax ??= false;
    s.notices ??= [];
    s.stats.crowEaten ??= 0;
    CHARM_ORDER.forEach((id) => (s.charms[id] ??= 0));
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
  if (!goldHeld && shownGold !== state.gold) setGold(state.gold);
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
  renderSky();
  renderDanger();
  renderCharms();
  saveRun();
  fitLayout();
  flushNotices();
}

/** ルール側から届いた知らせ（特別なお守り・金色・進化・大当たり）を演出する */
function flushNotices(): void {
  const list = state.notices.splice(0);
  // 直前の操作の演出（売った・買った）と重ならないよう少し遅らせる
  list.forEach((n: Notice, k) => window.setTimeout(() => playNotice(n), 700 + k * 900));
}

function playNotice(n: Notice): void {
  const top = { x: window.innerWidth / 2, y: window.innerHeight * 0.3 };
  const tab = visibleOr(null, 'charms');
  if (n.kind === 'ready') {
    sfx.rare();
    floatText(top.x, top.y, `${CHARMS[n.id].name} 解放！`, { cls: 'gold', size: 1.2, dur: 1800 });
    floatText(top.x, top.y + 34, '次の年貢で選べる', { size: 0.7, dur: 1800 });
    burst(top.x, top.y, [art(n.id), '✨', '⭐'], 14, 110);
    pop(tab, 1.2);
  } else if (n.kind === 'got') {
    sfx.charmGet();
    sfx.rare();
    flash('#ffe680', 400);
    void slamText(`${CHARMS[n.id].name}！`, { size: 0.7, dur: 1500 });
    burst(top.x, top.y + 40, [art(n.id), '✨', '🌟'], 18, 140);
    vibrate([40, 30, 80]);
    pop(tab, 1.3);
  } else if (n.kind === 'golden') {
    sfx.fever();
    flash('#ffd84a', 500);
    void slamText(`✦ ${CHARMS[n.id].name} 金色！`, { size: 0.6, dur: 1500 });
    coinRain(20);
  } else if (n.kind === 'evolve') {
    const plot = el.field.children[n.cell];
    if (!plot) return;
    const q = center(plot);
    sfx.newReel();
    sfx.rare();
    burst(q.x, q.y, ['✨', '🌟', '⭐'], 16, 90);
    pop(plot, 1.3);
    floatText(q.x, q.y - 30, `${PLACES[n.to].name}に進化！`, { cls: 'gold', size: 1, dur: 1600 });
  } else if (n.kind === 'jackpot') {
    sfx.fever();
    coinRain(50);
    confetti(40);
    void slamText('豊年満作!!', { dur: 1500 });
    const f = center(el.field);
    void rollNumber(f.x, f.y + 40, n.amount, { prefix: '+', size: 1.1, hold: 700, rise: true });
  }
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
  if (state.priceMult > 1) chips.push(`<span class="st merchant">🧑‍🌾 今日の売値 ×${fmtMult(state.priceMult)}</span>`);
  if (state.cloverBoost > 1) chips.push(`<span class="st clover">🍀 明日は金の種が出やすい（×${fmtMult(state.cloverBoost)}）</span>`);
  el.status.innerHTML = chips.join('');
}

function renderCharms(): void {
  const owned = CHARM_ORDER.filter((id) => state.charms[id] > 0);
  el.charmPanel.hidden = owned.length > 0;
  el.charmCount.textContent = state.stock.length ? `置く待ち${state.stock.length}` : owned.length ? `${owned.reduce((n, id) => n + state.charms[id], 0)}個` : '';
  el.charms.innerHTML = owned
    .map((id) => {
      const c = CHARMS[id];
      const n = state.charms[id];
      const gold = isGolden(state, id);
      return `<span class="charm tier-${c.tier}${gold ? ' golden' : ''}${c.special ? ' special' : ''}" data-charm="${id}"><span class="e">${art(id)}</span><span><b>${c.name}${n > 1 ? ` ×${n}` : ''}${gold ? ' ✦' : ''}</b><small>${c.desc(gold ? n * 2 : n)}</small></span></span>`;
    })
    .join('');
}

/** 今週の注文：畑の囲いに下げた木の札。作物の絵と「2/5」だけ、タップで詳しく */
function renderOrder(): void {
  const o = state.order;
  el.order.hidden = !o;
  if (!o) return;
  el.order.className = `order-tag${o.done ? ' done' : ''}`;
  el.order.innerHTML = `<small>注文</small><span class="order-ico">${art(FRUIT[o.crop])}</span><b>${o.done ? '✓' : `${o.have}/${o.need}`}</b>`;
}

/** 年貢：「年貢 7金 あと2日」を言葉で。払えるときは緑、足りないときは赤 */
function renderTax(): void {
  const t = nextTax(state);
  const short = state.gold < t.amount;
  const warn = short && t.daysLeft <= CONFIG.taxWarnDays;
  el.tax.className = `hud-tax${warn ? ' warn' : ''}${short ? ' short' : ' ok'}${state.difficulty ? ' hard' : ''}`;
  el.tax.innerHTML =
    `<span class="tax-label">${art('bale')}年貢</span><b>${t.amount}金</b>` +
    `<span class="tax-when">${t.daysLeft === 0 ? '今日まで' : `あと${t.daysLeft}日`}</span>` +
    `<span class="tax-mark">${short ? '足りない' : '払える'}</span>`;
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
  // 手元に置く物があっても、置ける空きマスがないときは案内しない（空いたら出す）
  if (state.stock.length && selected === null && state.field.some((_, i) => canPlace(state, i))) {
    const d = PLACES[state.stock[0]];
    el.hint.className = 'hint place';
    el.hint.textContent = `👆 ${d.name}を置く`;
    return;
  }
  if (state.day > 0 && t.daysLeft <= CONFIG.taxWarnDays && state.gold < t.amount) {
    // 不足は年貢の札が示すので、ここでは打てる手だけを言う
    const ripe = state.field.some(isRipe);
    el.hint.className = ripe ? 'hint danger' : 'hint';
    el.hint.textContent = ripe ? '🍅 売って年貢へ' : '';
    if (ripe) return;
  }
  if (state.day > CONFIG.hintUntilDay) {
    el.hint.textContent = !done.line && hasRipeGroup() ? '✨ 列！ タップで売る' : '';
    return;
  }
  const anyRipe = state.field.some(isRipe);
  let text = '';
  if (!done.spin) text = '👇 リールをタップで回す';
  else if (selected !== null) {
    const r = state.results[selected];
    const shape = SYMBOLS[r.symbol].shape;
    text = r.total > 1 ? `👆 植える ×${r.left}` : shape ? `👆 ${SHAPE_NAMES[shape]}に効く` : '👆 マスを選ぶ';
  }
  else if (!done.line && hasRipeGroup()) text = '✨ 列！ タップで売る';
  else if (!done.use && usableReels().length > 0) text = '👆 光る出目 → マス';
  else if (!done.sell && anyRipe) text = '🍅 3つ並べると高く売れる';
  else if (!done.buy && UPGRADES.some((u) => canBuy(state, u.id))) text = '💰 ショップへ';
  else if (!done.next && done.spin && usableReels().length === 0) text = '👇 リールをタップで次の日へ';
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
  if (r.used) return { text: '', cls: 'used' };
  if (selected === i) return { text: '', cls: 'selected' };
  if (canUse(state, i, null)) return { text: '', cls: 'usable' };
  return { text: '', cls: 'dead' };
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
    // 札：自動の出目は結果を短く、手動の出目は効く形の絵（3×3のマス目）
    const shape = r ? SYMBOLS[r.symbol].shape : undefined;
    const tagEl = b.querySelector('.tag') as HTMLElement;
    const html = tag.text ? `${fever ? (badFever ? '⚠️' : '🔥') : ''}${tag.text}` : shape && !r!.used ? shapeIcon(shape) : '';
    if (tagEl.innerHTML !== html) tagEl.innerHTML = html;
    tagEl.classList.toggle('empty', !html);
    tagEl.classList.toggle('shape', !tag.text && !!shape);
    renderCount(b, i);
    b.setAttribute('aria-label', r ? `${SYMBOLS[r.symbol].name}: ${tag.text}` : 'リール');
  });
}

/** 出目の効く形を3×3のマス目で描く（光っているマスに効く） */
function shapeIcon(shape: string): string {
  const on = (x: number, y: number): boolean =>
    shape === 'all' ||
    (shape === 'cross' && (x === 1 || y === 1)) ||
    (shape === 'column' && x === 1) ||
    (shape === 'row' && y === 1) ||
    (shape === 'x' && (x === y || x + y === 2));
  const cells = Array.from({ length: 9 }, (_, k) => `<i class="${on(k % 3, Math.floor(k / 3)) ? 'on' : ''}"></i>`).join('');
  return `<span class="shape-icon" aria-label="${SHAPE_NAMES[shape as keyof typeof SHAPE_NAMES]}">${cells}</span>`;
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

/** 回せるとき（出目を使い切った・1日目）はリール窓が光り「タップで回す」の帯が出る */
function renderSpinButton(): void {
  const t = nextTax(state);
  el.spin.disabled = busy || state.over;
  const ready = !busy && !state.over && (state.day === 0 || usableReels().length === 0);
  el.machine.classList.toggle('ready-spin', ready);
  el.machine.classList.toggle('taxday', state.day > 0 && t.daysLeft === 0);
  // 筐体の看板の文字を、回せるときだけ「タップで回す」に切り替える
  const cue = document.querySelector('.machine-top') as HTMLElement;
  cue.classList.toggle('cue', ready);
  cue.innerHTML = !ready
    ? `${art('coin')} 畑スロット ${art('coin')}`
    : state.day === 0
    ? '▼ タップで回す ▼'
    : t.daysLeft === 0
      ? `▼ タップで年貢 ${t.amount}金を納めて回す ▼`
      : `▼ タップで${state.day + 1}日目へ ▼`;
}

/** 道具・特別なマスの絵 */
const PLACE_ART: Record<PlaceId, ArtId> = {
  scarecrow: 'scarecrow', bigScarecrow: 'bigScarecrow', well: 'well', goldenWell: 'goldenWell',
  hive: 'hive', queenHive: 'queenHive', compost: 'compost', water: 'water',
};

/** マスに最後に書いた中身（同じなら書き換えない：押している最中に中身が入れ替わるとクリックが消える） */
const plotHtml = new WeakMap<Element, string>();

/** 形で効く出目を選んでいるとき、指しているマスに効く範囲を見せる */
let previewCell: number | null = null;

function previewCells(): number[] {
  if (selected === null || previewCell === null) return [];
  const shape = SYMBOLS[state.results[selected].symbol].shape;
  return shape ? shapeCells(state, shape, previewCell) : [];
}

function renderField(): void {
  const placeable = state.stock.length ? state.field.flatMap((_, i) => (canPlace(state, i) ? [i] : [])) : [];
  const targets = selected !== null ? validTargets(state, selected) : placeable.length ? placeable : null;
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
      // 空きマスでは中央に大きな名札を出すので、角の札は作物が乗っているときだけ
      // 水路は土の色（青）で分かるので、作物が乗っているときは印を出さない
      // 特別なマスは土の色で分かるので、作物・道具が乗っているときは印を出さない
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
        html += inLine ? `<span class="badge-line">列 ×${fmtMult(mult)}</span>` : `<span class="badge-single">単品 ×${fmtMult(singleMult(state))}</span>`;
        label = `${def.name} 実、タップで${price}金で売る${inLine ? '（列ごと）' : '（単品は半値）'}`;
      } else {
        html += `<span class="pips">${Array.from({ length: def.ripe }, (_, k) => `<i class="pip${k < crop.growth ? ' on' : ''}"></i>`).join('')}</span>`;
        label = `${def.name} ${STAGE_NAMES[stageOf(crop)]}（あと${def.ripe - crop.growth}で実る）`;
      }
    } else if (state.weeds[i]) {
      cls.push('weedy');
      html += `<span class="crop">${art('weed')}</span><span class="pull">${weedCost(state) ? `抜く ${weedCost(state)}金` : '抜く'}</span>`;
      label = `雑草、タップで抜く（${weedCost(state)}金）`;
    } else {
      html += tile
        ? `<span class="tile-label"><span class="tile-ico">${art(PLACE_ART[tile])}</span>${PLACES[tile].name.replace('のマス', '')}<small>${tile === 'water' ? '毎日 成長+1' : '売値 ×2'}</small></span>`
        : '<span class="empty">空き</span>';
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
    // innerHTML は書いた文字列と読み出しが一致しないことがあるので、前回書いた中身と比べる
    if (plotHtml.get(b) !== html) {
      b.innerHTML = html;
      plotHtml.set(b, html);
    }
    b.setAttribute('aria-label', label);
  });
}

/** ショップの値段の札。買えるときは緑の値段、足りないときは灰色の値段と不足額 */
function costHtml(price: number | null, affordable: boolean): string {
  if (price === null) return '<span class="cost done">完了</span>';
  return affordable
    ? `<span class="cost"><b>${price}金</b></span>`
    : `<span class="cost"><b>${price}金</b><small>あと${price - state.gold}</small></span>`;
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
    if (u.id === 'addMoon') return true;
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
    const ico = upgradeArt(u.id);
    const html = `<span class="ico">${ico}</span><span class="text"><span class="name">${u.name}${weekly ? '<span class="weekly-tag">週替わり</span>' : ''}</span><span class="effect">${upgradeEffect(u.id)}</span></span>${costHtml(available ? price : null, affordable)}`;
    if (b.innerHTML !== html) b.innerHTML = html;
  });
}

// ---- 空（昼夜と季節）・年貢前の鼓動 ----

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
let heartTimer = 0;

/** 1週（年貢1回分）で季節が進み、週の中で朝→昼→夕方→夜（年貢の日）と空が変わる */
function renderSky(): void {
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
function buildAmbient(season: (typeof SEASONS)[number]): void {
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

/** 年貢が明日までなのにお金が足りないとき：画面のふちが赤く脈打ち、鼓動が鳴る */
function renderDanger(): void {
  const t = nextTax(state);
  const danger = state.day > 0 && !state.over && t.daysLeft <= 1 && state.gold < t.amount;
  document.documentElement.classList.toggle('tax-danger', danger);
  if (danger && !heartTimer) {
    sfx.heartbeat();
    heartTimer = window.setInterval(() => {
      if (!busy) sfx.heartbeat();
    }, 1100);
  } else if (!danger && heartTimer) {
    clearInterval(heartTimer);
    heartTimer = 0;
  }
}

/** 畑が広がった演出（お守り「開墾」） */
function showExpanded(): void {
  sfx.bigBuy();
  flash('#c8f0a0', 400);
  const f = center(el.field);
  burst(f.x, f.y, ['🌱', '✨', '⭐'], 18, 160);
  floatText(f.x, f.y, `畑が広がった！ ${state.cols}×${state.rows}`, { cls: 'good', size: 1.2, dur: 1500 });
  fieldCells().forEach((c) => pop(el.field.children[c], 1.08));
}

/** 畑のショップ：道具・特別なマス */
function renderFarmShop(): void {
  const items: { key: string; ico: string; name: string; effect: string; price: number | null; ok: boolean }[] = [];
  const ep = expandPrice(state);
  const nextCols = state.cols <= state.rows ? state.cols + 1 : state.cols;
  const nextRows = state.cols <= state.rows ? state.rows : state.rows + 1;
  items.push({
    key: 'expand',
    ico: art('expand'),
    name: '畑を広げる',
    effect: ep === null ? 'これ以上は広げられない（5×5）' : `${state.cols}×${state.rows} → ${nextCols}×${nextRows}`,
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
    const html = `<span class="ico">${it.ico}</span><span class="text"><span class="name">${it.name}</span><span class="effect">${it.effect}</span></span>${costHtml(it.price, it.ok)}`;
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
      say(price === null ? '最大' : `${price - state.gold}金たりない`);
      return;
    }
    closeSheet();
    render();
    showExpanded();
    return;
  }
  if (!buyPlace(state, key)) {
    sfx.error();
    shake(card, 4);
    say(`${(placePrice(state, key) ?? 0) - state.gold}金たりない`);
    return;
  }
  sfx.buy();
  selected = null;
  closeSheet();
  render();
  say(`👆 ${PLACES[key].name}を置く`);
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
  // 出目が残っているときは確認を出す（はい→armedNextDay を立てて回す）
  const leftover = state.day > 0 ? usableReels().length : 0;
  if (leftover > 0 && !armedNextDay) {
    sfx.error();
    confirmSkip(leftover);
    return;
  }
  if (state.day > 0) done.next = true;
  armedNextDay = false;
  // リール窓がガコンと押し込まれる
  el.reels.parentElement!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(4px) scale(0.98)' }, { transform: 'translateY(0)' }], { duration: 220 });
  // 前の日のフリーズの名残（虹の枠・ひび）を片付ける
  el.machine.classList.remove('rainbow', 'burning');
  el.machine.querySelector('.crack')?.remove();
  selected = null;
  busy = true;
  done.spin = true;
  renderSpinButton();
  renderReelStates();

  const res = endDay(state, rng);
  autoOutcome = {};
  if (res.tax !== null) {
    if (res.ok) track('progress', state, { tax: res.tax });
    await showTaxStamp(res.tax, res.ok);
    if (!res.ok) {
      await witherField();
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

/** 年貢が払えず終わるとき、畑が枯れていく */
async function witherField(): Promise<void> {
  document.documentElement.classList.remove('tax-danger');
  sfx.wither();
  el.field.classList.add('withered');
  const f = center(el.field);
  burst(f.x, f.y, ['🍂', '🍂', '💨'], 14, 150);
  await sleep(1600);
}

async function showTaxStamp(amount: number, ok: boolean): Promise<void> {
  // 役人が拍子木を鳴らしてやって来て、印を押す
  const official = document.createElement('div');
  official.className = `official${ok ? '' : ' angry'}`;
  official.innerHTML = `<span class="official-body">${art('official')}</span><span class="official-say">${ok ? '年貢を納めよ！' : '年貢が足りぬ！'}</span>`;
  document.body.appendChild(official);
  sfx.official();
  official.animate([{ transform: 'translateX(120%)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  await sleep(isCalm() ? 450 : 900);
  official.querySelector('.official-body')!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px) rotate(-8deg)' }, { transform: 'translateY(0)' }], { duration: 260 });
  window.setTimeout(() => {
    official.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(130%)' }], { duration: 400, easing: 'ease-in', fill: 'forwards' }).onfinish = () => official.remove();
  }, 1500);
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
    floatText(window.innerWidth / 2, window.innerHeight * 0.4, state.cleared ? `年貢${state.taxesPaid}回 納付！` : `★${state.taxesPaid}/${CONFIG.winTaxes} あと${CONFIG.winTaxes - state.taxesPaid}回でクリア`, { cls: 'good', size: 1.1 });
    await sleep(500);
    const added = state.lastObstacles;
    if (added.length) {
      render();
      const c = center(visibleOr(el.bag.querySelector(`[data-sym="${added[0]}"]`), 'bag'));
      const names = [...new Set(added)].map((s) => `${SYMBOLS[s].name}${added.filter((x) => x === s).length > 1 ? `×${added.filter((x) => x === s).length}` : ''}`).join('・');
      floatText(c.x, c.y - 20, `${names}が袋に増えた…`, { cls: 'bad', size: 0.8 });
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
      <p class="sub">重ねると強くなる</p>
      <div class="charm-choices">
        ${offer
          .map((id) => {
            const c = CHARMS[id];
            const n = state.charms[id];
            // 3個目で金色（効果2倍）
            const toGold = c.max >= CONFIG.goldenAt && n + 1 === CONFIG.goldenAt;
            return `<button class="charm-card tier-${c.tier}${c.special ? ' special' : ''}${toGold ? ' golden' : ''}" data-charm="${id}" disabled>
              <span class="tier">${c.special ? '特別' : CHARM_TIER_NAMES[c.tier]}</span>
              <span class="e">${art(id)}</span>
              <b>${c.name}${n > 0 ? ` <span class="lv">${n}→${n + 1}</span>` : ''}</b>
              <small>${toGold ? '✦金色に！ ' : ''}${c.desc(toGold ? (n + 1) * 2 : n + 1)}</small>
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
          if (CHARM_PLACE[id]) say(`👆 ${PLACES[CHARM_PLACE[id]!].name}を置く`, 3000);
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
    speedLines(1400, 'rgba(60,0,90,0.55)');
    await slamText('群れ!!', { cls: 'bad', dur: 1100 });
    banner.className = 'fever-banner bad';
    banner.innerHTML = `⚠️ ${symbols.map((s) => `${SYMBOLS[s].name}の群れ`).join('・')}！<small>${lines}</small>`;
  } else {
    sfx.fever();
    flash('#ff9ad5', 600);
    vibrate([50, 40, 50, 40, 120]);
    // 枠が燃え、集中線の中に「FEVER!!」を叩きつけ、金貨が降る
    el.machine.classList.add('burning');
    speedLines(2200, 'rgba(255,200,60,0.6)');
    shake(el.app, 10);
    coinRain(45);
    await slamText('FEVER!!', { dur: 1200 });
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
        floatText(mid.x, mid.y, `${name}！ 今日の売値×${fmtMult(ev.mult)}`, { cls: 'gold', size: 1.1 });
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
    // どの役にも大当たりの金貨が付く。金額は下からせり上がって桁ごとに止まる
    sfx.rare();
    const m = center(el.reels);
    shake(el.app, shakeFor(ev.jackpot));
    scanlines(Math.min(1, ev.jackpot / 120));
    const roll = rollNumber(m.x, m.y - 10, ev.jackpot, { prefix: '大当たり +', size: ev.role === 'jackpot' ? 1.2 : 0.95, hold: 400, rise: true });
    flyTo(m, el.goldBox, '🪙', Math.min(12, 3 + Math.ceil(ev.jackpot / 8)), () => setGold(state.gold));
    if (ev.role === 'jackpot') {
      confetti(50);
      coinRain(40);
    }
    await roll;
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
      autoOutcome[i] = `売値×${fmtMult(ev.mult)}`;
      sfx.merchant();
      burst(from.x, from.y, ['💰', '✨', '🪙'], 10, 70);
      floatText(from.x, from.y - 40, `今日の売値 ×${fmtMult(ev.mult)}！`, { cls: 'gold', size: 0.9 });
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

/** 出目を残したまま次の日へ進むかの確認 */
function confirmSkip(left: number): void {
  el.overlay.innerHTML = `
    <div class="modal confirm-modal" role="dialog" aria-label="確認">
      <h2>出目が${left}つ残っています</h2>
      <p class="sub">使わずに次の日へ進むと消えます</p>
      <button class="primary" id="skip-yes">次の日へ</button>
      <button class="secondary" id="skip-no">もどる</button>
    </div>`;
  el.overlay.classList.add('show');
  const close = () => {
    el.overlay.classList.remove('show');
    el.overlay.innerHTML = '';
  };
  $('skip-yes').addEventListener('click', () => {
    close();
    armedNextDay = true;
    void onSpin();
  });
  $('skip-no').addEventListener('click', () => {
    close();
    sfx.cancel();
    // 使える出目を光らせて知らせる
    usableReels().forEach((k) => pop(el.reels.children[k], 1.12));
  });
}

function onReelTap(i: number): void {
  unlockAudio();
  if (busy || state.over) return;
  const r = state.results[i];
  // 1日目の前と、使える出目がない（使い切った・使えない・自動）リールのタップは「回す」
  if (!r || state.day === 0) {
    void onSpin();
    return;
  }
  const def = SYMBOLS[r.symbol];
  if (def.kind === 'auto' || r.used || !canUse(state, i, null)) {
    if (selected !== null) {
      selected = null;
      render();
    }
    void onSpin();
    return;
  }
  if (selected === i) {
    selected = null;
    sfx.cancel();
    render();
    return;
  }
  if (def.shape === 'all') {
    applyMoon(i);
    return;
  }
  selected = i;
  armedNextDay = false;
  sfx.select();
  say(def.name);
  render();
}

/** 満月：出目をタップするだけで畑の全作物が育つ */
function applyMoon(i: number): void {
  const affected = useSymbol(state, i, null) ?? [];
  done.use = true;
  armedNextDay = false;
  sfx.rare();
  flash('#fff4b8', 500);
  const f = center(el.field);
  burst(f.x, f.y, ['🌟', '✨', '⭐'], 16, 160);
  floatText(f.x, f.y - 60, '満月！ 全作物＋1', { cls: 'gold', size: 1.1 });
  render();
  afterGrowth(affected, '+1');
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
      say(SEEDS[sym] ? '空きマスへ' : SYMBOLS[sym].shape ? '範囲に作物なし' : !crop ? '作物なし' : '肥料済み');
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
      if (left > 0 && selected === null) say('空きマスなし');
    } else if (sym === 'fertilizer' && left > 0) {
      sfx.fertilizer();
      floatText(p.x, p.y - 20, '売値×2！（あと1つ）', { cls: 'combo', size: 0.9 });
    } else if (sym === 'rain') {
      sfx.rain();
      rainShower(shapeCells(state, 'cross', cell).map((c) => el.field.children[c]));
      afterGrowth(affected, `+${CONFIG.rainGrowth * power}`);
    } else if (sym === 'sun') {
      sfx.sun();
      sunBeam(shapeCells(state, 'column', cell).map((c) => el.field.children[c]));
      shapeCells(state, 'column', cell).forEach((c, k) => {
        const q = center(el.field.children[c]);
        window.setTimeout(() => burst(q.x, q.y, ['✨'], 4, 36), 200 + k * 70);
      });
      flash('#fff3a0', 300);
      afterGrowth(affected, `+${CONFIG.sunGrowth * power + state.charms.sunBlessing}`);
    } else if (sym === 'bee') {
      sfx.bee();
      beeFlight(shapeCells(state, 'x', cell).map((c) => el.field.children[c]), symHtml('bee'));
      shapeCells(state, 'x', cell).forEach((c, k) => {
        const q = center(el.field.children[c]);
        window.setTimeout(() => burst(q.x, q.y, ['🌼'], 3, 30), k * 220);
      });
      afterGrowth(affected, `+${CONFIG.beeGrowth * power}`);
      if (left > 0 && selected === null) say('使える場所なし');
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
    say(`❄️ ${state.frost[cell]}日`);
    return;
  }
  if (state.weeds[cell]) {
    if (!pullWeed(state, cell)) {
      sfx.error();
      shake(plot, 4);
      say(`${weedCost(state)}金たりない`);
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
    const ev = TOOL_EVOLVE[tool];
    say(`${PLACES[tool].name}：${PLACES[tool].desc}${ev ? `（進化 ${state.toolXp[cell]}/${ev.need}）` : ''}`);
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
    say(`${def.name} ${def.price}金`);
  } else {
    say(state.stock.length ? '置けない' : '空き');
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
        sfx.pon();
        plot.classList.add('just-ripe');
        window.setTimeout(() => plot.classList.remove('just-ripe'), 700);
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
  if (res.line) goldHeld++;
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
    void playLineHarvest(res, centers, p).finally(() => {
      goldHeld = Math.max(0, goldHeld - 1);
      if (!goldHeld) setGold(state.gold);
    });
  } else {
    sfx.sell(price, combo);
    const size = Math.min(2, 0.8 + price / 25);
    floatText(p.x, p.y - 10, `+${price}`, { cls: 'gold', size, rise: big ? 110 : 70 });
    floatText(p.x, p.y + 18, `単品（半値）`, { size: 0.6, dur: 900 });
    burst(p.x, p.y, big ? ['🪙', '✨', '🌟', '💰'] : ['🪙', '✨'], big ? 22 : 8, big ? 140 : 60);
  }
  if (combo >= 2) floatText(p.x, p.y - 60, `COMBO ×${combo}`, { cls: 'combo', size: 0.7 + Math.min(combo, 6) * 0.08, dur: 900 });
  if (res.line) return;
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

/**
 * 列の収穫：ヒットストップ → 倍率を1つずつ乗せる → 作物が跳ねて財布へ（大きいほどスロー）→ 合計が桁ごとに回る
 */
async function playLineHarvest(res: SellResult, centers: { x: number; y: number }[], p: { x: number; y: number }): Promise<void> {
  const level = Math.min(res.lines, 4);
  const slow = slowFactor(level - 1);
  const f = center(el.field);
  // 売った実は畑から消えるので、跳ねるまでその場に残して見せる
  const ghosts = res.cells.map(({ cell: c, kind }) => {
    const g = document.createElement('div');
    g.className = 'fx fx-ghost';
    g.innerHTML = art(FRUIT[kind]);
    g.style.left = `${centers[c].x}px`;
    g.style.top = `${centers[c].y}px`;
    g.style.fontSize = `${(el.field.children[c] as HTMLElement).clientWidth * 0.62}px`;
    $('fx').appendChild(g);
    return g;
  });
  if (level >= 2) {
    await hitStop(90);
    flash('#ffffff', 250);
    speedLines(1600 + level * 300, level >= 3 ? 'rgba(255,216,74,0.6)' : 'rgba(255,255,255,0.55)');
  }
  sfx.lineHarvest();
  const name = ['', '一列そろい！', '二列そろい！！', '大収穫！！！', 'ほぼ全部！！！！'][level];
  floatText(f.x, f.y - 90, name, { cls: 'combo', size: 1.1 + level * 0.2, rise: 60, dur: 1500 + level * 300 });
  await stackMultipliers(f.x, Math.max(90, p.y - 60), res.steps);
  // 作物が1つずつ跳ねて財布に吸い込まれる
  const arrivals = res.cells.map(({ cell: c, price: each, kind }, k) =>
    new Promise<void>((resolve) => {
      window.setTimeout(() => {
        const q = centers[c];
        sfx.sell(each, combo + k);
        ghosts[k].remove();
        pop(el.field.children[c], 1.2);
        floatText(q.x, q.y - 10, `+${each}`, { cls: 'gold', size: Math.min(1.6, 0.8 + each / 30) });
        burst(q.x, q.y, ['✨', '🌟'], 6, 50);
        flyTo(q, el.goldBox, art(FRUIT[kind]), 1, () => {
          sfx.coin();
          pop(el.goldBox, 1.3);
          resolve();
        });
      }, k * 150 * slow);
    }),
  );
  await Promise.all(arrivals);
  ghosts.forEach((g) => g.remove());
  setGold(state.gold);
  // 合計が桁ごとに回って止まる
  const amount = res.total;
  shake(el.app, shakeFor(amount));
  scanlines(Math.min(1, amount / 250));
  vibrate(level >= 2 ? [40, 30, 120] : [30, 20, 60]);
  if (level >= 2) confetti(20 + level * 20);
  if (level >= 3) coinRain(30 + level * 10);
  await rollNumber(f.x, f.y, amount, { prefix: '+', size: 0.9 + level * 0.15, hold: 500 + level * 150 });
}

// ---- 強化 ----

function onBuy(id: UpgradeId): void {
  unlockAudio();
  if (busy || state.over) return;
  const card = el.shop.querySelector(`[data-id="${id}"]`) as HTMLElement;
  if (!upgradeAvailable(state, id)) {
    say('最大');
    shake(card, 3);
    return;
  }
  if (!canBuy(state, id)) {
    sfx.error();
    shake(card, 4);
    say(`${upgradePrice(state, id) - state.gold}金たりない`);
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
  document.documentElement.classList.remove('tax-danger');
  clearInterval(heartTimer);
  heartTimer = 0;
  state.over = true;
  const best = loadBest();
  const isNew = state.day > (best.day ?? 0);
  if (isNew) saveBest({ day: state.day, taxes: state.taxesPaid });
  const t = nextTax(state);
  const earned = awardPoints(meta, state);
  track('result', state, { end: endedAfterClear ? 'clear' : 'tax', tax: t.amount, points: earned, difficulty: state.difficulty });
  const newly = recordRun(meta, state, true);
  el.overlay.innerHTML = `
    <div class="modal over-modal" role="dialog" aria-label="ゲームオーバー">
      <div class="big">${state.cleared ? '🏆' : '🏚️'}</div>
      <h2>${endedAfterClear ? 'クリア！' : state.cleared ? 'エンドレス終了' : '年貢が払えなかった…'}</h2>
      <div class="over-stats">
        <span>${art('calendar')}<b>${state.day}</b>日${isNew ? '<em>最高！</em>' : ''}</span>
        <span>${art('bale')}<b>${state.taxesPaid}</b>回</span>
        <span>${art('coin')}<b>${state.stats.totalEarned}</b>金</span>
      </div>
      <div class="points-earned">${art('sprout')} <b>+${earned}pt</b><small>計 ${meta.points}pt</small></div>
      ${newly.length ? `<div class="newly">${art('sparkle')} 解放：${newly.map((x) => `<b>${x}</b>`).join('')}</div>` : ''}
      <div class="share-row">
        <button class="secondary" id="share">${typeof navigator.share === 'function' ? '📤 シェア' : '📋 コピー'}</button>
        ${FEEDBACK_URL ? `<a class="secondary" href="${FEEDBACK_URL}" target="_blank" rel="noopener">✉️ 感想</a>` : ''}
      </div>
      <button class="primary" id="restart" disabled>タイトルへ</button>
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
  showTitle();
}

function resultText(endedAfterClear: boolean): string {
  const head = state.cleared ? (endedAfterClear ? '🏆 クリア！' : `🏆 クリア後エンドレスで${state.day}日目まで`) : `${state.day}日目まで`;
  const charms = state.stats.charms.map((c) => CHARMS[c.id].emoji).join('');
  return [
    `🌾畑スロット ${head}`,
    `年貢 ${state.taxesPaid}回納付 / 総収入 ${state.stats.totalEarned}金 / リール${state.reels}本`,
    charms ? `お守り ${charms}` : '',
    `フィーバー${state.stats.fevers}回・列${state.stats.lineHarvests}回`,
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
    say('コピーした');
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
    <ul class="help-list icons">
      <li>${art('calendar')}<span>1回転＝1日</span></li>
      <li>${art('seed')}<span>光る出目 → マスをタップ</span></li>
      <li>${art('rain')}<span>雨＝縦横十字　${art('sun')}太陽＝縦一列　${art('bee')}蜂＝斜め　${art('moon')}満月＝全体</span></li>
      <li>${art('tomato')}${art('tomato')}${art('tomato')}<span>縦・横・斜めに3つ＝高く売れる（単品は½）</span></li>
      <li>${art('bale')}<span>${CONFIG.taxPeriod}日ごとに年貢。払えないと終わり／${CONFIG.winTaxes}回でクリア</span></li>
      <li>${art('coinPurse')}<span>年貢のあと：お守り1つ＋お邪魔が増える</span></li>
      <li>${art('bargain')}<span>ショップ：絵柄・道具・畑を広げる</span></li>
      <li>${art('sprout')}<span>遊ぶほどポイント → 解放</span></li>
    </ul>`;
  const symbols = SYMBOL_ORDER.map((id) => {
    const d = SYMBOLS[id];
    return `<div class="dex-row${d.rarity === 'bad' ? ' bad' : ''}"><span class="e">${symHtml(id)}</span>
      <div><b>${d.name}</b> <span class="tag-k">${d.kind === 'manual' ? '手動' : '自動'}</span>
      <small>${d.desc}</small><small class="fv">フィーバー：${d.feverDesc}</small></div>
      <span class="own">袋に${state.bag[id]}枚</span></div>`;
  }).join('');
  const charms = CHARM_ORDER.map((id) => {
    const c = CHARMS[id];
    if (c.special && !meta.discovered.includes(id) && !state.charms[id]) {
      return `<div class="dex-row locked"><span class="e silhouette">${art(id)}</span><div><b>？？？</b><small>${c.special.hint}</small></div></div>`;
    }
    const locked = id in META.charmUnlock && !meta.unlockedCharms.includes(id);
    return `<div class="dex-row tier-${c.tier}${locked ? ' locked' : ''}"><span class="e">${art(id)}</span>
      <div><b>${c.name}</b> <span class="tag-k">${CHARM_TIER_NAMES[c.tier]}</span>
      <small>${c.desc(1)}${Number.isFinite(c.max) ? `（最大${c.max}個）` : ''}</small>
      ${locked ? `<small class="fv">🔒 解放 ${META.charmUnlock[id]}pt</small>` : ''}</div>
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
  recordRun(meta, state, false);
  sfx.bigBuy();
  confetti(80);
  // 大花火
  const colors = ['#ff5a5a', '#ffd84a', '#5ad1ff', '#b98bff', '#7dff8a', '#ff8fd8'];
  for (let k = 0; k < 10; k++) {
    window.setTimeout(() => {
      sfx.firework();
      firework(window.innerWidth * (0.15 + Math.random() * 0.7), window.innerHeight * (0.12 + Math.random() * 0.25), colors[k % colors.length]);
    }, k * 380);
  }
  flash('#ffe680', 700);
  vibrate([60, 40, 60, 40, 200]);
  el.overlay.innerHTML = `
    <div class="modal clear-modal" role="dialog" aria-label="クリア">
      <div class="big">🏆</div>
      <h2>クリア！</h2>
      <div class="record">${state.day}日目でクリア / 総収入 ${state.stats.totalEarned}金</div>
      <p class="sub">+${META.clearBonus}pt</p>
      <button class="primary" id="clear-continue" disabled>エンドレスへ</button>
      <button class="secondary" id="clear-end" disabled>ここで終える</button>
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
  el.field.classList.remove('withered');
  if (resume) Object.keys(done).forEach((k) => (done[k as keyof typeof done] = true));
  else clearRun();
  selected = null;
  armedNextDay = false;
  if (!resume) done.spin = false;
  el.overlay.classList.remove('show', 'title');
  el.overlay.innerHTML = '';
  el.reels.innerHTML = '';
  el.shop.innerHTML = '';
  render();
}

// ---- 準備画面（解放とショップの組み合わせ） ----

const ADD_EMOJI = Object.fromEntries(UPGRADES.map((u) => [u.id, upgradeArt(u.id)]));
const ADD_NAME = Object.fromEntries(UPGRADES.map((u) => [u.id, u.name]));

/** 準備画面の短い名前（「〜を足す」は見出しで分かるので省く） */
function shortName(id: keyof typeof META.adds): string {
  return ADD_NAME[id].replace(/を足す$/, '');
}

/** スタート画面：スタート（と続きから）だけ。強化の解放は小さなボタンから */
function showTitle(): void {
  const saved = loadRun();
  el.overlay.innerHTML = `
    <div class="title-screen" role="dialog" aria-label="畑スロット">
      <div class="title-logo">
        <span class="title-art">${art('tomato')}${art('coin')}${art('corn')}</span>
        <h1>畑スロット</h1>
      </div>
      <div class="title-actions">
        <button class="primary title-start" id="title-start">スタート</button>
        ${saved ? `<button class="secondary" id="title-resume">続きから <small>${saved.day}日目</small></button>` : ''}
      </div>
      <div class="title-sub">
        <button class="icon-pill" id="title-unlock">${art('lock')}<span>解放</span><b>${meta.points}pt</b></button>
        <button class="icon-pill" id="title-help">?<span>遊び方</span></button>
      </div>
    </div>`;
  el.overlay.classList.add('show', 'title');
  $('title-start').addEventListener('click', () => {
    unlockAudio();
    sfx.select();
    showPrep();
  });
  document.getElementById('title-resume')?.addEventListener('click', () => {
    unlockAudio();
    sfx.select();
    startGame(saved);
  });
  $('title-unlock').addEventListener('click', () => {
    unlockAudio();
    sfx.select();
    showUnlock();
  });
  $('title-help').addEventListener('click', () => {
    unlockAudio();
    showHelp('rules', showTitle);
  });
}

function leaveTitle(): void {
  el.overlay.classList.remove('title');
}

/** 図鑑：達成で解放されるもの。未達成は影絵と短いヒント */
function collection(): string {
  const item = (done: boolean, ico: string, name: string, hint: string) =>
    `<div class="prep-item${done ? ' on' : ' todo'}"><span class="e${done ? '' : ' silhouette'}">${ico}</span><b>${done ? name : '？？？'}</b><small>${done ? '✓' : hint}</small></div>`;
  const specials = CHARM_ORDER.filter((id) => CHARMS[id].special).map((id) =>
    item(meta.discovered.includes(id), art(id), CHARMS[id].name, CHARMS[id].special!.hint),
  );
  const adds = (Object.keys(ACHIEVE_ADDS) as (keyof typeof ACHIEVE_ADDS)[]).map((id) => {
    const done = meta.unlockedAdds.includes(id);
    const hint = id === 'addThunder' ? `列 ${Math.min(meta.lines, THUNDER_LINES)}/${THUNDER_LINES}` : ACHIEVE_ADDS[id]!.hint;
    return item(done, ADD_EMOJI[id], shortName(id), hint);
  });
  const levels = DIFFICULTIES.slice(1).map((d, k) => item(maxDifficulty(meta) >= k + 1, art('skull'), d.name, `${DIFFICULTIES[k].name}をクリア`));
  const skin = item(meta.skins.includes('gold'), art('coin'), '金色のスロット', '初めてクリアすると…？');
  return [...specials, ...adds, ...levels, skin].join('');
}

function skinItems(): string {
  return meta.skins
    .map((id) => `<button class="prep-item${meta.skin === id ? ' on' : ''}" data-skin="${id}"><span class="e">${art('coin')}</span><b>金色のスロット</b><small>${meta.skin === id ? '✓ 使う' : 'タップで使う'}</small></button>`)
    .join('');
}

/** 選んでいる見た目をスロットに反映 */
function applySkin(): void {
  el.machine.classList.toggle('skin-gold', meta.skin === 'gold');
}

/** 強化の解放（豊穣ポイントを使う）。スタート画面から開く */
function showUnlock(): void {
  leaveTitle();
  const paint = () => {
    const capPrice = nextCapacityPrice(meta);
    const adds = (Object.keys(META.adds) as (keyof typeof META.adds)[])
      .filter((id) => id !== 'addMoon' && !isAchieveAdd(id))
      .map((id) => {
        const def = META.adds[id];
        if (meta.unlockedAdds.includes(id)) {
          return `<div class="prep-item on"><span class="e">${ADD_EMOJI[id]}</span><b>${shortName(id)}</b><small>✓</small></div>`;
        }
        const can = meta.points >= def.unlock;
        return `<button class="prep-item locked${can ? ' unlockable' : ''}" data-unlock="${id}" ${can ? '' : 'disabled'}>
          <span class="e">${ADD_EMOJI[id]}</span><b>${shortName(id)}</b><small>${can ? '' : '🔒'}${def.unlock}pt</small></button>`;
      })
      .join('');
    const charms = (Object.keys(META.charmUnlock) as (keyof typeof META.charmUnlock)[])
      .map((id) => {
        const c = CHARMS[id];
        const price = META.charmUnlock[id]!;
        if (meta.unlockedCharms.includes(id)) {
          return `<div class="prep-item on"><span class="e">${art(id as ArtId)}</span><b>${c.name}</b><small>✓</small></div>`;
        }
        const can = meta.points >= price;
        return `<button class="prep-item locked${can ? ' unlockable' : ''}" data-charm="${id}" ${can ? '' : 'disabled'}>
          <span class="e">${art(id as ArtId)}</span><b>${c.name}</b><small>${can ? '' : '🔒'}${price}pt</small></button>`;
      })
      .join('');
    el.overlay.innerHTML = `
      <div class="modal prep-modal" role="dialog" aria-label="強化の解放">
        <h2>${art('lock')} 解放</h2>
        <div class="points"><b>${meta.points}pt</b></div>
        <h3>${art('seed')} 絵柄</h3>
        <div class="prep-grid">${adds}</div>
        <h3>${art('sunBlessing')} レアのお守り</h3>
        <div class="prep-grid">${charms}</div>
        <h3>${art('star')} 達成で解放</h3>
        <div class="prep-grid">${collection()}</div>
        ${meta.skins.length ? `<h3>${art('artisan')} 見た目</h3><div class="prep-grid">${skinItems()}</div>` : ''}
        <h3>${art('bargain')} 並べられる数</h3>
        ${capPrice !== null ? `<button class="secondary prep-cap" id="prep-cap" ${meta.points < capPrice ? 'disabled' : ''}>コスト上限 ${capacity(meta)} → ${capacity(meta) + META.capacityStep}<small>${capPrice}pt</small></button>` : `<p class="sub">コスト上限 ${capacity(meta)}（最大）</p>`}
        <div class="prep-actions"><button class="secondary" id="unlock-back">← もどる</button></div>
      </div>`;
    el.overlay.classList.add('show');
    const unlocked = (b: HTMLElement) => {
      sfx.charmGet();
      const c = center(b);
      paint();
      burst(c.x, c.y, ['✨', '🔓', '⭐'], 14, 80);
    };
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-unlock]').forEach((b) =>
      b.addEventListener('click', () => {
        if (unlockAdd(meta, b.dataset.unlock as never)) unlocked(b);
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-charm]').forEach((b) =>
      b.addEventListener('click', () => {
        if (unlockCharm(meta, b.dataset.charm as never)) unlocked(b);
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((b) =>
      b.addEventListener('click', () => {
        meta.skin = meta.skin === b.dataset.skin ? '' : b.dataset.skin!;
        saveMeta(meta);
        applySkin();
        sfx.select();
        paint();
      }),
    );
    document.getElementById('prep-cap')?.addEventListener('click', () => {
      if (!buyCapacity(meta)) return;
      sfx.buy();
      paint();
    });
    $('unlock-back').addEventListener('click', () => {
      sfx.cancel();
      showTitle();
    });
  };
  paint();
}

/** 準備画面：今回ショップに並べる組み合わせを選んで始める（スタートとプレイの間） */
function showPrep(): void {
  leaveTitle();
  const saved = loadRun();
  let confirmNew = false;
  const paint = () => {
    const cap = capacity(meta);
    const used = loadoutCost(meta.loadout.filter((id) => meta.unlockedAdds.includes(id)));
    const adds = (Object.keys(META.adds) as (keyof typeof META.adds)[])
      .filter((id) => id !== 'addMoon' && meta.unlockedAdds.includes(id))
      .map((id) => {
        const def = META.adds[id];
        const on = meta.loadout.includes(id);
        const fits = on || used + def.cost <= cap;
        return `<button class="prep-item${on ? ' on' : ''}${fits ? '' : ' full'}" data-toggle="${id}">
          <span class="e">${ADD_EMOJI[id]}</span><b>${shortName(id)}</b><span class="cost">${'●'.repeat(def.cost)}</span></button>`;
      })
      .join('');
    el.overlay.innerHTML = `
      <div class="modal prep-modal" role="dialog" aria-label="準備">
        <h2>${art('bargain')} ショップに並べる</h2>
        ${maxDifficulty(meta) > 0 ? `<div class="diff-row">${DIFFICULTIES.slice(0, maxDifficulty(meta) + 1).map((d, k) => `<button class="diff-chip${meta.difficulty === k ? ' on' : ''}" data-diff="${k}">${d.name}${d.desc ? `<small>${d.desc}</small>` : ''}</button>`).join('')}</div>` : ''}
        <div class="cap-meter${used > cap ? ' over' : ''}">${Array.from({ length: cap }, (_, k) => `<i class="${k < used ? 'on' : ''}"></i>`).join('')}<span>${used} / ${cap}</span></div>
        <div class="prep-grid">${adds}</div>
        <div class="prep-actions">
          <button class="primary" id="prep-start">${saved ? (confirmNew ? 'はじめる（続きは消えます）' : 'はじめる') : 'はじめる！'}</button>
          <button class="secondary" id="prep-back">← もどる</button>
        </div>
      </div>`;
    el.overlay.classList.add('show');
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        if (toggleLoadout(meta, b.dataset.toggle as never)) sfx.select();
        else {
          sfx.error();
          shake(b, 4);
          return;
        }
        paint();
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
      b.addEventListener('click', () => {
        meta.difficulty = Number(b.dataset.diff);
        saveMeta(meta);
        sfx.select();
        paint();
      }),
    );
    $('prep-start').addEventListener('click', () => {
      if (saved && !confirmNew) {
        confirmNew = true;
        sfx.error();
        paint();
        return;
      }
      sfx.select();
      startGame();
    });
    $('prep-back').addEventListener('click', () => {
      sfx.cancel();
      showTitle();
    });
  };
  paint();
}

// ---- 長押しで詳しく ----

let lpTimer = 0;
let lpFired = false;
let infoEl: HTMLElement | null = null;

function closeInfo(): void {
  infoEl?.remove();
  infoEl = null;
}

/** anchor の近く（上に余裕があれば上、なければ下）に詳しい説明の吹き出しを出す */
function showInfo(anchor: Element, html: string): void {
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
function longPress(root: HTMLElement, selector: string, info: (target: HTMLElement) => string | null): void {
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

const infoHead = (ico: string, name: string, tag = '') => `<div class="info-head"><span class="info-ico">${ico}</span><b>${name}</b>${tag ? `<em>${tag}</em>` : ''}</div>`;

function symbolInfo(id: SymbolId, extra = ''): string {
  const d = SYMBOLS[id];
  const shape = d.shape ? `<p>${shapeIcon(d.shape)} ${SHAPE_NAMES[d.shape]}</p>` : '';
  return `${infoHead(symHtml(id), d.name, d.kind === 'manual' ? '手動' : '自動')}<p>${d.desc}</p>${shape}<p class="sub">🔥 ${d.feverDesc}</p>${extra}`;
}

function plotInfo(cell: number): string | null {
  if (!inField(state, cell)) return null;
  const parts: string[] = [];
  const crop = state.field[cell];
  const tool = state.tools[cell];
  const tile = state.tiles[cell];
  if (tool) {
    const ev = TOOL_EVOLVE[tool];
    parts.push(`${infoHead(art(PLACE_ART[tool]), PLACES[tool].name, '道具')}<p>${PLACES[tool].desc}</p>${ev ? `<p class="sub">進化：${ev.what} ${state.toolXp[cell]}/${ev.need} → ${PLACES[ev.to].name}</p>` : ''}`);
  } else if (crop) {
    const def = CROPS[crop.kind];
    const ripe = isRipe(crop);
    const base = cropPrice(state, crop, cell);
    let sellLine = '';
    if (ripe) {
      const steps = multSteps(state, cell);
      const mult = steps.reduce((m, x) => m * x.x, 1);
      sellLine = `<p>今売ると <b>${Math.round(base * mult)}金</b></p><p class="sub">${base}金 ${steps.map((x) => `×${fmtMult(x.x)}（${x.label}）`).join(' ')}</p>`;
    }
    parts.push(`${infoHead(art(FRUIT[crop.kind]), def.name, ripe ? '実り' : `${crop.growth}/${def.ripe}`)}<p>売値 ${def.price}金${crop.fertilized ? '・肥料×2' : ''}</p>${sellLine}`);
  } else if (state.weeds[cell]) {
    parts.push(`${infoHead(art('weed'), '雑草', 'お邪魔')}<p>タップで抜く（${weedCost(state)}金）</p>`);
  } else {
    parts.push(infoHead(art('sprout'), '空きマス'));
  }
  if (tile) parts.push(`<p class="sub">${art(PLACE_ART[tile])} ${PLACES[tile].name}：${PLACES[tile].desc}</p>`);
  if (state.frost[cell]) parts.push(`<p class="sub">❄️ あと${state.frost[cell]}日凍っている</p>`);
  return parts.join('');
}

function charmInfo(id: CharmId): string {
  const c = CHARMS[id];
  const n = state.charms[id];
  const gold = isGolden(state, id);
  const tag = c.special ? '特別' : CHARM_TIER_NAMES[c.tier];
  const stack = c.max >= CONFIG.goldenAt ? `<p class="sub">${gold ? '✦ 金色（効果2倍）' : `${CONFIG.goldenAt}個で金色（効果2倍）`}</p>` : '';
  return `${infoHead(art(id), `${c.name}${n > 1 ? ` ×${n}` : ''}`, tag)}<p>${c.desc(gold ? n * 2 : Math.max(1, n))}</p>${stack}`;
}

/** 長押しの詳しい説明を、畑・リール・お守り・袋・ショップにつける */
function setupLongPress(): void {
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

// ---- 起動 ----

$('build-label').textContent = __BUILD__;
el.spin.addEventListener('click', () => void onSpin());
el.tax.addEventListener('click', () => {
  const t = nextTax(state);
  say(`${state.difficulty ? `【${DIFFICULTIES[state.difficulty].name}】` : ''}年貢 ${t.amount}金・${t.daysLeft === 0 ? '今日の終わり' : `あと${t.daysLeft}日`}（${state.day}日目）${state.cleared ? '' : `・クリアまであと${CONFIG.winTaxes - state.taxesPaid}回`}`, 3000);
});
el.order.addEventListener('click', () => {
  const o = state.order;
  if (!o) return;
  const left = o.dueDay - state.day;
  say(o.done ? `注文達成 +${o.reward}金` : `注文：${CROPS[o.crop].name}を${o.need}個 → +${o.reward}金（${left > 0 ? `あと${left}日` : '今日まで'}）`, 3000);
});
el.goldBox.querySelector('.stat-icon')!.innerHTML = art('coin');
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
// メニュー（遊び方・音・演出控えめ）
const menu = $('hud-menu');
const menuLabels = () => {
  el.mute.textContent = isMuted() ? '🔇 音オフ' : '🔊 音オン';
  $('calm-btn').textContent = isCalm() ? '✨ 演出 控えめ' : '✨ 演出 ふつう';
};
$('menu-btn').addEventListener('click', (e) => {
  unlockAudio();
  e.stopPropagation();
  menuLabels();
  menu.hidden = !menu.hidden;
  if (!menu.hidden) window.setTimeout(() => document.addEventListener('click', () => (menu.hidden = true), { once: true }), 0);
});
$('calm-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCalm();
  menuLabels();
  sfx.select();
});
el.help.addEventListener('click', () => {
  menu.hidden = true;
  // 年貢・お守り・結果などの画面の上には開かない
  if (busy || el.overlay.classList.contains('show')) return;
  unlockAudio();
  sfx.select();
  showHelp('rules');
});
el.mute.addEventListener('click', (e) => {
  e.stopPropagation();
  unlockAudio();
  toggleMute();
  menuLabels();
});
applySkin();
setupLongPress();
render();
showTitle();
