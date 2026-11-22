// 市：屋台の段（畑の品・足す・捨てる・合体・特別な品）、朝の仕入れ、絵柄袋の板

import { L } from '../i18n.ts';
import {
  MERGES, CONFIG, PLACES, PLACE_ORDER, SYMBOLS, SYMBOL_ORDER, UPGRADES, UPGRADE_SYMBOL, type AddUpgradeId, type PlaceId, type SymbolId, type UpgradeId,
} from '../config.ts';
import {
  bagTotal, buy, buyPlace, canBuy, canBuyPlace, canExpand, expand, expandPrice, placePrice, nextTax, upgradeAvailable, upgradePrice, isPivotAdd, mustPlace, takeOffer, roomLeft, isRareOffer, isMarketDay, shopOpen, mergeable, mergeSymbol, mergeCost, discard, discardPrice, canDiscard, PREMIUM, PREMIUM_ORDER, type PremiumId, premiumShown, premiumPrice, canBuyPremium, buyPremium, isSuperOffer,
} from '../game.ts';
import { sfx, unlockAudio } from '../audio.ts';
import { art, type ArtId } from '../art.ts';
import { burst, center, ripple, confetti, flash, floatText, flyTo, isCalm, pop, vibrate, later } from '../fx.ts';
import { PLACE_ART, setHtml, bagPct, costHtml, openSheet, openSheetName, say, shapeIcon, symHtml, upgradeArt, upgradeEffect, visibleOr } from './view.ts';
import { $, el, hooks, state, ui } from './store.ts';
import { armFresh } from './tapguard.ts';
import { reportError } from '../telemetry.ts';
import { done, play } from './play.ts';
import { accept, reject } from './states.ts';
import { explainOnce, marketCard, mergeCard, offerCard } from './explain.ts';
import { syncGold } from './gold-display.ts';
import { fieldCells, WEEKDAYS } from './hud.ts';
import { money } from './harvest-fx.ts';

/** 先に置く物があるときの断りのひと言 */
export const placeFirst = () => L(`先に${PLACES[state.stock[0]].name}を置く`, `Place the ${PLACES[state.stock[0]].name} first`);

/** お金が足りないときのひと言 */
export const needGold = (price: number) => L(`あと${price - state.gold}`, `${price - state.gold}g short`);

/** ショップの値段の札。買えるときは緑の値段、足りないときは灰色の値段と不足額 */
/** このゲームのショップに並ぶもの（選んだ「足す」強化＋消す＋リール） */
/** いつも並ぶ品・週替わり・袋に入っているお邪魔を消す品 */
export function shopItems(): typeof UPGRADES {
  return UPGRADES.filter((u) => {
    // 毎日の仕入れのときは、ショップで足せる絵柄は満月だけ
    if (u.id.startsWith('add')) return !CONFIG.dailyPick && state.weekly.includes(u.id as never);
    return state.bag[UPGRADE_SYMBOL[u.id]!.symbol] > 0;
  });
}

/** 市の上の帯：所持金・次の年貢・年貢まで使える額（買う前に比べられるように） */
export function renderBudget(): void {
  const stall = $('stall');
  let bar = stall.querySelector<HTMLElement>('.budget-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'budget-bar';
    stall.prepend(bar);
  }
  const t = nextTax(state);
  const free = state.gold - t.amount;
  const html = `<span class="bb-cell">${art('coin')}<small>${L('所持', 'Gold')}</small><b>${state.gold}</b></span>
    <span class="bb-cell">${art('bale')}<small>${L(`年貢（${WEEKDAYS[CONFIG.taxPeriod - 1]}）`, 'Tax')}</small><b>${t.amount}</b></span>
    <span class="bb-cell ${free >= 0 ? 'ok' : 'short'}">${art(free >= 0 ? 'bargain' : 'warn')}<small>${free >= 0 ? L('使える', 'Spendable') : L('年貢まで', 'To tax')}</small><b>${free >= 0 ? free : `−${-free}`}</b></span>`;
  if (bar.innerHTML !== html) bar.innerHTML = html;
}

