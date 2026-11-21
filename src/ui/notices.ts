// 出来事の知らせ（お邪魔が来た・お守りの効果など）を順に見せる札と、初めて出会ったときのヒントの札

import { L } from '../i18n.ts';
import { CHARMS, CHARM_ORDER, type CharmId, PLACES, SYMBOL_ORDER, UPGRADE_SYMBOL, type SymbolId } from '../config.ts';
import { type Notice } from '../game.ts';
import { sfx } from '../audio.ts';
import { saveMeta } from '../meta.ts';
import { art } from '../art.ts';
import { burst, center, coinRain, flash, floatText, pop, sleep, slamText, vibrate, later } from '../fx.ts';
import { visibleOr } from './view.ts';
import { el, meta, state } from './store.ts';

/** 出会った絵柄（袋・リール・仕入れ）とお守り（3択・持ち物）を図鑑に記録する。まだのものは図鑑で秘密 */
export function noteSeen(): void {
  let changed = false;
  const syms = new Set<SymbolId>([
    ...SYMBOL_ORDER.filter((id) => state.bag[id] > 0),
    ...state.results.map((r) => r.symbol),
    ...state.offer.map((id) => UPGRADE_SYMBOL[id]!.symbol),
  ]);
  syms.forEach((id) => {
    if (!meta.seenSymbols.includes(id)) {
      meta.seenSymbols.push(id);
      changed = true;
    }
  });
  const charms = new Set<CharmId>([...(state.charmOffer ?? []), ...CHARM_ORDER.filter((id) => state.charms[id] > 0)]);
  charms.forEach((id) => {
    if (!meta.seenCharms.includes(id)) {
      meta.seenCharms.push(id);
      changed = true;
    }
  });
  if (changed) saveMeta(meta);
}

/** 出来事と出来事の間の小さな間（同時に起こさず、順番に見せる） */
export const EVENT_GAP = 260;

export let noticeChain: Promise<void> = Promise.resolve();

/** ルール側から届いた知らせ（特別なお守り・金色・進化・大当たり）を演出する */
export function flushNotices(): void {
  const list = state.notices.splice(0);
  // 知らせは1つずつ順番に（直前の操作の演出と重ならないよう、少し間を空けてから）
  list.forEach((n: Notice) => {
    noticeChain = noticeChain.then(() => sleep(EVENT_GAP + 500)).then(() => playNotice(n)).then(() => sleep(900));
  });
}

export function playNotice(n: Notice): void {
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
    // 何が変わったか：効き目が2倍（前 → 今）
    const c = CHARMS[n.id];
    const k = state.charms[n.id];
    later(() => showHintCard(`${art(n.id)} <b>${c.name}</b> ${L('金色：効き目2倍', 'Golden: double effect')}<br>${c.desc(k)} → <b>${c.desc(k * 2)}</b>`, 7000), 1600);
  } else if (n.kind === 'toolLevel') {
    const plot = el.field.children[n.cell];
    if (!plot) return;
    const q = center(plot);
    sfx.rare();
    burst(q.x, q.y, ['✨', '⭐'], 10, 70);
    pop(plot, 1.2);
    floatText(q.x, q.y - 30, `${PLACES[n.tool].name} Lv${n.lv + 1}`, { cls: 'gold', size: 1, dur: 1500 });
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

/** 初めて出会ったお邪魔のひと言 */
export const PEST_HINTS: Partial<Record<SymbolId, string>> = {
  crow: L('<b>一番高い作物</b>を狙い、1/2で食べる。かかしの周りは守られる', 'Goes for your <b>most valuable crop</b> and eats it half the time. Scarecrows guard nearby plots'),
  bug: L('<b>一番高い作物</b>の成長−1。かかしの周りは守られ、鶏小屋の周りでは鶏が食べる', 'Growth −1 on your <b>most valuable crop</b>. Henhouses eat nearby bugs'),
  weed: L('<b>作物に囲まれた空きマス</b>をふさいで広がる。かかしの周りには生えない。タップで抜ける', 'Blocks <b>empty plots between crops</b> and spreads. Tap to pull'),
  tanuki: L('実った一番高い作物を盗む。かかしの周りには来ない', 'Steals your priciest ripe crop. Stays away from scarecrows'),
  frost: L('マスが3日凍る。太陽で溶かせる', 'Freezes a plot for 3 days. Sun melts it'),
  mole: L('作物を隣の空きマスへ押し出す。列が崩れることも', 'Pushes a crop into a nearby empty plot, which can break a line'),
  locust: L('出るたびに袋で増えることがある。市で消そう', 'May multiply in your bag each time. Remove them at the market'),
};

export let hintTimer = 0;

/** 画面の上の方に、絵とひと言の札。数秒で消える（タップでも消える） */
export function showHintCard(html: string, ms = 5000): void {
  document.getElementById('hint-card')?.remove();
  window.clearTimeout(hintTimer);
  const card = document.createElement('div');
  card.id = 'hint-card';
  card.className = 'hint-card';
  card.innerHTML = `<span class="hc-badge">${art('question')}</span><p>${html}</p>`;
  document.body.appendChild(card);
  card.animate([{ transform: 'translate(-50%, -12px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' });
  const close = () => {
    window.clearTimeout(hintTimer);
    card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = () => card.remove();
  };
  card.addEventListener('click', close);
  hintTimer = window.setTimeout(close, ms);
}
