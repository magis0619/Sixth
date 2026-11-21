import { applyStaticLang, gold, L } from './i18n.ts';
import './style.css';
import {
  symbolBase, type ShapeId, DIFFICULTIES, FARMERS, TOOL_EVOLVE, CONFIG, CROPS, PLACES, SEEDS, SYMBOLS, UPGRADE_SYMBOL, type PlaceId, type SymbolId,
} from './config.ts';
import {
  canPlace, canUse, cellMultiplier, cropPrice, drawSymbol, endDay, inField, inSameCropLine, isRipe, place, shapeCells, ripeGroup, newGame, nextTax, pullWeed, weedCost, resolveFever, type FeverEvent, resolveAuto, sell, useSymbol, validTargets, type GameState, bigCells, cropCells, isPond, rootOf, waterWheels, wheelGold, animalGold, plantLineMult, mustPlace, refreshCombos, symbolShape, isRareOffer, isMarketDay, shopOpen, nextMarketDay, beginDay, spinDay, sellBlock, isFlooded,
} from './game.ts';
import { isMuted, sfx, suspendAudio, toggleMute, unlockAudio } from './audio.ts';
import { saveMeta, setupFrom } from './meta.ts';
import { art, gradientDefs, type ArtId } from './art.ts';
import { track } from './telemetry.ts';
import {
  burst, center, coinRain, dropIn, PEST_SPEED, ripple, confetti, flash, floatText, flyTo, isCalm, pop, rollNumber, scanlines, shake, shakeFor, sleep, toggleCalm, vibrate, rainShower, setHurry, later, fmtMult, travel, sunBeam, beeFlight, growUp,
} from './fx.ts';
import {
  FRUIT, PLACE_ART, setHtml, STAGE_NAMES, type SheetName, closeSheet, cropEmoji, openSheet, openSheetName, roleClass, say, shapeIcon, stageOf, symHtml, visibleOr, MARK_LINE, MARK_SINGLE,
} from './ui/view.ts';
import { applySkin, showClear, showGameOver, showHelp, showTitle } from './ui/screens.ts';
import { clearRun, saveRun } from './ui/save.ts';
import { $, el, hooks, meta, rng, setState, state, ui } from './ui/store.ts';
import { done, play } from './ui/play.ts';
import { pressable } from './ui/press.ts';
import { applySettings, showSettings } from './ui/settings.ts';
import { reject } from './ui/states.ts';
import { renderDanger, renderSky, setupScene } from './ui/scene.ts';
import { blockLongPress, setupLongPress } from './ui/info.ts';
import { comboCard, contractCard, explainOnce, feverCard, markTutorialSymbols, symbolCard, taxCard } from './ui/explain.ts';
import { contractSay, showContractDone, showContractOffer } from './ui/contract-ui.ts';
import { comboBanner, feverBanner, showCharmOffer, showTaxStamp, witherField } from './ui/shows.ts';
import { syncGold, holdGold } from './ui/gold-display.ts';
import { noteSeen, PEST_HINTS, flushNotices, showHintCard, EVENT_GAP } from './ui/notices.ts';
import { fitLayout, renderGuide, fieldCells, usableReels, renderGoal, renderTax, renderCharms, renderStatus } from './ui/hud.ts';
import { reelTag, renderCount, spinReels, resultArt, type SpinShow } from './ui/reel-spin.ts';
import { playLineHarvest, money } from './ui/harvest-fx.ts';
import { TUT_OFFER, tutAllowsCell, tutStep, TUT_STEPS, tutAllowsSpin, tutAllowsReel, placeTutSpot } from './ui/tutorial.ts';
import { renderBag, openMarket, renderFarmShop, needGold, holdMarket, forcedOffer, longTotal, renderShop, placeFirst } from './ui/market.ts';

/** 演出を1つ始める。終わったら戻す関数を返す（吹き出しの表示もすぐ合わせる） */
function holdCoach(): () => void {
  play.fxRunning++;
  document.getElementById('coach')?.classList.add('quiet');
  let done = false;
  return () => {
    if (done) return;
    done = true;
    play.fxRunning = Math.max(0, play.fxRunning - 1);
    if (!play.fxRunning) {
      document.getElementById('coach')?.classList.remove('quiet');
      if (play.tut) render();
    }
  };
}

// ---- 表示ヘルパー ----

// ---- 描画 ----

function render(): void {
  el.day.textContent = String(state.day);
  syncGold();
  renderTax();
  renderOrder();
  renderMarket();
  renderPick();
  renderGuide();
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
  noteSeen();
}
/** 1つの出来事を見せておく長さ（次の出来事はこのあと） */
const EVENT_HOLD = 650;
/** いま出来事を見せている自動の出目のリール */
let actingReel: number | null = null;

// ---- 画面の高さに合わせて畑のマスの大きさを決める（まわすボタンが必ず画面内に入るように） ----

/** 最後にマスの大きさを合わせた畑の広さ */
let fittedSize = '';

window.addEventListener('resize', fitLayout);