export function renderShop(): void {
  // どれか1つの段でエラーが起きても、ほかの段は出す（市が空のまま開かないように）
  safely('budget', renderBudget);
  safely('offer', renderOfferShop);
  safely('next', () => {
    // 市を出るボタン：仕入れを選ぶまでは押せない（選ぶと押せるようになる）
    const next = $('market-next') as HTMLButtonElement;
    const must = forcedOffer();
    next.disabled = must;
    setHtml(next, must ? L('↑ 仕入れを1つ選ぶ', '↑ Pick one first') : `${L('次へ', 'Next')} ▶`);
  });
  safely('adds', () => {
    const items = shopItems();
    const adds = items.filter((u) => !u.id.startsWith('remove'));
    renderUpgradeList(el.shop, adds);
    // 毎日の仕入れのときは、ショップに絵柄の区画はいらない
    (el.shop.closest('.stall-sec') as HTMLElement).hidden = adds.length === 0;
    renderUpgradeList($('remove-shop'), items.filter((u) => u.id.startsWith('remove')));
  });
  safely('merge', renderMergeShop);
  safely('premium', renderPremiumShop);
  safely('discard', renderDiscardShop);
  syncStallSecs();
}

/** 市の段を描く。エラーは記録に送って、ほかの段は続ける */
function safely(where: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    reportError(state, `market:${where}`, err, { weeklyPlaces: state.weeklyPlaces.join(','), offer: state.offer.join(',') });
  }
}

/** 分類の段：中に品が1つもなければ段ごと隠す（お邪魔の段は「いない！」の1行があれば出す） */
export function syncStallSecs(): void {
  document.querySelectorAll<HTMLElement>('#stall .stall-sec[data-cat]').forEach((sec) => {
    // 段の中で隠れているかだけを見る（前は外側の隠れた板まで数えていて、絵柄袋の板を開いたあとに市を開くと、品の段が全部隠れていた）
    const hiddenInside = (e: HTMLElement) => {
      for (let n: HTMLElement | null = e; n && n !== sec; n = n.parentElement) if (n.hidden) return true;
      return false;
    };
    const parts = [...sec.querySelectorAll<HTMLElement>('.shop, .stall-sub, .stall-empty')].filter((e) => !hiddenInside(e));
    sec.hidden = !parts.some((e) => e.classList.contains('stall-empty') || e.querySelector('.item, .dc-chip'));
  });
}

/** 要らない札を捨てる（市で1回・捨てるたびに高くなる）。1回目のタップで選び、もう一度で捨てる */
export let discardArmed: SymbolId | null = null;

export function renderDiscardShop(): void {
  const box = $('discard-shop');
  const shown = shopOpen(state) && state.day > 0 && !play.tut;
  (box.closest('.stall-sec') as HTMLElement).hidden = !shown;
  if (!shown) return;
  const price = discardPrice(state);
  setHtml($('discard-price'), state.discardedThisMarket ? L('この市はもう捨てた', 'Done this market') : `${art('coin')}${price}・${L('市で1回', 'once per market')}`);
  const syms = SYMBOL_ORDER.filter((id) => state.bag[id] > 0 && SYMBOLS[id].rarity !== 'bad');
  const html = syms
    .map((id) => `<button class="dc-chip${discardArmed === id ? ' armed' : ''}" data-discard="${id}" ${canDiscard(state, id) ? '' : 'disabled'} aria-label="${SYMBOLS[id].name}">${symHtml(id)}<b>×${state.bag[id]}</b></button>`)
    .join('');
  if (box.innerHTML !== html) {
    box.innerHTML = html;
    box.querySelectorAll<HTMLButtonElement>('[data-discard]').forEach((b) => b.addEventListener('click', () => onDiscard(b)));
  }
}

export function onDiscard(b: HTMLButtonElement): void {
  unlockAudio();
  if (ui.busy || state.over || holdMarket()) return;
  const sym = b.dataset.discard as SymbolId;
  if (discardArmed !== sym) {
    discardArmed = sym;
    sfx.select();
    say(`${symHtml(sym)} ${L('もう一度タップで捨てる', 'Tap again to discard')}`, 2000);
    renderDiscardShop();
    return;
  }
  discardArmed = null;
  if (!discard(state, sym)) {
    reject(b, needGold(discardPrice(state)));
    renderDiscardShop();
    return;
  }
  sfx.buy();
  const q = center(b);
  burst(q.x, q.y, ['💨'], 8, 50);
  hooks.render();
  renderShop();
}

