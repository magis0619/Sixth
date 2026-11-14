// 1日の節目の演出：年貢の判子、お守りの3択、ゾロ目（フィーバー）、予告のカットイン、枯れる畑

import { EN, gold, L } from '../i18n.ts';
import { CHARM_PLACE, CHARM_TIER_NAMES, type CharmId, CHARMS, COMBOS, CONFIG, PLACES, type SymbolId, SYMBOLS } from '../config.ts';
import { chooseCharm } from '../game.ts';
import { art, type ArtId } from '../art.ts';
import { sfx } from '../audio.ts';
import { burst, center, coinRain, flash, floatText, flyTo, isCalm, later, pop, shake, slamText, sleep, speedLines, vibrate } from '../fx.ts';
import { el, hooks, rng, state } from './store.ts';
import { say, symHtml, visibleOr } from './view.ts';

/** 年貢が払えず終わるとき、畑が枯れていく */
export async function witherField(): Promise<void> {
  document.documentElement.classList.remove('tax-danger');
  sfx.wither();
  el.field.classList.add('withered');
  const f = center(el.field);
  burst(f.x, f.y, ['🍂', '🍂', '💨'], 14, 150);
  await sleep(1600);
}

export async function showTaxStamp(amount: number, ok: boolean): Promise<void> {
  // 役人が拍子木を鳴らしてやって来て、印を押す
  const official = document.createElement('div');
  official.className = `official${ok ? '' : ' angry'}`;
  official.innerHTML = `<span class="official-body">${art('official')}</span><span class="official-say">${ok ? L('年貢を納めよ！', 'Pay your taxes!') : L('年貢が足りぬ！', 'Not enough tax!')}</span>`;
  document.body.appendChild(official);
  sfx.official();
  official.animate([{ transform: 'translateX(120%)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  await sleep(isCalm() ? 450 : 900);
  official.querySelector('.official-body')!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px) rotate(-8deg)' }, { transform: 'translateY(0)' }], { duration: 260 });
  later(() => {
    official.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(130%)' }], { duration: 400, easing: 'ease-in', fill: 'forwards' }).onfinish = () => official.remove();
  }, 1500);
  sfx.tax();
  shake(el.app, 8);
  const stamp = document.createElement('div');
  stamp.className = `stamp${ok ? ' ok' : ''}`;
  stamp.innerHTML = ok
    ? `${art('bale')} ${L('年貢 納付！', 'TAX PAID!')}<small>−${gold(amount)}</small>`
    : `${art('bale')} ${L('年貢 未納…', 'UNPAID…')}<small>${L(`${amount} 払えなかった`, `Couldn't pay ${amount}g`)}</small>`;
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
    floatText(c.x, c.y + 30, `<span class="money">${art('coin')}−${amount}</span>`, { cls: 'bad', size: 1.1 });
    hooks.setGold(state.gold);
  } else {
    sfx.gameOver();
  }
  await sleep(ok ? 1300 : 1800);
  stamp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => stamp.remove();
  if (ok) {
    burst(window.innerWidth / 2, window.innerHeight * 0.4, ['🎊', '✨', '🌾'], 14, 140);
    floatText(window.innerWidth / 2, window.innerHeight * 0.4, state.cleared ? L(`年貢${state.taxesPaid}回 納付`, `Tax #${state.taxesPaid} paid`) : L(`★${state.taxesPaid}/${CONFIG.winTaxes} あと${CONFIG.winTaxes - state.taxesPaid}回でクリア`, `★${state.taxesPaid}/${CONFIG.winTaxes} ${CONFIG.winTaxes - state.taxesPaid} more to win`), { cls: 'good', size: 1.1 });
    await sleep(500);
    if (state.lastObstacles.length) await showPestsJoin(state.lastObstacles);
  }
}

/**
 * 年貢のあと、袋にお邪魔が入る：窓に文字で知らせ、カード（カラスの絵など）を見せる。
 * 「袋に入れる」を押すと、カードが絵柄袋へ飛んでいく
 */
function showPestsJoin(added: SymbolId[]): Promise<void> {
  const kinds = [...new Set(added)];
  sfx.danger();
  el.overlay.innerHTML = `
    <div class="modal pest-modal" role="dialog" aria-label="${L('お邪魔が袋に入る', 'Pests join your bag')}">
      <h2>${art('warn')} ${L('お邪魔が袋に入る', 'Pests join your bag')}</h2>
      <p class="pest-lead">${L(`年貢のあとは、袋にお邪魔が${added.length}枚増える`, `After each tax, ${added.length} pest${added.length > 1 ? 's join' : ' joins'} your bag`)}</p>
      <div class="pest-cards">${kinds
        .map((sym) => {
          const n = added.filter((x) => x === sym).length;
          return `<div class="pest-card" data-sym="${sym}"><span class="pc-art">${symHtml(sym)}</span><b>${SYMBOLS[sym].name}${n > 1 ? ` ×${n}` : ''}</b><span class="pc-desc">${SYMBOLS[sym].desc}</span></div>`;
        })
        .join('')}</div>
      <button class="primary" id="pest-ok">${L('袋に入れる', 'Into the bag')}</button>
    </div>`;
  el.overlay.classList.add('show');
  el.overlay.querySelectorAll<HTMLElement>('.pest-card').forEach((c, k) =>
    c.animate([{ transform: 'translateY(-30px) scale(0.6)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], {
      duration: 320,
      delay: 120 + k * 140,
      easing: 'cubic-bezier(.3,1.4,.5,1)',
      fill: 'backwards',
    }),
  );
  return new Promise((done) => {
    document.getElementById('pest-ok')!.addEventListener(
      'click',
      () => {
        sfx.select();
        hooks.render();
        // カードの絵が絵柄袋へ飛び込む（袋が閉じていればタブへ）
        el.overlay.querySelectorAll<HTMLElement>('.pest-card').forEach((c, k) => {
          const sym = c.dataset.sym as SymbolId;
          const from = center(c.querySelector('.pc-art')!);
          const n = added.filter((x) => x === sym).length;
          later(() => {
            const chip = visibleOr(el.bag.querySelector(`[data-sym="${sym}"]`), 'bag');
            flyTo(from, chip, symHtml(sym), n, () => {
              sfx.bug();
              pop(chip, 1.35);
            });
          }, k * 120);
          c.animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 250, fill: 'forwards' });
        });
        later(() => {
          el.overlay.classList.remove('show');
          el.overlay.innerHTML = '';
          done();
        }, 900);
      },
      { once: true },
    );
  });
}

