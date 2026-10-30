// 画面：結果・遊び方・クリア・タイトル・解放・準備

import { L } from '../i18n.ts';
import {
  ACHIEVE_ADDS, CHARM_ORDER, COMBOS, type CharmId, type SymbolId, PAUSED_CHARMS, CHARM_TIER_NAMES, CHARMS, CONFIG, DIFFICULTIES, FEEDBACK_URL, META, SHARE_URL, SYMBOL_ORDER, SYMBOLS, THUNDER_LINES, UPGRADES,
} from '../config.ts';
import { nextTax } from '../game.ts';
import {
  awardPoints, buyCapacity, capacity, isAchieveAdd, loadoutCost, maxDifficulty, nextCapacityPrice, recordRun, saveMeta, toggleLoadout, unlockAdd, unlockCharm,
} from '../meta.ts';
import { art, type ArtId } from '../art.ts';
import { sfx, unlockAudio } from '../audio.ts';
import { burst, center, confetti, firework, flash, floatText, isCalm, shake, toggleCalm, vibrate } from '../fx.ts';
import { track } from '../telemetry.ts';
import { $, el, hooks, meta, state } from './store.ts';
import { say, symHtml, upgradeArt } from './view.ts';
import { clearRun, loadBest, loadRun, saveBest } from './save.ts';
import { stopHeartbeat } from './scene.ts';
import { showSettings } from './settings.ts';
import { FEVER_FX } from './shows.ts';

/** 結果画面。cleared=true はクリア後にここで終えたとき */
export function showGameOver(endedAfterClear = false): void {
  clearRun();
  document.documentElement.classList.remove('tax-danger');
  stopHeartbeat();
  state.over = true;
  const best = loadBest();
  const isNew = state.day > (best.day ?? 0);
  if (isNew) saveBest({ day: state.day, taxes: state.taxesPaid });
  const t = nextTax(state);
  const earned = awardPoints(meta, state);
  track('result', state, { end: endedAfterClear ? 'clear' : 'tax', tax: t.amount, points: earned, difficulty: state.difficulty });
  const newly = recordRun(meta, state, true);
  el.overlay.innerHTML = `
    <div class="modal over-modal" role="dialog" aria-label="${L('ゲームオーバー', 'Game over')}">
      <div class="big">${art(state.cleared ? 'trophy' : 'hut')}</div>
      <h2>${endedAfterClear ? L('クリア！', 'You win!') : state.cleared ? L('エンドレス終了', 'Endless over') : L('年貢が払えなかった…', "Couldn't pay the tax…")}</h2>
      <div class="over-stats">
        <span>${art('calendar')}${L(`<b>${state.day}</b>日`, `Day <b>${state.day}</b>`)}${isNew ? `<em>${L('最高！', 'Best!')}</em>` : ''}</span>
        <span>${art('bale')}<b>${state.taxesPaid}</b>${L('回', ' paid')}</span>
        <span>${art('coin')}<b>${state.stats.totalEarned}</b>${L('', 'g')}</span>
      </div>
      ${reviewHtml(endedAfterClear, t.amount)}
      <div class="points-earned">${art('sprout')} <b>+${earned}pt</b><span>${L('計', 'Total')} ${meta.points}pt</span></div>
      ${newly.length ? `<div class="newly">${art('sparkle')} ${L('解放', 'Unlocked')}：${newly.map((x) => `<b>${x}</b>`).join('')}</div>` : ''}
      <div class="share-row">
        <button class="secondary" id="share">${typeof navigator.share === 'function' ? `${art('share')}${L('シェア', 'Share')}` : `${art('copy')}${L('コピー', 'Copy')}`}</button>
        ${FEEDBACK_URL ? `<a class="secondary" href="${FEEDBACK_URL}" target="_blank" rel="noopener">${art('mail')}${L('感想', 'Feedback')}</a>` : ''}
      </div>
      <div class="over-actions">
        <button class="primary" id="retry" disabled>${L('もう一度', 'Play again')}</button>
        <button class="secondary" id="restart" disabled>${L('タイトルへ', 'Title')}</button>
      </div>
    </div>`;
  el.overlay.classList.add('show');
  const btn = $<HTMLButtonElement>('restart');
  const retry = $<HTMLButtonElement>('retry');
  // 直前の連打で即リトライが暴発しないよう少し待つ
  window.setTimeout(() => {
    btn.disabled = false;
    retry.disabled = false;
  }, 900);
  btn.addEventListener('click', restart);
  // もう一度：準備画面（開店準備）から。組み合わせ・難しさを見直してから始められる
  retry.addEventListener('click', () => {
    sfx.select();
    showPrep();
  });
  $('share').addEventListener('click', () => void shareResult(endedAfterClear));
  hooks.render();
}