/** 大きな買い物（4週目から）：お金の使い道。売値+10%の像・リール+1 */
export function renderPremiumShop(): void {
  const box = $('premium-shop');
  const shown = premiumShown(state) && shopOpen(state);
  box.hidden = !shown;
  if (!shown) return;
  const html = PREMIUM_ORDER.map((id) => {
    const p = PREMIUM[id];
    const price = premiumPrice(state, id);
    const ok = canBuyPremium(state, id);
    const n = state.premium?.[id] ?? 0;
    return `<button class="item premium-item${ok ? ' affordable' : ''}${price === null ? ' soldout' : ''}" data-premium="${id}"><span class="ico">${art(p.art as ArtId)}</span>
      <span class="text"><span class="name">${p.name}${n ? ` <span class="lv">${n}/${p.max}</span>` : ''}</span><span class="effect">${p.desc}</span></span>${costHtml(price, ok)}</button>`;
  }).join('');
  if (box.innerHTML !== html) {
    box.innerHTML = html;
    box.querySelectorAll<HTMLButtonElement>('[data-premium]').forEach((b) => b.addEventListener('click', () => onBuyPremium(b)));
  }
}

export function onBuyPremium(b: HTMLButtonElement): void {
  unlockAudio();
  if (ui.busy || state.over) return;
  const id = b.dataset.premium as PremiumId;
  const price = premiumPrice(state, id);
  if (price === null) return;
  if (!buyPremium(state, id)) {
    reject(b, needGold(price));
    return;
  }
  sfx.bigBuy();
  accept(b);
  const q = center(b);
  burst(q.x, q.y, ['✨', '⭐', '🌟'], 14, 80);
  if (id === 'reel') {
    sfx.newReel();
    floatText(q.x, q.y - 30, L('リール+1！', 'Reel +1!'), { cls: 'good', size: 1 });
  }
  hooks.render();
  renderShop();
}

/** 合体：同じ札が4枚そろった絵柄を、1枚の上位の札にできる（市で1回に1種類まで） */
export function renderMergeShop(): void {
  const box = $('merge-shop');
  const list = mergeable(state);
  (box.closest('.stall-sec') as HTMLElement).hidden = !list.length;
  if (list.length) void explainOnce('ex:merge', mergeCard(list[0], MERGES[list[0]]!, mergeCost(state)), !!play.tut);
  const cost = mergeCost(state);
  const key = `${list.join(",")}|${state.mergedThisMarket}|${cost}|${state.gold}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.innerHTML = list
    .map((sym) => {
      const to = MERGES[sym]!;
      const def = SYMBOLS[to];
      return `<button class="item merge-item${state.gold >= cost ? ' affordable' : ' short'}" data-merge="${sym}">
        <span class="merge-from">${Array.from({ length: CONFIG.mergeNeed }, () => `<i>${symHtml(sym)}</i>`).join('')}</span>
        <span class="merge-arrow">▶</span>
        <span class="ico">${symHtml(to)}</span>
        <span class="text"><span class="name">${def.name}${def.shape ? `<span class="oc-shape">${shapeIcon(def.shape)}</span>` : ''}</span><span class="effect">${def.desc}</span></span>
        ${costHtml(cost, state.gold >= cost)}
      </button>`;
    })
    .join('');
  box.querySelectorAll<HTMLButtonElement>('[data-merge]').forEach((b) => b.addEventListener('click', () => onMerge(b)));
}

export function onMerge(b: HTMLButtonElement): void {
  unlockAudio();
  if (ui.busy || state.over) return;
  const sym = b.dataset.merge as SymbolId;
  const to = MERGES[sym]!;
  const from = [...b.querySelectorAll<HTMLElement>('.merge-from i')];
  const target = b.querySelector('.ico') as HTMLElement;
  const cost = mergeCost(state);
  if (state.gold < cost) {
    reject(b, needGold(cost));
    return;
  }
  if (!mergeSymbol(state, sym)) return;
  // 払ったお金はすぐ減らす
  syncGold();
  const pay = center(b.querySelector('.cost') ?? b);
  floatText(pay.x, pay.y - 10, money(-cost), { cls: 'bad', size: 0.9 });
  sfx.charmGet();
  vibrate(30);
  // 4枚が1か所に集まって、1枚の上位の札になる
  const t = center(target);
  from.forEach((f, k) => {
    const q = center(f);
    f.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${t.x - q.x}px, ${t.y - q.y}px) scale(.6)`, opacity: 0.2 }], { duration: 380, delay: k * 60, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'forwards' });
  });
  later(() => {
    flash('#fff6c0', 220);
    burst(t.x, t.y, ['✨', '⭐', '🌟'], 16, 80);
    pop(target, 1.4);
    floatText(t.x, t.y - 40, `${SYMBOLS[to].name}！`, { cls: 'good', size: 1.1 });
    later(() => {
      hooks.render();
      renderShop();
    }, 700);
  }, 380 + CONFIG.mergeNeed * 60);
}

