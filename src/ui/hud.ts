// 上の看板と畑のまわりの表示：今日の効果・お守り・曜日・年貢・目標・案内の1行。画面の高さに合わせた畑の大きさ

import { EN, L } from '../i18n.ts';
import { CHARMS, CHARM_ORDER, curseText, SHAPE_NAMES, CONFIG, PLACES, SEEDS, SYMBOLS, UPGRADES } from '../config.ts';
import {
  isGolden, canBuy, canUse, inField, isRipe, nextTax, upgradeAvailable, upgradePrice, hasRanch, isColorful, mustPlace, symbolShape, shopOpen, taxCursePct, lordPenalty,
} from '../game.ts';
import { art } from '../art.ts';
import { fmtMult } from '../fx.ts';
import { PLACE_ART, setHtml, symHtml } from './view.ts';
import { $, el, state } from './store.ts';
import { play } from './play.ts';
import { lordChip } from './lord.ts';
import { contractRibbon } from './contract-ui.ts';

export const WIDE = window.matchMedia('(min-width: 860px) and (orientation: landscape)');

export let fitRaf = 0;

export function fitLayout(): void {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => {
    const root = document.documentElement;
    // 畑は左右の余白に少しはみ出して広く取る（.farm の負の margin と合わせる）
    const colWidth = (WIDE.matches ? el.app.clientWidth / 2 - 18 : el.app.clientWidth - 24) + 12;
    // 畑の枠（縁・溝・マスの間）の実際の幅を測り、残りを列の数で割る
    const farm = el.field.closest<HTMLElement>('.farm');
    const fcs = getComputedStyle(el.field);
    const gap = parseFloat(fcs.columnGap) || 5;
    // 枠の幅＝畑全体の幅 − マスを並べた中身の幅（今のマスの大きさに関係なく正しく測れる）
    const inner = el.field.clientWidth - parseFloat(fcs.paddingLeft) - parseFloat(fcs.paddingRight);
    const frame = farm && inner > 0 ? farm.offsetWidth - inner : 28;
    let cell = Math.min(150, Math.floor((colWidth - frame - (state.cols - 1) * gap) / state.cols));
    root.style.setProperty('--cell', `${cell}px`);
    for (let k = 0; k < 3; k++) {
      const excess = root.scrollHeight - window.innerHeight;
      if (excess <= 0) break;
      cell = Math.max(40, cell - Math.ceil(excess / state.rows));
      root.style.setProperty('--cell', `${cell}px`);
    }
  });
}

/** 今日だけ・明日だけの効果 */
export function renderStatus(): void {
  const chips: string[] = [];
  const good = state.fever.filter((s) => SYMBOLS[s].rarity !== 'bad');
  const bad = state.fever.filter((s) => SYMBOLS[s].rarity === 'bad');
  if (good.length) chips.push(`<span class="st fever">${art('flame')} ${L('フィーバー', 'Fever')}：${good.map((s) => SYMBOLS[s].name).join(L('・', ', '))}</span>`);
  if (bad.length) chips.push(`<span class="st danger">${art('warn')} ${bad.map((s) => L(`${SYMBOLS[s].name}の群れ`, `${SYMBOLS[s].name} swarm`)).join(L('・', ', '))}</span>`);
  state.combos.forEach((id) => chips.push(`<span class="st combo">${art(id)} ${CHARMS[id].name}</span>`));
  // 市の日は高く売れる
  // 市の日の売値は曜日の板（今日の札の下）に出す
  if (state.priceMult > 1) chips.push(`<span class="st merchant">${art('merchant')} ${L('今日の売値', "Today's prices")} ×${fmtMult(state.priceMult)}</span>`);
  if (state.cloverBoost > 1) chips.push(`<span class="st clover">${art('clover')} ${L('明日は金の種が出やすい', 'Golden seeds likelier tomorrow')}（×${fmtMult(state.cloverBoost)}）</span>`);
  // セット効果：そろっている間だけ
  if (hasRanch(state)) chips.push(`<span class="st set">${art('henhouse')}${art('cowshed')}${art('hive')} ${L('牧場', 'Ranch')} ×2</span>`);
  if (isColorful(state)) chips.push(`<span class="st set">${art('sunBlessing')} ${L('彩りの畑', 'Colorful field')} +${Math.round(CONFIG.colorfulBonus * 100)}%</span>`);
  setHtml(el.status, chips.join(''));
}