/** 振り返り：どこまで届いたか・一番稼いだ日・列の数と、次に試すとよいことをひと言 */
function reviewHtml(endedAfterClear: boolean, taxAmount: number): string {
  const rows: string[] = [];
  if (!state.cleared && !endedAfterClear) {
    const short = Math.max(0, taxAmount - state.gold);
    rows.push(`<li class="short">${art('bale')} ${L(`年貢まで <b>あと${short}</b> 足りなかった`, `Tax short by <b>${short}g</b>`)}</li>`);
  }
  const days = state.stats.earnedByDay;
  let bestDay = 0;
  days.forEach((v, d) => {
    if ((v ?? 0) > (days[bestDay] ?? 0)) bestDay = d;
  });
  if (days[bestDay]) rows.push(`<li>${art('coin')} ${L(`一番稼いだ日：<b>${bestDay}日目 +${days[bestDay]}</b>`, `Best day: <b>day ${bestDay}, +${days[bestDay]}g</b>`)}</li>`);
  rows.push(`<li>${art('tomato')} ${L(`列で売った：<b>${state.stats.lineHarvests}回</b>・取られた作物：<b>${state.stats.cropsEaten}個</b>`, `Lines sold: <b>${state.stats.lineHarvests}</b> · crops lost: <b>${state.stats.cropsEaten}</b>`)}</li>`);
  const tip =
    state.stats.lineHarvests === 0
      ? L('作物を3つ並べて売ると ×1.3。並べずに売ると半値', 'Sell 3 crops in a line for ×1.3. Singles sell at half price')
      : state.stats.cropsEaten >= 5
        ? L('カラス・タヌキには、かかし（周り8マスを守る）', 'Scarecrows guard the 8 plots around them from crows and tanuki')
        : state.stats.purchases.length < 3
          ? L('ショップで絵柄を足すと、狙った作物を育てやすい', 'Add symbols in the shop to grow the crops you want')
          : L('同じ作物だけの列は、さらに ×1.3', 'Lines of a single crop get another ×1.3');
  return `<ul class="review">${rows.join('')}</ul><p class="tip">${art('sparkle')} ${L('次は', 'Next time')}：${tip}</p>`;
}

export function restart(): void {
  showTitle();
}

