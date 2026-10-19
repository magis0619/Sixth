import './style.css';
import {
  CHARMS, CHARM_ORDER, CONFIG, SYMBOLS, SYMBOL_ORDER, UPGRADES, UPGRADE_SYMBOL,
  type CharmId, type SymbolId, type UpgradeId,
} from './config.ts';
import {
  bagTotal, buy, canBuy, canUse, chooseCharm, cropPrice, drawDay, drawSymbol, endDay, isRipe, neighbors,
  newGame, nextTax, resolveAuto, ripeLines, sell, upgradeAvailable, upgradePrice, useSymbol, validTargets, type GameState,
} from './game.ts';
import { isMuted, sfx, toggleMute, unlockAudio } from './audio.ts';
import { burst, center, confetti, flash, floatText, flyTo, pop, shake, sleep, vibrate } from './fx.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const rng = Math.random;

const el = {
  app: $('app'),
  gold: $('gold'),
  goldBox: $('gold-box'),
  day: $('day'),
  tax: $('tax'),
  mute: $<HTMLButtonElement>('mute'),
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
  bag: $('bag'),
  bagTotal: $('bag-total'),
  overlay: $('overlay'),
};

const CROP_STAGES = ['🌱', '🌿', '🌷'];
const FRUIT = { normal: '🍅', gold: '🌽' };
const STAGE_NAMES = ['芽', '若葉', 'つぼみ', '実'];

let state: GameState = newGame();
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
  return `<span class="${id === 'crow' ? 'sym-crow' : ''}">${SYMBOLS[id].emoji}</span>`;
}