/** 年貢を納めたあとのお守り3択。選ぶまで待つ */
export function showCharmOffer(): Promise<void> {
  const offer = state.charmOffer!;
  sfx.charmOffer();
  // レアが混ざっていたら当たりの合図
  if (offer.some((id) => CHARMS[id].tier === 'rare')) later(() => sfx.rare(), 450);
  el.overlay.innerHTML = `
    <div class="modal charm-modal" role="dialog" aria-label="${L('お守りを選ぶ', 'Pick a charm')}">
      <h2>${art('gift')} ${L('お守りを1つ選ぼう', 'Pick a charm')}</h2>
      <div class="charm-choices">
        ${offer
          .map((id) => {
            const c = CHARMS[id];
            const n = state.charms[id];
            // 3個目で金色（効果2倍）
            const toGold = c.max >= CONFIG.goldenAt && n + 1 === CONFIG.goldenAt;
            return `<button class="charm-card tier-${c.tier}${c.special ? ' special' : ''}${toGold ? ' golden' : ''}" data-charm="${id}" disabled>
              <span class="tier">${c.special ? L('特別', 'Special') : CHARM_TIER_NAMES[c.tier]}</span>
              <span class="e">${art(id)}</span>
              <b>${c.name}${n > 0 ? ` <span class="lv">${n}→${n + 1}</span>` : ''}</b>
              <small>${toGold ? L('✦金色に ', '✦Goes golden ') : ''}${c.desc(toGold ? (n + 1) * 2 : n + 1)}</small>
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
  later(() => cards.forEach((c) => (c.disabled = false)), 700);
  return new Promise((resolve) => {
    let picked = false;
    cards.forEach((card) =>
      card.addEventListener('click', () => {
        // 連打で2つ取ったり、閉じる処理が次の画面（クリアなど）まで消したりしないよう1回だけ
        if (picked) return;
        picked = true;
        cards.forEach((c) => (c.disabled = true));
        const id = card.dataset.charm as CharmId;
        chooseCharm(state, id);
        sfx.charmGet();
        const c = center(card);
        burst(c.x, c.y, [art(id), '✨', '⭐'], 14, 90);
        vibrate(40);
        cards.forEach((other) => other !== card && other.animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 200, fill: 'forwards' }));
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 400 });
        later(() => {
          el.overlay.classList.remove('show');
          el.overlay.innerHTML = '';
          hooks.render();
          if (id === 'artisan') {
            sfx.newReel();
            flash('#ffffff', 300);
            const r = el.reels.lastElementChild as HTMLElement;
            burst(center(r).x, center(r).y, ['✨', '🎰', '⭐'], 14, 80);
            floatText(center(r).x, center(r).y - 40, L('リール+1！', 'Reel +1!'), { cls: 'good', size: 1 });
          }
          const got = visibleOr(el.charms.querySelector(`[data-charm="${id}"]`), 'charms');
          if (got) pop(got, 1.2);
          if (CHARM_PLACE[id]) say(`${art('hand')} ${L(`${PLACES[CHARM_PLACE[id]!].name}を置く`, `Place the ${PLACES[CHARM_PLACE[id]!].name}`)}`, 3000);
          resolve();
        }, 650);
      }),
    );
  });
}