export function resultText(endedAfterClear: boolean): string {
  const head = state.cleared ? (endedAfterClear ? L('🏆 クリア！', '🏆 Won!') : L(`🏆 クリア後エンドレスで${state.day}日目まで`, `🏆 Won, then reached day ${state.day} in endless`)) : L(`${state.day}日目まで`, `Reached day ${state.day}`);
  const charms = state.stats.charms.map((c) => CHARMS[c.id].emoji).join('');
  return [
    `🌾${L('畑スロット', 'Farm Slots')} ${head}`,
    L(`年貢 ${state.taxesPaid}回納付 / 総収入 ${state.stats.totalEarned} / リール${state.reels}本`, `Taxes paid ${state.taxesPaid} / earned ${state.stats.totalEarned}g / ${state.reels} reels`),
    charms ? `${L('お守り', 'Charms')} ${charms}` : '',
    L(`フィーバー${state.stats.fevers}回・列${state.stats.lineHarvests}回`, `Fevers ${state.stats.fevers} · lines ${state.stats.lineHarvests}`),
    SHARE_URL,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function shareResult(endedAfterClear: boolean): Promise<void> {
  const text = resultText(endedAfterClear);
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    say(L('コピーした', 'Copied'));
    floatText(window.innerWidth / 2, window.innerHeight * 0.3, L('コピーした！', 'Copied!'), { cls: 'good', size: 1 });
  } catch {
    // 共有を閉じた・権限がない場合は何もしない
  }
}

// ---- 遊び方・図鑑 ----

export type HelpTab = 'rules' | 'symbols' | 'combos' | 'charms';

/** onClose：閉じたあとに戻す画面（準備画面から開いたとき） */
export function showHelp(tab: HelpTab = 'rules', onClose?: () => void): void {
  const tabs: [HelpTab, string][] = [['rules', L('遊び方', 'How to play')], ['symbols', L('絵柄', 'Symbols')], ['combos', L('組み合わせ', 'Combos')], ['charms', L('お守り', 'Charms')]];
  const rules = `
    <ul class="help-list icons">
      <li>${art('calendar')}<span>${L('1回転＝1日', 'One spin = one day')}</span></li>
      <li>${art('seed')}<span>${L('光る出目 → マスをタップ', 'Tap a glowing reel → tap a plot')}</span></li>
      <li>${art('rain')}<span>${L('雨＝縦横十字', 'Rain = cross')}　${art('sun')}${L('太陽＝縦一列', 'Sun = column')}　${art('bee')}${L('蜂＝斜め', 'Bee = diagonals')}　${art('moon')}${L('満月＝全体', 'Moon = all')}</span></li>
      <li>${art('tomato')}${art('tomato')}${art('tomato')}<span>${L('縦・横・斜めに3つ＝高く売れる（単品は½）', '3 in a row (any direction) sell high; singles are ½')}</span></li>
      <li>${art('bale')}<span>${L(`${CONFIG.taxPeriod}日ごとに年貢。払えないと終わり／${CONFIG.winTaxes}回でクリア`, `Tax every ${CONFIG.taxPeriod} days. Can't pay = game over / pay ${CONFIG.winTaxes} to win`)}</span></li>
      <li>${art('coinPurse')}<span>${L('年貢のあと：お守り1つ＋お邪魔が増える', 'After each tax: pick a charm, and pests join your bag')}</span></li>
      <li>${art('seed')}<span>${L('毎日の仕入れ：看板の絵柄を1つ選ぶとタダで袋へ', 'Daily pick: choose a symbol on the sign to add it free')}</span></li>
      <li>${art('bargain')}<span>${L('ショップ：道具・畑を広げる・満月・お邪魔を消す', 'Shop: tools, bigger field, full moon, pest removal')}</span></li>
      <li>${art('waterwheel')}<span>${L('水路：3つ並べると水車・4方を囲むと釣り堀（毎晩お金）', 'Water: 3 in a row = waterwheel, enclose a plot = fishing pond (nightly gold)')}</span></li>
      <li>${art('sprout')}<span>${L('遊ぶほどポイント → 解放', 'Play to earn points → unlocks')}</span></li>
    </ul>`;
  const symbols = SYMBOL_ORDER.map((id) => {
    const d = SYMBOLS[id];
    return `<div class="dex-row${d.rarity === 'bad' ? ' bad' : ''}"><span class="e">${symHtml(id)}</span>
      <div><b>${d.name}</b> <span class="tag-k">${d.kind === 'manual' ? L('手動', 'Tap') : L('自動', 'Auto')}</span>
      <span class="dex-desc">${d.desc}</span>
      <span class="dex-fever">${art('flame')}${FEVER_FX[id].ico ? art(FEVER_FX[id].ico!) : ''}${FEVER_FX[id].text}</span></div>
      <span class="own">${art('seed')}×${state.bag[id]}</span></div>`;
  }).join('');
  // 組み合わせ：同じ日のスロットにそろうと起きること（集め方の目当てにするので、最初から全部見せる）
  const combos = (Object.keys(COMBOS) as CharmId[])
    .map((id) => {
      const need = Object.entries(COMBOS[id]!) as [SymbolId, number][];
      const pair = need.flatMap(([sym, n]) => Array.from({ length: n }, () => symHtml(sym))).join('<span class="fc-plus">＋</span>');
      return `<div class="dex-row combo-row${meta.discovered.includes(id) ? ' seen' : ''}"><span class="combo-pair">${pair}</span>
        <div><b>${art(id)} ${CHARMS[id].name}</b><span class="dex-desc">${CHARMS[id].desc(1)}</span></div></div>`;
    })
    .join('');
  // お守り（組み合わせは別の欄）
  const charms = CHARM_ORDER.filter((id) => !PAUSED_CHARMS.includes(id) && CHARMS[id].special?.kind !== 'combo').map((id) => {
    const c = CHARMS[id];
    if (c.special && !meta.discovered.includes(id) && !state.charms[id]) {
      return `<div class="dex-row locked"><span class="e silhouette">${art(id)}</span><div><b>？？？</b><small>${c.special.hint}</small></div></div>`;
    }
    const locked = id in META.charmUnlock && !meta.unlockedCharms.includes(id);
    return `<div class="dex-row tier-${c.tier}${locked ? ' locked' : ''}"><span class="e">${art(id)}</span>
      <div><b>${c.name}</b> <span class="tag-k">${CHARM_TIER_NAMES[c.tier]}</span>
      <small>${c.desc(1)}${Number.isFinite(c.max) ? L(`（最大${c.max}個）`, ` (max ${c.max})`) : ''}</small>
      ${locked ? `<small class="fv">${art('lock')} ${L('解放', 'Unlock')} ${META.charmUnlock[id]}pt</small>` : ''}</div>
      <span class="own">${state.charms[id] ? L(`所持${state.charms[id]}`, `Own ${state.charms[id]}`) : ''}</span></div>`;
  }).join('');
  el.overlay.innerHTML = `
    <div class="modal help-modal" role="dialog" aria-label="${L('遊び方と図鑑', 'How to play')}">
      <div class="help-tabs">${tabs.map(([k, label]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
      <div class="help-body">${tab === 'rules' ? rules : tab === 'symbols' ? symbols : tab === 'combos' ? `<p class="combo-lead">${L('同じ日のスロットにそろうと、その日だけ起きる', 'When these appear together on the reels, they trigger for the day')}</p>${combos}` : charms}</div>
      <button class="secondary" id="tutorial-again">${L('チュートリアルをもう一度', 'Replay the tutorial')}</button>
      <button class="secondary" id="calm-toggle">${L('演出控えめ', 'Calm effects')}：${isCalm() ? L('オン', 'On') : L('オフ', 'Off')}</button>
      <button class="primary" id="help-close">${L('閉じる', 'Close')}</button>
    </div>`;
  el.overlay.classList.add('show');
  $('tutorial-again').addEventListener('click', (e) => {
    meta.tutorialDone = false;
    saveMeta(meta);
    (e.currentTarget as HTMLElement).firstChild!.textContent = L('チュートリアル：次に始めるときに出ます', 'Tutorial: shows in your next game');
    sfx.select();
  });
  $('calm-toggle').addEventListener('click', (e) => {
    const on = toggleCalm();
    (e.currentTarget as HTMLElement).firstChild!.textContent = `${L('演出控えめ', 'Calm effects')}：${on ? L('オン', 'On') : L('オフ', 'Off')}`;
    sfx.select();
  });
  el.overlay.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => showHelp(b.dataset.tab as HelpTab, onClose)),
  );
  $('help-close').addEventListener('click', () => {
    el.overlay.classList.remove('show');
    el.overlay.innerHTML = '';
    onClose?.();
  });
}

/** クリア画面。エンドレスで続けるなら true */
export function showClear(): Promise<boolean> {
  recordRun(meta, state, false);
  sfx.bigBuy();
  confetti(80);
  // 大花火
  const colors = ['#ff5a5a', '#ffd84a', '#5ad1ff', '#b98bff', '#7dff8a', '#ff8fd8'];
  for (let k = 0; k < 10; k++) {
    window.setTimeout(() => {
      sfx.firework();
      firework(window.innerWidth * (0.15 + Math.random() * 0.7), window.innerHeight * (0.12 + Math.random() * 0.25), colors[k % colors.length]);
    }, k * 380);
  }
  flash('#ffe680', 700);
  vibrate([60, 40, 60, 40, 200]);
  el.overlay.innerHTML = `
    <div class="modal clear-modal" role="dialog" aria-label="${L('クリア', 'Win')}">
      <div class="big">${art('trophy')}</div>
      <h2>${L('クリア！', 'You win!')}</h2>
      <div class="record">${L(`${state.day}日目でクリア / 総収入 ${state.stats.totalEarned}`, `Won on day ${state.day} / earned ${state.stats.totalEarned}g`)}</div>
      <p class="sub">+${META.clearBonus}pt</p>
      <button class="primary" id="clear-continue" disabled>${L('エンドレスへ', 'Keep going (endless)')}</button>
      <button class="secondary" id="clear-end" disabled>${L('ここで終える', 'Finish here')}</button>
    </div>`;
  el.overlay.classList.add('show');
  window.setTimeout(() => el.overlay.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = false)), 900);
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      el.overlay.classList.remove('show');
      el.overlay.innerHTML = '';
      resolve(v);
    };
    $('clear-continue').addEventListener('click', () => close(true));
    $('clear-end').addEventListener('click', () => close(false));
  });
}

// ---- 準備画面（解放とショップの組み合わせ） ----

export const ADD_EMOJI = Object.fromEntries(UPGRADES.map((u) => [u.id, upgradeArt(u.id)]));
export const ADD_NAME = Object.fromEntries(UPGRADES.map((u) => [u.id, u.name]));

/** 準備画面の短い名前（「〜を足す」は見出しで分かるので省く） */
export function shortName(id: keyof typeof META.adds): string {
  return ADD_NAME[id].replace(/を足す$|^Add /, '');
}

/** スタート画面：スタート（と続きから）だけ。強化の解放は小さなボタンから */
export function showTitle(): void {
  const saved = loadRun();
  el.overlay.innerHTML = `
    <div class="title-scene" aria-hidden="true">
      <span class="ts-sun">${art('sun')}</span>
      <span class="ts-cloud a">${art('puff')}</span><span class="ts-cloud b">${art('puff')}</span>
      <span class="ts-hill back"></span><span class="ts-hill front"></span>
    </div>
    <div class="title-screen" role="dialog" aria-label="${L('畑スロット', 'Farm Slots')}">
      <div class="title-logo title-board">
        <span class="board-crops">${art('pumpkin')}${art('tomato')}${art('corn')}</span>
        <h1>${L('畑スロット', 'Farm Slots')}</h1>
        <span class="board-post l"></span><span class="board-post r"></span>
        <span class="board-crow">${art('crow')}</span>
      </div>
      <div class="title-actions">
        <button class="primary title-start" id="title-start">${L('スタート', 'Start')}</button>
        ${saved ? `<button class="secondary" id="title-resume">${L('続きから', 'Continue')} ${L(`（${saved.day}日目）`, `(day ${saved.day})`)}</button>` : ''}
      </div>
      <div class="title-sub">
        <button class="icon-pill" id="title-unlock">${art('lock')}<span>${L('解放', 'Unlocks')}</span><b>${meta.points}pt</b></button>
        <button class="icon-pill" id="title-help">${art('question')}<span>${L('遊び方', 'How to play')}</span></button>
        <button class="icon-pill" id="title-records">${art('calendar')}<span>${L('記録', 'Records')}</span></button>
        <button class="icon-pill" id="title-settings">${art('gear')}<span>${L('設定', 'Settings')}</span></button>
      </div>
    </div>`;
  el.overlay.classList.add('show', 'title');
  $('title-start').addEventListener('click', () => {
    unlockAudio();
    sfx.select();
    showPrep();
  });
  document.getElementById('title-resume')?.addEventListener('click', () => {
    unlockAudio();
    sfx.select();
    hooks.startGame(saved);
  });
  $('title-unlock').addEventListener('click', () => {
    unlockAudio();
    sfx.select();
    showUnlock();
  });
  $('title-help').addEventListener('click', () => {
    unlockAudio();
    showHelp('rules', showTitle);
  });
  $('title-records').addEventListener('click', () => {
    unlockAudio();
    sfx.select();
    showRecords();
  });
  $('title-settings').addEventListener('click', () => {
    unlockAudio();
    sfx.select();
    leaveTitle();
    showSettings(showTitle);
  });
}

/** 記録：これまでの成績 */
export function showRecords(): void {
  leaveTitle();
  const best = loadBest();
  const specials = CHARM_ORDER.filter((id) => CHARMS[id].special && !PAUSED_CHARMS.includes(id));
  const row = (ico: string, label: string, value: string) => `<li><span class="rec-ico">${ico}</span><span>${label}</span><b>${value}</b></li>`;
  el.overlay.innerHTML = `
    <div class="modal records-modal" role="dialog" aria-label="${L('記録', 'Records')}">
      <h2>${art('calendar')} ${L('記録', 'Records')}</h2>
      <ul class="records">
        ${row(art('sprout'), L('遊んだ回数', 'Games played'), `${meta.plays}`)}
        ${row(art('trophy'), L('クリア', 'Wins'), `${meta.clears}`)}
        ${row(art('calendar'), L('最高到達', 'Best run'), best.day ? L(`${best.day}日目（年貢${best.taxes}回）`, `Day ${best.day} (${best.taxes} taxes)`) : '—')}
        ${row(art('skull'), L('一番上の難しさ', 'Hardest cleared'), meta.maxCleared >= 0 ? DIFFICULTIES[meta.maxCleared].name : L('まだクリアしていない', 'Not yet'))}
        ${row(art('tomato'), L('列で売った（累計）', 'Lines sold (total)'), `${meta.lines}`)}
        ${row(art('sparkle'), L('特別なお守り', 'Special charms'), `${meta.discovered.filter((id) => specials.includes(id)).length} / ${specials.length}`)}
        ${row(art('coin'), L('これまでの豊穣ポイント', 'Points earned (total)'), `${meta.totalPoints}pt`)}
      </ul>
      <button class="primary" id="records-close">${L('もどる', 'Back')}</button>
    </div>`;
  el.overlay.classList.add('show');
  $('records-close').addEventListener('click', () => {
    sfx.cancel();
    showTitle();
  });
}

export function leaveTitle(): void {
  el.overlay.classList.remove('title');
}

/** 図鑑：達成で解放されるもの。未達成は影絵と短いヒント */
export function collection(): string {
  const item = (done: boolean, ico: string, name: string, hint: string) =>
    `<div class="prep-item${done ? ' on' : ' todo'}"><span class="e${done ? '' : ' silhouette'}">${ico}</span><b>${done ? name : '？？？'}</b><small>${done ? '✓' : hint}</small></div>`;
  const specials = CHARM_ORDER.filter((id) => CHARMS[id].special && !PAUSED_CHARMS.includes(id)).map((id) =>
    item(meta.discovered.includes(id), art(id), CHARMS[id].name, CHARMS[id].special!.hint),
  );
  const adds = (Object.keys(ACHIEVE_ADDS) as (keyof typeof ACHIEVE_ADDS)[]).map((id) => {
    const done = meta.unlockedAdds.includes(id);
    const hint = id === 'addThunder' ? `${L('列', 'Lines')} ${Math.min(meta.lines, THUNDER_LINES)}/${THUNDER_LINES}` : ACHIEVE_ADDS[id]!.hint;
    return item(done, ADD_EMOJI[id], shortName(id), hint);
  });
  const levels = DIFFICULTIES.slice(1).map((d, k) => item(maxDifficulty(meta) >= k + 1, art('skull'), d.name, L(`${DIFFICULTIES[k].name}をクリア`, `Clear ${DIFFICULTIES[k].name}`)));
  const skin = item(meta.skins.includes('gold'), art('coin'), L('金色のスロット', 'Golden slot machine'), L('初めてクリアすると…？', 'Clear the game once…?'));
  return [...specials, ...adds, ...levels, skin].join('');
}

export function skinItems(): string {
  return meta.skins
    .map((id) => `<button class="prep-item${meta.skin === id ? ' on' : ''}" data-skin="${id}"><span class="e">${art('coin')}</span><b>${L('金色のスロット', 'Golden slot machine')}</b><small>${meta.skin === id ? L('✓ 使う', '✓ In use') : L('タップで使う', 'Tap to use')}</small></button>`)
    .join('');
}

/** 選んでいる見た目をスロットに反映 */
export function applySkin(): void {
  el.machine.classList.toggle('skin-gold', meta.skin === 'gold');
}

/** 強化の解放（豊穣ポイントを使う）。スタート画面から開く */
export function showUnlock(): void {
  leaveTitle();
  const paint = () => {
    const capPrice = nextCapacityPrice(meta);
    const adds = (Object.keys(META.adds) as (keyof typeof META.adds)[])
      .filter((id) => id !== 'addMoon' && !isAchieveAdd(id))
      .map((id) => {
        const def = META.adds[id];
        if (meta.unlockedAdds.includes(id)) {
          return `<div class="prep-item on"><span class="e">${ADD_EMOJI[id]}</span><b>${shortName(id)}</b><small>✓</small></div>`;
        }
        const can = meta.points >= def.unlock;
        return `<button class="prep-item locked${can ? ' unlockable' : ''}" data-unlock="${id}" ${can ? '' : 'disabled'}>
          <span class="e">${ADD_EMOJI[id]}</span><b>${shortName(id)}</b><small>${can ? '' : art('lock')}${def.unlock}pt</small></button>`;
      })
      .join('');
    const charms = (Object.keys(META.charmUnlock) as (keyof typeof META.charmUnlock)[])
      .map((id) => {
        const c = CHARMS[id];
        const price = META.charmUnlock[id]!;
        if (meta.unlockedCharms.includes(id)) {
          return `<div class="prep-item on"><span class="e">${art(id as ArtId)}</span><b>${c.name}</b><small>✓</small></div>`;
        }
        const can = meta.points >= price;
        return `<button class="prep-item locked${can ? ' unlockable' : ''}" data-charm="${id}" ${can ? '' : 'disabled'}>
          <span class="e">${art(id as ArtId)}</span><b>${c.name}</b><small>${can ? '' : art('lock')}${price}pt</small></button>`;
      })
      .join('');
    setModal('unlock', 'prep-modal', L('強化の解放', 'Unlocks'), `
        <h2>${art('lock')} ${L('解放', 'Unlocks')}</h2>
        <div class="points"><b>${meta.points}pt</b></div>
        <h3>${art('seed')} ${L('絵柄', 'Symbols')}</h3>
        <div class="prep-grid">${adds}</div>
        <h3>${art('sunBlessing')} ${L('レアのお守り', 'Rare charms')}</h3>
        <div class="prep-grid">${charms}</div>
        <h3>${art('star')} ${L('達成で解放', 'Achievements')}</h3>
        <div class="prep-grid">${collection()}</div>
        ${meta.skins.length ? `<h3>${art('artisan')} ${L('見た目', 'Looks')}</h3><div class="prep-grid">${skinItems()}</div>` : ''}
        <h3>${art('bargain')} ${L('並べられる数', 'Shop capacity')}</h3>
        ${capPrice !== null ? `<button class="secondary prep-cap" id="prep-cap" ${meta.points < capPrice ? 'disabled' : ''}>${L('コスト上限', 'Cost limit')} ${capacity(meta)} → ${capacity(meta) + META.capacityStep}<small>${capPrice}pt</small></button>` : `<p class="sub">${L('コスト上限', 'Cost limit')} ${capacity(meta)}${L('（最大）', ' (max)')}</p>`}
        <div class="prep-actions"><button class="secondary" id="unlock-back">← ${L('もどる', 'Back')}</button></div>`);
    el.overlay.classList.add('show');
    const unlocked = (b: HTMLElement) => {
      sfx.charmGet();
      const c = center(b);
      paint();
      burst(c.x, c.y, ['✨', '🔓', '⭐'], 14, 80);
    };
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-unlock]').forEach((b) =>
      b.addEventListener('click', () => {
        if (unlockAdd(meta, b.dataset.unlock as never)) unlocked(b);
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-charm]').forEach((b) =>
      b.addEventListener('click', () => {
        if (unlockCharm(meta, b.dataset.charm as never)) unlocked(b);
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((b) =>
      b.addEventListener('click', () => {
        meta.skin = meta.skin === b.dataset.skin ? '' : b.dataset.skin!;
        saveMeta(meta);
        applySkin();
        sfx.select();
        paint();
      }),
    );
    document.getElementById('prep-cap')?.addEventListener('click', () => {
      if (!buyCapacity(meta)) return;
      sfx.buy();
      paint();
    });
    $('unlock-back').addEventListener('click', () => {
      sfx.cancel();
      showTitle();
    });
  };
  paint();
}

/** 難しさは積み重なる：選んだ段までの要素を全部並べて見せる（難しい3なら 1・2・3 の要素） */
function diffSummary(level: number): string {
  if (level === 0) return '';
  const parts = DIFFICULTIES.slice(1, level + 1).map((d) => `<span>${d.desc}</span>`).join('');
  return `<div class="diff-summary"><b>${DIFFICULTIES[level].name}</b>${parts}</div>`;
}

/**
 * 窓（.modal）を1回だけ出し、2回目からは中身だけ入れ替える。
 * 毎回作り直すと、選ぶたびに窓の登場の動きが最初から流れてチカチカする（スクロールの位置も戻る）
 */
function setModal(screen: string, cls: string, label: string, inner: string): HTMLElement {
  let m = el.overlay.querySelector<HTMLElement>(':scope > .modal');
  if (!m || m.dataset.screen !== screen) {
    el.overlay.innerHTML = `<div class="modal ${cls}" role="dialog"></div>`;
    m = el.overlay.firstElementChild as HTMLElement;
    m.dataset.screen = screen;
  }
  m.setAttribute('aria-label', label);
  const top = m.scrollTop;
  m.innerHTML = inner;
  m.scrollTop = top;
  return m;
}

/** 準備画面：今回ショップに並べる組み合わせを選んで始める（スタートとプレイの間） */
export function showPrep(): void {
  leaveTitle();
  const saved = loadRun();
  let confirmNew = false;
  const paint = () => {
    const cap = capacity(meta);
    const picked = meta.loadout.filter((id) => meta.unlockedAdds.includes(id));
    const used = loadoutCost(picked);
    const adds = (Object.keys(META.adds) as (keyof typeof META.adds)[])
      .filter((id) => id !== 'addMoon' && meta.unlockedAdds.includes(id))
      .map((id, k) => {
        const def = META.adds[id];
        const on = meta.loadout.includes(id);
        const fits = on || used + def.cost <= cap;
        return `<button class="prep-item tag${on ? ' on' : ''}${fits ? '' : ' full'}" data-toggle="${id}" style="--tilt:${[-2, 1.5, -1, 2, -1.5, 1][k % 6]}deg">
          <span class="tag-hole"></span><span class="e">${ADD_EMOJI[id]}</span><b>${shortName(id)}</b>
          <span class="cost" aria-label="${L(`枠${def.cost}`, `${def.cost} slot(s)`)}">${'<i></i>'.repeat(def.cost)}</span>
          ${on ? `<span class="tag-stamp">${L('仕入れ', 'In stock')}</span>` : ''}</button>`;
      })
      .join('');
    // 荷台：選んだ品が枠を使う数だけ並び、残りは空いた枠
    const cart =
      picked.map((id) => `<button class="cart-load" data-toggle="${id}" style="--w:${META.adds[id].cost}" aria-label="${L(`${shortName(id)}を外す`, `Remove ${shortName(id)}`)}">${ADD_EMOJI[id]}<i class="cart-x">×</i></button>`).join('') +
      Array.from({ length: Math.max(0, cap - used) }, () => '<span class="cart-slot"></span>').join('');
    setModal('prep', 'prep-modal setup-modal', L('準備', 'Setup'), `
        <div class="awning scallop"></div>
        <div class="prep-sign"><span class="rope l"></span><span class="rope r"></span>
          <b>${art('bargain')} ${L('開店準備', 'Opening the stall')}</b>
        </div>
        ${maxDifficulty(meta) > 0 ? `<div class="diff-row">${DIFFICULTIES.slice(0, maxDifficulty(meta) + 1).map((d, k) => `<button class="diff-chip${meta.difficulty === k ? ' on' : ''}" data-diff="${k}">${d.name}</button>`).join('')}</div>${diffSummary(meta.difficulty)}` : ''}
        <div class="prep-cart${used > cap ? ' over' : ''}">
          <span class="cart-label">${L('荷台', 'Cart')}<b>${used} / ${cap}</b></span>
          <div class="cart-bed">${cart}</div>
          <span class="cart-wheel l"></span><span class="cart-wheel r"></span>
        </div>
        <div class="prep-shelf">${adds}</div>
        <div class="prep-actions">
          <button class="primary prep-go" id="prep-start">${saved ? (confirmNew ? L('はじめる（続きは消えます）', 'Start (erases saved game)') : L('はじめる', 'Start')) : L('はじめる！', 'Start!')}</button>
          <button class="link-back" id="prep-back">← ${L('もどる', 'Back')}</button>
        </div>`);
    el.overlay.classList.add('show');
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        if (toggleLoadout(meta, b.dataset.toggle as never)) sfx.select();
        else {
          sfx.error();
          shake(b, 4);
          return;
        }
        paint();
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
      b.addEventListener('click', () => {
        meta.difficulty = Number(b.dataset.diff);
        saveMeta(meta);
        sfx.select();
        paint();
      }),
    );
    $('prep-start').addEventListener('click', () => {
      if (saved && !confirmNew) {
        confirmNew = true;
        sfx.error();
        paint();
        return;
      }
      sfx.select();
      hooks.startGame();
    });
    $('prep-back').addEventListener('click', () => {
      sfx.cancel();
      showTitle();
    });
  };
  paint();
}
