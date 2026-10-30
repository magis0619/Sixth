import { applyStaticLang, EN, gold, L } from './i18n.ts';
import './style.css';
import {
  CHARMS, CHARM_ORDER, DIFFICULTIES, TOOL_EVOLVE, CONFIG, CROPS, PLACES, PLACE_ORDER, SEEDS, SYMBOLS, SYMBOL_ORDER, UPGRADES, UPGRADE_SYMBOL, type AddUpgradeId, type PlaceId, type SymbolId, type UpgradeId,
} from './config.ts';
import {
  isGolden, singleMult, type Notice, bagTotal, buy, buyPlace, canBuy, canBuyPlace, canExpand, canPlace, canUse, cellMultiplier, cropPrice, drawDay, drawSymbol, endDay, expand, expandPrice, inField, inSameCropLine, isRipe, place, placePrice, shapeCells, ripeGroup, newGame, nextTax, pullWeed, weedCost, resolveFever, type FeverEvent, resolveAuto, sell, type SellResult, upgradeAvailable, upgradePrice, useSymbol, validTargets, type GameState, bigCells, cropCells, isPond, rootOf, waterWheels, hasRanch, isColorful, wheelGold, animalGold, isPivotAdd, isPivotPlace, plantLineMult, mustPlace, hasRoomFor, takeOffer, refreshCombos, symbolShape,
} from './game.ts';
import { duckBgm, isMuted, sfx, suspendAudio, toggleMute, unlockAudio } from './audio.ts';
import { saveMeta, setupFrom } from './meta.ts';
import { art, gradientDefs, type ArtId } from './art.ts';
import { track } from './telemetry.ts';
import {
  burst, center, coinRain, dropIn, PEST_SPEED, rays, ripple, dim, firework, confetti, flash, floatText, flyTo, hitStop, isCalm, pop, rollNumber, scanlines, shake, shakeFor, sleep, slamText, slowFactor, speedLines, stackMultipliers, toggleCalm, vibrate, rainShower, setHurry, later, fmtMult, travel, sunBeam, beeFlight,
} from './fx.ts';
import {
  FRUIT, PLACE_ART, setHtml, STAGE_NAMES, type SheetName, bagPct, closeSheet, costHtml, cropEmoji, openSheet, openSheetName, roleClass, say, shapeIcon, stageOf, symHtml, upgradeArt, upgradeEffect, visibleOr,
} from './ui/view.ts';
import { applySkin, showClear, showGameOver, showHelp, showTitle } from './ui/screens.ts';
import { clearRun, saveRun } from './ui/save.ts';
import { $, el, hooks, meta, rng, setState, state, ui } from './ui/store.ts';
import { pressable } from './ui/press.ts';
import { applySettings, showSettings } from './ui/settings.ts';
import { accept, reject } from './ui/states.ts';
import { renderDanger, renderSky, setupScene } from './ui/scene.ts';
import { blockLongPress, setupLongPress } from './ui/info.ts';
import { CUTIN_MS, comboBanner, feverBanner, playCutIn, showCharmOffer, showTaxStamp, witherField } from './ui/shows.ts';

let selected: number | null = null;
let armedNextDay = false;
let shownGold = state.gold;
/** 列の収穫の演出中は、作物が財布に届くまで所持金の表示を止めておく */
let goldHeld = 0;
let goldTween = 0;
let combo = 0;
let lastSellAt = 0;
/** 一度でもやった操作。ヒントを順に出すため */
const done = { spin: false, use: false, sell: false, buy: false, next: false, line: false };
/** その日の自動の絵柄の結果表示（リール番号ごと） */
let autoOutcome: Record<number, string> = {};

// ---- 表示ヘルパー ----

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
  // お金が増えたら財布がジャラッと揺れて光る
  if (value > from) {
    el.goldBox.classList.remove('jingle');
    void el.goldBox.offsetWidth;
    el.goldBox.classList.add('jingle');
    const c = center(el.goldBox.querySelector('.stat-icon') ?? el.goldBox);
    burst(c.x, c.y, ['✨'], value - from >= 20 ? 6 : 3, 26);
  }
}

// ---- 描画 ----

function render(): void {
  el.day.textContent = String(state.day);
  if (!goldHeld && shownGold !== state.gold) setGold(state.gold);
  renderTax();
  renderOrder();
  renderMarket();
  renderPick();
  renderGoal();
  renderStatus();
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
  // 畑の広さが変わったときだけ測り直す（毎回測るとページ全体の配置計算が走って重い）
  // 上の札（フィーバー・セット効果など）の行数が変わったときも、畑の上下の空きが変わるので測り直す
  const size = `${state.cols}x${state.rows}|${el.status.childElementCount}`;
  if (size !== fittedSize) {
    fittedSize = size;
    fitLayout();
  }
  flushNotices();
  renderTutorial();
}

/** 先に置く物があるときの断りのひと言 */
const placeFirst = () => L(`先に${PLACES[state.stock[0]].name}を置く`, `Place the ${PLACES[state.stock[0]].name} first`);
/** お金が足りないときのひと言 */
const needGold = (price: number) => L(`あと${price - state.gold}`, `${price - state.gold}g short`);

/** 出来事と出来事の間の小さな間（同時に起こさず、順番に見せる） */
const EVENT_GAP = 260;
/** 1つの出来事を見せておく長さ（次の出来事はこのあと） */
const EVENT_HOLD = 650;
let noticeChain: Promise<void> = Promise.resolve();
/** いま出来事を見せている自動の出目のリール */
let actingReel: number | null = null;

/** ルール側から届いた知らせ（特別なお守り・金色・進化・大当たり）を演出する */
function flushNotices(): void {
  const list = state.notices.splice(0);
  // 知らせは1つずつ順番に（直前の操作の演出と重ならないよう、少し間を空けてから）
  list.forEach((n: Notice) => {
    noticeChain = noticeChain.then(() => sleep(EVENT_GAP + 500)).then(() => playNotice(n)).then(() => sleep(900));
  });
}

function playNotice(n: Notice): void {
  const top = { x: window.innerWidth / 2, y: window.innerHeight * 0.3 };
  const tab = visibleOr(null, 'charms');
  if (n.kind === 'ready') {
    sfx.rare();
    floatText(top.x, top.y, L(`${CHARMS[n.id].name} 解放！`, `${CHARMS[n.id].name} unlocked!`), { cls: 'gold', size: 1.2, dur: 1800 });
    floatText(top.x, top.y + 34, L('次の年貢で選べる', 'Pickable after the next tax'), { size: 0.7, dur: 1800 });
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
    void slamText(L(`✦ ${CHARMS[n.id].name} 金色！`, `✦ ${CHARMS[n.id].name} golden!`), { size: 0.6, dur: 1500 });
    coinRain(20);
  } else if (n.kind === 'evolve') {
    const plot = el.field.children[n.cell];
    if (!plot) return;
    const q = center(plot);
    sfx.newReel();
    sfx.rare();
    burst(q.x, q.y, ['✨', '🌟', '⭐'], 16, 90);
    pop(plot, 1.3);
    floatText(q.x, q.y - 30, L(`${PLACES[n.to].name}に進化！`, `Evolved into ${PLACES[n.to].name}!`), { cls: 'gold', size: 1, dur: 1600 });
  }
}

/** 大豊作の幕開け：畑いっぱいの実が真ん中から順に跳ね、後光とともに「大豊作！」 */
async function bigHarvestIntro(ghosts: HTMLElement[]): Promise<void> {
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
async function bigHarvestFinale(amount: number): Promise<void> {
  const f = center(el.field);
  sfx.fever();
  flash('#ffe680', 500);
  shake(el.app, 12);
  coinRain(90);
  confetti(110);
  const colors = ['#ffd84a', '#ff6a4a', '#7fe07f', '#6ac8ff', '#ff9ae0', '#ffd84a'];
  colors.forEach((c, i) =>
    later(() => {
      firework(window.innerWidth * (0.15 + (0.7 * ((i * 2) % 5)) / 4), window.innerHeight * (0.16 + 0.1 * (i % 2)), c);
      sfx.firework();
    }, i * 300),
  );
  flyTo(f, el.goldBox, '🪙', 16, () => setGold(state.gold), true);
  await rollNumber(f.x, f.y, amount, { prefix: L('大豊作 +', 'Big harvest +'), size: 1.5, hold: 1400, rise: true });
}

// ---- 画面の高さに合わせて畑のマスの大きさを決める（まわすボタンが必ず画面内に入るように） ----

/** 最後にマスの大きさを合わせた畑の広さ */
let fittedSize = '';
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
  if (good.length) chips.push(`<span class="st fever">${art('flame')} ${L('フィーバー', 'Fever')}：${good.map((s) => SYMBOLS[s].name).join(L('・', ', '))}</span>`);
  if (bad.length) chips.push(`<span class="st danger">${art('warn')} ${bad.map((s) => L(`${SYMBOLS[s].name}の群れ`, `${SYMBOLS[s].name} swarm`)).join(L('・', ', '))}</span>`);
  state.combos.forEach((id) => chips.push(`<span class="st combo">${art(id)} ${CHARMS[id].name}</span>`));
  if (state.priceMult > 1) chips.push(`<span class="st merchant">${art('merchant')} ${L('今日の売値', "Today's prices")} ×${fmtMult(state.priceMult)}</span>`);
  if (state.cloverBoost > 1) chips.push(`<span class="st clover">${art('clover')} ${L('明日は金の種が出やすい', 'Golden seeds likelier tomorrow')}（×${fmtMult(state.cloverBoost)}）</span>`);
  // セット効果：そろっている間だけ
  if (hasRanch(state)) chips.push(`<span class="st set">${art('henhouse')}${art('cowshed')}${art('hive')} ${L('牧場', 'Ranch')} ×2</span>`);
  if (isColorful(state)) chips.push(`<span class="st set">${art('sunBlessing')} ${L('彩りの畑', 'Colorful field')} +${Math.round(CONFIG.colorfulBonus * 100)}%</span>`);
  setHtml(el.status, chips.join(''));
}

/** 今週の相場：畑の右上の札に、高値と安値の作物を絵と記号だけで */
/** いま選んでいる出目：畑の右上の札に、絵柄・名前・効く形（何を選んでいるか一目で分かるように） */
function renderPick(): void {
  const box = $('pick');
  if (state.stock.length && fieldCells().some((c) => canPlace(state, c))) {
    // 買った建物・土地を置くところ
    const id = state.stock[0];
    box.hidden = false;
    setHtml(box, `<span class="pick-label">${L('置く', 'Place')}</span><span class="pick-sym">${art(PLACE_ART[id])}</span><b>${PLACES[id].name}</b>`);
    return;
  }
  const r = selected !== null ? state.results[selected] : null;
  box.hidden = !r;
  if (!r) return;
  const def = SYMBOLS[r.symbol];
  // 効く形は小さな図で（文字は出さない）
  const shapeId = symbolShape(state, r.symbol);
  const shape = shapeId ? `<span class="pick-shape">${shapeIcon(shapeId)}</span>` : '';
  setHtml(box, `<span class="pick-label">${L('選択中', 'Selected')}</span><span class="pick-sym">${symHtml(r.symbol)}</span><b>${def.name}</b>${shape}`);
}

function renderMarket(): void {
  const m = state.market;
  const box = $('market');
  box.hidden = !(state.day > 0 && m && (m.high || m.low));
  if (box.hidden || !m) return;
  const up = m.high ? `<span class="up">▲${art(FRUIT[m.high])}×${fmtMult(CONFIG.marketHigh)}</span>` : '';
  const down = m.low ? `<span class="down">▼${art(FRUIT[m.low])}×${fmtMult(CONFIG.marketLow)}</span>` : '';
  setHtml(box, `${up}${down}`);
}

function renderCharms(): void {
  const owned = CHARM_ORDER.filter((id) => state.charms[id] > 0);
  el.charmPanel.hidden = owned.length > 0;
  el.charmCount.textContent = state.stock.length ? L(`置く待ち${state.stock.length}`, `${state.stock.length} to place`) : owned.length ? `${owned.reduce((n, id) => n + state.charms[id], 0)}` : '';
  setHtml(
    el.charms,
    owned
      .map((id) => {
        const c = CHARMS[id];
        const n = state.charms[id];
        const gold = isGolden(state, id);
        return `<span class="charm tier-${c.tier}${gold ? ' golden' : ''}${c.special ? ' special' : ''}" data-charm="${id}"><span class="e">${art(id)}</span><span><b>${c.name}${n > 1 ? ` ×${n}` : ''}${gold ? ' ✦' : ''}</b><small>${c.desc(gold ? n * 2 : n)}</small></span></span>`;
      })
      .join(''),
  );
}