/** 道具の育ち：上に経験のゲージ、鶏小屋・牛小屋は段の札（育ちきったら札だけ） */
function toolGrowHtml(cell: number, tool: PlaceId): string {
  const animal = tool === 'henhouse' || tool === 'cowshed';
  const need = animal ? CONFIG.animalLvNeed : TOOL_EVOLVE[tool]?.need;
  if (!need) return '';
  const lv = animal ? (state.toolLv?.[cell] ?? 0) : 0;
  const maxed = animal && lv >= CONFIG.animalLvMax;
  const pct = Math.min(100, Math.round(((state.toolXp[cell] ?? 0) / need) * 100));
  return `${maxed ? '' : `<span class="tool-xp"><i style="width:${pct}%"></i></span>`}${lv ? `<b class="tool-lv">Lv${lv + 1}</b>` : ''}`;
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
  const r = play.selected !== null ? state.results[play.selected] : null;
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

/** 今週の注文：畑の囲いに下げた木の札。作物の絵と「2/5」だけ、タップで詳しく */
function renderOrder(): void {
  const o = state.order;
  el.order.hidden = !o;
  if (!o) return;
  const done = o.done && !play.orderRevealPending;
  el.order.className = `order-tag${done ? ' done' : ''}`;
  setHtml(el.order, `<span class="sign-nail l"></span><span class="sign-nail r"></span><span class="order-ico">${art(FRUIT[o.crop])}</span><b>${done ? L('達成！', 'Done!') : `${CROPS[o.crop].name} ${o.have}/${o.need}`}</b><span class="order-reward">${done ? '✓' : gold(o.reward)}</span>`);
}

/** 手動の出目が今は使えない理由（札とタップしたときに出す） */
function deadReason(sym: SymbolId): string {
  if (SEEDS[sym]) return L('空きマスなし', 'No room');
  if (sym === 'hoe') return L('耕す所なし', 'Nothing to till');
  if (symbolBase(sym) === 'fertilizer') return L('作物なし', 'No crop');
  return L('育つ作物なし', 'Nothing to grow');
}

function buildReels(): void {
  const existing = el.reels.children.length;
  while (el.reels.children.length > state.reels) el.reels.lastElementChild!.remove();
  for (let i = existing; i < state.reels; i++) {
    const b = document.createElement('button');
    b.className = 'reel';
    b.dataset.i = String(i);
    const prev = state.results[i] ? resultArt(i) : symHtml(drawSymbol(state.bag, rng));
    b.innerHTML = `<div class="window"><div class="strip"><div class="cell-sym">${prev}</div></div></div><div class="tag">—</div>`;
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
    b.className = `reel ${r ? roleClass(r.symbol) : ''} ${tag.cls}${r?.symbol === 'goldSeed' ? ' rare' : ''}${fever ? (badFever ? ' fever-bad' : ' fever') : ''}${r && el.machine.classList.contains('rainbow') && state.fever.includes(r.symbol) ? ' rainbow-sym' : ''}${actingReel === i ? ' acting' : ''}${r?.fog ? ` fog fog-${r.fog}` : ''}`;
    // 札：自動の出目は結果を短く、手動の出目は効く形の絵（3×3のマス目）
    const shape = r ? symbolShape(state, r.symbol) : undefined;
    const tagEl = b.querySelector('.tag') as HTMLElement;
    const html = tag.text ? `${fever ? art(badFever ? 'warn' : 'flame') : ''}${tag.text}` : shape && !r!.used ? shapeIcon(shape) : '';
    if (tagEl.innerHTML !== html) tagEl.innerHTML = html;
    tagEl.classList.toggle('empty', !html);
    tagEl.classList.toggle('shape', !tag.text && !!shape);
    renderCount(b, i);
    // 霧の週：霧に隠れたリール（使えない日は濃い霧に「×」）
    const win = b.querySelector('.window')!;
    let fogEl = win.querySelector('.fog-cover');
    if (r?.fog && !fogEl) {
      fogEl = document.createElement('span');
      fogEl.className = 'fog-cover';
      win.appendChild(fogEl);
    }
    if (fogEl && !r?.fog) fogEl.remove();
    else if (fogEl) {
      fogEl.className = `fog-cover ${r!.fog}`;
      const html = `${art('puff')}${art('puff')}${r!.fog === 'lost' ? `<b>${L('霧', 'Fog')}</b>` : ''}`;
      if (fogEl.innerHTML.length < 10 || fogEl.classList.contains('lost') !== (r!.fog === 'lost')) fogEl.innerHTML = html;
    }
    b.setAttribute('aria-label', r ? `${SYMBOLS[r.symbol].name}: ${tag.text}` : L('リール', 'Reel'));
  });
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
  const placing = state.stock.length > 0 && mustPlace(state);
  // 上に画面（タイトル・開店準備）が重なっている間は出さない（見えないまま使い切らない）
  if (placing && state.day > 0 && !ui.busy && !el.overlay.classList.contains('show')) hintOnce('place', `${art('hand')} ${L('もらった物は、<b>光るマスをタップ</b>して置く', 'Tap a <b>glowing plot</b> to place what you got')}`);
  const t = nextTax(state);
  el.spin.disabled = ui.busy || state.over;
  // 置き待ちの物があるうちは回せない（「タップで回す」を出さない）
  const ready = !ui.busy && !state.over && !placing && (state.day === 0 || usableReels().length === 0);
  el.machine.classList.toggle('ready-spin', ready);
  el.machine.classList.toggle('taxday', state.day > 0 && t.daysLeft === 0);
  // 次の日に進むしかないとき：リールの上に大きな「次の日へ」の札を重ねる
  const go = $('spin-go');
  go.hidden = !ready;
  go.classList.toggle('tax', state.day > 0 && t.daysLeft === 0);
  setHtml(go, state.day === 0 || state.morning
    ? `<span class="go-hand">${art('hand')}</span><span class="go-text"><b>${L('タップで回す', 'Tap to spin')}</b></span>`
    : `<span class="go-hand">${art('hand')}</span><span class="go-text">${t.daysLeft === 0 ? `<small>${L(`年貢${t.amount}を納めて`, `Pay ${t.amount}g tax`)}</small>` : ''}<b>${L(`${state.day + 1}日目へ`, `To day ${state.day + 1}`)}</b><small>${L('リールをタップ', 'Tap the reels')}</small></span>`);
  // 筐体の看板：今日の仕入れがあれば、そこに3つの絵柄（押すと袋に入る）。なければ「タップで回す」など
  const cue = document.querySelector('.machine-top') as HTMLElement;
  const offering = state.offer.length > 0 && state.day > 0 && !state.over && !ui.busy && !play.tut;
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
      if (!CONFIG.offerForced) say(`${art('hand')} ${L('看板を押すと、今日の仕入れを選べる（タダ）', 'Tap the sign to pick a free symbol for today')}`, 3500);
    }
    // 看板の上の吹き出し「仕入れ！」で、押せることを知らせる
    setHtml(cue, `<span class="offer-bubble">${L('仕入れ', 'Pick')}</span><span class="offer-label">${L('仕入れ', 'Pick')}</span>${state.offer.map((id) => `<span class="offer${isRareOffer(id) ? ' rare' : ''}" data-offer="${id}">${symHtml(UPGRADE_SYMBOL[id]!.symbol)}</span>`).join('')}`);
    return;
  }
  setHtml(cue, !ready
    ? `${art('coin')} ${L('畑スロット', 'FARM SLOTS')} ${art('coin')}`
    : state.day === 0 || state.morning
    ? L('▼ タップで回す ▼', '▼ TAP TO SPIN ▼')
    : t.daysLeft === 0
      ? L(`▼ タップで年貢 ${t.amount}を納めて回す ▼`, `▼ TAP: PAY ${t.amount}g TAX & SPIN ▼`)
      : L(`▼ タップで${state.day + 1}日目へ ▼`, `▼ TAP FOR DAY ${state.day + 1} ▼`));
}

/** 道具・特別なマスの絵 */
/** マスに最後に書いた中身（同じなら書き換えない：押している最中に中身が入れ替わるとクリックが消える） */
const plotHtml = new WeakMap<Element, string>();

/** 形で効く出目を選んでいるとき、指しているマスに効く範囲を見せる */
let previewCell: number | null = null;

function previewCells(): number[] {
  if (play.selected === null || previewCell === null) return [];
  const sym = state.results[play.selected].symbol;
  // 大物の種は、植わる2×2を下見する
  if (SEEDS[sym] && CROPS[SEEDS[sym]!.crop].big) return bigCells(state, previewCell);
  const shape = symbolShape(state, sym);
  return shape ? shapeCells(state, shape, previewCell) : [];
}

