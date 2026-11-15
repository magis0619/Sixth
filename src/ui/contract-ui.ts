// 週契約の画面：月曜の朝の3択、曜日の上の帯、日曜の見返り

import { gold, L } from '../i18n.ts';
import { PLACES } from '../config.ts';
import { CONTRACTS, type ContractId, type ContractReward } from '../contracts.ts';
import { contractRewardGold, rollContractCharms, takeContract } from '../game.ts';
import { art, type ArtId } from '../art.ts';
import { sfx } from '../audio.ts';
import { burst, center, later, pop, sleep, vibrate } from '../fx.ts';
import { el, hooks, rng, state } from './store.ts';
import { showCharmOffer } from './shows.ts';

const stars = (n: number): string => `<span class="ct-stars s${n}">${'★'.repeat(n)}</span>`;

/** 見返りを絵と短い数字で */
export function rewardHtml(id: ContractId): string {
  const r: ContractReward = CONTRACTS[id].reward;
  const ico = (a: ArtId, t = ''): string => `<span class="ct-rw">${art(a)}${t ? `<b>${t}</b>` : ''}</span>`;
  switch (r.kind) {
    case 'gold':
      return ico('coin', `+${gold(contractRewardGold(state, id))}`);
    case 'remove':
      return ico(r.symbol as ArtId, '−1');
    case 'place':
      return ico(r.id as ArtId, '+1');
    case 'moon':
      return ico('moon', '+1');
    case 'charms':
      return ico('gift', r.rare ? L('レア', 'Rare') : '');
    case 'taxCut':
      return ico('bale', `−${r.pct}%`);
    case 'expand':
      return ico('expand', '+1');
    case 'reel':
      return ico('gear', L('リール+1', 'Reel +1'));
  }
}

/** 見返りの言葉 */
export function rewardText(id: ContractId): string {
  const r = CONTRACTS[id].reward;
  switch (r.kind) {
    case 'gold':
      return L(`お金 +${contractRewardGold(state, id)}`, `+${contractRewardGold(state, id)}g`);
    case 'remove':
      return L('袋のカラスを1枚消す', 'Remove 1 crow from the bag');
    case 'place':
      return L(`${PLACES[r.id].name}を1つ`, `1 ${PLACES[r.id].name}`);
    case 'moon':
      return L('満月を袋に1枚', '1 Full Moon in the bag');
    case 'charms':
      return r.rare ? L('レアのお守りの3択', 'Pick 1 of 3 rare charms') : L('お守りの3択', 'Pick 1 of 3 charms');
    case 'taxCut':
      return L(`次の年貢 −${r.pct}%`, `Next tax −${r.pct}%`);
    case 'expand':
      return L('畑を1回広げる（タダ）', 'Expand the field once (free)');
    case 'reel':
      return L('リール+1（ずっと）', 'Reel +1 (permanent)');
  }
}

/** 曜日の板の下に伸びる帯（今週の週契約）。日曜の端に見返り */
export function contractRibbon(): string {
  const id = state.contract;
  if (!id) return '';
  const c = CONTRACTS[id];
  return `<button class="wk-ribbon" type="button" data-contract="${id}" aria-label="${L('今週の週契約', 'This week’s contract')}: ${c.name}">
    <span class="rb-tag">${L('週契約', 'Contract')}</span><span class="rb-ico">${art(c.icon as ArtId)}</span><b class="rb-name">${c.name}</b><span class="rb-end">${rewardHtml(id)}</span>
  </button>`;
}

/** 帯をタップ：縛りと見返りをひと言で */
export function contractSay(): string {
  const id = state.contract;
  if (!id) return '';
  const c = CONTRACTS[id];
  return `${L('今週だけ', 'This week')}：${c.rule}<br>${L('見返り', 'Reward')}：${rewardText(id)}`;
}