/** 仕入れの段を畳んでいる最中（終わるまで描き直さない） */
export let offerFolding = false;

/** 市の仕入れ：3つから1つタダで袋へ（見送れない） */
export function renderOfferShop(): void {
  if (offerFolding) return;
  const box = $('offer-shop');
  (box.closest('.stall-sec') as HTMLElement).hidden = !state.offer.length;
  const html = state.offer
    .map((id) => {
      const sym = UPGRADE_SYMBOL[id]!.symbol;
      const def = SYMBOLS[sym];
      const after = { ...state.bag, [sym]: state.bag[sym] + 1 };
      // 横に3枚並べるカード：絵・名前・効き目・袋の割合・選ぶ
      // スーパーレアは金の札・金の「超レア」札。レアは「レア」札
      const sup = isSuperOffer(id);
      return `<button class="item affordable offer-item${isRareOffer(id) ? ' rare-offer' : ''}${sup ? ' super-offer' : ''}" data-take="${id}">${sup ? `<span class="pivot-tag super-tag">${L('超レア', 'Super rare')}</span>` : isRareOffer(id) ? `<span class="pivot-tag">${L('レア', 'Rare')}</span>` : ''}<span class="ico">${symHtml(sym)}</span>
        <span class="name">${def.name}${def.shape ? `<span class="oc-shape">${shapeIcon(def.shape)}</span>` : ''}</span>
        <span class="effect">${def.desc}</span><span class="odds">${art('seed')}${bagPct(state.bag, sym)}→<b>${bagPct(after, sym)}%</b></span>
        <span class="cost free"><b>${L('選ぶ', 'Pick')}</b></span></button>`;
    })
    .join('');
  if (box.dataset.key !== state.offer.join(',')) {
    box.dataset.key = state.offer.join(',');
    box.innerHTML = html;
    box.querySelectorAll<HTMLButtonElement>('[data-take]').forEach((b) => b.addEventListener('click', () => onTakeOffer(b)));
  }
}

export function onTakeOffer(b: HTMLButtonElement): void {
  unlockAudio();
  if (ui.busy || state.over) return;
  const id = b.dataset.take as AddUpgradeId;
  const from = center(b.querySelector('.ico')!);
  // 畳む前の段（render で hidden になる前に、高さを測っておく）
  const sec = b.closest('.stall-sec') as HTMLElement;
  if (!takeOffer(state, id)) return;
  offerFolding = true;
  const sym = UPGRADE_SYMBOL[id]!.symbol;
  sfx.buy();
  accept(b);
  sec.querySelectorAll<HTMLElement>('.offer-item').forEach((it) => {
    if (it !== b) it.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.25, transform: 'scale(0.96)' }], { duration: 220, fill: 'forwards' });
  });
  later(() => {
    // 選んだら画面を薄く消して、市（買い物）を開く
    const scr = $('offer-screen');
    scr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: isCalm() ? 120 : 260, easing: 'ease-in' }).onfinish = () => {
      scr.hidden = true;
      offerFolding = false;
      openMarket();
    };
  }, 420);
  later(() => {
    hooks.render();
    ripple(from.x, from.y, '#ffd84a');
    const chip = visibleOr(el.bag.querySelector(`[data-sym="${sym}"]`), 'bag');
    flyTo(from, chip, symHtml(sym), 1, () => {
      pop(chip, 1.35);
      burst(center(chip).x, center(chip).y, ['✨'], 6, 30);
    });
  }, 260);
}