function renderField(): void {
  // 水車は水路の並びの端に立つ
  const wheelEnds = new Set(waterWheels(state).map((w) => w[w.length - 1]));
  const placeable = state.stock.length ? state.field.flatMap((_, i) => (canPlace(state, i) ? [i] : [])) : [];
  const targets = play.selected !== null ? validTargets(state, play.selected) : placeable.length ? placeable : null;
  const preview = previewCells();
  const selSeed = play.selected !== null ? SEEDS[state.results[play.selected].symbol] : undefined;
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
        if (play.selected !== null && SYMBOLS[state.results[play.selected].symbol].shape) renderField();
      });
      b.addEventListener('pointerleave', () => {
        if (previewCell !== i) return;
        previewCell = null;
        if (play.selected !== null) renderField();
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
      html += `<span class="crop">${art(PLACE_ART[tool])}</span><span class="tool-name">${PLACES[tool].name}</span>${toolGrowHtml(i, tool)}`;
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
      if (crop.fertilized) html += `<span class="badge-fert" title="${L('肥料（売値×1.5）', 'Fertilized (price ×1.5)')}">${art('fertilizer')}</span>`;
      // カラスにつつかれた跡（売値−20%）
      if (crop.pecked) html += `<span class="badge-peck" title="${L('つつかれた（売値−20%）', 'Pecked (price −20%)')}">${art('crow')}</span>`;
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
        // 倍率の札は列（と大物）のときだけ。単品は金貨の数字がもう半値なので札は出さない（1マスに乗せる物を減らす）
        if (def.big) html += `<span class="badge-line">${L('大物', 'Big')}</span>`;
        else if (inLine) html += `<span class="badge-line">${MARK_LINE}×${fmtMult(mult)}</span>`;
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
    if (isFlooded(state, i)) {
      cls.push('flooded');
      html += `<span class="flood">${art('drop')}</span>`;
      label += L('、長雨で水びたし（植えられない）', ', flooded by the long rain (no planting)');
    }
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
  // 仕入れは見送れない：選ぶまで次の日へ進めない
  if (forcedOffer()) {
    openMarket();
    return;
  }
  // 月曜の朝：週契約を決めるまで回さない（続きから始めたときなど）
  if (state.morning && state.contractOffer.length) {
    await explainOnce('ex:contract', contractCard(), !!play.tut);
    await showContractOffer();
    return;
  }
  if (openSheetName) closeSheet();
  // 朝（市を閉じたあと・続きから）：日付はもう進んでいるので、リールだけ回す
  if (state.morning) {
    await spinMorning();
    return;
  }
  // 出目が残っているときは確認を出す（はい→armedNextDay を立てて回す）
  const leftover = state.day > 0 ? usableReels().length : 0;
  if (leftover > 0 && !play.armedNextDay) {
    sfx.error();
    confirmSkip(leftover);
    return;
  }
  if (state.day > 0) done.next = true;
  play.armedNextDay = false;
  // リール窓がガコンと押し込まれる
  el.reels.parentElement!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(4px) scale(0.98)' }, { transform: 'translateY(0)' }], { duration: 220 });
  // 前の日のフリーズの名残（虹の枠・ひび）を片付ける
  el.machine.classList.remove('rainbow', 'burning');
  el.machine.querySelector('.crack')?.remove();
  play.selected = null;
  ui.busy = true;
  done.spin = true;
  renderSpinButton();
  renderReelStates();

  const res = endDay(state, rng);
  // 年貢は判子を押すときに引いて見せる（それまでは夜の収入を足した額のまま）
  if (res.tax !== null && res.ok) play.taxPending = res.tax;
  play.autoOutcome = {};
  // 植えきれなかった種は1つ1金で売れる：リールから所持金へ
  if (res.seedGold) {
    const land = holdGold(res.seedGold);
    const q = center(el.reels);
    floatText(q.x, q.y - 30, `${art('seed')} ${money(res.seedGold)}`, { cls: 'gold', size: 0.9 });
    flyTo(q, el.goldBox, '🪙', Math.min(5, res.seedGold), land);
    hintOnce('seed-sell', `${art('seed')} ${L('植えきれなかった種は、<b>1つ1金</b>で売れる', 'Seeds you couldn’t plant sell for <b>1 gold each</b>')}`);
    await sleep(EVENT_GAP);
  }
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
  // 週契約を果たした：見返り（お守りなら3択）
  if (state.contractDone) {
    render();
    await showContractDone();
  }
  if (res.cleared && !(await showClear())) {
    endBusy();
    showGameOver(true);
    return;
  }
  beginDay(state, rng);
  // 月曜の朝：今週の週契約（回す前に選ぶ）
  if (state.contractOffer.length) {
    render();
    await explainOnce('ex:contract', contractCard(), !!play.tut);
    await showContractOffer();
  }
  // チュートリアルの水曜の市は、決まった3つ
  if (play.tut && isMarketDay(state.day) && state.offer.length) state.offer = [...TUT_OFFER];
  // 市の日の朝：リールを回す前に市を開く。市を閉じるとリールが回る
  if (isMarketDay(state.day) && state.offer.length) {
    endBusy();
    render();
    openMarket();
    return;
  }
  await spinMorning();
}

/** 朝のリールを回す（演出・フィーバー・自動の絵柄まで） */
async function spinMorning(): Promise<void> {
  play.selected = null;
  ui.busy = true;
  done.spin = true;
  renderSpinButton();
  renderReelStates();
  spinDay(state, rng);
  tutScript();
  // チュートリアルで出目を差し替えたときも、組み合わせは出目に合わせる
  refreshCombos(state);
  // フリーズ中に結果が見えないよう、描き直すのは演出のあと
  const show = planShow();
  render();
  await spinReels(show);
  // 初めて出た絵柄は、一枚絵で説明（お邪魔は効く前に）
  for (const s of [...new Set(state.results.map((r) => r.symbol))]) await explainOnce(`ex:sym:${s}`, symbolCard(s), !!play.tut);
  if (state.combos.length) {
    await showCombos();
    for (const id of state.combos) await explainOnce(`ex:combo:${id}`, comboCard(id), !!play.tut);
  }
  if (state.fever.length) {
    await showFever();
    const feverEvents = resolveFever(state, rng);
    await playFeverRoles(feverEvents);
    // 初めてのフィーバー：その絵柄で何が起きたかを、通常 → フィーバー → 大当たりの行で（チュートリアルでは説明しない）
    for (const ev of feverEvents) await explainOnce(`ex:fever:${symbolBase(ev.symbol)}`, feverCard(ev.symbol, ev.jackpot), !!play.tut);
    const badFever = state.fever.find((s) => SYMBOLS[s].rarity === 'bad');
    if (badFever) await explainOnce('ex:fever:bad', feverCard(badFever, 0), !!play.tut);
    if (state.charmOffer) {
      render();
      await showCharmOffer();
    }
  }
  await resolveAutos();
  endBusy();
  autoSelect();
  render();
  // 初めての年貢の日：一枚絵で（日曜の終わりに払う・足りないと終わり）
  if (nextTax(state).daysLeft === 0) await explainOnce('ex:tax', taxCard(nextTax(state).amount), !!play.tut);
}

/** 置き終えたら市に戻る（演出の途中なら終わるのを待つ） */
function backToMarket(tries = 40): void {
  if (state.over || state.stock.length || !shopOpen(state) || openSheetName === 'shop') return;
  if (ui.busy || openSheetName || el.overlay.classList.contains('show')) {
    if (tries > 0) later(() => backToMarket(tries - 1), 300);
    return;
  }
  openMarket();
}

/** 市を閉じた：朝なら（置く物がなければ）そのままリールを回す */
function leaveMarket(): void {
  closeSheet();
  if (state.morning && !mustPlace(state)) void onSpin();
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
  const land = holdGold(n.wheel + n.fish + n.animals);
  const at = (c: number) => center(el.field.children[c]);
  if (n.grown.length) {
    renderField();
    n.grown.forEach((c) => {
      const plot = el.field.children[c] as HTMLElement;
      const q = at(c);
      const ripe = isRipe(state.field[c]);
      growUp(plot.querySelector('.crop') ?? plot);
      burst(q.x, q.y, ripe ? ['✨', '⭐'] : ['💧', '✨'], ripe ? 8 : 4, ripe ? 50 : 30);
      const g = state.field[c]?.growth ?? 0;
      if (!ripe) bumpPips(c, g - 1, g);
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
        floatText(q.x, q.y - 16, money(wheelGold(state, w)), { cls: 'gold', size: 0.7 });
        flyTo(q, el.goldBox, '🪙', 1);
      });
      return n.wheels.length > 0;
    },
    () => {
      const ponds = fieldCells().filter((c) => isPond(state, c));
      ponds.forEach((c) => {
        const q = at(c);
        const big = n.bigFish.includes(c);
        floatText(q.x, q.y - 16, big ? `${L('大物！', 'Big catch!')} ${money(CONFIG.fishGold + CONFIG.bigFishGold)}` : money(CONFIG.fishGold), { cls: 'gold', size: big ? 1 : 0.7 });
        if (big) burst(q.x, q.y, [art('fish'), '✨'], 8, 50);
        flyTo(q, el.goldBox, '🪙', big ? 3 : 1);
      });
      return ponds.length > 0;
    },
    () => {
      const sheds = fieldCells().filter((c) => state.tools[c] === 'henhouse' || state.tools[c] === 'cowshed');
      sheds.forEach((c) => {
        const q = at(c);
        floatText(q.x, q.y - 16, money(animalGold(state, c)), { cls: 'gold', size: 0.7 });
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
  land();
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
  // どの役も、お金は先に「飛んでいる途中」にしておく（描き直しで先に増えないように）
  const lands = events.map((ev) => ({
    jackpot: holdGold(ev.jackpot),
    role: holdGold(ev.role === 'honey' ? ev.amount : ev.role === 'bigsale' ? ev.sold.reduce((n, r) => n + r.total, 0) : 0),
  }));
  for (const [k, ev] of events.entries()) {
    const land = lands[k];
    const name = SYMBOLS[ev.symbol].feverDesc.split(/：|: /)[0];
    const mid = center(el.field);
    switch (ev.role) {
      case 'breed':
        sfx.plant();
          break;
      case 'grow':
        render();
        sfx.sun();
        flash('#bff3ff', 400);
        afterGrowth(ev.cells, '+1');
          break;
      case 'festival':
        sfx.merchant();
        render();
          el.field.querySelectorAll('.plot.ripe').forEach((p) => pop(p, 1.15));
        break;
      case 'compost':
        sfx.fertilizer();
        render();
        ev.cells.forEach((c) => {
          const q = center(el.field.children[c]);
          burst(q.x, q.y, ['✨', '💜'], 5, 40);
        });
          break;
      case 'honey':
        sfx.coin();
        floatText(mid.x, mid.y, money(ev.amount), { cls: 'gold', size: 1.1 });
        flyTo(mid, el.goldBox, '🪙', 5, land.role);
        break;
      case 'bigsale': {
        sfx.lineHarvest();
        const total = ev.sold.reduce((n, r) => n + r.total, 0);
        render();
        if (ev.sold.length) floatText(mid.x, mid.y, money(total), { cls: 'gold', size: 1.1 });
        if (ev.sold.length) flyTo(mid, el.goldBox, '🪙', 8, land.role);
        else land.role();
        break;
      }
      case 'luck':
        sfx.charmGet();
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
    flyTo(m, el.goldBox, '🪙', Math.min(30, 8 + Math.ceil(ev.jackpot / 4)), land.jackpot);
    coinRain(Math.min(160, 70 + ev.jackpot));
    if (ev.role === 'jackpot') {
      confetti(60);
      coinRain(120);
    }
    await roll;
  }
  render();
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
    // 金貨と通行料は、財布に届いてから増やす
    const landCoin = holdGold(ev.type === 'coin' ? ev.amount : 0);
    const landToll = holdGold(ev.type === 'crow' ? ev.toll : 0);
    // 追い払ったお礼も、財布に届いてから増やす
    const reward = 'reward' in ev ? (ev.reward ?? 0) : 0;
    const landReward = holdGold(reward);
    const sym = state.results[i].symbol;
    if (PEST_HINTS[sym]) hintOnce(`pest-${sym}`, `${symHtml(sym)} <b>${SYMBOLS[sym].name}</b>：${PEST_HINTS[sym]}`);
    // いま動いている出目のリールを光らせる（どのリールの出来事か分かるように）
    actingReel = i;
    reels[i].classList.add('acting');
    const from = center(reels[i]);
    // 見せておく長さ（金貨はささっと回収するので短く）
    let hold = EVENT_HOLD;
    if (ev.type === 'coin') {
      play.autoOutcome[i] = `+${gold(ev.amount)}`;
      hold = 120;
      sfx.coin();
      floatText(from.x, from.y - 30, money(ev.amount), { cls: 'gold', size: 0.9, dur: 700 });
      await new Promise<void>((r) => flyTo(from, el.goldBox, '🪙', Math.min(5, 1 + Math.ceil(ev.amount / 4)), r, true));
      landCoin();
    } else if (ev.type === 'merchant') {
      play.autoOutcome[i] = L(`売値×${fmtMult(ev.mult)}`, `Price ×${fmtMult(ev.mult)}`);
      sfx.merchant();
      burst(from.x, from.y, ['💰', '✨', '🪙'], 10, 70);
      render();
      el.field.querySelectorAll('.plot.ripe').forEach((p) => pop(p, 1.12));
    } else if (ev.type === 'clover') {
      play.autoOutcome[i] = L('明日 金の種↑', 'Gold seed↑');
      sfx.rare();
      burst(from.x, from.y, ['🍀', '✨', '🌟'], 12, 80);
      renderStatus();
    } else if (ev.type === 'bug') {
      if (ev.cell === null) {
        play.autoOutcome[i] = L('空振り', 'Miss');
      } else {
        const plot = el.field.children[ev.cell] as HTMLElement;
        await travel(from, plot, symHtml('bug'), true);
        const p = center(plot);
        if (ev.warded) {
          play.autoOutcome[i] = ev.hen ? L('鶏が食べた', 'Hen ate it') : L('よけた', 'Blocked');
          sfx.shoo();
          if (ev.hen) critterPop(p, art('henhouse'));
          burst(p.x, p.y, ev.hen ? ['🪶', '✨'] : ['🌿', '✨'], 8, 50);
          floatText(p.x, ev.hen ? p.y + 28 : p.y - 20, ev.hen ? L('鶏が食べた', 'Hen ate it') : L('虫よけ成功', 'Bug blocked'), { cls: 'good pill', size: 0.8 });
        } else {
          play.autoOutcome[i] = L(`成長−${ev.damage}`, `Growth −${ev.damage}`);
          sfx.bug();
          burst(p.x, p.y, ['🐛', '🍂'], 6, 40);
          renderField();
          bumpPips(ev.cell, (state.field[ev.cell]?.growth ?? 0) + ev.damage, state.field[ev.cell]?.growth ?? 0);
          shake(plot, 6);
          renderField();
        }
      }
    } else if (ev.type === 'weed') {
      if (ev.warded) {
        play.autoOutcome[i] = L('よけた', 'Blocked');
        sfx.shoo();
      } else if (!ev.cells.length) {
        play.autoOutcome[i] = L('空振り', 'Miss');
      } else {
        play.autoOutcome[i] = L(`${ev.cells.length}か所`, `${ev.cells.length} spots`);
        sfx.bug();
        for (const c of ev.cells) {
          const plot = el.field.children[c] as HTMLElement;
          await new Promise<void>((r) => flyTo(from, plot, symHtml('weed'), 1, r));
          renderField();
          pop(plot, 1.15);
          const q = center(plot);
        }
      }
    } else if (ev.type === 'tanuki') {
      if (ev.escaped) {
        play.autoOutcome[i] = L('逃げた', 'Fled');
        sfx.shoo();
        ev.guarded.forEach((c) => pop(el.field.children[c], 1.12));
      } else if (!ev.taken.length) {
        play.autoOutcome[i] = ev.stolen ? `−${gold(ev.stolen)}` : L('空振り', 'Miss');
        if (ev.stolen) {
          sfx.crow();
          const g = center(el.goldBox);
          floatText(g.x, g.y + 30, money(-ev.stolen), { cls: 'bad', size: 0.9 });
          syncGold();
          shake(el.goldBox, 6);
        }
      } else {
        play.autoOutcome[i] = `−${gold(ev.taken.reduce((n, t) => n + t.price, 0))}`;
        for (const t of ev.taken) {
          const plot = el.field.children[t.cell] as HTMLElement;
          // タヌキは畑の横から跳ねながら走ってくる
          await travel(edgeFrom(plot, false), plot, symHtml('tanuki'), true);
          sfx.crow();
          sfx.poof();
          const q = center(plot);
          burst(q.x, q.y, ['💨', '🍂'], 8, 50);
          shake(plot, 8);
          renderField();
        }
        shake(el.app, 5);
        vibrate(120);
      }
    } else if (ev.type === 'mole') {
      play.autoOutcome[i] = ev.moves.length ? L(`${ev.moves.length}つ移動`, `Moved ${ev.moves.length}`) : ev.chased.length ? L('鶏が追い払った', 'Hen chased it') : L('空振り', 'Miss');
      // モグラが顔を出したところへ鶏が来て、追い払う
      for (const c of ev.chased) {
        const q = center(el.field.children[c]);
        critterPop(q, symHtml('mole'));
        await sleep(isCalm() ? 150 : 450);
        sfx.shoo();
        critterPop(q, art('henhouse'));
        burst(q.x, q.y, ['🪶', '💨'], 8, 50);
      }
      if (ev.moves.length || ev.chased.length) {
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
        });
      }
    } else if (ev.type === 'frost') {
      play.autoOutcome[i] = ev.cells.length ? L(`${ev.cells.length}マス`, `${ev.cells.length} plots`) : L('空振り', 'Miss');
      if (ev.cells.length) {
        sfx.tax();
        flash('#dff1ff', 400);
        renderField();
        ev.cells.forEach((c) => {
          const q = center(el.field.children[c]);
          burst(q.x, q.y, ['❄️', '✨'], 8, 40);
        });
      }
    } else if (ev.type === 'locust') {
      // イナゴ：袋の中で増える（袋の札が跳ねる）。畑はかじらない
      play.autoOutcome[i] = L(`袋+${ev.bred}`, `Bag +${ev.bred}`);
      sfx.bug();
      const chip = visibleOr(el.bag.querySelector('[data-sym="locust"]'), 'bag');
      floatText(from.x, from.y - 40, `${symHtml('locust')}+${ev.bred}`, { cls: 'bad', size: 0.9 });
      flyTo(from, chip, symHtml('locust'), ev.bred, () => pop(chip, 1.3));
      if (ev.cell !== null) {
        const plot = el.field.children[ev.cell] as HTMLElement;
        await travel(from, plot, symHtml('locust'), true);
        const p = center(plot);
        burst(p.x, p.y, ['🍂', '🍃'], 6, 40);
        shake(plot, 6);
        renderField();
        bumpPips(ev.cell, (state.field[ev.cell]?.growth ?? 0) + 1, state.field[ev.cell]?.growth ?? 0);
      }
      renderBag();
    } else if (ev.type === 'egg') {
      // 卵：温まる（あと何回で孵るか）。孵ったらツバメが袋へ飛んでいく
      if (ev.hatched) {
        play.autoOutcome[i] = L('孵った！', 'Hatched!');
        sfx.rare();
        burst(from.x, from.y, ['✨', '🪶', '⭐'], 14, 80);
        floatText(from.x, from.y - 40, `${symHtml('swallow')} ${L('ツバメが生まれた', 'A swallow hatched')}`, { cls: 'good', size: 0.9 });
        const chip = visibleOr(el.bag.querySelector('[data-sym="swallow"]'), 'bag');
        flyTo(from, chip, symHtml('swallow'), 1, () => pop(chip, 1.3));
        renderBag();
      } else {
        play.autoOutcome[i] = L(`孵化 ${ev.progress}/${CONFIG.eggHatch}`, `Hatch ${ev.progress}/${CONFIG.eggHatch}`);
        sfx.pon();
        pop(reels[i], 1.06);
      }
      // 卵にひびが入っていく（孵ったらツバメ）
      const cellSym = reels[i].querySelector('.cell-sym');
      if (cellSym) cellSym.innerHTML = art(ev.hatched ? 'swallow' : ev.progress >= 2 ? 'eggCrack2' : 'eggCrack1');
    } else if (ev.type === 'swallow') {
      // ツバメ：袋の虫を追い出す
      if (ev.removed) {
        play.autoOutcome[i] = L('虫を追い出した', 'Bug out');
        sfx.shoo();
        const chip = visibleOr(el.bag.querySelector(`[data-sym="${ev.removed}"]`), 'bag');
        flyTo(center(chip), reels[i], symHtml(ev.removed), 1, () => burst(from.x, from.y, ['🪶', '✨'], 8, 50));
        renderBag();
      } else {
        play.autoOutcome[i] = `+${gold(ev.amount)}`;
        sfx.coin();
        floatText(from.x, from.y - 30, money(ev.amount), { cls: 'gold', size: 0.8 });
      }
    } else if (ev.type === 'hawk') {
      // タカ：袋のカラスを追い出す（カラスの札が袋からリールへ飛んで、羽が散る）
      if (ev.removed) {
        play.autoOutcome[i] = L('カラスを追い出した', 'Crow out');
        sfx.shoo();
        const chip = visibleOr(el.bag.querySelector('[data-sym="crow"]'), 'bag');
        flyTo(center(chip), reels[i], symHtml('crow'), 1, () => burst(from.x, from.y, ['🪶', '✨'], 8, 50));
        renderBag();
      } else {
        play.autoOutcome[i] = `+${gold(ev.amount)}`;
        sfx.coin();
        floatText(from.x, from.y - 30, money(ev.amount), { cls: 'gold', size: 0.8 });
      }
    } else if (ev.cell === null) {
      play.autoOutcome[i] = state.charms.crowFriend > 0 ? L('仲良し', 'Friend') : L('空振り', 'Miss');
      sfx.crow();
    } else if (ev.pecked) {
      // 重い作物はつつくだけ：売値−20%
      play.autoOutcome[i] = L('つついた', 'Pecked');
      const plot = el.field.children[ev.cell] as HTMLElement;
      await travel(edgeFrom(plot, true), plot, symHtml('crow'), false);
      sfx.crow();
      const p = center(plot);
      burst(p.x, p.y, ['🪶', '💨'], 6, 40);
      shake(plot, 5);
      floatText(p.x, p.y - 20, L('つつかれた −20%', 'Pecked −20%'), { cls: 'bad pill', size: 0.85 });
      renderField();
    } else if (!ev.eaten) {
      play.autoOutcome[i] = L('セーフ', 'Safe');
      const plot = el.field.children[ev.cell] as HTMLElement;
      // カラスは空から羽ばたいて飛んでくる
      await travel(edgeFrom(plot, true), plot, symHtml('crow'), false);
      sfx.shoo();
      const p = center(plot);
      burst(p.x, p.y, ['💨', '🪶', '✨'], 8, 60);
      pop(plot, 1.12);
    } else {
      play.autoOutcome[i] = L('パクッ…', 'Chomp…');
      const plot = el.field.children[ev.cell] as HTMLElement;
      // カラスは空から羽ばたいて飛んでくる
      await travel(edgeFrom(plot, true), plot, symHtml('crow'), false);
      sfx.crow();
      sfx.poof();
      const p = center(plot);
      burst(p.x, p.y, ['🪶', '💨', '🍂'], 8, 50);
      shake(plot, 8);
      if (ev.crop && isRipe(ev.crop)) {
        shake(el.app, 5);
        vibrate(120);
      }
      renderField();
    }
    // 大かかしが袋のカラスを1枚追い出した：大かかしからリールへカラスが飛んで、袋の札が減る
    if (ev.type === 'crow' && ev.banished) {
      const big = fieldCells().find((c) => state.tools[c] === 'bigScarecrow');
      const src = big !== undefined ? center(el.field.children[big]) : from;
      sfx.shoo();
      floatText(src.x, src.y - 40, `${art('bigScarecrow')} ${L('袋のカラス −1', 'Bag crow −1')}`, { cls: 'good', size: 0.9, dur: 1400 });
      const chip = visibleOr(el.bag.querySelector('[data-sym="crow"]'), 'bag');
      flyTo(center(chip), reels[i], symHtml('crow'), 1, () => burst(from.x, from.y, ['🪶', '✨'], 8, 50));
      renderBag();
    }
    if (ev.type === 'crow' && ev.toll > 0) {
      sfx.coin();
      floatText(center(el.goldBox).x, center(el.goldBox).y + 28, money(ev.toll), { cls: 'gold', size: 0.8 });
      landToll();
    }
    if (reward > 0) {
      // 追い払ったマスから財布へ、お礼の金貨が飛ぶ
      const at = ev.type === 'tanuki' ? ev.guarded[0] : 'cell' in ev ? ev.cell : null;
      const plot = at !== null && at !== undefined ? (el.field.children[at] as HTMLElement) : null;
      const q = plot ? center(plot) : from;
      sfx.coin();
      floatText(q.x, q.y - 34, money(reward), { cls: 'gold', size: 0.9, dur: 900 });
      await new Promise<void>((r) => flyTo(q, el.goldBox, '🪙', reward, r, true));
      landReward();
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
    play.armedNextDay = true;
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
    if (play.selected === i) {
      play.selected = null;
      render();
    }
    return;
  }
  if (def.kind === 'auto' || r.used) {
    if (play.selected !== null) {
      play.selected = null;
      render();
    }
    void onSpin();
    return;
  }
  // 自動で選んでおいたリールを押したときは、外さずにそのまま（押した人は「選んだ」つもり）
  if (play.selected === i && play.autoSelected) {
    play.autoSelected = false;
    sfx.select();
    return;
  }
  if (play.selected === i) {
    play.selected = null;
    sfx.cancel();
    render();
    return;
  }
  if (def.shape === 'all') {
    applyMoon(i);
    return;
  }
  play.selected = i;
  play.autoSelected = false;
  play.armedNextDay = false;
  sfx.select();
  render();
}

/** 満月：出目をタップするだけで畑の全作物が育つ */
function applyMoon(i: number): void {
  const affected = useSymbol(state, i, null) ?? [];
  done.use = true;
  play.armedNextDay = false;
  sfx.rare();
  flash('#fff4b8', 500);
  const f = center(el.field);
  burst(f.x, f.y, ['🌟', '✨', '⭐'], 16, 160);
  render();
  afterGrowth(affected, '+1');
}

/** 作物のあるマスに置き物を置く確認（1回目のタップで選び、2回目で置く） */
let placeArmed: number | null = null;

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
    // 作物があるマスに建物（道具）を置くときは、作物がどくので2回目のタップで置く。土地（水路・堆肥）は作物と重なるのでそのまま
    if (state.field[cell] && PLACES[state.stock[0]].kind === 'tool' && placeArmed !== cell) {
      placeArmed = cell;
      sfx.select();
      shake(plot, 4);
      say(`${art(PLACE_ART[state.stock[0]])} ${L(isRipe(state.field[cell]) ? '実りがなくなる：もう一度タップで置く' : '作物がなくなる：もう一度タップで置く', 'The crop will be removed: tap again to place')}`, 2500);
      return;
    }
    placeArmed = null;
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
    // 市で買った物を置き終えた：市に自動で戻る（続けて買える。閉じたら朝はそのまま回す）
    if (!state.stock.length && shopOpen(state) && isMarketDay(state.day) && !play.tut) later(() => backToMarket(), 650);
    return;
  }
  // 雑草のマスは、出目を選んでいても抜くのが先（抜くつもりで雨を降らせてしまわないように）
  if (state.weeds[cell]) {
    if (!pullWeed(state, cell)) {
      reject(plot, needGold(weedCost(state)));
      return;
    }
    sfx.poof();
    burst(p.x, p.y, ['🍃', '💨'], 8, 50);
    if (weedCost(state)) floatText(p.x, p.y - 20, money(-weedCost(state)), { cls: 'bad', size: 0.8 });
    render();
    return;
  }
  if (play.selected !== null) {
    const reel = play.selected;
    const sym = state.results[reel].symbol;
    if (!canUse(state, reel, cell)) {
      const crop = state.field[cell];
      reject(plot, SEEDS[sym] ? L('空きマスへ', 'Needs an empty plot') : SYMBOLS[sym].shape ? L('範囲に作物なし', 'No crops in range') : !crop ? L('作物なし', 'No crop') : L('肥料済み', 'Already fertilized'));
      return;
    }
    const power = state.results[reel].power;
    // 合体した絵柄は元の絵柄の演出で（範囲は合体した形）
    const kind = symbolBase(sym);
    const big = kind !== sym;
    const area = (fallback: ShapeId) => shapeCells(state, symbolShape(state, sym) ?? fallback, cell);
    const affected = useSymbol(state, reel, cell) ?? [];
    const left = state.results[reel].left;
    play.selected = left > 0 && canUse(state, reel, null) ? reel : null;
    play.autoSelected = false;
    if (play.selected === null) autoSelect();
    done.use = true;
    play.armedNextDay = false;
    render();
    if (SEEDS[sym]) {
      sfx.plant();
      // 植えた：土が跳ねて緑の波紋（文字は出さない。残りの数はリールの ×N で分かる）
      ripple(p.x, p.y, sym === 'goldSeed' ? '#ffd84a' : '#7fd35a');
      burst(p.x, p.y + 10, sym === 'goldSeed' ? ['✨', '🌟'] : ['🌰', '🌱'], 7, 36);
      pop(plot, 1.15);
      if (left > 0 && play.selected === null) say(L('空きマスなし', 'No empty plots'));
    } else if (kind === 'hoe') {
      sfx.poof();
      affected.forEach((c, k) => {
        const q = center(el.field.children[c]);
        later(() => burst(q.x, q.y + 10, ['💨', '🌰'], 5, 34), k * 70);
      });
    } else if (kind === 'fertilizer' && left > 0) {
      sfx.fertilizer();
      floatText(p.x, p.y - 20, L('売値×2（あと1つ）', 'Price ×2 (1 more)'), { cls: 'combo', size: 0.9 });
    } else if (kind === 'rain') {
      sfx.rain();
      rainShower(area('cross').map((c) => el.field.children[c]));
      afterGrowth(affected, `+${(big ? 2 : CONFIG.rainGrowth) * power}`);
    } else if (kind === 'sun') {
      sfx.sun();
      sunBeam(area('column').map((c) => el.field.children[c]));
      area('column').forEach((c, k) => {
        const q = center(el.field.children[c]);
        later(() => burst(q.x, q.y, ['✨'], 4, 36), 200 + k * 70);
      });
      flash('#fff3a0', 300);
      afterGrowth(affected, `+${CONFIG.sunGrowth * power + state.charms.sunBlessing}`);
    } else if (kind === 'bee') {
      sfx.bee();
      beeFlight(area('x').map((c) => el.field.children[c]), symHtml(sym));
      area('x').forEach((c, k) => {
        const q = center(el.field.children[c]);
        later(() => burst(q.x, q.y, ['🌼'], 3, 30), k * 220);
      });
      afterGrowth(affected, `+${CONFIG.beeGrowth * power}`);
      if (left > 0 && play.selected === null) say(L('使える場所なし', 'Nowhere to use it'));
    } else if (kind === 'can') {
      sfx.rain();
      rainShower([plot]);
      afterGrowth(affected, `+${2 * power}`);
    } else if (kind === 'thunder') {
      sfx.crt();
      flash('#fff6c0', 220);
      area('row').forEach((c, k) => {
        const q = center(el.field.children[c]);
        later(() => burst(q.x, q.y, ['⚡', '✨'], 4, 36), k * 60);
      });
      shake(el.field, 4);
      afterGrowth(affected, `+${2 * power}`);
    } else if (kind === 'fertilizer') {
      sfx.fertilizer();
      if (big) affected.forEach((c) => pop(el.field.children[c] as HTMLElement, 1.12));
      burst(p.x, p.y, ['✨', '💜'], 10, 50);
      pop(plot, 1.15);
      floatText(p.x, p.y - 20, L('売値×1.5', 'Price ×1.5'), { cls: 'combo', size: 0.9 });
    }
    return;
  }
  if (state.frost[cell]) {
    shake(plot, 3);
    say(`${art('frost')} ${state.frost[cell]}${L('日', 'd')}`);
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
    const block = sellBlock(state, root);
    if (block) {
      reject(plot, block.replace(/<[^>]+>/g, ''));
      say(`${art('calendar')} ${block}`);
      return;
    }
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

// ---- その場のヒント：初めて出会ったときに1回だけ、短い札で（遊びは止めない） ----

/** ヒントを1回だけ出す（key ごと）。チュートリアル中は出さない */
function hintOnce(key: string, html: string, ms = 5000): void {
  if (play.tut || meta.hints.includes(key)) return;
  meta.hints.push(key);
  saveMeta(meta);
  showHintCard(html, ms);
}

/**
 * 成長の○：増えた○（from〜to）を一瞬大きくして、増えたことを見せる。減ったときは赤く。
 * 文字の「+1」の代わり。描き直したあとに呼ぶ
 */
function bumpPips(cell: number, from: number, to: number): void {
  const pips = el.field.children[rootOf(state, cell)]?.querySelectorAll<HTMLElement>('.pip');
  if (!pips?.length) return;
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(pips.length, Math.max(from, to));
  for (let k = lo; k < hi; k++) {
    const pip = pips[k];
    pip.classList.remove('bump', 'drop');
    void pip.offsetWidth;
    pip.classList.add(to > from ? 'bump' : 'drop');
    later(() => pip.classList.remove('bump', 'drop'), 700);
  }
}

/** 育って新しく列がそろったら、その列を光らせて知らせる */
function announceLines(cells: number[], delay = 500): number {
  const formed = [...new Set(cells.flatMap((c) => (isRipe(state.field[c]) ? [ripeGroup(state, c)] : [])).filter((g) => g.length >= 3).map((g) => [...g].sort((a, b) => a - b).join()))];
  // 「列ができた」の演出の間は、チュートリアルの吹き出しを隠す
  if (formed.length) later(holdCoach(), delay + formed.length * 250 + 1400);
  formed.forEach((key, k) => {
    const group = key.split(',').map(Number);
    later(() => {
      sfx.bonus();
      group.forEach((c, j) => later(() => pop(el.field.children[c], 1.12), j * 60));
      const pts = group.map((c) => center(el.field.children[c]));
      const q = { x: pts.reduce((n, v) => n + v.x, 0) / pts.length, y: pts.reduce((n, v) => n + v.y, 0) / pts.length };
      floatText(q.x, q.y - 10, `${MARK_LINE} ${L('列ができた', 'Line formed')}`, { cls: 'combo pill', size: 0.95, dur: 1300 });
    }, delay + k * 250);
  });
  return formed.length;
}

function afterGrowth(cells: number[], label: string): void {
  announceLines(cells);
  // 実ったら実が跳ねて光るだけ、育ち中は○が増える動きだけ（文字は出さない）
  const ripened = cells.filter((c) => isRipe(state.field[c]));
  const amount = Math.max(1, parseInt(label, 10) || 1);
  cells.forEach((cell, k) => {
    const plot = el.field.children[cell] as HTMLElement;
    const p = center(plot);
    const crop = state.field[cell];
    later(() => {
      growUp(plot.querySelector('.crop') ?? plot);
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
      } else if (crop) {
        bumpPips(cell, crop.growth - amount, crop.growth);
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
  play.combo = now - play.lastSellAt < CONFIG.timing.comboWindow ? play.combo + 1 : 1;
  play.lastSellAt = now;
  const price = res.total;
  const big = price >= CROPS.corn.price || res.line;
  const landSale = holdGold(res.total);
  const landOrder = holdGold(res.orderReward);
  if (res.orderReward) play.orderRevealPending = true;
  play.landBumper = holdGold(res.bumper);
  render();
  // 単品で売った：並べると高いことを1回だけ
  if (!res.line && res.steps.some((st) => st.x < 1)) hintOnce('single', `${MARK_SINGLE} ${L('並んでいない作物は<b>半値</b>。縦・横・斜めに3つ並べてから売ると高い', 'Crops not in a line sell at <b>half price</b>. Line up 3 first to sell high')}`);
  // 長い列ほど高い：畑が4列以上になって列で売ったら、1回だけ知らせる
  if (res.line && (state.cols >= 4 || state.rows >= 4)) hintOnce('longline', `${MARK_LINE} ${L(`<b>4つ並べる＝×${fmtMult(longTotal(4))}</b>　5つ＝×${fmtMult(longTotal(5))}`, `<b>4 in a line = ×${fmtMult(longTotal(4))}</b> · 5 = ×${fmtMult(longTotal(5))}`)}`, 6000);
  // 注文達成：お客さんからまとめて代金（列で売ったときは、列の演出が終わってから）
  const orderDone = () => {
    if (!res.orderReward) return;
    sfx.bigBuy();
    const o = center(el.order);
    floatText(o.x, o.y + 30, L(`注文達成！ +${res.orderReward}`, `Order done! +${res.orderReward}g`), { cls: 'gold', size: 1.3, dur: 1600 });
    burst(o.x, o.y, ['🪙', '✨', '⭐'], 16, 90);
    // 札が「達成！」に変わり、報酬の金貨が財布へ届いてから所持金が増える
    play.orderRevealPending = false;
    renderOrder();
    flyTo(o, el.goldBox, '🪙', 8, landOrder);
    pop(el.order, 1.1);
    vibrate([40, 30, 80]);
  };
  if (!res.line) later(orderDone, 500);
  if (res.line) {
    done.line = true;
    const release = holdCoach();
    void playLineHarvest(res, centers, p, landSale).finally(() => {
      release();
      landSale();
      orderDone();
    });
  } else {
    sfx.sell(price, play.combo);
    const size = Math.min(2, 0.8 + price / 25);
    floatText(p.x, p.y - 10, money(price), { cls: 'gold', size, rise: big ? 110 : 70 });
    floatText(p.x, p.y + 18, L('単品（半値）', 'Single (half price)'), { cls: 'pill', size: 0.6, dur: 900 });
    burst(p.x, p.y, big ? ['🪙', '✨', '🌟', '💰'] : ['🪙', '✨'], big ? 22 : 8, big ? 140 : 60);
  }
  if (play.combo >= 2) floatText(p.x, p.y - 60, `COMBO ×${play.combo}`, { cls: 'combo', size: 0.7 + Math.min(play.combo, 6) * 0.08, dur: 900 });
  if (res.line) return;
  flyTo(p, el.goldBox, '🪙', Math.min(10, Math.ceil(price / 6)), landSale);
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

// ---- 始める（新しく・続きから） ----

function startGame(resume: GameState | null = null): void {
  setState(resume ?? newGame(setupFrom(meta)));
  play.goldInFlight = 0;
  play.taxPending = 0;
  // 所持金の表示は始めの額に合わせる（腕前で0以外から始まることがある）
  cancelAnimationFrame(play.goldTween);
  play.shownGold = state.gold;
  el.gold.textContent = String(state.gold);
  play.orderRevealPending = false;
  el.field.classList.remove('withered');
  if (resume) Object.keys(done).forEach((k) => (done[k as keyof typeof done] = true));
  else clearRun();
  play.selected = null;
  play.armedNextDay = false;
  if (!resume) done.spin = false;
  play.tut = null;
  document.documentElement.classList.remove('in-tutorial');
  document.getElementById('tut-dim')?.remove();
  document.getElementById('tut-hand')?.remove();
  window.clearInterval(play.tutSpotTimer);
  document.getElementById('coach')?.remove();
  if (!resume && !meta.tutorialDone) startTutorial();
  // 初めて遊ぶ農家は、最初にその農家のこつを出す
  const farmer = FARMERS.find((f) => f.id === state.farmer);
  if (!resume && farmer?.tip && !meta.farmersPlayed.includes(farmer.id)) {
    meta.farmersPlayed.push(farmer.id);
    saveMeta(meta);
    later(() => showHintCard(`${art(farmer.art as ArtId)} <b>${farmer.name}</b>：${farmer.tip}`, 8000), 500);
  }
  if (resume) autoSelect();
  el.overlay.classList.remove('show', 'title');
  el.overlay.innerHTML = '';
  el.reels.innerHTML = '';
  el.shop.innerHTML = '';
  $('remove-shop').innerHTML = '';
  render();
  // 市の朝に閉じていたら、続きは市から
  if (resume && state.morning && state.offer.length && isMarketDay(state.day)) openMarket();
  if (resume && state.morning && state.contractOffer.length) void explainOnce('ex:contract', contractCard(), !!play.tut).then(() => showContractOffer());
}
// ---- 押す回数を減らす：なぞって植える・リールから畑へ引っぱる・使える出目が1つなら選んでおく ----

function clickAllowed(kind: 'plot' | 'reel'): boolean {
  const s = play.suppressClick;
  if (!s || s.kind !== kind) return true;
  play.suppressClick = null;
  return performance.now() > s.until;
}

// 新しく押し始めたら、前の操作で残った「次の click を無視」は捨てる
// （最後の種を植えて畑が描き直されると、その click が届かずに残り、次のタップを飲み込んでいた）
document.addEventListener('pointerdown', () => (play.suppressClick = null), true);

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
  if (ui.busy || state.over || play.selected === null || !SEEDS[state.results[play.selected].symbol]) return;
  const cell = plotAt(e.clientX, e.clientY);
  if (cell === null || !canUse(state, play.selected, cell) || !tutAllowsCell(cell)) return;
  // 自動で選んだだけの種は、押した瞬間には植えない（長押しの説明を見たいだけかもしれない）。
  // なぞり始めたら植える。動かさずに離したら、ふつうのタップとして植わる
  const pending = play.autoSelected;
  drag = { kind: 'plant', reel: play.selected, x: e.clientX, y: e.clientY, moved: !pending, last: cell, ghost: null };
  if (pending) return;
  play.suppressClick = { kind: 'plot', until: Infinity };
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
    if (cell === null || cell === drag.last || play.selected !== drag.reel || !canUse(state, drag.reel, cell) || !tutAllowsCell(cell)) return;
    if (!drag.moved) {
      // なぞり始め：押したマスにも植える
      drag.moved = true;
      play.suppressClick = { kind: 'plot', until: Infinity };
      blockLongPress();
      onPlotTap(drag.last!);
      if (play.selected !== drag.reel || !canUse(state, drag.reel, cell)) return;
    }
    drag.last = cell;
    onPlotTap(cell);
    return;
  }
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 12) return;
    // 引っぱり始め：その出目を選んで、指に絵柄を持たせる
    drag.moved = true;
    play.autoSelected = false;
    play.suppressClick = { kind: 'reel', until: Infinity };
    blockLongPress();
    play.selected = drag.reel;
    play.armedNextDay = false;
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
    if (cell !== null && play.selected === d.reel && canUse(state, d.reel, cell) && tutAllowsCell(cell)) onPlotTap(cell);
  }
  if (play.suppressClick) play.suppressClick.until = performance.now() + 350;
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

/** 使える出目が1つだけなら、最初から選んでおく（リールを押す手間を省く） */
function autoSelect(): void {
  if (play.tut || play.selected !== null || state.over) return;
  const usable = usableReels();
  if (usable.length !== 1) return;
  const r = state.results[usable[0]];
  if (SYMBOLS[r.symbol].shape === 'all') return;
  play.selected = usable[0];
  play.autoSelected = true;
}

// ---- チュートリアル：初めての人の最初の2日を案内する ----

function startTutorial(): void {
  play.tut = { step: 0 };
  document.documentElement.classList.add('in-tutorial');
}

function endTutorial(): void {
  play.tut = null;
  document.documentElement.classList.remove('in-tutorial');
  window.clearInterval(play.tutSpotTimer);
  document.getElementById('tut-dim')?.remove();
  document.getElementById('tut-hand')?.remove();
  meta.tutorialDone = true;
  saveMeta(meta);
  // チュートリアルで教えた絵柄は、説明カードを出さない
  markTutorialSymbols();
  play.tutFocus.forEach((e) => e.classList.remove('coach-focus'));
  play.tutFocus = [];
  document.getElementById('coach')?.remove();
  render();
}

/** チュートリアルの日は出目を決めておく（1日目：種×3・雨・金貨、2日目：雷・金貨・金貨、3日目：種×2・太陽・金貨） */
function tutScript(): void {
  if (!play.tut) return;
  const mk = (symbol: SymbolId, total = 1) => ({ symbol, used: false, total, left: total, power: 1 });
  const plan: Record<number, ReturnType<typeof mk>[]> = { 1: [mk('seed', 3), mk('rain'), mk('coin')], 2: [mk('thunder'), mk('coin'), mk('coin')], 3: [mk('seed', 2), mk('sun'), mk('coin')] };
  const r = plan[state.day];
  if (!r) return;
  state.results = [...r, ...state.results.slice(r.length).map(() => mk('coin'))];
  state.fever = [];
}

function renderTutorial(): void {
  let advanced = false;
  while (play.tut && TUT_STEPS[play.tut.step].done?.()) {
    play.tut.step++;
    advanced = true;
    if (play.tut.step >= TUT_STEPS.length) return endTutorial();
  }
  const s = tutStep();
  play.tutFocus.forEach((e) => e.classList.remove('coach-focus'));
  play.tutFocus = [];
  let coach = document.getElementById('coach');
  if (!s) {
    coach?.remove();
    placeTutSpot();
    return;
  }
  if (!coach) {
    coach = document.createElement('div');
    coach.id = 'coach';
    coach.className = 'coach';
    coach.setAttribute('role', 'status');
    document.body.appendChild(coach);
  }
  // 案内役（かかし）・文・進み具合の点・ボタン
  const dots = TUT_STEPS.map((_, k) => `<i class="${k < play.tut!.step ? 'done' : k === play.tut!.step ? 'now' : ''}"></i>`).join('');
  const html = `<div class="coach-body"><span class="coach-guide">${art('scarecrow')}</span><p>${s.text}</p></div><div class="coach-dots">${dots}</div><div class="coach-actions">${s.button ? `<button class="primary coach-next">${s.button}</button>` : ''}<button class="coach-skip">${L('スキップ', 'Skip')}</button></div>`;
  if (coach.dataset.step !== String(play.tut!.step)) {
    coach.dataset.step = String(play.tut!.step);
    coach.innerHTML = html;
    pop(coach, 1.04);
    // やって進んだ手順は、小さくほめる（光の粒と音）
    if (advanced) {
      const c = center(coach.querySelector('.coach-guide') ?? coach);
      burst(c.x, c.y, ['✨', '⭐'], 8, 50);
      sfx.pon();
      // かかしの横に「いいね！」の判子
      const stamp = document.createElement('span');
      stamp.className = 'coach-good';
      stamp.textContent = L('いいね！', 'Nice!');
      coach.appendChild(stamp);
      stamp.animate([{ transform: 'scale(2) rotate(-14deg)', opacity: 0 }, { transform: 'scale(1) rotate(-8deg)', opacity: 1, offset: 0.4 }, { transform: 'scale(1) rotate(-8deg)', opacity: 1, offset: 0.8 }, { transform: 'scale(1) rotate(-8deg)', opacity: 0 }], { duration: 1100, easing: 'ease-out', fill: 'forwards' }).onfinish = () => stamp.remove();
    }
    coach.querySelector('.coach-next')?.addEventListener('click', () => {
      sfx.select();
      play.tut!.step++;
      if (play.tut!.step >= TUT_STEPS.length) endTutorial();
      else render();
    });
    coach.querySelector('.coach-skip')!.addEventListener('click', () => {
      sfx.cancel();
      endTutorial();
    });
  }
  // 吹き出しは光らせる物とかぶらない側へ（畑・リールなら上、上の札なら下）
  play.tutFocus = s.focus().filter(Boolean);
  play.tutFocus.forEach((e) => e.classList.add('coach-focus'));
  placeTutSpot();
  // 演出で物が動いても暗幕の穴と指がついていくよう、少しずつ置き直す
  window.clearInterval(play.tutSpotTimer);
  play.tutSpotTimer = window.setInterval(placeTutSpot, 250);
  // 置き場所は placeCoach（光らせる物の上か下の、空いている方）
}

// ---- 起動 ----

// 開発用の版の札は、開発中か ?debug を付けたときだけ出す（版は設定の下にも出ている）
$('build-label').textContent = __BUILD__;
$('build-label').hidden = !(import.meta.env.DEV || new URLSearchParams(location.search).has('debug'));
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
// 曜日の帯（週契約）をタップ：縛りと見返り
el.week.addEventListener('click', (e) => {
  const rb = (e.target as HTMLElement).closest('.wk-ribbon');
  if (!rb) return;
  pop(rb, 1.05);
  say(contractSay(), 5000);
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
$('dex-btn').innerHTML = `${art('book')}${L('図鑑', 'Collection')}`;
$('settings-btn').innerHTML = `${art('gear')}${L('設定', 'Settings')}`;
$('to-title').innerHTML = `${art('home')}${L('タイトルへ', 'Title')}`;
// 早送り中の印（自作の絵）
$('hurry-badge').innerHTML = `${art('fastForward')}<b>${L('早送り', 'FAST')}</b><span>×4</span>`;
document.querySelector('.machine-top')!.innerHTML = `${art('coin')} ${L('畑スロット', 'FARM SLOTS')} ${art('coin')}`;
// 毎日の仕入れ：看板を押すと窓が開き、効果を見て選ぶ
document.querySelector('.machine-top')!.addEventListener('click', () => {
  if (!state.offer.length || ui.busy || state.over || play.tut) return;
  unlockAudio();
  sfx.select();
  openMarket();
});

// 演出の最中に画面をタップすると早送り
// 窓（お守り選び・確認など）や案内の吹き出しを押したときは、選ぶための操作なので早送りにしない
document.addEventListener('pointerdown', (e) => {
  if (!ui.busy) return;
  if ((e.target as Element | null)?.closest('#overlay.show, .coach, .sheet, .explain-layer')) return;
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
    if (openSheetName === name) {
      if (!holdMarket()) closeSheet();
    } else if (name === 'shop' && !shopOpen(state)) {
      // 市の日でなければ開かない。次の市を知らせる
      sfx.error();
      const d = nextMarketDay(state);
      say(`${art('bargain')} ${d === null ? '' : L(`次の市は${d}日目（あと${d - state.day}日）`, `Next market: day ${d} (${d - state.day} days)`)}`, 2500);
    } else {
      sfx.select();
      // 市は中身を描き直してから開く（週が替わって品が変わっていても、土地・置き物が出るように）
      if (name === 'shop') openMarket();
      else openSheet(name);
    }
  }),
);
el.sheetBackdrop.addEventListener('click', () => {
  if (holdMarket()) return;
  if (openSheetName === 'shop') leaveMarket();
  else closeSheet();
});
$('market-next').addEventListener('click', () => {
  if (holdMarket()) return;
  sfx.select();
  leaveMarket();
});
$('sheet-close').addEventListener('click', () => holdMarket() || closeSheet());
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
// 図鑑：出会った絵柄・組み合わせ・お守りの一覧（まだのものは秘密）
$('dex-btn').addEventListener('click', () => {
  menu.hidden = true;
  if (ui.busy || el.overlay.classList.contains('show')) return;
  unlockAudio();
  sfx.select();
  showHelp('symbols');
});
el.mute.addEventListener('click', (e) => {
  e.stopPropagation();
  unlockAudio();
  toggleMute();
  menuLabels();
});
hooks.render = render;
hooks.startGame = startGame;

// どの画面のボタンも：押してから離すまでに画面が動いて（板がせり上がる・カードが入れ替わる途中など）
// 指の下からボタンが外れても、指がほとんど動いていなければ押したボタンのタップとして扱う
{
  let pressed: { btn: HTMLButtonElement; at: number; x: number; y: number } | null = null;
  document.addEventListener('pointerdown', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button');
    pressed = btn && e.isPrimary ? { btn, at: performance.now(), x: e.clientX, y: e.clientY } : null;
  }, true);
  document.addEventListener('pointercancel', () => (pressed = null), true);
  document.addEventListener('click', (e) => {
    const p = pressed;
    pressed = null;
    if (!p || !e.isTrusted || performance.now() - p.at > 700) return;
    // 指が動いた（ずらしてやめた・なぞった）ときは、押したことにしない
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 24) return;
    const hit = (e.target as Element).closest('button');
    if (hit) return;
    // 押したボタンが消えた・押せなくなった・見えなくなったときも何もしない
    if (!p.btn.isConnected || p.btn.disabled || !p.btn.checkVisibility()) return;
    e.stopPropagation();
    e.preventDefault();
    p.btn.click();
  }, true);
}

// 軽量化：しばらく触らないと、飾りの動き（舞う葉・光る枠・脈打つマスなど）を止める。触ればすぐ戻る
{
  let idleTimer = 0;
  const wake = () => {
    document.documentElement.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => document.documentElement.classList.add('idle'), 15000);
  };
  ['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach((t) => document.addEventListener(t, wake, { passive: true, capture: true }));
  wake();
}
hooks.setGold = () => {
  play.taxPending = 0;
  syncGold();
};
applySkin();
setupLongPress();
setupScene();
render();
showTitle();