/** 月曜の朝：今週の週契約を3つから1つ受けるか、受けない */
export function showContractOffer(): Promise<void> {
  const offer = state.contractOffer;
  sfx.charmOffer();
  el.overlay.innerHTML = `
    <div class="modal contract-modal" role="dialog" aria-label="${L('今週の週契約', 'This week’s contract')}">
      <h2>${art('calendar')} ${L('今週の週契約', 'This Week’s Contract')}</h2>
      <p class="ct-sub">${L('<b>月〜日の今週だけ</b>の縛り。日曜の年貢を納めたら見返り', 'A rule for <b>this week only</b> (Mon–Sun). Pay Sunday’s tax to get the reward')}</p>
      <div class="ct-week" aria-hidden="true">${(L('月火水木金土日', 'MTWTFSS')).split('').map((d) => `<i>${d}</i>`).join('')}</div>
      <div class="ct-choices">
        ${offer
          .map((id) => {
            const c = CONTRACTS[id];
            return `<button class="ct-card s${c.stars}" data-contract="${id}" disabled>
              ${stars(c.stars)}
              <span class="ct-ico">${art(c.icon as ArtId)}</span>
              <b class="ct-name">${c.name}</b>
              <span class="ct-rule">${c.rule}</span>
              <span class="ct-reward"><span class="ct-reward-h">${L('見返り', 'Reward')}</span>${rewardHtml(id)}<span class="ct-reward-t">${rewardText(id)}</span></span>
            </button>`;
          })
          .join('')}
      </div>
      <button class="ct-skip" data-contract="" disabled>${L('今週は受けない', 'No contract this week')}</button>
    </div>`;
  el.overlay.classList.add('show');
  const cards = [...el.overlay.querySelectorAll<HTMLButtonElement>('[data-contract]')];
  cards.forEach((card, k) =>
    card.animate([{ transform: 'translateY(24px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 120 + k * 110, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' }),
  );
  later(() => cards.forEach((c) => (c.disabled = false)), 650);
  return new Promise((resolve) => {
    let picked = false;
    cards.forEach((card) =>
      card.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        cards.forEach((c) => (c.disabled = true));
        const id = (card.dataset.contract || null) as ContractId | null;
        takeContract(state, id);
        if (id) {
          sfx.charmGet();
          vibrate(30);
          const p = center(card);
          burst(p.x, p.y, ['✨', '⭐'], 10, 70);
          card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 360 });
        }
        cards.forEach((o) => o !== card && o.animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 200, fill: 'forwards' }));
        later(() => {
          el.overlay.classList.remove('show');
          el.overlay.innerHTML = '';
          hooks.render();
          const rb = el.week.querySelector('.wk-ribbon');
          if (rb) {
            rb.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 520, easing: 'cubic-bezier(.3,.9,.4,1)' });
            later(() => pop(rb, 1.06), 520);
          }
          resolve();
        }, id ? 600 : 250);
      }),
    );
  });
}

/** 日曜：週契約を果たした。見返りを見せる（お守りの見返りは3択を出す） */
export async function showContractDone(): Promise<void> {
  const id = state.contractDone;
  if (!id) return;
  state.contractDone = null;
  const c = CONTRACTS[id];
  const r = c.reward;
  el.overlay.innerHTML = `
    <div class="modal contract-done" role="dialog">
      <h2>${L('週契約を果たした！', 'Contract fulfilled!')}</h2>
      <div class="ct-done-card">${stars(c.stars)}<span class="ct-ico">${art(c.icon as ArtId)}</span><b class="ct-name">${c.name}</b></div>
      <div class="ct-done-reward">${rewardHtml(id)}<span>${rewardText(id)}</span></div>
      <button class="ct-ok">${L('受け取る', 'Collect')}</button>
    </div>`;
  el.overlay.classList.add('show');
  sfx.charmGet();
  const box = el.overlay.querySelector('.contract-done') as HTMLElement;
  box.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.3,1.5,.5,1)' });
  const ok = el.overlay.querySelector<HTMLButtonElement>('.ct-ok')!;
  ok.disabled = true;
  later(() => (ok.disabled = false), 500);
  await new Promise<void>((resolve) => ok.addEventListener('click', () => resolve(), { once: true }));
  const p = center(ok);
  burst(p.x, p.y, ['✨', '⭐'], 12, 80);
  el.overlay.classList.remove('show');
  el.overlay.innerHTML = '';
  hooks.render();
  if (r.kind === 'charms') {
    const offer = rollContractCharms(state, rng, r.rare);
    if (offer.length) {
      state.charmOffer = offer;
      await sleep(200);
      await showCharmOffer();
    }
  }
}