/** 絵柄袋の品（足す・消す）を container に並べる */
export function renderUpgradeList(container: HTMLElement, items: typeof UPGRADES): void {
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
    // 「新しい作戦」の札は出さない
    const pivot = false && u.id.startsWith('add') && isPivotAdd(state, u.id as AddUpgradeId);
    b.classList.toggle('pivot', pivot);
    const html = `<span class="ico">${ico}</span><span class="text"><span class="name">${u.name}${pivot ? `<span class="pivot-tag">${L('新しい作戦', 'New plan')}</span>` : ''}</span><span class="effect">${pivot ? CONFIG.pivotAdds[u.id]!.split(/：|: /)[1] : upgradeEffect(u.id)}</span></span>${costHtml(available ? price : null, affordable, u.id.startsWith('remove') && state.bag[UPGRADE_SYMBOL[u.id]!.symbol] > 0 ? CONFIG.marketDays.length ? L('次の市', 'Next') : L('来週', 'Next wk') : L('完了', 'Done'))}`;
    if (b.innerHTML !== html) b.innerHTML = html;
  });
  if (container.id === 'remove-shop') $('stall-empty').hidden = items.length > 0;
}

/** 畑が広がった演出（お守り「開墾」） */
export function showExpanded(): void {
  sfx.bigBuy();
  flash('#c8f0a0', 400);
  const f = center(el.field);
  burst(f.x, f.y, ['🌱', '✨', '⭐'], 18, 160);
  fieldCells().forEach((c) => pop(el.field.children[c], 1.08));
}

/** 畑のショップ：道具・特別なマス */
/** 長い列の倍率（同じ作物の上乗せなし、四捨五入して1桁） */
export const longTotal = (len: number): number => Math.round(CONFIG.lineMult * CONFIG.longLineMult[len] * 10) / 10;

/** 市の畑の品の効き目：1行に1つ、行の頭に絵（docs/ui-reading.md） */
export const PLACE_ROWS: Record<PlaceId, [ArtId, string][]> = {
  scarecrow: [['crow', L('周り8マスを守る', 'Guards 8 around')], ['coin', L('追い払うと+1', '+1 per shoo')]],
  bigScarecrow: [['crow', L('2マス以内を守る', 'Guards 2 away')], ['coin', L('追い払うと+2', '+2 per shoo')], ['puff', L('袋のカラス−1（1日1回）', 'Bag crow −1 daily')]],
  well: [['sprout', L('上下左右 毎晩+1', '4 sides +1 nightly')]],
  goldenWell: [['sprout', L('周り8マス 毎晩+1', '8 around +1 nightly')]],
  hive: [['coin', L('周り8マス 売値+20%', '8 around price +20%')], ['strawberry', L('苺が毎晩育つ', 'Strawberries grow nightly')]],
  queenHive: [['coin', L('周り8マス 売値+50%', '8 around price +50%')], ['strawberry', L('苺が毎晩育つ', 'Strawberries grow nightly')]],
  henhouse: [['coin', L('毎晩+3', '+3 nightly')], ['bug', L('虫を食べて+3', 'Eats bugs: +3')]],
  cowshed: [['coin', L('毎晩+4', '+4 nightly')], ['water', L('隣に水路で+2', '+2 next to water')]],
  compost: [['coin', L('売値×2', 'Price ×2')]],
  water: [['sprout', L('毎晩+1', '+1 nightly')], ['waterwheel', L('3つ並べて水車', '3 in a row: wheel')]],
  sprinkler: [['sprout', L('横一列 毎晩+1', 'Its row +1 nightly')]],
  reservoir: [['sprout', L('縦一列 毎晩+1', 'Its column +1 nightly')]],
  windmill: [['sprout', L('縦と横の列 毎晩+1', 'Row & column +1 nightly')]],
};

