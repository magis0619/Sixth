// 1日の節目の演出：年貢の判子、お守りの3択、ゾロ目（フィーバー）、予告のカットイン、枯れる畑

import { EN, gold, L } from '../i18n.ts';
import { CHARM_PLACE, CHARM_TIER_NAMES, type CharmId, CHARMS, CONFIG, PLACES, type SymbolId, SYMBOLS } from '../config.ts';
import { chooseCharm } from '../game.ts';
import { art, type ArtId } from '../art.ts';
import { sfx } from '../audio.ts';
import { burst, center, coinRain, flash, floatText, isCalm, later, pop, shake, slamText, sleep, speedLines, vibrate } from '../fx.ts';
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
    : `${art('bale')} ${L('年貢 未納…', 'UNPAID…')}<small>${L(`${amount}金 払えなかった`, `Couldn't pay ${amount}g`)}</small>`;
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
    hooks.setGold(state.gold);
  } else {
    sfx.gameOver();
  }
  await sleep(ok ? 1300 : 1800);
  stamp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => stamp.remove();
  if (ok) {
    burst(window.innerWidth / 2, window.innerHeight * 0.4, ['🎊', '✨', '🌾'], 14, 140);
    floatText(window.innerWidth / 2, window.innerHeight * 0.4, state.cleared ? L(`年貢${state.taxesPaid}回 納付！`, `Tax #${state.taxesPaid} paid!`) : L(`★${state.taxesPaid}/${CONFIG.winTaxes} あと${CONFIG.winTaxes - state.taxesPaid}回でクリア`, `★${state.taxesPaid}/${CONFIG.winTaxes} ${CONFIG.winTaxes - state.taxesPaid} more to win`), { cls: 'good', size: 1.1 });
    await sleep(500);
    const added = state.lastObstacles;
    if (added.length) {
      hooks.render();
      const c = center(visibleOr(el.bag.querySelector(`[data-sym="${added[0]}"]`), 'bag'));
      const names = [...new Set(added)].map((s) => `${SYMBOLS[s].name}${added.filter((x) => x === s).length > 1 ? `×${added.filter((x) => x === s).length}` : ''}`).join('・');
      floatText(c.x, c.y - 20, L(`${names}が袋に増えた…`, `${names} joined your bag…`), { cls: 'bad', size: 0.8 });
    }
  }
}

/** 年貢を納めたあとのお守り3択。選ぶまで待つ */
export function showCharmOffer(): Promise<void> {
  const offer = state.charmOffer!;
  sfx.charmOffer();
  // レアが混ざっていたら当たりの合図
  if (offer.some((id) => CHARMS[id].tier === 'rare')) later(() => sfx.rare(), 450);
  el.overlay.innerHTML = `
    <div class="modal charm-modal" role="dialog" aria-label="${L('お守りを選ぶ', 'Pick a charm')}">
      <h2>🎁 ${L('お守りを1つ選ぼう', 'Pick a charm')}</h2>
      <p class="sub">${L('重ねると強くなる', 'Stacks get stronger')}</p>
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
              <small>${toGold ? L('✦金色に！ ', '✦Goes golden! ') : ''}${c.desc(toGold ? (n + 1) * 2 : n + 1)}</small>
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
          if (CHARM_PLACE[id]) say(`👆 ${L(`${PLACES[CHARM_PLACE[id]!].name}を置く`, `Place the ${PLACES[CHARM_PLACE[id]!].name}`)}`, 3000);
          resolve();
        }, 650);
      }),
    );
  });
}

export async function feverBanner(symbols: SymbolId[], bad: boolean): Promise<void> {
  const lines = symbols
    .map((s) => `${symHtml(s)}${SYMBOLS[s].name}：${SYMBOLS[s].feverDesc}${SYMBOLS[s].rarity === 'bad' ? '' : L('＋大当たり', ' + jackpot')}`)
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
    await slamText(L('群れ!!', 'SWARM!!'), { cls: 'bad', dur: 1100 });
    banner.className = 'fever-banner bad';
    banner.innerHTML = `⚠️ ${symbols.map((s) => L(`${SYMBOLS[s].name}の群れ`, `${SYMBOLS[s].name} swarm`)).join(L('・', ', '))}！<small>${lines}</small>`;
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