/** 今週の注文：畑の囲いに下げた木の札。作物の絵と「2/5」だけ、タップで詳しく */
function renderOrder(): void {
  const o = state.order;
  el.order.hidden = !o;
  if (!o) return;
  el.order.className = `order-tag${o.done ? ' done' : ''}`;
  setHtml(el.order, `<span class="sign-nail l"></span><span class="sign-nail r"></span><span class="order-ico">${art(FRUIT[o.crop])}</span><b>${o.done ? L('達成！', 'Done!') : `${CROPS[o.crop].name} ${o.have}/${o.need}`}</b><span class="order-reward">${o.done ? '✓' : gold(o.reward)}</span>`);
}

/** 年貢：「年貢 7 あと2日」を言葉で。払えるときは緑、足りないときは赤 */
function renderTax(): void {
  const t = nextTax(state);
  const short = state.gold < t.amount;
  const warn = short && t.daysLeft <= CONFIG.taxWarnDays;
  el.tax.className = `hud-tax${warn ? ' warn' : ''}${short ? ' short' : ' ok'}${state.difficulty ? ' hard' : ''}`;
  el.tax.innerHTML =
    `<span class="tax-label">${art('bale')}<span class="tax-word">${L('年貢', 'Tax')}</span></span><b>${gold(t.amount)}</b>` +
    `<span class="tax-when">${t.daysLeft === 0 ? L('今日まで', 'today') : L(`あと${t.daysLeft}日`, `${t.daysLeft}d left`)}</span>` +
    `<span class="tax-mark">${short ? L('足りない', 'short') : L('払える', 'ready')}</span>`;
}

/** 列（縦・横・斜めに3つ以上）にそろった実があるか */

function renderGoal(): void {
  const available = UPGRADES.filter((u) => upgradeAvailable(state, u.id));
  const tab = document.querySelector('.tab[data-sheet="shop"]')!;
  const ready = available.some((u) => canBuy(state, u.id));
  tab.classList.toggle('ready', ready);
  if (ready) {
    el.goal.textContent = L('買える！', 'Can buy!');
    return;
  }
  const next = available.sort((a, b) => upgradePrice(state, a.id) - upgradePrice(state, b.id))[0];
  el.goal.textContent = next ? L(`あと${upgradePrice(state, next.id) - state.gold}`, `${upgradePrice(state, next.id) - state.gold}g to go`) : '';
}

function usableReels(): number[] {
  return state.results.flatMap((_, i) => (canUse(state, i, null) ? [i] : []));
}

function reelTag(i: number): { text: string; cls: string } {
  const r = state.results[i];
  if (!r) return { text: '—', cls: '' };
  const def = SYMBOLS[r.symbol];
  if (def.kind === 'auto') {
    // 絵柄はイラストで分かるので、札には結果だけを短く書く
    const text = autoOutcome[i] ?? L('自動', 'Auto');
    return { text, cls: def.rarity === 'bad' ? 'auto-bad used' : 'used' };
  }
  if (r.used) return { text: '', cls: 'used' };
  if (selected === i) return { text: '', cls: 'selected' };
  if (canUse(state, i, null)) return { text: '', cls: 'usable' };
  return { text: '', cls: 'dead' };
}

/** 手動の出目が今は使えない理由（札とタップしたときに出す） */
function deadReason(sym: SymbolId): string {
  if (SEEDS[sym]) return L('空きマスなし', 'No room');
  if (sym === 'hoe') return L('耕す所なし', 'Nothing to till');
  if (sym === 'fertilizer') return L('作物なし', 'No crop');
  return L('育つ作物なし', 'Nothing to grow');
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
    b.addEventListener('click', () => clickAllowed('reel') && onReelTap(i));
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
    b.className = `reel ${r ? roleClass(r.symbol) : ''} ${tag.cls}${r?.symbol === 'goldSeed' ? ' rare' : ''}${fever ? (badFever ? ' fever-bad' : ' fever') : ''}${r && el.machine.classList.contains('rainbow') && state.fever.includes(r.symbol) ? ' rainbow-sym' : ''}${actingReel === i ? ' acting' : ''}`;
    // 札：自動の出目は結果を短く、手動の出目は効く形の絵（3×3のマス目）
    const shape = r ? symbolShape(state, r.symbol) : undefined;
    const tagEl = b.querySelector('.tag') as HTMLElement;
    const html = tag.text ? `${fever ? art(badFever ? 'warn' : 'flame') : ''}${tag.text}` : shape && !r!.used ? shapeIcon(shape) : '';
    if (tagEl.innerHTML !== html) tagEl.innerHTML = html;
    tagEl.classList.toggle('empty', !html);
    tagEl.classList.toggle('shape', !tag.text && !!shape);
    renderCount(b, i);
    b.setAttribute('aria-label', r ? `${SYMBOLS[r.symbol].name}: ${tag.text}` : L('リール', 'Reel'));
  });
}

/** 出目の効く形を3×3のマス目で描く（光っているマスに効く） */
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

/** 毎日の仕入れの案内を出したか */
let offerHinted = (() => {
  try {
    return localStorage.getItem('hatake-slot:offerHint') === '1';
  } catch {
    return false;
  }
})();

/** 回せるとき（出目を使い切った・1日目）はリール窓が光り「タップで回す」の帯が出る */
function renderSpinButton(): void {
  const t = nextTax(state);
  el.spin.disabled = ui.busy || state.over;
  const ready = !ui.busy && !state.over && (state.day === 0 || usableReels().length === 0);
  el.machine.classList.toggle('ready-spin', ready);
  el.machine.classList.toggle('taxday', state.day > 0 && t.daysLeft === 0);
  // 次の日に進むしかないとき：リールの上に大きな「次の日へ」の札を重ねる
  const go = $('spin-go');
  go.hidden = !ready;
  go.classList.toggle('tax', state.day > 0 && t.daysLeft === 0);
  setHtml(go, state.day === 0
    ? `<span class="go-hand">${art('hand')}</span><span class="go-text"><b>${L('タップで回す', 'Tap to spin')}</b></span>`
    : `<span class="go-hand">${art('hand')}</span><span class="go-text">${t.daysLeft === 0 ? `<small>${L(`年貢${t.amount}を納めて`, `Pay ${t.amount}g tax`)}</small>` : ''}<b>${L(`${state.day + 1}日目へ`, `To day ${state.day + 1}`)}</b><small>${L('リールをタップ', 'Tap the reels')}</small></span>`);
  // 筐体の看板：今日の仕入れがあれば、そこに3つの絵柄（押すと袋に入る）。なければ「タップで回す」など
  const cue = document.querySelector('.machine-top') as HTMLElement;
  const offering = state.offer.length > 0 && state.day > 0 && !state.over && !ui.busy && !tut;
  cue.classList.toggle('offer', offering);
  cue.classList.toggle('cue', ready && !offering);
  if (offering) {
    // 初めて仕入れが出たときだけ、ひと言で知らせる
    if (!offerHinted) {
      offerHinted = true;
      try {
        localStorage.setItem('hatake-slot:offerHint', '1');
      } catch {
        // 保存できなくても遊べる
      }
      say(`${art('hand')} ${L('看板を押すと、今日の仕入れを選べる（タダ）', 'Tap the sign to pick a free symbol for today')}`, 3500);
    }
    setHtml(cue, `<span class="offer-label">${L('仕入れ', 'Pick')}</span>${state.offer.map((id) => `<span class="offer" data-offer="${id}">${symHtml(UPGRADE_SYMBOL[id]!.symbol)}</span>`).join('')}`);
    return;
  }
  setHtml(cue, !ready
    ? `${art('coin')} ${L('畑スロット', 'FARM SLOTS')} ${art('coin')}`
    : state.day === 0
    ? L('▼ タップで回す ▼', '▼ TAP TO SPIN ▼')
    : t.daysLeft === 0
      ? L(`▼ タップで年貢 ${t.amount}を納めて回す ▼`, `▼ TAP: PAY ${t.amount}g TAX & SPIN ▼`)
      : L(`▼ タップで${state.day + 1}日目へ ▼`, `▼ TAP FOR DAY ${state.day + 1} ▼`));
}

/** 売値の倍率の印：3つ並んだ点（列）と1つの点（単品） */
const MARK_LINE = '<svg class="mk" viewBox="0 0 26 10" aria-hidden="true"><path d="M4 5H22" stroke="currentColor" stroke-width="2.4"/><circle cx="4" cy="5" r="3.4" fill="currentColor"/><circle cx="13" cy="5" r="3.4" fill="currentColor"/><circle cx="22" cy="5" r="3.4" fill="currentColor"/></svg>';
const MARK_SINGLE = '<svg class="mk" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3.4" fill="currentColor"/></svg>';

/** 道具・特別なマスの絵 */
/** マスに最後に書いた中身（同じなら書き換えない：押している最中に中身が入れ替わるとクリックが消える） */
const plotHtml = new WeakMap<Element, string>();

/** 形で効く出目を選んでいるとき、指しているマスに効く範囲を見せる */
let previewCell: number | null = null;

function previewCells(): number[] {
  if (selected === null || previewCell === null) return [];
  const sym = state.results[selected].symbol;
  // 大物の種は、植わる2×2を下見する
  if (SEEDS[sym] && CROPS[SEEDS[sym]!.crop].big) return bigCells(state, previewCell);
  const shape = symbolShape(state, sym);
  return shape ? shapeCells(state, shape, previewCell) : [];
}