function cropEmoji(kind: 'normal' | 'gold', growth: number): string {
  return growth >= CONFIG.ripeGrowth ? FRUIT[kind] : CROP_STAGES[growth];
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

function render(): void {
  el.day.textContent = String(state.day);
  if (shownGold !== state.gold) setGold(state.gold);
  renderTax();
  renderGoal();
  renderStatus();
  renderHint();
  renderReelStates();
  renderSpinButton();
  renderField();
  renderShop();
  renderBag();
  renderCharms();
}

/** 今日だけ・明日だけの効果 */
function renderStatus(): void {
  const chips: string[] = [];
  if (state.fever.length) chips.push(`<span class="st fever">🔥 フィーバー：${state.fever.map((s) => SYMBOLS[s].name).join('・')}</span>`);
  if (state.priceMult > 1) chips.push(`<span class="st merchant">🧑‍🌾 今日の売値 ×${state.priceMult}</span>`);
  if (state.cloverBoost > 1) chips.push(`<span class="st clover">🍀 明日は金の種が出やすい（×${state.cloverBoost}）</span>`);
  el.status.innerHTML = chips.join('');
}

function renderCharms(): void {
  const owned = CHARM_ORDER.filter((id) => state.charms[id] > 0);
  el.charmPanel.hidden = owned.length === 0;
  el.charms.innerHTML = owned
    .map((id) => {
      const c = CHARMS[id];
      const n = state.charms[id];
      return `<span class="charm" data-charm="${id}"><span class="e">${c.emoji}</span><span><b>${c.name}${n > 1 ? ` ×${n}` : ''}</b><small>${c.desc(n)}</small></span></span>`;
    })
    .join('');
}

function renderTax(): void {
  const t = nextTax(state);
  const short = state.gold < t.amount;
  const warn = short && t.daysLeft <= CONFIG.taxWarnDays;
  const when = t.daysLeft === 0 ? '今日の終わり' : `あと${t.daysLeft}日`;
  el.tax.className = `tax${warn ? ' warn' : ''}`;
  el.tax.innerHTML = `${warn ? '⚠️' : '🏯'} 年貢 <b>${t.amount}金</b>（${when}）<br>${short ? `不足 ${t.amount - state.gold}金` : '✅ 払える'}`;
}

function renderGoal(): void {
  const available = UPGRADES.filter((u) => upgradeAvailable(state, u.id));
  if (available.some((u) => canBuy(state, u.id))) {
    el.goal.innerHTML = '<span class="ready">✨ 強化できる！ 下のショップをチェック</span>';
    return;
  }
  const next = available.sort((a, b) => upgradePrice(state, a.id) - upgradePrice(state, b.id))[0];
  el.goal.innerHTML = next
    ? `次の強化 ${next.emoji}<b>${next.name}</b> まで あと <b>${upgradePrice(state, next.id) - state.gold}金</b>`
    : '';
}

function usableReels(): number[] {
  return state.results.flatMap((_, i) => (canUse(state, i, null) ? [i] : []));
}

function renderHint(): void {
  const t = nextTax(state);
  el.hint.className = 'hint';
  if (state.day > 0 && t.daysLeft <= CONFIG.taxWarnDays && state.gold < t.amount) {
    el.hint.className = 'hint danger';
    el.hint.textContent =
      t.daysLeft === 0
        ? `⚠️ 今日の終わりに年貢 ${t.amount}金！ あと${t.amount - state.gold}金 足りない — 作物を売ろう`
        : `⚠️ 年貢まであと${t.daysLeft}日：${t.amount}金 必要（あと${t.amount - state.gold}金）`;
    return;
  }
  if (state.day > CONFIG.hintUntilDay) {
    el.hint.textContent = !done.line && ripeLines(state).length > 0 ? '✨ そろった！ 並んだ実をタップで列ごと売値×1.5' : '';
    return;
  }
  const anyRipe = state.field.some(isRipe);
  let text = '';
  if (!done.spin) text = '👇「まわす！」でスロットを回そう（1回転＝畑の1日）';
  else if (selected !== null) {
    const r = state.results[selected];
    text = r.total > 1 ? `👆 光っている空きマスをタップ（あと${r.left}個 植えられる）` : '👆 光っているマスをタップ（出目をもう一度タップで取り消し）';
  }
  else if (!done.line && ripeLines(state).length > 0) text = '✨ そろった！ 縦・横・斜めに並んだ実をタップすると、列ごと売値×1.5でまとめて売れる';
  else if (!done.use && usableReels().length > 0) text = '✨ 光っている出目をタップ → 畑のマスをタップで使える';
  else if (!done.sell && anyRipe) text = '🍅 実った作物をタップすると売れる！';
  else if (!done.buy && UPGRADES.some((u) => canBuy(state, u.id))) text = '💰 お金がたまった！ ショップでスロットを強化しよう';
  else if (!done.next && done.spin && usableReels().length === 0) text = '▶ 次の日へ進もう。作物は雨と太陽でしか育たない';
  el.hint.textContent = text;
}

function reelTag(i: number): { text: string; cls: string } {
  const r = state.results[i];
  if (!r) return { text: '—', cls: '' };
  const def = SYMBOLS[r.symbol];
  if (def.kind === 'auto') {
    const text = autoOutcome[i] ?? `${def.name} 自動`;
    return { text, cls: def.rarity === 'bad' ? 'auto-bad used' : 'used' };
  }
  const name = r.total > 1 && r.left > 0 ? `${def.name}×${r.left}` : def.name;
  if (r.used) return { text: `${def.name} ✓`, cls: 'used' };
  if (selected === i) return { text: `${name} 選択中`, cls: 'selected' };
  if (canUse(state, i, null)) return { text: `${name} ▶使う`, cls: 'usable' };
  return { text: `${name}（使えない）`, cls: 'dead' };
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
    b.className = `reel ${tag.cls}${r?.symbol === 'goldSeed' ? ' rare' : ''}${fever ? ' fever' : ''}`;
    b.querySelector('.tag')!.textContent = fever ? `🔥${tag.text}` : tag.text;
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
    el.spin.innerHTML = `年貢を納めて 次の日へ<small>🏯 ${t.amount}金を徴収されます</small>`;
  } else {
    el.spin.innerHTML = `次の日へ ▶ まわす<small>${state.day + 1}日目</small>`;
  }
}