/** 難しい8：道具の維持費の行（毎週の年貢に足される額） */
const upkeepRow = (id: PlaceId): string =>
  state.difficulty >= CONFIG.upkeepFrom && PLACES[id].kind === 'tool'
    ? `<span class="fx-row">${art('dread8')}<span>${L(`維持費 毎週+${Math.round((PLACES[id].price ?? CONFIG.upkeepFree) * CONFIG.upkeepRate)}`, `Upkeep +${Math.round((PLACES[id].price ?? CONFIG.upkeepFree) * CONFIG.upkeepRate)}/week`)}</span></span>`
    : '';

export const placeRowsHtml = (id: PlaceId): string => PLACE_ROWS[id].map(([ico, t]) => `<span class="fx-row">${art(ico)}<span>${t}</span></span>`).join('');

/** 畑の品の分類：何に効くか（市の段の見出し） */
export type FarmCat = 'grow' | 'earn' | 'guard';

export const PLACE_CAT: Record<PlaceId, FarmCat> = {
  sprinkler: 'grow', reservoir: 'grow', windmill: 'grow', well: 'grow', goldenWell: 'grow', water: 'grow',
  compost: 'earn', hive: 'earn', queenHive: 'earn', henhouse: 'earn', cowshed: 'earn',
  scarecrow: 'guard', bigScarecrow: 'guard',
};

export const ring = (n: number) => (dx: number, dy: number) => Math.max(Math.abs(dx), Math.abs(dy)) <= n;

/** 効く範囲（置いた所から見て）。ないものは置いたマスだけに効く */
export const PLACE_RANGE: Partial<Record<PlaceId, (dx: number, dy: number) => boolean>> = {
  scarecrow: ring(1), bigScarecrow: ring(2), goldenWell: ring(1), hive: ring(1), queenHive: ring(1), henhouse: ring(1),
  well: (dx, dy) => Math.abs(dx) + Math.abs(dy) === 1,
  sprinkler: (_dx, dy) => dy === 0,
  reservoir: (dx) => dx === 0,
  windmill: (dx, dy) => dx === 0 || dy === 0,
};

/** 5×5の小さなマス目で効く範囲を見せる（真ん中が置く所） */
export function rangeGrid(id: PlaceId): string {
  const f = PLACE_RANGE[id];
  const cells = Array.from({ length: 25 }, (_, k) => {
    const dx = (k % 5) - 2;
    const dy = Math.floor(k / 5) - 2;
    return `<i class="${!dx && !dy ? (f ? 'me' : 'me on') : f?.(dx, dy) ? 'on' : ''}"></i>`;
  }).join('');
  return `<span class="rng" aria-hidden="true">${cells}</span>`;
}