/** 操作の案内：今なにをすればよいかを、リールのすぐ上に1行で（docs/ui-reading.md：操作の近くに） */
export function renderGuide(): void {
  const box = $('guide');
  let html = '';
  if (state.over || play.tut) html = '';
  // 置き待ちの物があるときは、まず置く（1日目の前に、腕前でもらった物も）
  else if (state.stock.length && mustPlace(state)) {
    const id = state.stock[0];
    html = `${art(PLACE_ART[id])}<span>${L(`${PLACES[id].name}を置く → <b>光るマス</b>をタップ`, `Place the ${PLACES[id].name} → tap a <b>glowing plot</b>`)}</span>`;
  } else if (state.day === 0) html = `${art('hand')}<span>${L('<b>リールをタップ</b>して回す', '<b>Tap the reels</b> to spin')}</span>`; else if (play.selected !== null && state.results[play.selected]) {
    const r = state.results[play.selected];
    const shape = symbolShape(state, r.symbol);
    const what = SEEDS[r.symbol] ? L(`植える 残り${r.left}`, `plant ${r.left}`) : shape ? SHAPE_NAMES[shape] : SYMBOLS[r.symbol].desc;
    html = `${symHtml(r.symbol)}<span>${L(`${SYMBOLS[r.symbol].name} → <b>光るマス</b>をタップ`, `${SYMBOLS[r.symbol].name} → tap a <b>glowing plot</b>`)}<em>${what}</em></span>`;
  } else if (usableReels().length) html = `${art('hand')}<span>${L('<b>出目</b>を選ぶ', 'Pick a <b>reel</b>')}</span>`;
  else if (fieldCells().some((c) => isRipe(state.field[c]))) html = `${art('coin')}<span>${L('<b>実り</b>をタップで売る・リールで次の日へ', 'Tap <b>ripe crops</b> to sell · reels for next day')}</span>`;
  else html = `${art('calendar')}<span>${L(`<b>リールをタップ</b>で${state.day + 1}日目へ`, `<b>Tap the reels</b> for day ${state.day + 1}`)}</span>`;
  box.hidden = !html;
  setHtml(box, html);
}

export function renderCharms(): void {
  const owned = CHARM_ORDER.filter((id) => state.charms[id] > 0);
  el.charmPanel.hidden = owned.length > 0;
  el.charmCount.textContent = state.stock.length ? L(`置き待ち${state.stock.length}`, `${state.stock.length} to place`) : owned.length ? `${owned.reduce((n, id) => n + state.charms[id], 0)}` : '';
  setHtml(
    el.charms,
    owned
      .map((id) => {
        const c = CHARMS[id];
        const n = state.charms[id];
        const gold = isGolden(state, id);
        return `<span class="charm tier-${c.tier}${gold ? ' golden' : ''}${c.special ? ' special' : ''}" data-charm="${id}"><span class="e">${art(id)}</span><span><b>${c.name}${n > 1 ? ` ×${n}` : ''}${gold ? ` <i class="gold-tag">✦ ${L('金色・2倍', 'Golden ×2')}</i>` : c.max >= CONFIG.goldenAt && n > 0 ? ` <i class="gold-next">${L(`あと${CONFIG.goldenAt - n}個で金色`, `${CONFIG.goldenAt - n} more → golden`)}</i>` : ''}</b><small>${c.desc(gold ? n * 2 : n)}${curseText(id, n) ? `<em class="curse">${curseText(id, n)}</em>` : ''}</small></span></span>`;
      })
      .join(''),
  );
}

/** 年貢：「年貢 7 あと2日」を言葉で。払えるときは緑、足りないときは赤 */
/** 曜日の表示：月〜日のどこにいるか（今日が光る）。水・土は市、日は年貢の印 */
export const WEEKDAYS = EN ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['月', '火', '水', '木', '金', '土', '日'];