function renderField(): void {
  const targets = selected !== null ? validTargets(state, selected) : null;
  const lineCells = new Set(ripeLines(state).flat());
  if (el.field.children.length !== state.field.length) {
    el.field.innerHTML = '';
    state.field.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'plot';
      b.addEventListener('click', () => onPlotTap(i));
      el.field.appendChild(b);
    });
  }
  state.field.forEach((crop, i) => {
    const b = el.field.children[i] as HTMLButtonElement;
    const cls = ['plot'];
    let html = '';
    let label = '空きマス';
    if (crop) {
      const ripe = isRipe(crop);
      cls.push(`g${crop.growth}`);
      if (ripe) cls.push('ripe');
      if (crop.kind === 'gold') cls.push('goldcrop');
      html += `<span class="crop">${cropEmoji(crop.kind, crop.growth)}</span>`;
      if (crop.kind === 'gold' && !ripe) html += '<span class="badge-gold">金</span>';
      if (crop.fertilized) html += '<span class="badge-fert">肥×2</span>';
      if (ripe) {
        const line = lineCells.has(i);
        if (line) cls.push('line');
        const price = Math.round(cropPrice(state, crop) * (line ? CONFIG.lineBonus : 1));
        html += `<span class="price">${price}金</span>`;
        if (line) html += '<span class="badge-line">そろい</span>';
      }
      else html += `<span class="pips">${Array.from({ length: CONFIG.ripeGrowth }, (_, k) => `<i class="pip${k < crop.growth ? ' on' : ''}"></i>`).join('')}</span>`;
      label = `${crop.kind === 'gold' ? '金の作物' : '作物'} ${STAGE_NAMES[crop.growth]}${ripe ? `、タップで${cropPrice(state, crop)}金で売る` : ''}`;
    } else {
      html = '<span class="empty">空き</span>';
    }
    if (targets) cls.push(targets.includes(i) ? 'target' : 'dim');
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
  if (id === 'addReel') return state.reels < CONFIG.maxReels ? `リール ${state.reels}本 → ${state.reels + 1}本` : `最大 ${CONFIG.maxReels}本`;
  const { symbol, delta } = UPGRADE_SYMBOL[id]!;
  if (delta < 0 && state.bag[symbol] === 0) return `${SYMBOLS[symbol].name}はもういない！`;
  const after = { ...state.bag, [symbol]: state.bag[symbol] + delta };
  return `出る確率 ${bagPct(state.bag, symbol)}% → ${bagPct(after, symbol)}%`;
}

function renderShop(): void {
  if (el.shop.children.length === 0) {
    UPGRADES.forEach((u) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.dataset.id = u.id;
      b.addEventListener('click', () => onBuy(u.id));
      el.shop.appendChild(b);
    });
  }
  UPGRADES.forEach((u, i) => {
    const b = el.shop.children[i] as HTMLButtonElement;
    const available = upgradeAvailable(state, u.id);
    const price = upgradePrice(state, u.id);
    const affordable = canBuy(state, u.id);
    b.className = `item${affordable ? ' affordable' : ''}${available ? '' : ' soldout'}`;
    const cost = !available ? '完了' : affordable ? `${price}金で買う` : `${price}金（あと${price - state.gold}）`;
    const ico = u.id === 'removeCrow' ? symHtml('crow') : u.emoji;
    const html = `<span class="ico">${ico}</span><span class="name">${u.name}</span><span class="effect">${upgradeEffect(u.id)}</span><span class="cost">${cost}</span>`;
    if (b.innerHTML !== html) b.innerHTML = html;
  });
}

function renderBag(): void {
  el.bagTotal.textContent = `全${bagTotal(state.bag)}枚・リール${state.reels}本`;
  el.bag.innerHTML = SYMBOL_ORDER.filter((id) => state.bag[id] > 0 || id === 'crow' || id === 'goldSeed' || id === 'bug')
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
  drawDay(state, rng);
  render();
  await spinReels();
  if (state.fever.length) await showFever();
  await resolveAutos();
  busy = false;
  render();
}

