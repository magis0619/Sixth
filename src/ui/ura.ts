// 裏（妖怪退治）の画面：妖怪の札（体力・残りの回転・弱点・次の妨害）、ダメージの見せ方、倒したあとの3択、妨害の演出。
// ルールは src/game.ts の「裏」。売った作物の金貨は財布ではなく妖怪へ飛ぶ（el.goldBox を妖怪の絵に差し替える）

import { art, type ArtId } from '../art.ts';
import { sfx } from '../audio.ts';
import { CHARMS, CROPS, PLACES, SYMBOLS, URA, YOKAI, type HarassId } from '../config.ts';
import { takeUraReward, type UraReward } from '../game.ts';
import { burst, center, flash, floatText, pop, shake, slamText, vibrate } from '../fx.ts';
import { L } from '../i18n.ts';
import { $, el, hooks, state } from './store.ts';
import { FRUIT, PLACE_ART, say, symHtml } from './view.ts';
import { armFresh } from './tapguard.ts';

export const HARASS: Record<HarassId, { name: string; art: ArtId }> = {
  burnRow: { name: L('横一列の実りを燃やす', 'Burns a row of ripe crops'), art: 'flame' },
  pests: { name: L('袋にお邪魔を混ぜる', 'Adds pests to your bag'), art: 'crow' },
  frost: { name: L('縦一列を凍らせる', 'Freezes a column'), art: 'frost' },
  steal: { name: L('一番高い実りを盗む', 'Steals your best crop'), art: 'hand' },
  heal: { name: L('体力が戻る', 'Heals itself'), art: 'heart' },
};

let walletBox: HTMLElement | null = null;
let lastHp = -1;
let lastFoe = '';

/** 妖怪の札を描く。裏でなければ隠す */
export function renderUraHud(): void {
  const hud = $('ura-hud');
  const u = state.ura;
  document.documentElement.classList.toggle('ura-game', !!u);
  walletBox ??= el.goldBox;
  // 裏では上の帯（お金・ノルマの所）に妖怪の札を入れる。表では週の下に戻す（隠したまま）
  const bar = document.querySelector('.hud-bar');
  const menu = $('menu-btn');
  if (u && hud.parentElement !== bar) bar?.insertBefore(hud, menu);
  if (!u && hud.parentElement === bar) $('week').after(hud);
  if (!u) {
    hud.hidden = true;
    el.goldBox = walletBox;
    lastHp = -1;
    return;
  }
  hud.hidden = false;
  const def = YOKAI[u.foe];
  const pct = u.maxHp ? Math.max(0, Math.round((u.hp / u.maxHp) * 100)) : 0;
  const h = HARASS[u.harass];
  const soon = u.harassIn <= 1;
  const html = `<div class="uh-foe" id="uh-foe">${art(def.art as ArtId)}</div>
    <div class="uh-main">
      <p class="uh-name"><b>${def.name}</b><span>${u.idx + 1}/${URA.order.length}</span></p>
      <div class="uh-hp" role="meter" aria-valuemin="0" aria-valuemax="${u.maxHp}" aria-valuenow="${u.hp}"><i style="width:${pct}%"></i><b>${u.hp}<small>/${u.maxHp}</small></b></div>
      <p class="uh-row"><span class="uh-weak">${art(FRUIT[u.weak])}<small>${L('弱点×2', 'Weak ×2')}</small></span><span class="uh-harass${soon ? ' soon' : ''}">${art(h.art)}<small>${soon ? L('今夜', 'Tonight') : L(`あと${u.harassIn}`, `In ${u.harassIn}`)}</small></span></p>
    </div>
    <div class="uh-turns${u.turnsLeft <= 2 ? ' danger' : ''}"><b>${u.turnsLeft}</b><small>${L('回転', 'spins')}</small></div>`;
  if (hud.dataset.html !== html) {
    hud.innerHTML = html;
    hud.dataset.html = html;
  }
  // 売った金貨は妖怪へ飛ぶ
  el.goldBox = $('uh-foe');
  // ダメージ・回復の見せ方（同じ妖怪のときだけ）
  if (lastFoe === u.foe && lastHp >= 0 && u.hp !== lastHp) {
    const c = center(hud);
    const foe = center($('uh-foe'));
    if (u.hp < lastHp) {
      floatText(foe.x, foe.y + 10, `−${lastHp - u.hp}`, { cls: 'bad', size: 1.1 });
      shake($('uh-foe'), 6);
    } else floatText(c.x, c.y, `+${u.hp - lastHp}`, { cls: 'good', size: 0.9 });
  }
  lastHp = u.hp;
  lastFoe = u.foe;
}