/** フィーバーで起きることを、絵とひと言で（長い説明は図鑑に） */
export const FEVER_FX: Record<SymbolId, { ico: ArtId | null; text: string }> = {
  seed: { ico: 'bud', text: L('育って植わる', 'Plant grown') },
  berrySeed: { ico: 'bud', text: L('育って植わる', 'Plant grown') },
  pumpkinSeed: { ico: 'bud', text: L('育って植わる', 'Plant grown') },
  melonSeed: { ico: 'bud', text: L('育って植わる', 'Plant grown') },
  watermelonSeed: { ico: 'bud', text: L('育って植わる', 'Plant grown') },
  goldSeed: { ico: 'coin', text: L('大当たり×3', 'Jackpot ×3') },
  rain: { ico: 'leaf', text: L('全部 +1', 'All +1') },
  thunder: { ico: 'leaf', text: L('全部 +1', 'All +1') },
  moon: { ico: 'leaf', text: L('全部 さらに+1', 'All +1 more') },
  sun: { ico: 'coin', text: L('売値 ×2', 'Price ×2') },
  fertilizer: { ico: 'fertilizer', text: L('全部に肥料', 'Fertilize all') },
  bee: { ico: 'coin', text: L('作物ごと +4', '+4 per crop') },
  merchant: { ico: 'coin', text: L('実りを ×2で売る', 'Sell ripe ×2') },
  clover: { ico: 'star', text: L('お守りを選ぶ', 'Pick a charm') },
  coin: { ico: 'coin', text: L('大当たり×3', 'Jackpot ×3') },
  hoe: { ico: 'hoe', text: L('畑を全部耕す', 'Till everything') },
  crow: { ico: null, text: L('食べる 1/2→3/4', 'Eats 1/2→3/4') },
  bug: { ico: null, text: L('成長 −2', 'Growth −2') },
  weed: { ico: null, text: L('2か所に生える', 'Sprouts ×2') },
  tanuki: { ico: null, text: L('2つ盗む', 'Steals 2') },
  frost: { ico: null, text: L('2マス凍る', 'Freezes 2') },
  mole: { ico: null, text: L('2つ押し出す', 'Pushes 2') },
  locust: { ico: null, text: L('2匹ずつ増える', 'Breeds ×2') },
};

/** フィーバーの札：絵柄ごとに1枚。良い絵柄には大当たりの金貨の印 */
function feverCards(symbols: SymbolId[], bad: boolean): string {
  return `<div class="fever-cards">${symbols
    .map((s) => {
      const fx = FEVER_FX[s];
      return `<div class="fever-card">
        <span class="fc-sym">${symHtml(s)}</span>
        <span class="fc-arrow">▶</span>
        ${fx.ico ? `<span class="fc-ico">${art(fx.ico)}</span>` : ''}
        <b class="fc-text">${fx.text}</b>
        ${bad ? '' : `<span class="fc-jackpot">${art('coin')}${L('大当たり', 'Jackpot')}</span>`}
      </div>`;
    })
    .join('')}</div>`;
}

/** 組み合わせの札：そろった2つの絵柄 → 起きること */
/**
 * 組み合わせのカットイン：画面が暗くなり帯が走る → そろった絵柄が左右から飛び込んでぶつかる →
 * 組み合わせの絵が大きく現れて名前と効き目。1つずつ順に見せる
 */
export async function comboBanner(ids: CharmId[]): Promise<void> {
  for (const id of ids) await comboCutIn(id);
}