async function showTaxStamp(amount: number, ok: boolean): Promise<void> {
  sfx.tax();
  shake(el.app, 8);
  const stamp = document.createElement('div');
  stamp.className = `stamp${ok ? ' ok' : ''}`;
  stamp.innerHTML = ok ? `🏯 年貢 納付！<small>−${amount}金</small>` : `🏯 年貢 未納…<small>${amount}金 払えなかった</small>`;
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
    const chip = el.bag.querySelector('[data-sym="bug"]');
    if (chip) {
      render();
      const c = center(el.bag.querySelector('[data-sym="bug"]')!);
      floatText(c.x, c.y - 20, '虫が増えた…', { cls: 'bad', size: 0.8 });
    }
  }
}

/** 年貢を納めたあとのお守り3択。選ぶまで待つ */
function showCharmOffer(): Promise<void> {
  const offer = state.charmOffer!;
  sfx.charmOffer();
  el.overlay.innerHTML = `
    <div class="modal charm-modal" role="dialog" aria-label="お守りを選ぶ">
      <h2>🎁 お守りを1つ選ぼう</h2>
      <p class="sub">年貢${state.taxesPaid}回 納付のごほうび。同じお守りは重ねるほど強くなる</p>
      <div class="charm-choices">
        ${offer
          .map((id) => {
            const c = CHARMS[id];
            const n = state.charms[id];
            return `<button class="charm-card" data-charm="${id}" disabled>
              <span class="e">${c.emoji}</span>
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
        burst(c.x, c.y, [CHARMS[id].emoji, '✨', '⭐'], 14, 90);
        vibrate(40);
        cards.forEach((other) => other !== card && other.animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 200, fill: 'forwards' }));
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 400 });
        window.setTimeout(() => {
          el.overlay.classList.remove('show');
          el.overlay.innerHTML = '';
          render();
          const got = el.charms.querySelector(`[data-charm="${id}"]`);
          if (got) pop(got, 1.2);
          resolve();
        }, 650);
      }),
    );
  });
}

async function showFever(): Promise<void> {
  sfx.fever();
  flash('#ff9ad5', 600);
  vibrate([50, 40, 50, 40, 120]);
  confetti(30);
  shake(el.machine, 8);
  const banner = document.createElement('div');
  banner.className = 'fever-banner';
  banner.innerHTML = `🔥 FEVER！ 🔥<small>${state.fever.map((s) => `${SYMBOLS[s].emoji}${SYMBOLS[s].name}：${SYMBOLS[s].feverDesc}`).join('<br>')}</small>`;
  document.body.appendChild(banner);
  banner.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.2) rotate(-8deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.15) rotate(3deg)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
    ],
    { duration: 500, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'forwards' },
  );
  renderReelStates();
  renderStatus();
  await sleep(1500);
  banner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => banner.remove();
}