/** 妨害が起きた夜：荒らされたマスと、何をされたか */
export async function showUraHarass(): Promise<void> {
  const u = state.ura;
  const h = u?.lastHarass;
  if (!u || !h) return;
  const info = HARASS[h.id];
  sfx.error();
  vibrate([30, 40, 60]);
  pop($('uh-foe'), 1.25);
  if (h.id === 'burnRow') flash('#ff7a3a', 350);
  if (h.id === 'frost') flash('#9fd8ff', 350);
  h.cells.forEach((i) => {
    const p = center(el.field.children[i]);
    burst(p.x, p.y, h.id === 'frost' ? ['❄️', '✨'] : h.id === 'steal' ? ['💨'] : ['🔥', '✨'], 8, 50);
  });
  say(`${art(YOKAI[u.foe].art as ArtId)} ${L(`${YOKAI[u.foe].name}が${info.name}`, `${YOKAI[u.foe].name}: ${info.name}`)}`, 2600);
  hooks.render();
  await new Promise((r) => setTimeout(r, 700));
}

function rewardCard(rw: UraReward, k: number): string {
  let ico = '';
  let name = '';
  let sub = '';
  switch (rw.kind) {
    case 'seed': {
      const next = YOKAI[URA.order[Math.min((state.ura?.idx ?? 0) + 1, URA.order.length - 1)]];
      ico = symHtml(rw.sym);
      name = `${SYMBOLS[rw.sym].name} ×${rw.n}`;
      sub = L(`次の${next.name}の弱点`, `${next.name}'s weakness`);
      break;
    }
    case 'symbol':
      ico = symHtml(rw.sym);
      name = `${SYMBOLS[rw.sym].name} ×${rw.n}`;
      sub = SYMBOLS[rw.sym].desc;
      break;
    case 'charm':
      ico = art(rw.id as ArtId);
      name = CHARMS[rw.id].name;
      sub = CHARMS[rw.id].desc((state.charms[rw.id] ?? 0) + 1);
      break;
    case 'place':
      ico = art(PLACE_ART[rw.id]);
      name = PLACES[rw.id].name;
      sub = L('畑に置く', 'Place on your farm');
      break;
    case 'expand':
      ico = art('expand');
      name = L('畑を広げる', 'Expand the farm');
      sub = `${state.cols}×${state.rows} → ${state.cols <= state.rows ? state.cols + 1 : state.cols}×${state.cols <= state.rows ? state.rows : state.rows + 1}`;
      break;
    case 'clean':
      ico = art('crow');
      name = L(`お邪魔を${rw.n}枚払う`, `Remove ${rw.n} pests`);
      sub = L('袋から消す', 'From your bag');
      break;
  }
  return `<button class="ur-card" data-k="${k}"><span class="ur-ico">${ico}</span><span class="ur-text"><b>${name}</b><small>${sub}</small></span></button>`;
}

/** 倒したあとの3択（必ず1つ選ぶ）。選ぶと次の妖怪が来る */
export function showUraReward(): Promise<void> {
  const u = state.ura;
  if (!u?.reward) return Promise.resolve();
  const def = YOKAI[u.foe];
  sfx.bigBuy();
  flash('#fff3b0', 400);
  el.overlay.innerHTML = `<div class="modal ura-reward" role="dialog" aria-label="${L('ごほうび', 'Reward')}">
      <div class="ur-head"><span class="ur-foe">${art(def.art as ArtId)}</span><h2>${L(`${def.name}を退治！`, `${def.name} defeated!`)}</h2></div>
      <p class="ur-lead">${L('ごほうびを1つ選ぶ', 'Pick one reward')}</p>
      <div class="ur-cards">${u.reward.map(rewardCard).join('')}</div>
    </div>`;
  el.overlay.classList.add('show');
  const modal = el.overlay.querySelector<HTMLElement>('.ura-reward')!;
  armFresh(modal, 600);
  return new Promise((resolve) => {
    let picked = false;
    modal.querySelectorAll<HTMLButtonElement>('.ur-card').forEach((b) =>
      b.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        takeUraReward(state, Number(b.dataset.k));
        sfx.charmGet();
        el.overlay.classList.remove('show');
        el.overlay.innerHTML = '';
        hooks.render();
        resolve();
      }),
    );
  });
}

/** 次の妖怪が来た */
export async function uraIntro(): Promise<void> {
  const u = state.ura;
  if (!u) return;
  const def = YOKAI[u.foe];
  sfx.reach();
  pop($('uh-foe'), 1.3);
  await slamText(def.boss ? L(`${def.name}が現れた！`, `${def.name} appears!`) : L(`${def.name}が来た`, `${def.name} comes`), { cls: 'bad', size: 1.4, dur: 1200 });
  say(`${art(FRUIT[u.weak])} ${L(`弱点は${CROPS[u.weak].name}（×${URA.weakMult}）・${u.limit}回転のうちに倒す`, `Weak to ${CROPS[u.weak].name} (×${URA.weakMult}) · defeat within ${u.limit} spins`)}`, 3200);
}