function renderField(): void {
  // 水車は水路の並びの端に立つ
  const wheelEnds = new Set(waterWheels(state).map((w) => w[w.length - 1]));
  const placeable = state.stock.length ? state.field.flatMap((_, i) => (canPlace(state, i) ? [i] : [])) : [];
  const targets = selected !== null ? validTargets(state, selected) : placeable.length ? placeable : null;
  const preview = previewCells();
  const selSeed = selected !== null ? SEEDS[state.results[selected].symbol] : undefined;
  const plantKind = selSeed && !CROPS[selSeed.crop].big ? selSeed.crop : null;
  el.field.style.setProperty('--cols', String(state.cols));
  if (el.field.children.length !== state.field.length) {
    el.field.innerHTML = '';
    state.field.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'plot';
      b.addEventListener('click', () => clickAllowed('plot') && onPlotTap(i));
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
    let label = L('空きマス', 'Empty plot');
    const tool = state.tools[i];
    const tile = state.tiles[i];
    const part = crop?.anchor !== undefined ? state.field[crop.anchor] : null;
    if (tile) {
      cls.push(`tile-${tile}`);
      // 空きマスでは中央に大きな名札を出すので、角の札は作物が乗っているときだけ
      // 水路は土の色（青）で分かるので、作物が乗っているときは印を出さない
      // 特別なマスは土の色で分かるので、作物・道具が乗っているときは印を出さない
    }
    if (part) {
      // 大物の右・下・右下：絵は本体のマスから重ねて描くので、ここは土だけ
      cls.push('big-part');
      if (isRipe(part)) cls.push('ripe');
      label = `${CROPS[part.kind].name}（2×2）`;
    } else if (tool) {
      cls.push('tool');
      html += `<span class="crop">${art(PLACE_ART[tool])}</span><span class="tool-name">${PLACES[tool].name}</span>`;
      label = `${PLACES[tool].name}：${PLACES[tool].desc}`;
    } else if (crop) {
      const ripe = isRipe(crop);
      const def = CROPS[crop.kind];
      cls.push(`g${stageOf(crop)}`, `crop-${crop.kind}`);
      if (ripe) cls.push('ripe');
      if (def.gold) cls.push('goldcrop');
      if (def.big) cls.push('big');
      // 実るまでは成長に合わせて少しずつ大きくなる
      html += `<span class="crop"${ripe ? '' : ` style="--g:${(0.55 + 0.45 * (crop.growth / def.ripe)).toFixed(2)}"`}>${cropEmoji(crop)}</span>`;
      // 育っている間も何の作物か分かるように小さな札を出す
      if (!ripe) html += `<span class="badge-kind">${art(FRUIT[crop.kind])}</span>`;
      if (crop.fertilized) html += `<span class="badge-fert">${L('肥×2', 'F×2')}</span>`;
      if (ripe) {
        // 列に入っていれば倍率、入っていなければ単品（半値）
        const mult = cellMultiplier(state, i);
        const inLine = mult > CONFIG.singleMult;
        const price = Math.round(cropPrice(state, crop, i) * mult);
        if (def.big) cls.push('bigripe');
        else if (inLine) cls.push('line', inSameCropLine(state, i) ? 'lines-3' : 'lines-1');
        else cls.push('single');
        // 金貨の上に数字（「金」の字は入れない）。桁が多いほど字を小さく
        html += `<span class="price d${String(price).length}">${art('coinBlank')}<b>${price}</b></span>`;
        // 倍率は文字ではなく印と数字で：並んだ点＝列、1つの点＝単品
        if (def.big) html += `<span class="badge-line">${L('大物', 'Big')}</span>`;
        else html += inLine ? `<span class="badge-line">${MARK_LINE}×${fmtMult(mult)}</span>` : `<span class="badge-single">${MARK_SINGLE}×${fmtMult(singleMult(state))}</span>`;
        label = L(`${def.name} 実、タップで${price}で売る${def.big ? '' : inLine ? '（列ごと）' : '（単品は半値）'}`, `${def.name}, ripe: tap to sell for ${price}g${def.big ? '' : inLine ? ' (whole line)' : ' (single: half price)'}`);
      } else {
        html += `<span class="pips">${Array.from({ length: def.ripe }, (_, k) => `<i class="pip${k < crop.growth ? ' on' : ''}"></i>`).join('')}</span>`;
        label = L(`${def.name} ${STAGE_NAMES[stageOf(crop)]}（あと${def.ripe - crop.growth}で実る）`, `${def.name}, ${STAGE_NAMES[stageOf(crop)]} (ripe in ${def.ripe - crop.growth})`);
      }
      // 大物は本体のマスから2×2の大きさで重ねて描く
      if (def.big) html = `<span class="big-wrap">${html}</span>`;
    } else if (state.weeds[i]) {
      cls.push('weedy');
      html += `<span class="crop">${art('weed')}</span><span class="pull">${weedCost(state) ? L(`抜く ${weedCost(state)}`, `Pull ${weedCost(state)}g`) : L('抜く', 'Pull')}</span>`;
      label = L(`雑草、タップで抜く（${weedCost(state)}）`, `Weed: tap to pull (${weedCost(state)}g)`);
    } else if (isPond(state, i)) {
      cls.push('pond');
      html += `<span class="crop">${art('fish')}</span>`;
      label = L(`釣り堀：毎晩+${CONFIG.fishGold}、ときどき大物`, `Fishing pond: +${CONFIG.fishGold}g nightly, sometimes a big catch`);
    } else {
      if (state.tilled[i]) {
        cls.push('tilled');
        label = L('耕した土（植えると成長+1）', 'Tilled soil (planting gives +1 growth)');
      }
      const tilledMark = state.tilled[i] && !tile ? `<span class="till-mark">${art('hoe')}<b>+${state.charms.tillMaster ? 2 : 1}</b></span>` : '';
      html += tilledMark || (tile
        ? `<span class="tile-label"><span class="tile-ico">${art(PLACE_ART[tile])}</span>${tile === 'water' ? '+1' : '×2'}</span>`
        : `<span class="empty">${L('空き', 'empty')}</span>`);
    }
    if (wheelEnds.has(i)) {
      html += `<span class="badge-wheel">${art('waterwheel')}</span>`;
      label += L('、水車', ', waterwheel');
    }
    if (tile) label += `、${PLACES[tile].name}（${PLACES[tile].desc}）`;
    if (state.frost[i]) {
      cls.push('frozen');
      html += `<span class="ice"></span><span class="badge-frost">${art('frost')}${state.frost[i]}${L('日', 'd')}</span>`;
      label += L(`、凍っている（あと${state.frost[i]}日）`, `, frozen (${state.frost[i]} more days)`);
    }
    if (targets) cls.push(targets.includes(i) ? 'target' : 'dim');
    // 種を選んでいるとき：ここに植えると列になるマスに倍率の見込み
    if (plantKind && targets?.includes(i)) {
      const m = plantLineMult(state, i, plantKind);
      if (m > 0) {
        html += `<span class="line-hint${m > CONFIG.lineMult ? ' same' : ''}">${MARK_LINE}×${fmtMult(m)}</span>`;
        label += L(`、植えると列（×${fmtMult(m)}）`, `, planting makes a line (×${fmtMult(m)})`);
      }
    }
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
/** このゲームのショップに並ぶもの（選んだ「足す」強化＋消す＋リール） */
/** いつも並ぶ品・週替わり・袋に入っているお邪魔を消す品 */
function shopItems(): typeof UPGRADES {
  return UPGRADES.filter((u) => {
    // 毎日の仕入れのときは、ショップで足せる絵柄は満月だけ
    if (u.id.startsWith('add')) return CONFIG.dailyPick ? u.id === 'addMoon' : state.weekly.includes(u.id as never);
    return state.bag[UPGRADE_SYMBOL[u.id]!.symbol] > 0;
  });
}

function renderShop(): void {
  const items = shopItems();
  renderUpgradeList(el.shop, items.filter((u) => !u.id.startsWith('remove')));
  renderUpgradeList($('remove-shop'), items.filter((u) => u.id.startsWith('remove')));
}

/** 絵柄袋の品（足す・消す）を container に並べる */
function renderUpgradeList(container: HTMLElement, items: typeof UPGRADES): void {
  const key = items.map((u) => u.id).join(',');
  // 新しいゲームで中身を空にした場合も作り直す
  if (container.dataset.key !== key || container.children.length !== items.length) {
    container.dataset.key = key;
    container.innerHTML = '';
    items.forEach((u) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.dataset.id = u.id;
      b.addEventListener('click', () => onBuy(u.id));
      container.appendChild(b);
    });
  }
  items.forEach((u, i) => {
    const b = container.children[i] as HTMLButtonElement;
    const available = upgradeAvailable(state, u.id);
    const price = upgradePrice(state, u.id);
    const affordable = canBuy(state, u.id);
    b.className = `item${affordable ? ' affordable' : ''}${available ? '' : ' soldout'}`;
    const ico = upgradeArt(u.id);
    const pivot = u.id.startsWith('add') && isPivotAdd(state, u.id as AddUpgradeId);
    b.classList.toggle('pivot', pivot);
    const html = `<span class="ico">${ico}</span><span class="text"><span class="name">${u.name}${pivot ? `<span class="pivot-tag">${L('新しい作戦', 'New plan')}</span>` : ''}</span><span class="effect">${pivot ? CONFIG.pivotAdds[u.id]!.split(/：|: /)[1] : upgradeEffect(u.id)}</span></span>${costHtml(available ? price : null, affordable, u.id.startsWith('remove') && state.bag[UPGRADE_SYMBOL[u.id]!.symbol] > 0 ? L('来週', 'Next wk') : L('完了', 'Done'))}`;
    if (b.innerHTML !== html) b.innerHTML = html;
  });
  if (container.id === 'remove-shop') $('stall-empty').hidden = items.length > 0;
}

/** 畑が広がった演出（お守り「開墾」） */
function showExpanded(): void {
  sfx.bigBuy();
  flash('#c8f0a0', 400);
  const f = center(el.field);
  burst(f.x, f.y, ['🌱', '✨', '⭐'], 18, 160);
  floatText(f.x, f.y, L(`畑が広がった！ ${state.cols}×${state.rows}`, `Field expanded! ${state.cols}×${state.rows}`), { cls: 'good', size: 1.2, dur: 1500 });
  fieldCells().forEach((c) => pop(el.field.children[c], 1.08));
}

/** 畑のショップ：道具・特別なマス */
function renderFarmShop(): void {
  const items: { key: string; ico: string; name: string; effect: string; price: number | null; ok: boolean; pivot?: boolean }[] = [];
  const ep = expandPrice(state);
  const nextCols = state.cols <= state.rows ? state.cols + 1 : state.cols;
  const nextRows = state.cols <= state.rows ? state.rows : state.rows + 1;
  const expandItem = {
    key: 'expand',
    ico: art('expand'),
    name: L('畑を広げる', 'Expand field'),
    effect: ep === null ? L(`これ以上は広げられない（${CONFIG.fieldCols}×${CONFIG.fieldRows}）`, `Already at max (${CONFIG.fieldCols}×${CONFIG.fieldRows})`) : `${state.cols}×${state.rows} → ${nextCols}×${nextRows}`,
    price: ep,
    ok: canExpand(state),
  };
  // 広げきったら「完了」は一番下へ（今週の品を上に）
  if (ep !== null) items.push(expandItem);
  PLACE_ORDER.filter((id) => state.weeklyPlaces.includes(id)).forEach((id) =>
    items.push({ key: id, ico: art(PLACE_ART[id]), name: PLACES[id].name, effect: mustPlace(state) ? placeFirst() : hasRoomFor(state, id) ? PLACES[id].desc : PLACES[id].kind === 'tool' ? L('置ける空きマスがない', 'No empty plot to place it') : L('敷けるマスがない', 'No plot to lay it on'), price: placePrice(state, id), ok: canBuyPlace(state, id), pivot: isPivotPlace(state, id) }),
  );
  if (ep === null) items.push(expandItem);
  // 週が替わって品が入れ替わったら作り直す（数が同じでも、ボタンが前の品のまま押されないように）
  const key = items.map((it) => it.key).join(',');
  if (el.farmShop.dataset.key !== key || el.farmShop.children.length !== items.length) {
    el.farmShop.dataset.key = key;
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
    b.className = `item${it.ok ? ' affordable' : ''}${it.price === null ? ' soldout' : ''}${it.pivot ? ' pivot' : ''}`;
    const html = `<span class="ico">${it.ico}</span><span class="text"><span class="name">${it.name}${it.pivot ? `<span class="pivot-tag">${L('新しい作戦', 'New plan')}</span>` : ''}</span><span class="effect">${it.effect}</span></span>${costHtml(it.price, it.ok)}`;
    if (b.innerHTML !== html) b.innerHTML = html;
  });
}

function onBuyFarm(key: PlaceId | 'expand'): void {
  unlockAudio();
  if (ui.busy || state.over) return;
  const card = el.farmShop.querySelector(`[data-id="${key}"]`) as HTMLElement;
  if (key === 'expand') {
    const price = expandPrice(state);
    if (price === null || !expand(state)) {
      reject(card, price === null ? L('もう広げられない', 'Max size') : needGold(price));
      return;
    }
    accept(card);
    closeSheet();
    render();
    showExpanded();
    return;
  }
  if (!buyPlace(state, key)) {
    reject(card, mustPlace(state) ? placeFirst() : !hasRoomFor(state, key) ? L('置ける所がない', 'No room') : needGold(placePrice(state, key) ?? 0));
    return;
  }
  accept(card);
  sfx.buy();
  selected = null;
  closeSheet();
  render();
  say(`${art('hand')} ${L(`${PLACES[key].name}を置く`, `Place the ${PLACES[key].name}`)}`);
}

function fieldCells(): number[] {
  return state.field.flatMap((_, i) => (inField(state, i) ? [i] : []));
}

function renderBag(): void {
  el.bagTotal.textContent = L(`${bagTotal(state.bag)}枚`, `${bagTotal(state.bag)}`);
  setHtml(
    el.bag,
    SYMBOL_ORDER.filter((id) => state.bag[id] > 0 || id === 'crow')
      .map((id) => {
        const def = SYMBOLS[id];
        const cls = `chip${def.rarity === 'bad' ? ' bad' : ''}${state.bag[id] === 0 ? ' zero' : ''}`;
        return `<span class="${cls}" data-sym="${id}" title="${def.desc}（${L('フィーバー', 'Fever')}：${def.feverDesc}）"><span class="e">${symHtml(id)}</span><b class="chip-name">${def.name}</b><span class="chip-num">×${state.bag[id]}<span class="pct">${bagPct(state.bag, id)}%</span></span></span>`;
      })
      .join(''),
  );
}

// ---- スロットを回す ----