async function comboCutIn(id: CharmId): Promise<void> {
  const calm = isCalm();
  const syms = (Object.entries(COMBOS[id]!) as [SymbolId, number][]).flatMap(([sym, n]) => Array.from({ length: n }, () => sym));
  const root = document.createElement('div');
  root.className = 'combo-cutin';
  root.innerHTML = `
    <div class="cc-band"></div>
    <div class="cc-rays"></div>
    ${syms.map((sym, k) => `<span class="cc-sym s${k}">${symHtml(sym)}</span>`).join('')}
    <div class="cc-main">
      <span class="cc-label">${L('組み合わせ', 'COMBO')}</span>
      <span class="cc-art">${art(id)}</span>
      <b class="cc-name">${CHARMS[id].name}</b>
      <span class="cc-desc">${CHARMS[id].desc(1)}</span>
    </div>`;
  document.body.appendChild(root);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  sfx.rare();
  vibrate([30, 30, 60]);
  root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' });
  q('.cc-band').animate([{ transform: 'translateY(-50%) skewY(-6deg) translateX(-110%)' }, { transform: 'translateY(-50%) skewY(-6deg) translateX(0)' }], {
    duration: 240,
    easing: 'cubic-bezier(.2,.9,.3,1)',
    fill: 'forwards',
  });
  // 絵柄が左右（3つなら下からも）から飛び込んで真ん中でぶつかる
  const from = ['-60vw, 0', '60vw, 0', '0, 50vh'];
  const to = syms.length === 3 ? ['-26vw, -2vh', '26vw, -2vh', '0, 10vh'] : ['-18vw, 0', '18vw, 0'];
  syms.forEach((_, k) =>
    q(`.cc-sym.s${k}`).animate(
      [
        { transform: `translate(-50%, -50%) translate(${from[k]}) scale(0.8)`, opacity: 0 },
        { transform: `translate(-50%, -50%) translate(${to[k]}) scale(1.15)`, opacity: 1, offset: 0.7 },
        { transform: `translate(-50%, -50%) translate(0, 0) scale(0.4)`, opacity: 0 },
      ],
      { duration: calm ? 420 : 620, delay: 120, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' },
    ),
  );
  await sleep(calm ? 480 : 700);
  sfx.bonus();
  flash('#fff6c8', 260);
  const c = { x: window.innerWidth / 2, y: window.innerHeight * 0.45 };
  burst(c.x, c.y, ['✨', '⭐', '🌟'], calm ? 6 : 18, 150);
  q('.cc-rays').animate([{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.3) rotate(0deg)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(60deg)' }], {
    duration: 500,
    easing: 'ease-out',
    fill: 'forwards',
  });
  q('.cc-art').animate(
    [
      { transform: 'scale(0.2) rotate(-10deg)', opacity: 0 },
      { transform: 'scale(1.18) rotate(3deg)', opacity: 1, offset: 0.55 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ],
    { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' },
  );
  for (const [sel, d] of [['.cc-label', 80], ['.cc-name', 200], ['.cc-desc', 320]] as const) {
    q(sel).animate([{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 300, delay: d, easing: 'ease-out', fill: 'forwards' });
  }
  await sleep(calm ? 1100 : 1700);
  await new Promise<void>((done) => {
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).onfinish = () => {
      root.remove();
      done();
    };
  });
}

export async function feverBanner(symbols: SymbolId[], bad: boolean): Promise<void> {
  const banner = document.createElement('div');
  if (bad) {
    sfx.danger();
    flash('#2a0010', 700);
    vibrate([200, 80, 200]);
    shake(el.app, 10);
    const c = center(el.machine);
    burst(c.x, c.y, ['🪶', '💀', '🖤'], 16, 140);
    speedLines(1400, 'rgba(60,0,90,0.55)');
    await slamText(L('群れ!!', 'SWARM!!'), { cls: 'bad', dur: 1100 });
    banner.className = 'fever-banner bad';
    banner.innerHTML = `<div class="fever-title">${art('warn')} ${L('群れ', 'SWARM')}！</div>${feverCards(symbols, true)}`;
  } else {
    sfx.fever();
    flash('#ff9ad5', 600);
    vibrate([50, 40, 50, 40, 120]);
    // 枠が燃え、集中線の中に「FEVER!!」を叩きつけ、金貨が降る
    el.machine.classList.add('burning');
    speedLines(2200, 'rgba(255,200,60,0.6)');
    shake(el.app, 10);
    coinRain(120);
    await slamText('FEVER!!', { dur: 1200 });
    banner.className = 'fever-banner';
    banner.innerHTML = `<div class="fever-title">${art('flame')} FEVER！ ${art('flame')}</div>${feverCards(symbols, false)}`;
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
  // 何が起きるかを読めるだけ見せる（札が多いほど長く）
  await sleep(1600 + symbols.length * 400);
  banner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => banner.remove();
}

export const CUTIN_TEXT = EN ? ['Chance?', 'Chance!', 'HOT!!', 'SURE THING!!!'] : ['チャンス？', 'チャンス！', '激アツ!!', '確定!!!'];
export const CUTIN_MS = 1500;

/** 予告のカットイン：キャラが斜めに飛び込んで期待度の色を見せる */
export async function playCutIn(level: number): Promise<void> {
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