export function renderFarmShop(): void {
  type FarmItem = { key: string; cat: FarmCat; ico: string; name: string; effect: string; price: number | null; ok: boolean; rng: string };
  const items: FarmItem[] = [];
  const ep = expandPrice(state);
  const nextCols = state.cols <= state.rows ? state.cols + 1 : state.cols;
  const nextRows = state.cols <= state.rows ? state.rows : state.rows + 1;
  const expandItem: FarmItem = {
    key: 'expand',
    cat: 'grow',
    ico: art('expand'),
    name: L('畑を広げる', 'Expand field'),
    effect: ep === null
      ? L(`これ以上は広げられない（${CONFIG.fieldCols}×${CONFIG.fieldRows}）`, `Already at max (${CONFIG.fieldCols}×${CONFIG.fieldRows})`)
      : `<span class="fx-row">${art('expand')}<span>${state.cols}×${state.rows} → ${nextCols}×${nextRows}</span></span>` +
        // 広げると、初めて4つ・5つの列が作れるようになる
        (Math.max(nextCols, nextRows) > Math.max(state.cols, state.rows) && CONFIG.longLineMult[Math.max(nextCols, nextRows)]
          ? `<span class="fx-row">${art('tomato')}<span>${L(`${Math.max(nextCols, nextRows)}つの列 ×${longTotal(Math.max(nextCols, nextRows))}`, `${Math.max(nextCols, nextRows)}-long line ×${longTotal(Math.max(nextCols, nextRows))}`)}</span></span>`
          : ''),
    price: ep,
    ok: canExpand(state),
    rng: '',
  };
  PLACE_ORDER.filter((id) => state.weeklyPlaces.includes(id)).forEach((id) =>
    safely(`place:${id}`, () =>
      items.push({ key: id, cat: PLACE_CAT[id], ico: art(PLACE_ART[id]), name: PLACES[id].name, effect: (roomLeft(state, id) > 0 ? placeRowsHtml(id) : PLACES[id].kind === 'tool' ? L('置ける空きマスがない', 'No empty plot to place it') : L('敷けるマスがない', 'No plot to lay it on')) + upkeepRow(id), price: placePrice(state, id), ok: canBuyPlace(state, id), rng: rangeGrid(id) }),
    ),
  );
  // 畑を広げるは「畑を強化する」の最後（広げきったら完了の札で）
  items.push(expandItem);
  const lists: Record<FarmCat, HTMLElement> = { grow: el.farmShop, earn: $('farm-earn'), guard: $('farm-guard') };
  (Object.keys(lists) as FarmCat[]).forEach((cat) => {
    const box = lists[cat];
    const list = items.filter((it) => it.cat === cat);
    // 週が替わって品が入れ替わったら作り直す（数が同じでも、ボタンが前の品のまま押されないように）
    const key = list.map((it) => it.key).join(',');
    if (box.dataset.key !== key || box.children.length !== list.length) {
      box.dataset.key = key;
      box.innerHTML = '';
      list.forEach((it) => {
        const b = document.createElement('button');
        b.className = 'item';
        b.dataset.id = it.key;
        b.addEventListener('click', () => onBuyFarm(it.key as PlaceId | 'expand'));
        box.appendChild(b);
      });
    }
    list.forEach((it, i) => {
      const b = box.children[i] as HTMLButtonElement;
      b.className = `item${it.ok ? ' affordable' : ''}${it.price === null ? ' soldout' : ''}${it.rng ? ' has-rng' : ''}`;
      // 買って置き待ちの品は、名前の横に緑の札
      const waiting = state.stock.filter((s) => s === it.key).length;
      const badge = waiting ? `<span class="stock-badge">${L(`置き待ち ${waiting}`, `To place ${waiting}`)}</span>` : '';
      const html = `<span class="ico">${it.ico}</span><span class="text"><span class="name">${it.name}${badge}</span><span class="effect">${it.effect}</span></span>${it.rng}${costHtml(it.price, it.ok)}`;
      if (b.innerHTML !== html) b.innerHTML = html;
    });
  });
  syncStallSecs();
}

/** 市の畑の品のボタン（3つの段のどれか） */
export const farmCard = (key: string): HTMLElement | null => document.querySelector(`#stall .farm-list [data-id="${key}"]`);

export function onBuyFarm(key: PlaceId | 'expand'): void {
  unlockAudio();
  if (ui.busy || state.over || holdMarket()) return;
  if (play.tut) {
    reject(farmCard(key), L('チュートリアルのあとで', 'After the tutorial'));
    return;
  }
  const card = farmCard(key) as HTMLElement;
  if (key === 'expand') {
    const price = expandPrice(state);
    if (price === null || !expand(state)) {
      reject(card, price === null ? L('もう広げられない', 'Max size') : needGold(price));
      return;
    }
    accept(card);
    // 市は閉じない（続けて買える）
    hooks.render();
    renderFarmShop();
    showExpanded();
    return;
  }
  if (!buyPlace(state, key)) {
    reject(card, roomLeft(state, key) <= 0 ? L('置ける所がない', 'No room') : needGold(placePrice(state, key) ?? 0));
    return;
  }
  accept(card);
  sfx.buy();
  play.selected = null;
  // 市は閉じずに続けて買える。買った物は置き待ちにたまり、市を出たら置く
  hooks.render();
  renderFarmShop();
  say(`${art(PLACE_ART[key])} ${L(`置き待ち ${state.stock.length}（市を出たら置く）`, `To place: ${state.stock.length} (after the market)`)}`);
}