async function onSpin(): Promise<void> {
  unlockAudio();
  if (ui.busy || state.over) return;
  if (!tutAllowsSpin()) {
    sfx.error();
    return;
  }
  // 買った建物・土地を置くまでは次の日へ進めない
  if (mustPlace(state)) {
    reject(el.field, placeFirst());
    return;
  }
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
  ui.busy = true;
  done.spin = true;
  renderSpinButton();
  renderReelStates();

  const res = endDay(state, rng);
  autoOutcome = {};
  await showNightIncome();
  if (res.tax !== null) {
    await sleep(EVENT_GAP);
    if (res.ok) track('progress', state, { tax: res.tax });
    await showTaxStamp(res.tax, res.ok);
    if (!res.ok) {
      await witherField();
      endBusy();
      showGameOver();
      return;
    }
  }
  if (state.charmOffer) {
    render();
    await showCharmOffer();
  }
  if (res.cleared && !(await showClear())) {
    endBusy();
    showGameOver(true);
    return;
  }
  drawDay(state, rng);
  tutScript();
  // チュートリアルで出目を差し替えたときも、組み合わせは出目に合わせる
  refreshCombos(state);
  // フリーズ中に結果が見えないよう、描き直すのは演出のあと
  const show = planShow();
  render();
  await spinReels(show);
  if (state.combos.length) await showCombos();
  if (state.fever.length) {
    await showFever();
    await playFeverRoles(resolveFever(state, rng));
    if (state.charmOffer) {
      render();
      await showCharmOffer();
    }
  }
  await resolveAutos();
  endBusy();
  autoSelect();
  render();
}

/** 動物がマスからひょっこり出てくる（何の動物か分かる大きさで） */
function critterPop(q: { x: number; y: number }, html: string): void {
  floatText(q.x, q.y - 6, html, { size: 2.8, rise: 16, dur: 1300 / PEST_SPEED });
}

/** 演出が終わって操作を受け付ける（早送りも止める） */
function endBusy(): void {
  ui.busy = false;
  setHurry(false);
}