export function renderWeek(): void {
  const today = state.day > 0 ? ((state.day - 1) % CONFIG.taxPeriod) + 1 : 0;
  const t = nextTax(state);
  setHtml(
    el.week,
    WEEKDAYS.map((w, k) => {
      const d = k + 1;
      // 札の右下に小さな印：市の日は値札、日曜は年貢の俵
      // 市が閉まる週は市の印を出さない
      const market = CONFIG.marketDays.includes(d) && state.contract !== 'marketClosed';
      const mark = d === CONFIG.taxPeriod ? art('bale') : market ? art('bargain') : '';
      const cls = `wd${d === today ? ' now' : d < today ? ' past' : ''}${d === CONFIG.taxPeriod ? ' tax' : ''}${market ? ' market' : ''}${d === CONFIG.taxPeriod && state.gold < t.amount ? ' short' : ''}`;
      // 市の日の今日は、札の下に売値の倍率を下げる（畑の上に別の帯を出さない）
      const sell = d === today && market && state.day > 0 ? `<em class="wd-sell">${L('売値', 'Sell')}×${CONFIG.marketDaySell}</em>` : '';
      return `<span class="${cls}"><span class="wd-plate"><b>${w}</b>${mark ? `<i>${mark}</i>` : ''}</span>${sell}</span>`;
    }).join('') + contractRibbon(),
  );
  el.week.classList.toggle('has-contract', !!state.contract);
  // 道のりの進み具合（月＝0、日＝1）。済んだ区間は金色に塗る
  el.week.style.setProperty('--wk-p', String(today ? (today - 1) / (CONFIG.taxPeriod - 1) : 0));
  // 溝は札の真ん中を通す（最初と最後の札の中心を測る。今日の札は大きくなるので、ほかの札で測る）
  requestAnimationFrame(() => {
    const plates = [...el.week.querySelectorAll<HTMLElement>('.wd:not(.now) .wd-plate')];
    if (plates.length < 2) return;
    const box = el.week.getBoundingClientRect();
    const first = el.week.querySelector<HTMLElement>('.wd:first-child .wd-plate')!.getBoundingClientRect();
    const last = el.week.querySelector<HTMLElement>('.wd:nth-child(7) .wd-plate')!.getBoundingClientRect();
    const ref = plates[0].getBoundingClientRect();
    const border = el.week.clientLeft;
    const cy = ref.top + ref.height / 2 - box.top - el.week.clientTop;
    const x0 = first.left + first.width / 2 - box.left - border;
    const x1 = last.left + last.width / 2 - box.left - border;
    el.week.style.setProperty('--wk-y', `${cy.toFixed(1)}px`);
    el.week.style.setProperty('--wk-x0', `${x0.toFixed(1)}px`);
    el.week.style.setProperty('--wk-w', `${(x1 - x0).toFixed(1)}px`);
  });
  el.week.setAttribute('aria-label', today ? L(`今日は${WEEKDAYS[today - 1]}曜日`, `Today: ${WEEKDAYS[today - 1]}`) : '');
}

export function renderTax(): void {
  const t = nextTax(state);
  // 今のお金が年貢に足りないときは、所持金を赤字で
  el.goldBox.classList.toggle('short', state.day > 0 && state.gold < t.amount);
  // 左上：所持金のあとに「/年貢の額」
  $('gold-need').textContent = `/${t.amount}`;
  renderWeek();
  const short = state.gold < t.amount;
  const warn = short && t.daysLeft <= CONFIG.taxWarnDays;
  const lordOn = !!state.lordLevel && !!(state.taxCond || state.whim);
  const pct = taxCursePct(state) + Math.round(lordPenalty(state) * 100);
  el.tax.className = `hud-tax${warn ? ' warn' : ''}${short ? ' short' : ' ok'}${state.difficulty ? ' hard' : ''}${lordOn ? ' lord' : ''}`;
  el.tax.innerHTML =
    // 年貢の額は左上の所持金の横（所持金/年貢）に出す
    `<span class="tax-label">${art('bale')}<span class="tax-word">${L('年貢', 'Tax')}</span></span>` +
    // お守りの代償で年貢が上がっているときは、金額の横に「+10%」の印
    // 殿様モードで条件に届いていない分も、同じ「+◯%」の印にまとめる（札に収まるように1つだけ）
    (pct ? `<em class="tax-curse" title="${L('年貢が増えている', 'Tax raised')}">+${pct}%</em>` : '') +
    // 殿様モード：今週の年貢の条件の進み（2/5）・気まぐれの殿様の顔
    lordChip(state) +
    // 足りないときは、いくら足りないか（いつ払うかは曜日の板で分かるので書かない）
    `<span class="tax-mark">${short ? L(`あと${t.amount - state.gold}`, `${t.amount - state.gold} short`) : L('払える', 'ready')}</span>` +
    // 何回目の年貢か（クリアまでの7回のうち）
    `<span class="tax-count">${Math.min(t.index + 1, CONFIG.winTaxes)}<small>/${CONFIG.winTaxes}</small></span>`;
}

/** 列（縦・横・斜めに3つ以上）にそろった実があるか */

export function renderGoal(): void {
  const available = UPGRADES.filter((u) => upgradeAvailable(state, u.id));
  const tab = document.querySelector('.tab[data-sheet="shop"]')!;
  // 市の日だけ開く。それ以外の日は次の市までの日数
  tab.classList.toggle('closed', !shopOpen(state));
  if (!shopOpen(state)) {
    tab.classList.remove('ready');
    el.goal.textContent = '';
    return;
  }
  const ready = available.some((u) => canBuy(state, u.id));
  tab.classList.toggle('ready', ready);
  if (ready) {
    el.goal.textContent = L('買える', 'Can buy');
    return;
  }
  const next = available.sort((a, b) => upgradePrice(state, a.id) - upgradePrice(state, b.id))[0];
  el.goal.textContent = next ? L(`あと${upgradePrice(state, next.id) - state.gold}`, `${upgradePrice(state, next.id) - state.gold}g to go`) : '';
}

export function usableReels(): number[] {
  return state.results.flatMap((_, i) => (canUse(state, i, null) ? [i] : []));
}

export function fieldCells(): number[] {
  return state.field.flatMap((_, i) => (inField(state, i) ? [i] : []));
}