export function renderBag(): void {
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

/** 市を開く（仕入れ・畑の品・お邪魔を消す・広げるが1つの画面） */
/** 市の日の朝：まず「タダで1つ選ぶ」だけの画面を出す。選ぶと市（買い物）が開く */
export function showOfferScreen(): void {
  const scr = $('offer-screen');
  renderOfferShop();
  if (!scr.hidden) return;
  scr.hidden = false;
  armFresh(scr);
  scr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: isCalm() ? 120 : 240, easing: 'ease-out' });
  // 札は動かさずに薄く出す（動いている途中の札を押すとタップが消えるので）
  scr.querySelectorAll<HTMLElement>('.offer-item').forEach((it, k) => it.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120 + k * 80, fill: 'backwards' }));
  void explainOnce('ex:offer', offerCard(), !!play.tut);
}

export function openMarket(): void {
  // 選んでいない仕入れがあれば、先にその画面
  if (state.offer.length) {
    showOfferScreen();
    return;
  }
  renderShop();
  safely('farm', renderFarmShop);
  const wasOpen = openSheetName === 'shop';
  openSheet('shop');
  // 畑の品の段が1つも出ていなければ、そのときの様子を記録に送る（市が空で開いた不具合を調べるため）
  if (!document.querySelector('#stall .stall-sec[data-cat]:not([hidden])')) {
    // 通しのテストで、空の市が起きなかったかを確かめるための数
    (window as unknown as { __marketEmpty?: number }).__marketEmpty = ((window as unknown as { __marketEmpty?: number }).__marketEmpty ?? 0) + 1;
    reportError(state, 'market:empty', 'no farm section', {
      weeklyPlaces: state.weeklyPlaces.join(','),
      farmItems: document.querySelectorAll('#stall .farm-list .item').length,
      // 先頭に s を付ける（数字だけだとスプレッドシートが頭の0を消す）
      secs: 's' + [...document.querySelectorAll<HTMLElement>('#stall .stall-sec')].map((x) => (x.hidden ? 0 : 1)).join(''),
    });
    syncStallSecs();
  }
  if (wasOpen) return;
  // 初めての市の日：一枚絵で（買い物）
  if (isMarketDay(state.day)) void explainOnce('ex:market', marketCard(), !!play.tut);
  el.sheet.animate([{ transform: 'translateY(105%)' }, { transform: 'translateY(-2%)', offset: 0.75 }, { transform: 'translateY(0)' }], {
    duration: isCalm() ? 260 : 520,
    easing: 'cubic-bezier(.2,.8,.3,1)',
  });
  [...el.sheet.querySelectorAll<HTMLElement>('[data-pane="shop"] .stall-sec:not([hidden]), .market-foot')].forEach((sec, k) =>
    // 動かさずに薄く出す（動いている途中の札を押すと、押した札から指がずれてタップが消えるので）
    sec.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 320,
      delay: 180 + k * 90,
      easing: 'cubic-bezier(.2,.8,.3,1)',
      fill: 'backwards',
    }),
  );
}

/** 仕入れを選ばずに市を閉じようとしたら止める */
export function holdMarket(): boolean {
  if (!forcedOffer()) return false;
  reject($('offer-shop'), L('仕入れを1つ選んでから', 'Pick one first'));
  return true;
}

/** 選ぶまで進めない仕入れが残っている */
export function forcedOffer(): boolean {
  return CONFIG.offerForced && state.offer.length > 0 && state.day > 0 && !state.over;
}

export function onBuy(id: UpgradeId): void {
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
  hooks.render();
  pop(card, 1.1);
  if (UPGRADE_SYMBOL[id]!.delta < 0) {
    const sym = UPGRADE_SYMBOL[id]!.symbol;
    sfx.buy();
    sfx.poof();
    const chip = visibleOr(el.bag.querySelector(`[data-sym="${sym}"]`), 'bag');
    const c = center(chip);
    burst(c.x, c.y, ['💨', sym === 'crow' ? '🪶' : '🍃', '✨'], 12, 60);
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
  }
}