function spinReels(): Promise<void> {
  const reels = [...el.reels.children] as HTMLElement[];
  const h = reels[0].querySelector('.window')!.clientHeight;
  // 最後のリールが金の種なら溜めを入れる。外れでもたまに溜めて読めないようにする
  const last = state.results.length - 1;
  const suspense = state.results[last].symbol === 'goldSeed' || state.fever.length > 0 || (state.bag.goldSeed > 0 && rng() < 0.15);
  let tick = window.setInterval(() => sfx.tick(), 70);
  const promises = reels.map((reel, i) => {
    const strip = reel.querySelector('.strip') as HTMLElement;
    const prevSym = reel.querySelector('.cell-sym')!.innerHTML;
    const dur = CONFIG.timing.spinBase + i * CONFIG.timing.spinStagger + (suspense && i === last ? 900 : 0);
    const fillers = Math.max(8, Math.round(dur / 40));
    const items = [prevSym, ...Array.from({ length: fillers }, () => symHtml(drawSymbol(state.bag, rng))), symHtml(state.results[i].symbol)];
    strip.innerHTML = items.map((s) => `<div class="cell-sym">${s}</div>`).join('');
    reel.className = 'reel spinning';
    reel.querySelector('.tag')!.textContent = '…';
    if (suspense && i === last) window.setTimeout(() => reel.classList.add('suspense'), dur - 1100);
    const anim = strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-(items.length - 1) * h}px)` }], {
      duration: dur,
      easing: 'cubic-bezier(.15,.55,.25,1.04)',
      fill: 'forwards',
    });
    return anim.finished.then(() => {
      anim.cancel();
      strip.innerHTML = `<div class="cell-sym">${symHtml(state.results[i].symbol)}</div>`;
      reel.classList.remove('spinning', 'suspense');
      sfx.reelStop(i);
      pop(reel.querySelector('.window')!, 1.12);
      if (i === reels.length - 1) clearInterval(tick);
      onReelLanded(i, reel);
    });
  });
  return Promise.all(promises).then(() => {
    clearInterval(tick);
    tick = 0;
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
  reel.className = `reel ${sym === 'goldSeed' ? 'rare ' : ''}${SYMBOLS[sym].kind === 'auto' ? '' : tag.cls}`;
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
        autoOutcome[i] = '🐛 空振り';
        floatText(from.x, from.y - 30, '虫は空振り', { size: 0.6 });
      } else {
        const plot = el.field.children[ev.cell] as HTMLElement;
        await new Promise<void>((r) => flyTo(from, plot, '🐛', 1, r));
        const p = center(plot);
        if (ev.warded) {
          autoOutcome[i] = '🐛 よけた';
          sfx.shoo();
          burst(p.x, p.y, ['🌿', '✨'], 8, 50);
          floatText(p.x, p.y - 20, '虫よけ成功！', { cls: 'good', size: 0.8 });
        } else {
          autoOutcome[i] = `🐛 成長−${ev.damage}`;
          sfx.bug();
          burst(p.x, p.y, ['🐛', '🍂'], 6, 40);
          floatText(p.x, p.y - 20, `かじられた！ 成長−${ev.damage}`, { cls: 'bad', size: 0.8 });
          shake(plot, 6);
          renderField();
        }
      }
    } else if (ev.cell === null) {
      autoOutcome[i] = '🐦 空振り';
      sfx.crow();
      floatText(from.x, from.y - 30, 'カラスは空振り', { size: 0.6 });
    } else if (!ev.eaten) {
      autoOutcome[i] = '🐦 追い払った';
      const plot = el.field.children[ev.cell] as HTMLElement;
      await new Promise<void>((r) => flyTo(from, plot, symHtml('crow'), 1, r));
      sfx.shoo();
      const p = center(plot);
      burst(p.x, p.y, ['💨', '🪶', '✨'], 8, 60);
      floatText(p.x, p.y - 20, ev.crop && isRipe(ev.crop) ? 'セーフ！ 守った！' : 'セーフ！', { cls: 'good', size: ev.crop && isRipe(ev.crop) ? 1 : 0.8 });
      pop(plot, 1.12);
    } else {
      autoOutcome[i] = '🐦 パクッ…';
      const plot = el.field.children[ev.cell] as HTMLElement;
      await new Promise<void>((r) => flyTo(from, plot, symHtml('crow'), 1, r));
      sfx.crow();
      sfx.poof();
      const p = center(plot);
      burst(p.x, p.y, ['🪶', '💨', '🍂'], 8, 50);
      const lost = ev.crop ? (isRipe(ev.crop) ? `${cropPrice(state, ev.crop)}金が…` : STAGE_NAMES[ev.crop.growth]) : '';
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
    say(r.symbol === 'seed' || r.symbol === 'goldSeed' ? '空きマスがない！ 実った作物を売ろう' : r.symbol === 'fertilizer' ? '肥料をまける作物がない' : '育てる作物がない');
    return;
  }
  if (def.noTarget) {
    applySun(i);
    return;
  }
  selected = i;
  armedNextDay = false;
  sfx.select();
  say(`${def.name}：${def.desc}`);
  render();
}

function applySun(i: number): void {
  const affected = useSymbol(state, i, null) ?? [];
  done.use = true;
  sfx.sun();
  flash('#fff3a0', 450);
  const c = center(el.reels.children[i]);
  burst(c.x, c.y, ['☀️', '✨'], 8, 60);
  render();
  afterGrowth(affected, `+${CONFIG.sunGrowth * state.results[i].power + state.charms.sunBlessing}`);
}

function onPlotTap(cell: number): void {
  unlockAudio();
  if (busy || state.over) return;
  const plot = el.field.children[cell] as HTMLElement;
  const p = center(plot);
  if (selected !== null) {
    const reel = selected;
    const sym = state.results[reel].symbol;
    if (!canUse(state, reel, cell)) {
      sfx.error();
      shake(plot, 5);
      const crop = state.field[cell];
      say(
        sym === 'seed' || sym === 'goldSeed'
          ? 'そこにはもう作物がある'
          : sym === 'bee'
            ? 'そのまわりに育てる作物がない'
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
    if (sym === 'seed' || sym === 'goldSeed') {
      sfx.plant();
      burst(p.x, p.y, sym === 'goldSeed' ? ['✨', '🌟'] : ['🌱', '·'], 8, 40);
      pop(plot, 1.15);
      const more = left > 0 ? `（あと${left}）` : '';
      floatText(p.x, p.y - 20, sym === 'goldSeed' ? '金の種を植えた！' : `植えた！${more}`, { size: 0.7, cls: sym === 'goldSeed' ? 'gold' : 'good' });
      if (left > 0 && selected === null) say('空きマスがないので残りの種は使えない');
    } else if (sym === 'fertilizer' && left > 0) {
      sfx.fertilizer();
      floatText(p.x, p.y - 20, '売値×2！（あと1つ）', { cls: 'combo', size: 0.9 });
    } else if (sym === 'rain') {
      sfx.rain();
      rainDrops(plot);
      afterGrowth([cell], `+${CONFIG.rainGrowth * power}`);
      const extra = affected.filter((c) => c !== cell);
      if (extra.length) afterGrowth(extra, `☔+${state.charms.gentleRain}`);
    } else if (sym === 'bee') {
      sfx.bee();
      [cell, ...neighbors(cell)].forEach((c, k) => {
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
  const crop = state.field[cell];
  if (isRipe(crop)) {
    sellCrop(cell);
    return;
  }
  if (crop) {
    shake(plot, 3);
    say(`${STAGE_NAMES[crop.growth]}：あと${CONFIG.ripeGrowth - crop.growth}育つと実る（雨🌧️・太陽☀️で育つ）`);
  } else {
    say('空きマス：種🌰が出たら植えられる');
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
        burst(p.x, p.y, ['✨', crop.kind === 'gold' ? '🌟' : '⭐'], 8, 50);
        floatText(p.x, p.y - 20, crop.kind === 'gold' ? `実った！ ${cropPrice(state, crop)}金` : '実った！', {
          cls: crop.kind === 'gold' ? 'gold' : 'good',
          size: crop.kind === 'gold' ? 1 : 0.8,
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
  const big = price >= CONFIG.goldPrice || res.line;
  render();
  if (res.line) {
    done.line = true;
    sfx.lineHarvest();
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
      floatText(p.x, p.y - 70, `そろい収穫！ +${price}`, { cls: 'combo', size: 1.4, rise: 120, dur: 1500 });
    }, res.cells.length * 140);
  } else {
    sfx.sell(price, combo);
    const size = Math.min(2, 0.8 + price / 25);
    floatText(p.x, p.y - 10, `+${price}`, { cls: 'gold', size, rise: big ? 110 : 70 });
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
  if (id === 'addReel') {
    sfx.newReel();
    flash('#ffffff', 300);
    const r = el.reels.lastElementChild as HTMLElement;
    burst(center(r).x, center(r).y, ['✨', '🎰', '⭐'], 14, 80);
    floatText(center(r).x, center(r).y - 40, '出来事+1！', { cls: 'good', size: 1 });
  } else if (UPGRADE_SYMBOL[id]!.delta < 0) {
    const sym = UPGRADE_SYMBOL[id]!.symbol;
    sfx.buy();
    sfx.poof();
    const chip = el.bag.querySelector(`[data-sym="${sym}"]`) as HTMLElement;
    const c = center(chip);
    burst(c.x, c.y, ['💨', sym === 'crow' ? '🪶' : '🍃', '✨'], 12, 60);
    floatText(c.x, c.y - 20, `${SYMBOLS[sym].name} −1！`, { cls: 'good', size: 0.9 });
    pop(chip, 1.3);
  } else {
    sfx.buy();
    const sym = UPGRADE_SYMBOL[id]!.symbol;
    const chip = el.bag.querySelector(`[data-sym="${sym}"]`) as HTMLElement;
    flyTo(from, chip, SYMBOLS[sym].emoji, 1, () => {
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

function showGameOver(): void {
  const best = loadBest();
  const isNew = state.day > (best.day ?? 0);
  if (isNew) saveBest({ day: state.day, taxes: state.taxesPaid });
  const name = (id: UpgradeId) => UPGRADES.find((u) => u.id === id)!.name;
  const first = state.stats.purchases[0];
  const t = nextTax(state);
  el.overlay.innerHTML = `
    <div class="modal" role="dialog" aria-label="ゲームオーバー">
      <div class="big">🏚️</div>
      <h2>年貢が払えなかった…</h2>
      <div class="record">${state.day}日目まで / 年貢 ${state.taxesPaid}回 納付${isNew ? '<span class="newrec">最高記録！</span>' : ''}</div>
      <table>
        <tr><td>最高記録</td><td>${Math.max(state.day, best.day ?? 0)}日目</td></tr>
        <tr><td>払えなかった年貢</td><td>${t.amount}金（所持 ${state.gold}金）</td></tr>
        <tr><td>回転数</td><td>${state.stats.spins}回</td></tr>
        <tr><td>総収入</td><td>${state.stats.totalEarned}金</td></tr>
        <tr><td>売った作物 / 食べられた作物</td><td>${state.stats.cropsSold} / ${state.stats.cropsEaten}</td></tr>
        <tr><td>追い払ったカラス</td><td>${state.stats.crowsMissed}回</td></tr>
        <tr><td>フィーバー / そろい収穫</td><td>${state.stats.fevers}回 / ${state.stats.lineHarvests}回</td></tr>
        <tr><td>最初の強化</td><td>${first ? `${first.day}日目（${name(first.id)}）` : 'なし'}</td></tr>
        <tr><td>リール本数</td><td>${state.reels}本</td></tr>
      </table>
      <h3>📝 強化の購入順（検証ログ）</h3>
      ${state.stats.purchases.length ? `<ol>${state.stats.purchases.map((p) => `<li>${p.day}日目 ${name(p.id)}</li>`).join('')}</ol>` : '<p>なし</p>'}
      <h3>🎁 選んだお守り</h3>
      ${state.stats.charms.length ? `<ol>${state.stats.charms.map((c) => `<li>${c.day}日目 ${CHARMS[c.id].emoji}${CHARMS[c.id].name}</li>`).join('')}</ol>` : '<p>なし</p>'}
      <button class="primary" id="restart" disabled>もう一度あそぶ</button>
    </div>`;
  el.overlay.classList.add('show');
  const btn = $<HTMLButtonElement>('restart');
  // 直前の連打で即リトライが暴発しないよう少し待つ
  window.setTimeout(() => (btn.disabled = false), 900);
  btn.addEventListener('click', restart);
  render();
}

function restart(): void {
  state = newGame();
  selected = null;
  armedNextDay = false;
  el.overlay.classList.remove('show');
  el.overlay.innerHTML = '';
  el.reels.innerHTML = '';
  render();
}

// ---- 起動 ----

el.spin.addEventListener('click', () => void onSpin());
el.mute.textContent = isMuted() ? '🔇' : '🔊';
el.mute.addEventListener('click', () => {
  unlockAudio();
  el.mute.textContent = toggleMute() ? '🔇' : '🔊';
});
render();