/** ゆうべ育ったマス（巣箱の苺・水車の隣・水路・井戸）と、入ったお金（水車・釣り堀・鶏小屋・牛小屋） */
async function showNightIncome(): Promise<void> {
  const n = state.nightIncome;
  if (!n) return;
  const at = (c: number) => center(el.field.children[c]);
  if (n.grown.length) {
    renderField();
    n.grown.forEach((c) => {
      const plot = el.field.children[c] as HTMLElement;
      const q = at(c);
      const ripe = isRipe(state.field[c]);
      pop(plot, ripe ? 1.2 : 1.1);
      burst(q.x, q.y, ripe ? ['✨', '⭐'] : ['💧', '✨'], ripe ? 8 : 4, ripe ? 50 : 30);
      floatText(q.x, q.y + 10, ripe ? L('実った！', 'Ripe!') : L('育った', 'Grew'), { cls: ripe ? 'gold pill' : 'good pill', size: ripe ? 0.8 : 0.7, rise: 20, dur: 1000 });
    });
    sfx.grow();
    if (n.grown.some((c) => isRipe(state.field[c]))) sfx.pon();
    await sleep(EVENT_HOLD);
    // 育って列がそろったら、そのあとに知らせる
    if (announceLines(n.grown, 0)) await sleep(EVENT_HOLD + 300);
    await sleep(EVENT_GAP);
  }
  if (n.wheel + n.fish + n.animals === 0) return;
  // 水車 → 釣り堀 → 小屋 の順に、1種類ずつ
  const groups: (() => boolean)[] = [
    () => {
      n.wheels.forEach((w) => {
        const q = at(w[w.length - 1]);
        floatText(q.x, q.y - 16, L(`水車 +${wheelGold(state, w)}`, `Wheel +${wheelGold(state, w)}`), { cls: 'gold', size: 0.7 });
        flyTo(q, el.goldBox, '🪙', 1);
      });
      return n.wheels.length > 0;
    },
    () => {
      const ponds = fieldCells().filter((c) => isPond(state, c));
      ponds.forEach((c) => {
        const q = at(c);
        const big = n.bigFish.includes(c);
        floatText(q.x, q.y - 16, big ? L(`大物！ +${CONFIG.fishGold + CONFIG.bigFishGold}`, `Big catch! +${CONFIG.fishGold + CONFIG.bigFishGold}`) : `+${CONFIG.fishGold}`, { cls: 'gold', size: big ? 1 : 0.7 });
        if (big) burst(q.x, q.y, [art('fish'), '✨'], 8, 50);
        flyTo(q, el.goldBox, '🪙', big ? 3 : 1);
      });
      return ponds.length > 0;
    },
    () => {
      const sheds = fieldCells().filter((c) => state.tools[c] === 'henhouse' || state.tools[c] === 'cowshed');
      sheds.forEach((c) => {
        const q = at(c);
        floatText(q.x, q.y - 16, `+${animalGold(state, c)}`, { cls: 'gold', size: 0.7 });
        flyTo(q, el.goldBox, '🪙', 1);
      });
      return sheds.length > 0;
    },
  ];
  for (const show of groups) {
    if (!show()) continue;
    sfx.coin();
    await sleep(EVENT_HOLD);
    await sleep(EVENT_GAP);
  }
  setGold(state.gold);
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

/** 組み合わせがそろった：2つの絵柄 ＋ が光って、その日だけ起きることを札で見せる */
async function showCombos(): Promise<void> {
  renderStatus();
  state.combos.forEach((id) => {
    if (!meta.discovered.includes(id)) meta.discovered.push(id);
  });
  saveMeta(meta);
  await comboBanner(state.combos);
}

/** フィーバーの役と大当たりの演出 */
async function playFeverRoles(events: FeverEvent[]): Promise<void> {
  for (const ev of events) {
    const name = SYMBOLS[ev.symbol].feverDesc.split(/：|: /)[0];
    const mid = center(el.field);
    switch (ev.role) {
      case 'breed':
        sfx.plant();
        floatText(mid.x, mid.y, L(`${name}！ 今日植える${CROPS[ev.crop].name}は育った状態から`, `${name}! ${CROPS[ev.crop].name} planted today start grown`), { cls: 'good', size: 1 });
        break;
      case 'grow':
        render();
        sfx.sun();
        flash('#bff3ff', 400);
        afterGrowth(ev.cells, '+1');
        floatText(mid.x, mid.y, L(`${name}！ 全作物＋1`, `${name}! All crops +1`), { cls: 'good', size: 1.1 });
        break;
      case 'festival':
        sfx.merchant();
        render();
        floatText(mid.x, mid.y, L(`${name}！ 今日の売値×${fmtMult(ev.mult)}`, `${name}! Prices ×${fmtMult(ev.mult)} today`), { cls: 'gold', size: 1.1 });
        el.field.querySelectorAll('.plot.ripe').forEach((p) => pop(p, 1.15));
        break;
      case 'compost':
        sfx.fertilizer();
        render();
        ev.cells.forEach((c) => {
          const q = center(el.field.children[c]);
          burst(q.x, q.y, ['✨', '💜'], 5, 40);
        });
        floatText(mid.x, mid.y, L(`${name}！ ${ev.cells.length}つに肥料`, `${name}! Fertilized ${ev.cells.length}`), { cls: 'combo', size: 1.1 });
        break;
      case 'honey':
        sfx.coin();
        floatText(mid.x, mid.y, `${name}! +${gold(ev.amount)}`, { cls: 'gold', size: 1.1 });
        flyTo(mid, el.goldBox, '🪙', 5);
        break;
      case 'bigsale': {
        sfx.lineHarvest();
        const total = ev.sold.reduce((n, r) => n + r.total, 0);
        render();
        floatText(mid.x, mid.y, ev.sold.length ? L(`${name}！ ${ev.sold.length}個を×2で +${total}`, `${name}! Sold ${ev.sold.length} at ×2: +${total}g`) : L(`${name}！（実りなし→大当たり2倍）`, `${name}! (nothing ripe → jackpot ×2)`), { cls: 'gold', size: 1.1 });
        if (ev.sold.length) flyTo(mid, el.goldBox, '🪙', 8);
        break;
      }
      case 'luck':
        sfx.charmGet();
        floatText(mid.x, mid.y, L(`${name}！ お守りを1つ選べる`, `${name}! Pick a charm`), { cls: 'good', size: 1.1 });
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
    const roll = rollNumber(m.x, m.y - 10, ev.jackpot, { prefix: L('大当たり +', 'Jackpot +'), size: ev.role === 'jackpot' ? 1.2 : 0.95, hold: 400, rise: true });
    // フィーバーの大当たりは金貨をたっぷり降らせ、財布へもどっさり飛ばす
    flyTo(m, el.goldBox, '🪙', Math.min(30, 8 + Math.ceil(ev.jackpot / 4)), () => setGold(state.gold));
    coinRain(Math.min(160, 70 + ev.jackpot));
    if (ev.role === 'jackpot') {
      confetti(60);
      coinRain(120);
    }
    await roll;
  }
  render();
}

/** 回す前に決める見せ方。結果はもう決まっているので、それに合わせて煽る */
interface SpinShow {
  /** カットインの色（0 青・1 緑・2 赤・3 虹）。null は出さない */
  cutIn: number | null;
}

function planShow(): SpinShow {
  const goodFever = state.fever.some((s) => SYMBOLS[s].rarity !== 'bad');
  const hot = goodFever || state.results.some((r) => r.symbol === 'goldSeed');
  // 当たりの日は多めに、外れの日もたまに出す（ガセ）。色が強いほど当たりやすい
  if (rng() >= (hot ? 0.6 : 0.08)) return { cutIn: null };
  const weights = hot ? [1, 2, 3, goodFever ? 1.5 : 0] : [6, 3, 1, 0];
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  const level = weights.findIndex((w) => (r -= w) < 0);
  return { cutIn: level < 0 ? 0 : level };
}

function spinReels(show: SpinShow = { cutIn: null }): Promise<void> {
  const reels = [...el.reels.children] as HTMLElement[];
  const h = reels[0].querySelector('.window')!.clientHeight;
  const last = state.results.length - 1;
  // リーチ：最後のリールより前で良い絵柄があと1つでそろう
  const counts = new Map<SymbolId, number>();
  state.results.slice(0, last).forEach((r) => counts.set(r.symbol, (counts.get(r.symbol) ?? 0) + 1));
  const reachSym = [...counts].find(([s, n]) => n >= CONFIG.feverCount - 1 && SYMBOLS[s].rarity !== 'bad')?.[0];
  const reach = reachSym !== undefined;
  // 最後のリールが金の種なら溜めを入れる。外れでもたまに溜めて読めないようにする
  const suspense = reach || state.results[last].symbol === 'goldSeed' || state.fever.some((s) => SYMBOLS[s].rarity !== 'bad') || (state.bag.goldSeed > 0 && rng() < 0.15);
  // カットインが出る日は、出ている間リールを回し続ける
  const extra = show.cutIn !== null ? CUTIN_MS : 0;
  const hold = reach ? 1500 : 600;
  if (show.cutIn !== null) later(() => void playCutIn(show.cutIn!), 150);
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
      later(() => {
        reel.classList.add('suspense');
        if (reach) {
          reel.classList.add('reach');
          el.machine.classList.add('spotlight');
          sfx.reach();
          vibrate([30, 290, 30, 290, 30]);
          // 何がそろいそうで、そろうと何が起きるか
          const call = document.createElement('div');
          call.className = 'reach-call';
          call.innerHTML = L(`リーチ！ あと1つで ${symHtml(reachSym!)}`, `REACH! One more ${symHtml(reachSym!)}`);
          el.machine.appendChild(call);
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
    });
  });
  return Promise.all(promises).then(() => {
    clearInterval(tick);
    tick = 0;
    el.machine.classList.remove('rumble', 'spotlight');
    el.machine.querySelector('.reach-call')?.remove();
  });
}

function onReelLanded(i: number, reel: HTMLElement): void {
  const sym = state.results[i].symbol;
  const c = center(reel);
  if (sym === 'goldSeed') {
    sfx.rare();
    flash('#ffe680', 500);
    burst(c.x, c.y, ['✨', '🌟', '💛'], 16, 110);
    floatText(c.x, c.y - 40, L('レア！金の種', 'Rare! Golden seed'), { cls: 'gold', size: 1 });
    vibrate([30, 30, 60]);
  }
  const total = state.results[i].total;
  if (total > 1) {
    renderCount(reel, i);
    pop(reel.querySelector('.count')!, 1.6);
    if (total >= 3) {
      sfx.bonus();
      burst(c.x, c.y, ['🌰', '✨'], 12, 80);
      floatText(c.x, c.y - 40, L(`種×${total}！`, `Seeds ×${total}!`), { cls: 'gold', size: 1 });
      vibrate(40);
    } else {
      floatText(c.x, c.y - 40, `×${total}`, { cls: 'good', size: 0.8 });
    }
  }
  const tag = reelTag(i);
  reel.className = `reel ${roleClass(sym)} ${sym === 'goldSeed' ? 'rare ' : ''}${SYMBOLS[sym].kind === 'auto' ? '' : tag.cls}`;
  reel.querySelector('.tag')!.textContent = SYMBOLS[sym].kind === 'auto' ? '…' : tag.text;
}

/** お邪魔がやって来る出発点：画面の左右の端（空なら上の方、地面なら同じ高さ） */
function edgeFrom(plot: Element, sky: boolean): { x: number; y: number } {
  const q = center(plot);
  const left = q.x > window.innerWidth / 2;
  return { x: left ? -40 : window.innerWidth + 40, y: sky ? Math.max(40, q.y - 220) : q.y };
}

async function resolveAutos(): Promise<void> {
  const reels = [...el.reels.children] as HTMLElement[];
  // リールが止まったときの演出（レア・種の数）が終わってから始める
  if (state.results.some((r) => SYMBOLS[r.symbol].kind === 'auto')) await sleep(EVENT_HOLD);
  for (let i = 0; i < state.results.length; i++) {
    if (SYMBOLS[state.results[i].symbol].kind !== 'auto') continue;
    const ev = resolveAuto(state, i, rng);
    if (!ev) continue;
    // いま動いている出目のリールを光らせる（どのリールの出来事か分かるように）
    actingReel = i;
    reels[i].classList.add('acting');
    const from = center(reels[i]);
    // 見せておく長さ（金貨はささっと回収するので短く）
    let hold = EVENT_HOLD;
    if (ev.type === 'coin') {
      autoOutcome[i] = `+${gold(ev.amount)}`;
      hold = 120;
      sfx.coin();
      floatText(from.x, from.y - 30, `+${ev.amount}`, { cls: 'gold', size: 0.9, dur: 700 });
      await new Promise<void>((r) => flyTo(from, el.goldBox, '🪙', Math.min(5, 1 + Math.ceil(ev.amount / 4)), r, true));
      setGold(state.gold);
    } else if (ev.type === 'merchant') {
      autoOutcome[i] = L(`売値×${fmtMult(ev.mult)}`, `Price ×${fmtMult(ev.mult)}`);
      sfx.merchant();
      burst(from.x, from.y, ['💰', '✨', '🪙'], 10, 70);
      floatText(from.x, from.y - 40, L(`今日の売値 ×${fmtMult(ev.mult)}！`, `Prices ×${fmtMult(ev.mult)} today!`), { cls: 'gold', size: 0.9 });
      render();
      el.field.querySelectorAll('.plot.ripe').forEach((p) => pop(p, 1.12));
    } else if (ev.type === 'clover') {
      autoOutcome[i] = L('明日 金の種↑', 'Gold seed↑');
      sfx.rare();
      burst(from.x, from.y, ['🍀', '✨', '🌟'], 12, 80);
      floatText(from.x, from.y - 40, L('明日は金の種が出やすい！', 'Golden seeds likelier tomorrow!'), { cls: 'good', size: 0.8 });
      renderStatus();
    } else if (ev.type === 'bug') {
      if (ev.cell === null) {
        autoOutcome[i] = L('空振り', 'Miss');
        floatText(from.x, from.y - 30, L('虫は空振り', 'The bug missed'), { size: 0.6 });
      } else {
        const plot = el.field.children[ev.cell] as HTMLElement;
        await travel(from, plot, symHtml('bug'), true);
        const p = center(plot);
        if (ev.warded) {
          autoOutcome[i] = ev.hen ? L('鶏が食べた', 'Hen ate it') : L('よけた', 'Blocked');
          sfx.shoo();
          if (ev.hen) critterPop(p, art('henhouse'));
          burst(p.x, p.y, ev.hen ? ['🪶', '✨'] : ['🌿', '✨'], 8, 50);
          floatText(p.x, ev.hen ? p.y + 28 : p.y - 20, ev.hen ? L('鶏がパクッ！', 'Hen gobbled it!') : L('虫よけ成功！', 'Bug blocked!'), { cls: 'good pill', size: 0.8 });
        } else {
          autoOutcome[i] = L(`成長−${ev.damage}`, `Growth −${ev.damage}`);
          sfx.bug();
          burst(p.x, p.y, ['🐛', '🍂'], 6, 40);
          floatText(p.x, p.y - 20, L(`かじられた！ 成長−${ev.damage}`, `Nibbled! Growth −${ev.damage}`), { cls: 'bad', size: 0.8 });
          shake(plot, 6);
          renderField();
        }
      }
    } else if (ev.type === 'weed') {
      if (ev.warded) {
        autoOutcome[i] = L('よけた', 'Blocked');
        sfx.shoo();
        floatText(from.x, from.y - 30, L('草よけ成功！', 'Weed blocked!'), { cls: 'good', size: 0.7 });
      } else if (!ev.cells.length) {
        autoOutcome[i] = L('空振り', 'Miss');
        floatText(from.x, from.y - 30, L('生える場所がない', 'Nowhere to grow'), { size: 0.6 });
      } else {
        autoOutcome[i] = L(`${ev.cells.length}か所`, `${ev.cells.length} spots`);
        sfx.bug();
        for (const c of ev.cells) {
          const plot = el.field.children[c] as HTMLElement;
          await new Promise<void>((r) => flyTo(from, plot, symHtml('weed'), 1, r));
          renderField();
          pop(plot, 1.15);
          const q = center(plot);
          floatText(q.x, q.y - 20, L('雑草が生えた…', 'Weeds sprouted…'), { cls: 'bad', size: 0.7 });
        }
      }
    } else if (ev.type === 'tanuki') {
      if (ev.escaped) {
        autoOutcome[i] = L('逃げた', 'Fled');
        sfx.shoo();
        floatText(from.x, from.y - 30, L('かかしがいてタヌキは近寄れない！', "The scarecrow kept the tanuki away!"), { cls: 'good', size: 0.7 });
        ev.guarded.forEach((c) => pop(el.field.children[c], 1.12));
      } else if (!ev.taken.length) {
        autoOutcome[i] = ev.stolen ? `−${gold(ev.stolen)}` : L('空振り', 'Miss');
        if (ev.stolen) {
          sfx.crow();
          const g = center(el.goldBox);
          floatText(g.x, g.y + 30, L(`タヌキにお金を盗まれた −${ev.stolen}`, `A tanuki stole gold −${ev.stolen}`), { cls: 'bad', size: 0.9 });
          setGold(state.gold);
          shake(el.goldBox, 6);
        } else floatText(from.x, from.y - 30, L('何も取れずに帰っていった', 'Left empty-handed'), { size: 0.6 });
      } else {
        autoOutcome[i] = `−${gold(ev.taken.reduce((n, t) => n + t.price, 0))}`;
        for (const t of ev.taken) {
          const plot = el.field.children[t.cell] as HTMLElement;
          // タヌキは畑の横から跳ねながら走ってくる
          await travel(edgeFrom(plot, false), plot, symHtml('tanuki'), true);
          sfx.crow();
          sfx.poof();
          const q = center(plot);
          burst(q.x, q.y, ['💨', '🍂'], 8, 50);
          floatText(q.x, q.y - 20, L(`持っていかれた！ −${t.price}`, `Stolen! ${t.price}g gone…`), { cls: 'bad', size: 0.9 });
          shake(plot, 8);
          renderField();
        }
        shake(el.app, 5);
        vibrate(120);
      }
    } else if (ev.type === 'mole') {
      autoOutcome[i] = ev.moves.length ? L(`${ev.moves.length}つ移動`, `Moved ${ev.moves.length}`) : ev.chased.length ? L('鶏が追い払った', 'Hen chased it') : L('空振り', 'Miss');
      // モグラが顔を出したところへ鶏が来て、追い払う
      for (const c of ev.chased) {
        const q = center(el.field.children[c]);
        critterPop(q, symHtml('mole'));
        await sleep(isCalm() ? 150 : 450);
        sfx.shoo();
        critterPop(q, art('henhouse'));
        burst(q.x, q.y, ['🪶', '💨'], 8, 50);
        floatText(q.x, q.y + 28, L('追い払った！', 'Chased off!'), { cls: 'good pill', size: 0.8 });
      }
      if (!ev.moves.length && !ev.chased.length) {
        floatText(from.x, from.y - 30, L('モグラは空振り', 'The mole missed'), { size: 0.6 });
      } else {
        sfx.poof();
        for (const m of ev.moves) {
          const fp = el.field.children[m.from] as HTMLElement;
          const q = center(fp);
          burst(q.x, q.y + 12, ['💨', '🌰'], 8, 40);
          // 土の中から顔を出し、作物をとなりへ押し出す
          critterPop(q, symHtml('mole'));
          pop(fp, 1.12);
        }
        await sleep(350);
        renderField();
        ev.moves.forEach((m) => {
          const q = center(el.field.children[m.to]);
          pop(el.field.children[m.to], 1.15);
          floatText(q.x, q.y - 20, L('押し出された！', 'Pushed out!'), { cls: 'bad', size: 0.7 });
        });
      }
    } else if (ev.type === 'frost') {
      autoOutcome[i] = ev.cells.length ? L(`${ev.cells.length}マス`, `${ev.cells.length} plots`) : L('空振り', 'Miss');
      if (ev.cells.length) {
        sfx.tax();
        flash('#dff1ff', 400);
        renderField();
        ev.cells.forEach((c) => {
          const q = center(el.field.children[c]);
          burst(q.x, q.y, ['❄️', '✨'], 8, 40);
          floatText(q.x, q.y - 20, L('凍った！', 'Frozen!'), { cls: 'bad', size: 0.8 });
        });
      }
    } else if (ev.type === 'locust') {
      // イナゴ：袋の中で増える（袋の札が跳ねる）。育ち中の作物があれば成長を1つかじる
      autoOutcome[i] = L(`袋+${ev.bred}`, `Bag +${ev.bred}`);
      sfx.bug();
      const chip = visibleOr(el.bag.querySelector('[data-sym="locust"]'), 'bag');
      floatText(from.x, from.y - 40, L(`イナゴが増えた！ +${ev.bred}`, `Locusts multiplied! +${ev.bred}`), { cls: 'bad', size: 0.9 });
      flyTo(from, chip, symHtml('locust'), ev.bred, () => pop(chip, 1.3));
      if (ev.cell !== null) {
        const plot = el.field.children[ev.cell] as HTMLElement;
        await travel(from, plot, symHtml('locust'), true);
        const p = center(plot);
        burst(p.x, p.y, ['🍂', '🍃'], 6, 40);
        floatText(p.x, p.y - 20, L('かじられた！ 成長−1', 'Nibbled! Growth −1'), { cls: 'bad', size: 0.8 });
        shake(plot, 6);
        renderField();
      }
      renderBag();
    } else if (ev.cell === null) {
      autoOutcome[i] = L('空振り', 'Miss');
      sfx.crow();
      floatText(from.x, from.y - 30, L('カラスは空振り', 'The crow missed'), { size: 0.6 });
    } else if (!ev.eaten) {
      autoOutcome[i] = L('セーフ', 'Safe');
      const plot = el.field.children[ev.cell] as HTMLElement;
      // カラスは空から羽ばたいて飛んでくる
      await travel(edgeFrom(plot, true), plot, symHtml('crow'), false);
      sfx.shoo();
      const p = center(plot);
      burst(p.x, p.y, ['💨', '🪶', '✨'], 8, 60);
      floatText(p.x, p.y - 20, ev.guarded ? L('かかしが追い払った！', 'Scarecrow chased it off!') : ev.crop && isRipe(ev.crop) ? L('セーフ！ 守った！', 'Safe! Protected!') : L('セーフ！', 'Safe!'), { cls: 'good', size: ev.crop && isRipe(ev.crop) ? 1 : 0.8 });
      pop(plot, 1.12);
    } else {
      autoOutcome[i] = L('パクッ…', 'Chomp…');
      const plot = el.field.children[ev.cell] as HTMLElement;
      // カラスは空から羽ばたいて飛んでくる
      await travel(edgeFrom(plot, true), plot, symHtml('crow'), false);
      sfx.crow();
      sfx.poof();
      const p = center(plot);
      burst(p.x, p.y, ['🪶', '💨', '🍂'], 8, 50);
      const lost = ev.crop ? (isRipe(ev.crop) ? L(`−${cropPrice(state, ev.crop)}`, `${cropPrice(state, ev.crop)}g gone…`) : CROPS[ev.crop.kind].name) : '';
      floatText(p.x, p.y - 20, L(`パクッ！ ${lost}`, `Chomp! ${lost}`), { cls: 'bad', size: ev.crop && isRipe(ev.crop) ? 1 : 0.8 });
      shake(plot, 8);
      if (ev.crop && isRipe(ev.crop)) {
        shake(el.app, 5);
        vibrate(120);
      }
      renderField();
    }
    if (ev.type === 'crow' && ev.toll > 0) {
      sfx.coin();
      floatText(center(el.goldBox).x, center(el.goldBox).y + 28, L(`通行料 +${ev.toll}`, `Toll +${ev.toll}`), { cls: 'gold', size: 0.8 });
      setGold(state.gold);
    }
    renderReelStates();
    // 1つずつ見せきってから、少し間を空けて次へ
    await sleep(hold);
    actingReel = null;
    reels[i].classList.remove('acting');
    await sleep(ev.type === 'coin' ? EVENT_GAP / 2 : EVENT_GAP);
  }
}

// ---- 出目を使う ----

/** 出目を残したまま次の日へ進むかの確認 */
function confirmSkip(left: number): void {
  el.overlay.innerHTML = `
    <div class="modal confirm-modal" role="dialog" aria-label="${L('確認', 'Confirm')}">
      <h2>${L(`出目が${left}つ残っています`, `${left} unused reel(s) left`)}</h2>
      <p class="sub">${L('使わずに次の日へ進むと消えます', 'They vanish if you move to the next day')}</p>
      <button class="primary" id="skip-yes">${L('次の日へ', 'Next day')}</button>
      <button class="secondary" id="skip-no">${L('もどる', 'Back')}</button>
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
  if (ui.busy || state.over) return;
  if (!tutAllowsReel(i)) {
    reject(el.reels.children[i], L('光っている所へ', 'Use the glowing spot'));
    return;
  }
  if (mustPlace(state)) {
    reject(el.reels.children[i], placeFirst());
    return;
  }
  const r = state.results[i];
  // 1日目の前と、使える出目がない（使い切った・使えない・自動）リールのタップは「回す」
  if (!r || state.day === 0) {
    void onSpin();
    return;
  }
  const def = SYMBOLS[r.symbol];
  // 手動の出目が残っているのに今は使えない：理由を出すだけで、次の日へは進めない（進むのはほかのリールか「次の日へ」の札で）
  if (def.kind === 'manual' && !r.used && !canUse(state, i, null)) {
    reject(el.reels.children[i], deadReason(r.symbol));
    if (selected === i) {
      selected = null;
      render();
    }
    return;
  }
  if (def.kind === 'auto' || r.used) {
    if (selected !== null) {
      selected = null;
      render();
    }
    void onSpin();
    return;
  }
  // 自動で選んでおいたリールを押したときは、外さずにそのまま（押した人は「選んだ」つもり）
  if (selected === i && autoSelected) {
    autoSelected = false;
    sfx.select();
    say(def.name);
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
  autoSelected = false;
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
  floatText(f.x, f.y - 60, L('満月！ 全作物＋1', 'Full moon! All crops +1'), { cls: 'gold', size: 1.1 });
  render();
  afterGrowth(affected, '+1');
}

function onPlotTap(cell: number): void {
  unlockAudio();
  if (ui.busy || state.over) return;
  const plot = el.field.children[cell] as HTMLElement;
  if (!tutAllowsCell(cell)) {
    reject(plot, L('光っている所へ', 'Use the glowing spot'));
    return;
  }
  const p = center(plot);
  if (mustPlace(state) && !canPlace(state, cell)) {
    reject(plot, PLACES[state.stock[0]].kind === 'tool' ? L('空きマスへ', 'Needs an empty plot') : L('置けるマスへ', 'Pick a valid plot'));
    return;
  }
  if (state.stock.length && canPlace(state, cell)) {
    place(state, cell);
    sfx.plant();
    sfx.charmGet();
    render();
    // 置いた：上から落ちてきてドンと弾み、金の波紋と土ぼこり（文字は出さない）
    dropIn(plot);
    later(() => {
      ripple(p.x, p.y, '#ffd84a');
      burst(p.x, p.y + 14, ['💨', '✨'], 8, 46);
      shake(el.field, 3);
    }, 180);
    return;
  }
  if (selected !== null) {
    const reel = selected;
    const sym = state.results[reel].symbol;
    if (!canUse(state, reel, cell)) {
      const crop = state.field[cell];
      reject(plot, SEEDS[sym] ? L('空きマスへ', 'Needs an empty plot') : SYMBOLS[sym].shape ? L('範囲に作物なし', 'No crops in range') : !crop ? L('作物なし', 'No crop') : L('肥料済み', 'Already fertilized'));
      return;
    }
    const power = state.results[reel].power;
    const affected = useSymbol(state, reel, cell) ?? [];
    const left = state.results[reel].left;
    selected = left > 0 && canUse(state, reel, null) ? reel : null;
    autoSelected = false;
    if (selected === null) autoSelect();
    done.use = true;
    armedNextDay = false;
    render();
    if (SEEDS[sym]) {
      sfx.plant();
      // 植えた：土が跳ねて緑の波紋（文字は出さない。残りの数はリールの ×N で分かる）
      ripple(p.x, p.y, sym === 'goldSeed' ? '#ffd84a' : '#7fd35a');
      burst(p.x, p.y + 10, sym === 'goldSeed' ? ['✨', '🌟'] : ['🌰', '🌱'], 7, 36);
      pop(plot, 1.15);
      if (left > 0 && selected === null) say(L('空きマスなし', 'No empty plots'));
    } else if (sym === 'hoe') {
      sfx.poof();
      affected.forEach((c, k) => {
        const q = center(el.field.children[c]);
        later(() => burst(q.x, q.y + 10, ['💨', '🌰'], 5, 34), k * 70);
      });
      floatText(p.x, p.y - 20, L('耕した！', 'Tilled!'), { cls: 'good', size: 0.8 });
    } else if (sym === 'fertilizer' && left > 0) {
      sfx.fertilizer();
      floatText(p.x, p.y - 20, L('売値×2！（あと1つ）', 'Price ×2! (1 more)'), { cls: 'combo', size: 0.9 });
    } else if (sym === 'rain') {
      sfx.rain();
      rainShower(shapeCells(state, 'cross', cell).map((c) => el.field.children[c]));
      afterGrowth(affected, `+${CONFIG.rainGrowth * power}`);
    } else if (sym === 'sun') {
      sfx.sun();
      sunBeam(shapeCells(state, 'column', cell).map((c) => el.field.children[c]));
      shapeCells(state, 'column', cell).forEach((c, k) => {
        const q = center(el.field.children[c]);
        later(() => burst(q.x, q.y, ['✨'], 4, 36), 200 + k * 70);
      });
      flash('#fff3a0', 300);
      afterGrowth(affected, `+${CONFIG.sunGrowth * power + state.charms.sunBlessing}`);
    } else if (sym === 'bee') {
      sfx.bee();
      beeFlight(shapeCells(state, 'x', cell).map((c) => el.field.children[c]), symHtml('bee'));
      shapeCells(state, 'x', cell).forEach((c, k) => {
        const q = center(el.field.children[c]);
        later(() => burst(q.x, q.y, ['🌼'], 3, 30), k * 220);
      });
      afterGrowth(affected, `+${CONFIG.beeGrowth * power}`);
      if (left > 0 && selected === null) say(L('使える場所なし', 'Nowhere to use it'));
    } else if (sym === 'thunder') {
      sfx.crt();
      flash('#fff6c0', 220);
      shapeCells(state, symbolShape(state, 'thunder')!, cell).forEach((c, k) => {
        const q = center(el.field.children[c]);
        later(() => burst(q.x, q.y, ['⚡', '✨'], 4, 36), k * 60);
      });
      shake(el.field, 4);
      afterGrowth(affected, `+${2 * power}`);
    } else if (sym === 'fertilizer') {
      sfx.fertilizer();
      burst(p.x, p.y, ['✨', '💜'], 10, 50);
      pop(plot, 1.15);
      floatText(p.x, p.y - 20, L('売値×2！', 'Price ×2!'), { cls: 'combo', size: 0.9 });
    }
    return;
  }
  if (state.frost[cell]) {
    shake(plot, 3);
    say(`${art('frost')} ${state.frost[cell]}${L('日', 'd')}`);
    return;
  }
  if (state.weeds[cell]) {
    if (!pullWeed(state, cell)) {
      reject(plot, needGold(weedCost(state)));
      return;
    }
    sfx.poof();
    burst(p.x, p.y, ['🍃', '💨'], 8, 50);
    floatText(p.x, p.y - 20, weedCost(state) ? L(`草むしり −${weedCost(state)}`, `Weeded −${weedCost(state)}g`) : L('草むしり！', 'Weeded!'), { size: 0.8 });
    render();
    return;
  }
  const tool = state.tools[cell];
  if (tool) {
    const ev = TOOL_EVOLVE[tool];
    say(`${PLACES[tool].name}：${PLACES[tool].desc}${ev ? `（${L('進化', 'evolve')} ${state.toolXp[cell]}/${ev.need}）` : ''}`);
    pop(plot, 1.08);
    return;
  }
  if (isPond(state, cell)) {
    pop(plot, 1.08);
    say(L(`釣り堀：毎晩+${CONFIG.fishGold}`, `Fishing pond: +${CONFIG.fishGold}g nightly`));
    return;
  }
  const root = rootOf(state, cell);
  const crop = state.field[root];
  if (isRipe(crop)) {
    sellCrop(root);
    return;
  }
  if (crop) {
    shake(plot, 3);
    const def = CROPS[crop.kind];
    say(`${def.name} ${gold(def.price)}`);
  } else {
    say(state.stock.length ? L('置けない', "Can't place here") : L('空き', 'Empty'));
  }
}

/** 育って新しく列がそろったら、その列を光らせて知らせる */
function announceLines(cells: number[], delay = 500): number {
  const formed = [...new Set(cells.flatMap((c) => (isRipe(state.field[c]) ? [ripeGroup(state, c)] : [])).filter((g) => g.length >= 3).map((g) => [...g].sort((a, b) => a - b).join()))];
  formed.forEach((key, k) => {
    const group = key.split(',').map(Number);
    later(() => {
      sfx.bonus();
      group.forEach((c, j) => later(() => pop(el.field.children[c], 1.12), j * 60));
      const pts = group.map((c) => center(el.field.children[c]));
      const q = { x: pts.reduce((n, v) => n + v.x, 0) / pts.length, y: pts.reduce((n, v) => n + v.y, 0) / pts.length };
      floatText(q.x, q.y - 10, `${MARK_LINE} ${L('列ができた！', 'Line formed!')}`, { cls: 'combo pill', size: 0.95, dur: 1300 });
    }, delay + k * 250);
  });
  return formed.length;
}

function afterGrowth(cells: number[], label: string): void {
  announceLines(cells);
  // 一度にいくつも実ったら、文字は「実った！×N」を1つだけ（文字が重なると何が起きたか分からない）
  const ripened = cells.filter((c) => isRipe(state.field[c]));
  if (ripened.length >= 2) {
    const pts = ripened.map((c) => center(el.field.children[c]));
    const q = { x: pts.reduce((n, v) => n + v.x, 0) / pts.length, y: Math.min(...pts.map((v) => v.y)) };
    later(() => floatText(q.x, q.y - 30, L(`実った！ ×${ripened.length}`, `Ripe! ×${ripened.length}`), { cls: 'gold pill', size: 1 }), 150);
  }
  cells.forEach((cell, k) => {
    const plot = el.field.children[cell] as HTMLElement;
    const p = center(plot);
    const crop = state.field[cell];
    later(() => {
      pop(plot.querySelector('.crop') ?? plot, 1.35);
      if (crop && isRipe(crop) && ripened.length >= 2) {
        sfx.pon();
        plot.classList.add('just-ripe');
        later(() => plot.classList.remove('just-ripe'), 700);
        burst(p.x, p.y, ['✨', '⭐'], 6, 50);
      } else if (crop && isRipe(crop)) {
        sfx.pon();
        plot.classList.add('just-ripe');
        later(() => plot.classList.remove('just-ripe'), 700);
        const big = CROPS[crop.kind].price >= 20;
        burst(p.x, p.y, ['✨', big ? '🌟' : '⭐'], 8, 50);
        floatText(p.x, p.y - 20, big ? L(`実った！ ${cropPrice(state, crop, cell)}`, `Ripe! ${cropPrice(state, crop, cell)}g`) : L('実った！', 'Ripe!'), {
          cls: big ? 'gold pill' : 'good pill',
          size: big ? 1 : 0.8,
        });
      } else {
        floatText(p.x, p.y - 20, label, { cls: 'good', size: 0.7 });
      }
    }, 150 + k * 80);
  });
}

/** 作物の真ん中（大物は4マスの真ん中） */
function cropCenter(cell: number): { x: number; y: number } {
  const pts = cropCells(state, cell).map((c) => center(el.field.children[c]));
  return { x: pts.reduce((n, q) => n + q.x, 0) / pts.length, y: pts.reduce((n, q) => n + q.y, 0) / pts.length };
}

function sellCrop(cell: number): void {
  const p = cropCenter(cell);
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
  // 注文達成：お客さんからまとめて代金（列で売ったときは、列の演出が終わってから）
  const orderDone = () => {
    if (!res.orderReward) return;
    sfx.bigBuy();
    const o = center(el.order);
    floatText(o.x, o.y + 30, L(`注文達成！ +${res.orderReward}`, `Order done! +${res.orderReward}g`), { cls: 'gold', size: 1.3, dur: 1600 });
    burst(o.x, o.y, ['🪙', '✨', '⭐'], 16, 90);
    flyTo(o, el.goldBox, '🪙', 8, () => setGold(state.gold));
    pop(el.order, 1.1);
    vibrate([40, 30, 80]);
  };
  if (!res.line) later(orderDone, 500);
  if (res.line) {
    done.line = true;
    void playLineHarvest(res, centers, p).finally(() => {
      orderDone();
      goldHeld = Math.max(0, goldHeld - 1);
      if (!goldHeld) setGold(state.gold);
    });
  } else {
    sfx.sell(price, combo);
    const size = Math.min(2, 0.8 + price / 25);
    floatText(p.x, p.y - 10, `+${price}`, { cls: 'gold', size, rise: big ? 110 : 70 });
    floatText(p.x, p.y + 18, L('単品（半値）', 'Single (half price)'), { cls: 'pill', size: 0.6, dur: 900 });
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
  // 作物が1つずつ跳ねて財布に吸い込まれる
  const arrivals = res.cells.map(({ cell: c, price: each, kind }, k) =>
    new Promise<void>((resolve) => {
      later(() => {
        const q = centers[c];
        sfx.sell(each, combo + k);
        ghosts[k].remove();
        pop(el.field.children[c], 1.2);
        // 1つずつの額は短めに見せて、合計が出る前に消す（真ん中の数字と重ならないように）
        floatText(q.x, q.y - 10, `+${each}`, { cls: 'gold', size: Math.min(1.4, 0.75 + each / 30), dur: 650 });
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
  await sleep(250);
  setGold(state.gold);
  // 合計が桁ごとに回って止まる
  const amount = res.total;
  shake(el.app, shakeFor(amount));
  scanlines(Math.min(1, amount / 250));
  vibrate(level >= 2 ? [40, 30, 120] : [30, 20, 60]);
  if (level >= 2) confetti(20 + level * 20);
  if (level >= 3) coinRain(30 + level * 10);
  await rollNumber(f.x, f.y, amount, { prefix: '+', size: 0.9 + level * 0.15, hold: 500 + level * 150 });
  if (res.bumper) await bigHarvestFinale(res.bumper);
}

// ---- 強化 ----

function onBuy(id: UpgradeId): void {
  unlockAudio();
  if (ui.busy || state.over) return;
  const card = $('stall').querySelector(`[data-id="${id}"]`) as HTMLElement;
  if (mustPlace(state)) {
    reject(card, placeFirst());
    return;
  }
  if (!upgradeAvailable(state, id)) {
    const sym = UPGRADE_SYMBOL[id]!.symbol;
    reject(card, UPGRADE_SYMBOL[id]!.delta < 0 && state.bag[sym] === 0 ? L('もういない', 'None left') : UPGRADE_SYMBOL[id]!.delta < 0 ? L('来週また消せる', 'Again next week') : L('今週は並んでいない', 'Not in stock this week'));
    return;
  }
  if (!canBuy(state, id)) {
    reject(card, needGold(upgradePrice(state, id)));
    return;
  }
  accept(card);
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
    floatText(window.innerWidth / 2, window.innerHeight * 0.35, L('はじめての強化！', 'First upgrade!'), { cls: 'gold', size: 1.3, dur: 1500 });
  }
}

// ---- 始める（新しく・続きから） ----

function startGame(resume: GameState | null = null): void {
  setState(resume ?? newGame(setupFrom(meta)));
  el.field.classList.remove('withered');
  if (resume) Object.keys(done).forEach((k) => (done[k as keyof typeof done] = true));
  else clearRun();
  selected = null;
  armedNextDay = false;
  if (!resume) done.spin = false;
  tut = null;
  document.getElementById('coach')?.remove();
  if (!resume && !meta.tutorialDone) startTutorial();
  if (resume) autoSelect();
  el.overlay.classList.remove('show', 'title');
  el.overlay.innerHTML = '';
  el.reels.innerHTML = '';
  el.shop.innerHTML = '';
  $('remove-shop').innerHTML = '';
  render();
}

// ---- 押す回数を減らす：なぞって植える・リールから畑へ引っぱる・使える出目が1つなら選んでおく ----

/** なぞる・引っぱる操作のあとに1回だけ来る click（押し始めた要素のもの）は無視する */
let suppressClick: { kind: 'plot' | 'reel'; until: number } | null = null;
function clickAllowed(kind: 'plot' | 'reel'): boolean {
  const s = suppressClick;
  if (!s || s.kind !== kind) return true;
  suppressClick = null;
  return performance.now() > s.until;
}

/** 指の下にある畑のマス */
function plotAt(x: number, y: number): number | null {
  const p = document.elementFromPoint(x, y)?.closest<HTMLElement>('.plot');
  if (!p || !el.field.contains(p)) return null;
  const i = [...el.field.children].indexOf(p);
  return i >= 0 && inField(state, i) ? i : null;
}

let drag: { kind: 'plant' | 'reel'; reel: number; x: number; y: number; moved: boolean; last: number | null; ghost: HTMLElement | null } | null = null;

/** 種を選んでいるとき：押したマスから、なぞったマスへ続けて植える */
el.field.addEventListener('pointerdown', (e) => {
  if (ui.busy || state.over || selected === null || !SEEDS[state.results[selected].symbol]) return;
  const cell = plotAt(e.clientX, e.clientY);
  if (cell === null || !canUse(state, selected, cell) || !tutAllowsCell(cell)) return;
  // 自動で選んだだけの種は、押した瞬間には植えない（長押しの説明を見たいだけかもしれない）。
  // なぞり始めたら植える。動かさずに離したら、ふつうのタップとして植わる
  const pending = autoSelected;
  drag = { kind: 'plant', reel: selected, x: e.clientX, y: e.clientY, moved: !pending, last: cell, ghost: null };
  if (pending) return;
  suppressClick = { kind: 'plot', until: Infinity };
  blockLongPress();
  onPlotTap(cell);
});

/** 使える出目のリールを押して引っぱると、畑のマスへ持っていける（離したマスに使う） */
el.reels.addEventListener('pointerdown', (e) => {
  const reel = (e.target as Element).closest<HTMLElement>('.reel');
  if (!reel || ui.busy || state.over || state.day === 0) return;
  const i = Number(reel.dataset.i);
  const r = state.results[i];
  if (!r || r.used || !canUse(state, i, null) || SYMBOLS[r.symbol].shape === 'all' || !tutAllowsReel(i)) return;
  drag = { kind: 'reel', reel: i, x: e.clientX, y: e.clientY, moved: false, last: null, ghost: null };
});

document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.kind === 'plant') {
    const cell = plotAt(e.clientX, e.clientY);
    if (cell === null || cell === drag.last || selected !== drag.reel || !canUse(state, drag.reel, cell) || !tutAllowsCell(cell)) return;
    if (!drag.moved) {
      // なぞり始め：押したマスにも植える
      drag.moved = true;
      suppressClick = { kind: 'plot', until: Infinity };
      blockLongPress();
      onPlotTap(drag.last!);
      if (selected !== drag.reel || !canUse(state, drag.reel, cell)) return;
    }
    drag.last = cell;
    onPlotTap(cell);
    return;
  }
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 12) return;
    // 引っぱり始め：その出目を選んで、指に絵柄を持たせる
    drag.moved = true;
    autoSelected = false;
    suppressClick = { kind: 'reel', until: Infinity };
    blockLongPress();
    selected = drag.reel;
    armedNextDay = false;
    sfx.select();
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'drag-ghost';
    drag.ghost.innerHTML = symHtml(state.results[drag.reel].symbol);
    document.body.appendChild(drag.ghost);
    render();
  }
  drag.ghost!.style.translate = `${e.clientX}px ${e.clientY}px`;
  const cell = plotAt(e.clientX, e.clientY);
  if (cell !== previewCell) {
    previewCell = cell;
    renderField();
  }
});

function endDrag(e: PointerEvent): void {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.ghost?.remove();
  if (d.kind === 'reel' && d.moved) {
    const cell = plotAt(e.clientX, e.clientY);
    // 使えるマスで離したら使う。ほかで離したら選んだままにする（あとでマスをタップできる）
    if (cell !== null && selected === d.reel && canUse(state, d.reel, cell) && tutAllowsCell(cell)) onPlotTap(cell);
  }
  if (suppressClick) suppressClick.until = performance.now() + 350;
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

/** 今選ばれているリールは、自動で選んだもの */
let autoSelected = false;

/** 使える出目が1つだけなら、最初から選んでおく（リールを押す手間を省く） */
function autoSelect(): void {
  if (tut || selected !== null || state.over) return;
  const usable = usableReels();
  if (usable.length !== 1) return;
  const r = state.results[usable[0]];
  if (SYMBOLS[r.symbol].shape === 'all') return;
  selected = usable[0];
  autoSelected = true;
}

// ---- チュートリアル：初めての人の最初の2日を案内する ----

interface TutStep {
  /** 吹き出しの文 */
  text: string;
  /** 光らせる要素 */
  focus: () => Element[];
  /** タップしてよいリール（なければリールは「回す」だけ、spin も false なら触れない） */
  reel?: number;
  /** リールで次の日へ回してよい */
  spin?: boolean;
  /** タップしてよいマス */
  cells?: number[];
  /** 終わったか（ボタンで進む手順は undefined） */
  done?: () => boolean;
  /** 押して進むボタン */
  button?: string;
}

/** 横一列（真ん中の行）の3マス */
const tutRow = (): number[] => [0, 1, 2].map((x) => CONFIG.fieldCols + x);
const reelEl = (i: number): Element[] => (el.reels.children[i] ? [el.reels.children[i]] : []);
const plotEls = (cells: number[]): Element[] => cells.map((c) => el.field.children[c]).filter(Boolean);

const TUT_STEPS: TutStep[] = [
  { text: L('ようこそ！ まずは<b>リールをタップ</b>して回そう', 'Welcome! First, <b>tap the reels</b> to spin'), focus: () => [el.reels], spin: true, done: () => state.day >= 1 && !ui.busy },
  { text: `${symHtml('seed')} ${L('種が出た！ <b>種のリール</b>をタップ', 'A seed! Tap the <b>seed reel</b>')}`, focus: () => reelEl(0), reel: 0, done: () => selected === 0 || tutRow().some((c) => state.field[c]) },
  { text: L('光る<b>横一列の3マス</b>に植えよう。<br>3つ並べると<b>列ごと高く売れる</b>！', 'Plant in the <b>3 glowing plots</b>.<br>3 in a row <b>sell high as a line</b>!'), focus: () => plotEls(tutRow()), reel: 0, cells: tutRow(), done: () => tutRow().every((c) => state.field[c]) },
  { text: `${symHtml('rain')} ${L('次は雨。<b>雨のリール</b>をタップして<br><b>真ん中のトマト</b>へ（縦横に育つ）', 'Now rain. Tap the <b>rain reel</b>,<br>then the <b>middle tomato</b> (grows a cross)')}`, focus: () => (selected === 1 ? plotEls([tutRow()[1]]) : reelEl(1)), reel: 1, cells: [tutRow()[1]], done: () => !!state.results[1]?.used },
  { text: L('今日はここまで。<b>リールをタップ</b>で次の日へ', "That's today. <b>Tap the reels</b> for the next day"), focus: () => [el.reels], spin: true, done: () => state.day >= 2 && !ui.busy },
  { text: `${symHtml('thunder')} ${L('雷！ 横一列が<b>+2</b>育つ。<br>雷をタップ → <b>トマトの列</b>へ', 'Thunder! A row grows <b>+2</b>.<br>Tap thunder → the <b>tomato row</b>')}`, focus: () => (selected === 0 ? plotEls(tutRow()) : reelEl(0)), reel: 0, cells: tutRow(), done: () => !!state.results[0]?.used },
  { text: L('3つそろって実った！<br><b>タップで列ごと売ろう</b>', 'All 3 are ripe!<br><b>Tap to sell the whole line</b>'), focus: () => plotEls(tutRow()), cells: tutRow(), done: () => state.stats.lineHarvests >= 1 && !ui.busy },
  { text: L(`${MARK_LINE} 列は<b>×1.3</b>、同じ作物だけの列は<b>さらに×1.3</b>。<br>${MARK_SINGLE} 並んでいない<b>単品は半値</b>！<br>種を選ぶと、列になるマスに倍率が出るよ`, `${MARK_LINE} Lines are <b>×1.3</b>; single-crop lines get <b>another ×1.3</b>.<br>${MARK_SINGLE} Crops not in a line sell at <b>half price</b>!<br>Pick a seed to see line multipliers on the plots`), focus: () => [], button: L('なるほど', 'Got it') },
  { text: `${art('official')} ${L('7日ごとに<b>年貢</b>。払えないと終わり。<br><b>7回納める（49日目）とクリア</b>！', "Every 7 days there's a <b>tax</b>. Can't pay = game over.<br><b>Pay 7 times (day 49) to win</b>!")}`, focus: () => [el.tax], button: L('次へ', 'Next') },
  { text: `${art('bargain')} ${L('毎日、看板に<b>仕入れ</b>が3つ並ぶ。<br>1つ選ぶとタダで袋に入る。<br>お金は<b>ショップ</b>で畑の道具に', 'Each day the sign offers <b>3 symbols</b>.<br>Pick one to add it for free.<br>Spend gold on farm tools in the <b>shop</b>')}`, focus: () => [document.querySelector('.tab[data-sheet="shop"]')!], button: L('はじめる！', "Let's go!") },
];

let tut: { step: number } | null = null;
let tutFocus: Element[] = [];

function tutStep(): TutStep | null {
  return tut ? TUT_STEPS[tut.step] : null;
}

function startTutorial(): void {
  tut = { step: 0 };
}

function endTutorial(): void {
  tut = null;
  meta.tutorialDone = true;
  saveMeta(meta);
  tutFocus.forEach((e) => e.classList.remove('coach-focus'));
  tutFocus = [];
  document.getElementById('coach')?.remove();
  render();
}

/** チュートリアルの日は出目を決めておく（1日目：種×3・雨・金貨、2日目：雷・金貨・金貨） */
function tutScript(): void {
  if (!tut) return;
  const mk = (symbol: SymbolId, total = 1) => ({ symbol, used: false, total, left: total, power: 1 });
  const plan: Record<number, ReturnType<typeof mk>[]> = { 1: [mk('seed', 3), mk('rain'), mk('coin')], 2: [mk('thunder'), mk('coin'), mk('coin')] };
  const r = plan[state.day];
  if (!r) return;
  state.results = [...r, ...state.results.slice(r.length).map(() => mk('coin'))];
  state.fever = [];
}

/** そのリールに触れてよいか */
function tutAllowsReel(i: number): boolean {
  const s = tutStep();
  return !s || s.reel === i || (!!s.spin && s.reel === undefined);
}

/** 次の日へ回してよいか */
function tutAllowsSpin(): boolean {
  const s = tutStep();
  return !s || !!s.spin;
}

function tutAllowsCell(cell: number): boolean {
  const s = tutStep();
  return !s || !!s.cells?.includes(cell);
}

function renderTutorial(): void {
  while (tut && TUT_STEPS[tut.step].done?.()) {
    tut.step++;
    if (tut.step >= TUT_STEPS.length) return endTutorial();
  }
  const s = tutStep();
  tutFocus.forEach((e) => e.classList.remove('coach-focus'));
  tutFocus = [];
  let coach = document.getElementById('coach');
  if (!s) {
    coach?.remove();
    return;
  }
  if (!coach) {
    coach = document.createElement('div');
    coach.id = 'coach';
    coach.className = 'coach';
    coach.setAttribute('role', 'status');
    document.body.appendChild(coach);
  }
  const html = `<p>${s.text}</p><div class="coach-actions">${s.button ? `<button class="primary coach-next">${s.button}</button>` : ''}<button class="coach-skip">${L('スキップ', 'Skip')}</button></div>`;
  if (coach.dataset.step !== String(tut!.step)) {
    coach.dataset.step = String(tut!.step);
    coach.innerHTML = html;
    pop(coach, 1.04);
    coach.querySelector('.coach-next')?.addEventListener('click', () => {
      sfx.select();
      tut!.step++;
      if (tut!.step >= TUT_STEPS.length) endTutorial();
      else render();
    });
    coach.querySelector('.coach-skip')!.addEventListener('click', () => {
      sfx.cancel();
      endTutorial();
    });
  }
  // 吹き出しは光らせる物とかぶらない側へ（畑・リールなら上、上の札なら下）
  tutFocus = s.focus().filter(Boolean);
  tutFocus.forEach((e) => e.classList.add('coach-focus'));
  coach.classList.toggle('low', tutFocus.some((e) => e === el.tax));
}

// ---- 起動 ----

$('build-label').textContent = __BUILD__;
// 絵の立体の塗り（グラデーション）の定義をページに1回だけ置く
document.body.insertAdjacentHTML('afterbegin', gradientDefs());
applyStaticLang();
applySettings();
// ホーム画面に置いたとき・電波がないときも遊べるように（公開版だけ）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
// 画面を離れている間は音を止める
document.addEventListener('visibilitychange', () => suspendAudio(document.hidden));
// 思わぬエラーが起きても、遊び続けられるようにひと言だけ出す（途中は保存されている）
const OOPS = L('うまく動かない所がありました。おかしければ再読み込みしてください', 'Something went wrong. If things look off, please reload');
window.addEventListener('error', () => say(OOPS, 4000));
window.addEventListener('unhandledrejection', () => say(OOPS, 4000));
el.spin.addEventListener('click', () => void onSpin());
$('spin-go').addEventListener('click', () => void onSpin());
el.tax.addEventListener('click', () => {
  const t = nextTax(state);
  say(
    `${state.difficulty ? `【${DIFFICULTIES[state.difficulty].name}】` : ''}` +
      L(
        `年貢 ${t.amount}・${t.daysLeft === 0 ? '今日の終わり' : `あと${t.daysLeft}日`}（${state.day}日目）${state.cleared ? '' : `・クリアまであと${CONFIG.winTaxes - state.taxesPaid}回`}`,
        `Tax ${t.amount}g · ${t.daysLeft === 0 ? 'due today' : `${t.daysLeft} days left`} (day ${state.day})${state.cleared ? '' : ` · ${CONFIG.winTaxes - state.taxesPaid} more to win`}`,
      ),
    3000,
  );
});
el.order.addEventListener('click', () => {
  const o = state.order;
  if (!o) return;
  const left = o.dueDay - state.day;
  say(
    o.done
      ? L(`注文達成 +${o.reward}`, `Order done +${o.reward}g`)
      : L(`注文：${CROPS[o.crop].name}を${o.need}個 → +${o.reward}（${left > 0 ? `あと${left}日` : '今日まで'}）`, `Order: ${o.need} ${CROPS[o.crop].name} → +${o.reward}g (${left > 0 ? `${left} days left` : 'due today'})`),
    3000,
  );
});
el.goldBox.querySelector('.stat-icon')!.innerHTML = art('coin');
// メニューの印（絵文字の代わりに自作の絵）
$('help').innerHTML = `${art('question')}${L('遊び方', 'How to play')}`;
$('settings-btn').innerHTML = `${art('gear')}${L('設定', 'Settings')}`;
$('to-title').innerHTML = `${art('home')}${L('タイトルへ', 'Title')}`;
// 早送り中の印（自作の絵）
$('hurry-badge').innerHTML = `${art('fastForward')}<b>${L('早送り', 'FAST')}</b><span>×4</span>`;
document.querySelector('.machine-top')!.innerHTML = `${art('coin')} ${L('畑スロット', 'FARM SLOTS')} ${art('coin')}`;
// 毎日の仕入れ：看板を押すと窓が開き、効果を見て選ぶ
document.querySelector('.machine-top')!.addEventListener('click', () => {
  if (!state.offer.length || ui.busy || state.over || tut) return;
  unlockAudio();
  sfx.select();
  showOfferPick();
});

/** 仕入れの窓：3つの絵柄の効果と、袋に入れたときの出やすさの変化を見て1つ選ぶ */
function showOfferPick(): void {
  const cards = state.offer
    .map((id) => {
      const sym = UPGRADE_SYMBOL[id]!.symbol;
      const def = SYMBOLS[sym];
      const after = { ...state.bag, [sym]: state.bag[sym] + 1 };
      return `<button class="charm-card offer-card" data-take="${id}">
        <span class="e">${symHtml(sym)}</span>
        <span class="oc-text"><b>${def.name}${def.shape ? `<span class="oc-shape">${shapeIcon(def.shape)}</span>` : ''}</b>
        <span class="oc-desc">${def.desc}</span>
        <span class="oc-odds">${art('seed')}×${state.bag[sym]} → <b>×${state.bag[sym] + 1}</b>　${bagPct(state.bag, sym)}% → <b>${bagPct(after, sym)}%</b></span></span>
      </button>`;
    })
    .join('');
  el.overlay.innerHTML = `
    <div class="modal charm-modal offer-modal" role="dialog" aria-label="${L('今日の仕入れ', 'Daily pick')}">
      <h2>${art('seed')} ${L('今日の仕入れ', 'Daily pick')}</h2>
      <div class="charm-choices">${cards}</div>
      <button class="secondary" id="offer-skip">${L('今日は見送る', 'Skip for now')}</button>
    </div>`;
  el.overlay.classList.add('show');
  const close = () => {
    el.overlay.classList.remove('show');
    el.overlay.innerHTML = '';
  };
  $('offer-skip').addEventListener('click', () => {
    sfx.cancel();
    close();
  });
  el.overlay.querySelectorAll<HTMLButtonElement>('[data-take]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.take as AddUpgradeId;
      const from = center(b.querySelector('.e')!);
      if (!takeOffer(state, id)) return;
      const sym = UPGRADE_SYMBOL[id]!.symbol;
      sfx.buy();
      accept(b);
      later(() => {
        close();
        render();
        ripple(from.x, from.y, '#ffd84a');
        const chip = visibleOr(el.bag.querySelector(`[data-sym="${sym}"]`), 'bag');
        flyTo(from, chip, symHtml(sym), 1, () => {
          pop(chip, 1.35);
          burst(center(chip).x, center(chip).y, ['✨'], 6, 30);
        });
      }, 260);
    }),
  );
}
// 演出の最中に画面をタップすると早送り
// 窓（お守り選び・確認など）や案内の吹き出しを押したときは、選ぶための操作なので早送りにしない
document.addEventListener('pointerdown', (e) => {
  if (!ui.busy) return;
  if ((e.target as Element | null)?.closest('#overlay.show, .coach, .sheet')) return;
  setHurry(true);
}, { capture: true });
// 押した瞬間の手応え
pressable(el.field, '.plot');
pressable(el.reels, '.reel');
pressable($('sheet'), '.item');
document.querySelectorAll<HTMLElement>('.tabs').forEach((t) => pressable(t, '.tab'));

document.querySelectorAll<HTMLElement>('.tab-ico[data-art]').forEach((n) => (n.innerHTML = art(n.dataset.art as ArtId)));
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    unlockAudio();
    if (ui.busy) return;
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
  el.mute.innerHTML = isMuted() ? `${art('mute')}${L('音オフ', 'Sound off')}` : `${art('speaker')}${L('音オン', 'Sound on')}`;
  $('calm-btn').innerHTML = `${art('sparkle')}${isCalm() ? L('演出 控えめ', 'Effects: calm') : L('演出 ふつう', 'Effects: normal')}`;
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
$('settings-btn').addEventListener('click', () => {
  menu.hidden = true;
  if (ui.busy || el.overlay.classList.contains('show')) return;
  unlockAudio();
  sfx.select();
  showSettings(() => {
    menuLabels();
    render();
  });
});
// タイトルへ：途中は自動で保存されているので、続きからで戻れる
$('to-title').addEventListener('click', () => {
  menu.hidden = true;
  if (ui.busy || el.overlay.classList.contains('show')) return;
  sfx.select();
  saveRun();
  showTitle();
});
el.help.addEventListener('click', () => {
  menu.hidden = true;
  // 年貢・お守り・結果などの画面の上には開かない
  if (ui.busy || el.overlay.classList.contains('show')) return;
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
hooks.render = render;
hooks.startGame = startGame;
hooks.setGold = setGold;
applySkin();
setupLongPress();
setupScene();
render();
showTitle();
