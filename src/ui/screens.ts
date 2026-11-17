// 画面：結果・遊び方・クリア・タイトル・解放・準備

import { L } from '../i18n.ts';
import {
  ACHIEVE_ADDS, PLACES, CHARM_ORDER, FARMERS, COMBOS, CUT, isCutAdd, type CharmId, type SymbolId, PAUSED_CHARMS, CHARM_TIER_NAMES, CHARMS, CONFIG, DIFFICULTIES, FEEDBACK_URL, META, SHARE_URL, SYMBOL_ORDER, SYMBOLS, THUNDER_LINES, UPGRADES,
} from '../config.ts';
import { difficultyTaxMult, nextTax, rateRun, taxPlan } from '../game.ts';
import {
  awardPoints, buyCapacity, capacity, farmerUnlocked, isAchieveAdd, loadoutCost, maxDifficulty, nextCapacityPrice, recordRun, saveMeta, toggleLoadout, unlockAdd, unlockCharm,
} from '../meta.ts';
import { art, type ArtId } from '../art.ts';
import { sfx, unlockAudio } from '../audio.ts';
import { burst, center, confetti, firework, flash, floatText, isCalm, shake, toggleCalm, vibrate } from '../fx.ts';
import { track } from '../telemetry.ts';
import { $, el, hooks, meta, state } from './store.ts';
import { PLACE_ART, say, symHtml, upgradeArt } from './view.ts';
import { clearRun, loadBest, loadRun, saveBest } from './save.ts';
import { stopHeartbeat } from './scene.ts';
import { showSettings } from './settings.ts';
import { FEVER_FX } from './shows.ts';
import { explainOnce, overviewCard, showExplain, symbolCard } from './explain.ts';

/** 結果画面。cleared=true はクリア後にここで終えたとき */
/** 評価：大きな判子のランクと、4つの数字の棒 */
function ratingHtml(): string {
  const r = rateRun(state);
  return `<div class="rating rank-${r.rank}">
    <div class="rt-stamp"><b>${r.rank}</b><span>${r.score}${L('点', 'pts')}</span></div>
    ${r.progress < 100 ? `<p class="rt-progress">${art('bale')} ${L(`進み具合 ${state.taxesPaid}/${CONFIG.winTaxes}（点数に掛かる）`, `Progress ${state.taxesPaid}/${CONFIG.winTaxes} (scales the score)`)}</p>` : ''}
    <ul class="rt-parts">${r.parts
      .map((p) => `<li><span class="rt-label">${p.label}</span><span class="rt-bar"><i style="width:${p.value}%"></i></span><b>${p.value}</b><small>${p.detail}</small></li>`)
      .join('')}</ul>
  </div>`;
}

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
      ${rateRun(state).score > 0 ? ratingHtml() : ''}
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
  // 1行に1つ
  rows.push(`<li>${art('tomato')} ${L(`列で売った <b>${state.stats.lineHarvests}回</b>`, `Lines sold <b>${state.stats.lineHarvests}</b>`)}</li>`);
  if (state.stats.cropsEaten) rows.push(`<li>${art('crow')} ${L(`取られた作物 <b>${state.stats.cropsEaten}個</b>`, `Crops lost <b>${state.stats.cropsEaten}</b>`)}</li>`);
  // 次に試すこと：その回の遊び方から、一番効きそうな1つ（上から順に当てはまったもの）
  const short = Math.max(0, taxAmount - state.gold);
  const boughtPlaces = Object.entries(state.bought).some(([k, n]) => k !== 'expand' && (n ?? 0) > 0);
  const tip =
    state.stats.lineHarvests === 0
      ? L('3つ並べて売ると×1.3', 'Sell 3 in a line: ×1.3')
      : state.stats.cropsEaten >= 5
        ? L('カラスにはかかし', 'Scarecrows stop crows')
        : (state.stats.expired ?? 0) >= 6
          ? L('雨・太陽は使い切ろう', 'Use up rain and sun')
          : !boughtPlaces && state.day >= 10
            ? L('市で巣箱を買ってみよう', 'Try a beehive')
            : !state.cleared && short > 0 && short <= taxAmount * 0.2
              ? L('日曜の前に売り切ろう', 'Sell out before Sunday')
              : L('同じ作物の列はさらに×1.3', 'Same-crop lines: ×1.3 more');
  return `<ul class="review">${rows.join('')}</ul><p class="tip">${art('sparkle')} ${L('次は', 'Next time')}：${tip}</p>`;
}

export function restart(): void {
  showTitle();
}

export function resultText(endedAfterClear: boolean): string {
  const head = state.cleared ? (endedAfterClear ? `${art('trophy')} ${L('クリア', 'Won')}` : `${art('trophy')} ${L(`クリア後エンドレスで${state.day}日目まで`, `Won, then reached day ${state.day} in endless`)}`) : L(`${state.day}日目まで`, `Reached day ${state.day}`);
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
    floatText(window.innerWidth / 2, window.innerHeight * 0.3, L('コピーした', 'Copied'), { cls: 'good', size: 1 });
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
    <button class="set-row help-overview" id="help-overview"><span>${art('calendar')} ${L('全体の流れを一枚絵で見る', 'See the whole game in one picture')}</span></button>
    <ul class="help-list icons">
      <li>${art('calendar')}<span>${L('1回転＝1日', 'One spin = one day')}</span></li>
      <li>${art('seed')}<span>${L('光る出目 → マスをタップ', 'Glowing reel → tap a plot')}</span></li>
      <li>${art('rain')}<span>${L('雨＝縦横十字', 'Rain = cross')}</span></li>
      <li>${art('sun')}<span>${L('太陽＝縦一列', 'Sun = column')}</span></li>
      <li>${art('bee')}<span>${L('蜂＝斜め', 'Bee = diagonals')}</span></li>
      <li>${art('moon')}<span>${L('満月＝畑全体', 'Full moon = whole field')}</span></li>
      <li>${art('tomato')}${art('tomato')}${art('tomato')}<span>${L('3つ並べて売る＝×1.3', '3 in a row = ×1.3')}</span></li>
      <li>${art('tomato')}<span>${L('並ばない単品＝半値', 'Singles = half price')}</span></li>
      <li>${art('flame')}<span>${L('同じ絵柄3つ＝フィーバー', '3 of a symbol = FEVER')}</span></li>
      <li>${art('bale')}<span>${L(`${CONFIG.taxPeriod}日ごとに年貢`, `Tax every ${CONFIG.taxPeriod} days`)}</span></li>
      <li>${art('warn')}<span>${L('払えないと終わり', "Can't pay = game over")}</span></li>
      <li>${art('trophy')}<span>${L(`${CONFIG.winTaxes}回納めたらクリア`, `Pay ${CONFIG.winTaxes} times to win`)}</span></li>
      <li>${art('gift')}<span>${L('年貢のあと お守りを1つ', 'After tax: pick a charm')}</span></li>
      <li>${art('crow')}<span>${L('年貢のあと お邪魔が増える', 'After tax: pests join')}</span></li>
      ${CONFIG.marketDays.length ? `<li>${art('bargain')}<span>${L(`${CONFIG.marketDays.map((d) => '月火水木金土日'[d - 1]).join('・')}は市`, 'Wed & Sat: market')}</span></li>
      <li>${art('seed')}<span>${L('市で絵柄を1つタダで', 'Market: 1 free symbol')}</span></li>` : `<li>${art('bargain')}<span>${L('ショップで道具・広げる', 'Shop: tools, expand')}</span></li>`}
      ${CUT.places.includes('water') ? `<li>${art('henhouse')}<span>${L('鶏小屋・牛小屋＝毎晩お金', 'Hen/cow sheds = nightly gold')}</span></li>` : `<li>${art('waterwheel')}<span>${L('水路3つ＝水車', '3 water = waterwheel')}</span></li>`}
      <li>${art('sprout')}<span>${L('遊ぶほど解放', 'Play more to unlock')}</span></li>
    </ul>`;
  // まだ出会っていない絵柄・組み合わせ・お守りは秘密（影と「？？？」）
  const secret = (ico: string) => `<div class="dex-row locked"><span class="e silhouette">${ico}</span><div><b>？？？</b></div></div>`;
  const symbols = SYMBOL_ORDER.filter((id) => !CUT.symbols.includes(id) || state.bag[id] > 0).map((id) => {
    const d = SYMBOLS[id];
    if (!meta.seenSymbols.includes(id) && state.bag[id] === 0) return secret(symHtml(id));
    return `<div class="dex-row${d.rarity === 'bad' ? ' bad' : ''}" data-ex-sym="${id}"><span class="e">${symHtml(id)}</span>
      <div><b>${d.name}</b> <span class="tag-k">${d.kind === 'manual' ? L('手動', 'Tap') : L('自動', 'Auto')}</span>
      <span class="dex-desc">${d.desc}</span>
      <span class="dex-fever">${art('flame')}${FEVER_FX[id].ico ? art(FEVER_FX[id].ico!) : ''}${FEVER_FX[id].text}</span></div>
      <span class="own">${art('seed')}×${state.bag[id]}</span></div>`;
  }).join('');
  // 組み合わせ：同じ日のスロットにそろうと起きること。たまたまそろったものから明かす
  const comboIds = Object.keys(COMBOS) as CharmId[];
  const found = comboIds.filter((id) => meta.discovered.includes(id));
  const combos = comboIds
    .map((id) => {
      if (!found.includes(id)) {
        return `<div class="dex-row combo-row locked"><span class="combo-pair"><span class="q">？</span><span class="fc-plus">＋</span><span class="q">？</span></span><div><b>？？？</b></div></div>`;
      }
      const need = Object.entries(COMBOS[id]!) as [SymbolId, number][];
      const pair = need.flatMap(([sym, n]) => Array.from({ length: n }, () => symHtml(sym))).join('<span class="fc-plus">＋</span>');
      return `<div class="dex-row combo-row${meta.discovered.includes(id) ? ' seen' : ''}"><span class="combo-pair">${pair}</span>
        <div><b>${art(id)} ${CHARMS[id].name}</b><span class="dex-desc">${CHARMS[id].desc(1)}</span></div></div>`;
    })
    .join('');
  // お守り（組み合わせは別の欄）
  const charms = CHARM_ORDER.filter((id) => !PAUSED_CHARMS.includes(id) && CHARMS[id].special?.kind !== 'combo').map((id) => {
    const c = CHARMS[id];
    if (!meta.discovered.includes(id) && !meta.seenCharms.includes(id) && !state.charms[id]) return secret(art(id));
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
      <div class="help-body">${tab === 'rules' ? rules : tab === 'symbols' ? symbols : tab === 'combos' ? `<p class="combo-lead">${L('3つそろった日だけ起きる', 'Works on the day all 3 appear')}</p><p class="combo-lead">${L(`見つけた ${found.length} / ${comboIds.length}`, `Found ${found.length} / ${comboIds.length}`)}</p>${combos}` : charms}</div>
      <button class="primary" id="help-close">${L('閉じる', 'Close')}</button>
    </div>`;
  el.overlay.classList.add('show');
  // チュートリアルをもう一度・演出控えめは、設定にまとめた（遊び方の画面には置かない）
  el.overlay.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => showHelp(b.dataset.tab as HelpTab, onClose)),
  );
  // 全体の流れ・絵柄の一枚絵をもう一度
  el.overlay.firstElementChild?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('#help-overview')) void showExplain(overviewCard());
    const row = t.closest<HTMLElement>('[data-ex-sym]');
    if (row) void showExplain(symbolCard(row.dataset.exSym as SymbolId, false));
  });
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
      ${ratingHtml()}
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
  $('title-start').addEventListener('click', async () => {
    unlockAudio();
    sfx.select();
    // 初めての人は、まずゲームの全体像を一枚絵で。それから準備画面を飛ばしてチュートリアル（ふつうの農家・出目も市も決まった3日間）
    if (!meta.tutorialDone && !loadRun()) {
      await explainOnce('ex:overview', overviewCard());
      hooks.startGame();
      return;
    }
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
  const adds = (Object.keys(ACHIEVE_ADDS) as (keyof typeof ACHIEVE_ADDS)[]).filter((id) => !isCutAdd(id)).map((id) => {
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
      .filter((id) => !CONFIG.rareOffers.includes(id) && !isAchieveAdd(id) && !isCutAdd(id))
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
/** 農家を選ぶ札：絵・名前・勝ち筋のひと言・最初に持っている物（増える絵柄・お守り・畑の品）と市に出やすい品 */
function farmerCards(): string {
  // 最初の袋に入るカードを全部（いつもの袋＋農家の増減）。農家で増えた絵柄は色つき
  const chips = (f: (typeof FARMERS)[number]) => [
    ...SYMBOL_ORDER.flatMap((sym) => {
      const n = Math.max(0, CONFIG.initialBag[sym] + (f.bag[sym] ?? 0));
      const d = f.bag[sym] ?? 0;
      return n > 0 ? [`<span class="fm-chip${d > 0 ? ' up' : d < 0 ? ' down' : ''}${SYMBOLS[sym].rarity === 'bad' ? ' bad' : ''}">${art(sym as ArtId)}<b>×${n}</b></span>`] : [];
    }),
    ...(Object.keys(f.charms) as CharmId[]).map((id) => `<span class="fm-chip up">${art(id as ArtId)}</span>`),
    ...f.stock.map((id) => `<span class="fm-chip up">${art(PLACE_ART[id])}</span>`),
  ].join('');
  return `<p class="fm-lead">${L('農家を選ぶ', 'Choose your farmer')}</p><div class="farmers">${FARMERS.map((f) => {
    // まだの農家は影と解放の条件だけ（どの難しさをクリアすると開くか）
    if (!farmerUnlocked(meta, f.id)) {
      return `<div class="farmer locked"><span class="fm-art silhouette">${art(f.art as ArtId)}</span>
        <span class="fm-text"><b>？？？</b><span class="fm-desc">${art('lock')} ${L(`「${DIFFICULTIES[f.unlockClear!].name}」をクリアで解放`, `Clear "${DIFFICULTIES[f.unlockClear!].name}" to unlock`)}</span></span></div>`;
    }
    const on = f.id === meta.farmer;
    const favor = f.favor.filter((id) => !isCutAdd(id) && !CONFIG.rareOffers.includes(id));
    return `<button class="farmer${on ? ' on' : ''}" data-farmer="${f.id}">
      <span class="fm-art">${art(f.art as ArtId)}</span>
      <span class="fm-text"><b>${f.name}</b><span class="fm-desc">${f.desc}</span>
        <span class="fm-row"><span class="fm-k">${L('袋', 'Bag')}</span><span class="fm-chips">${chips(f)}</span></span>
        ${favor.length || f.favorPlaces?.length ? `<span class="fm-row"><span class="fm-k">${L('市', 'Market')}</span><span class="fm-chips">${favor.map((id) => `<span class="fm-chip">${ADD_EMOJI[id]}</span>`).join('')}${(f.favorPlaces ?? []).map((id) => `<span class="fm-chip">${art(PLACE_ART[id])}</span>`).join('')}</span></span>` : ''}</span>
      ${on ? `<span class="tag-stamp">${L('この人', 'Chosen')}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

export function showPrep(): void {
  leaveTitle();
  // 農家を選ぶ形のときは、画面いっぱいの「開店準備」（難しさの画面と同じ作り）
  if (CONFIG.farmers) {
    showFarmerScreen();
    return;
  }
  const saved = loadRun();
  let confirmNew = false;
  const paint = () => {
    const cap = capacity(meta);
    const picked = meta.loadout.filter((id) => meta.unlockedAdds.includes(id));
    const used = loadoutCost(picked);
    const adds = (Object.keys(META.adds) as (keyof typeof META.adds)[])
      .filter((id) => !CONFIG.rareOffers.includes(id) && meta.unlockedAdds.includes(id) && !isCutAdd(id))
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
        ${CONFIG.farmers ? farmerCards() : `<div class="prep-cart${used > cap ? ' over' : ''}">
          <span class="cart-label">${L('荷台', 'Cart')}<b>${used} / ${cap}</b></span>
          <div class="cart-bed">${cart}</div>
          <span class="cart-wheel l"></span><span class="cart-wheel r"></span>
        </div>
        <div class="prep-shelf">${adds}</div>`}
        <div class="prep-actions">
          <button class="primary prep-go" id="prep-start">${saved && confirmNew ? L('次へ（続きは消えます）', 'Next (erases saved game)') : maxDifficulty(meta) > 0 ? `${L('難しさを選ぶ', 'Choose difficulty')} ▶` : L('はじめる！', 'Start!')}</button>
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
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-farmer]').forEach((b) =>
      b.addEventListener('click', () => {
        meta.farmer = b.dataset.farmer!;
        saveMeta(meta);
        sfx.select();
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
      // 難しさを解放していれば、難しさの画面へ（農家選びと分ける）
      if (maxDifficulty(meta) > 0) showDifficulty();
      else hooks.startGame();
    });
    $('prep-back').addEventListener('click', () => {
      sfx.cancel();
      showTitle();
    });
  };
  paint();
}

// ---- 難しさを選ぶ（画面いっぱい）----
// 参考：Slay the Spire のアセンション（左右で切り替え、前のレベルの縛りが積み重なる）、
// Balatro のステーク（色の付いたチップの列と大きな札）、Hades の罰の契約（縛りを絵と一言で）

const DIFF_COLOR = ['#5fae3c', '#3a86c8', '#e0a40a', '#e8743b', '#c93c2b', '#6a3d8f'];
/** レベルごとに加わる縛り（年貢の倍率は、そのレベルの値を1つだけ見せる） */
const DIFF_RULES: { ico: ArtId; text: string }[][] = [
  [],
  // 難しい1は年貢だけ（年貢の行で見せる）
  [],
  [{ ico: 'bargain', text: L('市の値段×1.3', 'Market prices ×1.3') }],
  [{ ico: 'crow', text: L('お邪魔が早く多く来る', 'Pests come earlier and more') }],
  [{ ico: 'coin', text: L('単品は×0.3でしか売れない', 'Singles sell for ×0.3') }],
  [{ ico: 'locust', text: L('増えるイナゴが袋にいる', 'Multiplying locusts in your bag') }],
];

let diffSwipeX = 0;
export function showDifficulty(): void {
  const max = maxDifficulty(meta);
  const farmer = FARMERS.find((f) => f.id === meta.farmer) ?? FARMERS[0];
  const paint = (dir = 0) => {
    const lv = meta.difficulty;
    const locked = lv > max;
    const color = DIFF_COLOR[lv];
    const rules = DIFF_RULES.slice(1, lv + 1).flatMap((list, k) => list.map((r) => ({ ...r, isNew: k + 1 === lv })));
    // 年貢は1行で、そのレベルの倍率を見せる（上がったレベルでは NEW）
    const tax = lv > 0 ? `<li class="dr-tax new">${art('bale')}<span>${L(`年貢 ×${difficultyTaxMult(lv).toFixed(1)}`, `Tax ×${difficultyTaxMult(lv).toFixed(1)}`)}</span><em>${lv === 1 ? 'NEW' : '↑'}</em></li>` : '';
    // 年貢のグラフ：クリアまでの7回。いちばん難しい段を天井にして、段を上げると棒が伸びて見えるように
    const plan = taxPlan(lv);
    const top = Math.max(...taxPlan(DIFFICULTIES.length - 1));
    const taxChart = `<div class="ds-tax" aria-label="${L('年貢の額', 'Tax amounts')}">
      <p class="dt-head">${art('bale')}<b>${L('年貢', 'Tax')}</b><span>${L(`${plan.length}回でクリア`, `${plan.length} to win`)}</span></p>
      <div class="dt-bars">${plan
        .map((v, i) => `<div class="dt-col"><b>${v}</b><span class="dt-track"><i class="dt-bar" style="height:${((v / top) * 100).toFixed(1)}%"></i></span><small>${i + 1}</small></div>`)
        .join('')}</div>
    </div>`;
    const cleared = meta.maxCleared >= lv;
    el.overlay.innerHTML = `
      <div class="diff-screen" data-sky="${lv}" style="--dc:${color}" role="dialog" aria-label="${L('難しさを選ぶ', 'Choose difficulty')}">
        <div class="ds-top">
          <button class="ds-back" id="diff-back" aria-label="${L('もどる', 'Back')}">←</button>
          <b class="ds-title">${L('難しさを選ぶ', 'Choose difficulty')}</b>
          <span class="ds-farmer">${art(farmer.art as ArtId)}${farmer.name}</span>
        </div>
        <div class="ds-chips">${DIFFICULTIES.map((d, k) => `<button class="ds-chip${k === lv ? ' on' : ''}${k > max ? ' locked' : ''}${meta.maxCleared >= k ? ' cleared' : ''}" data-lv="${k}" style="--c:${DIFF_COLOR[k]}" aria-label="${d.name}">${k > max ? art('lock') : k === 0 ? art('sprout') : `<b>${k}</b>`}</button>`).join('')}</div>
        <div class="ds-stage">
          <button class="ds-arrow l" id="diff-prev" ${lv === 0 ? 'disabled' : ''} aria-label="${L('やさしく', 'Easier')}">◀</button>
          <div class="ds-emblem${locked ? ' locked' : ''}${dir ? (dir > 0 ? ' in-r' : ' in-l') : ''}">
            <span class="ds-ring"></span>
            <span class="ds-num">${locked ? art('lock') : lv === 0 ? art('sprout') : lv}</span>
            ${cleared ? `<span class="ds-cleared">${art('trophy')}${L('クリア済み', 'Cleared')}</span>` : ''}
          </div>
          <button class="ds-arrow r" id="diff-next" ${lv >= DIFFICULTIES.length - 1 ? 'disabled' : ''} aria-label="${L('むずかしく', 'Harder')}">▶</button>
        </div>
        <h2 class="ds-name">${DIFFICULTIES[lv].name}</h2>
        <div class="ds-rules">
          ${lv === 0 ? `<p class="ds-plain">${art('sprout')} ${L('縛りなし。まずはここから', 'No extra rules. Start here')}</p>` : `<p class="ds-stack">${L('前の難しさの縛りも、すべて続く', 'All earlier rules stay in effect')}</p><ul>${tax}${rules.map((r) => `<li class="${r.isNew ? 'new' : ''}">${art(r.ico)}<span>${r.text}</span>${r.isNew ? `<em>${L('NEW', 'NEW')}</em>` : ''}</li>`).join('')}</ul>`}
        </div>
        ${taxChart}
        <div class="ds-foot">
          ${locked ? `<p class="ds-lock">${art('lock')} ${L(`「${DIFFICULTIES[lv - 1].name}」をクリアで解放`, `Clear "${DIFFICULTIES[lv - 1].name}" to unlock`)}</p>` : ''}
          <button class="primary ds-go" id="diff-start" ${locked ? 'disabled' : ''}>${L('はじめる！', 'Start!')}</button>
        </div>
      </div>`;
    el.overlay.classList.add('show');
    const go = (d: number) => {
      const next = Math.max(0, Math.min(DIFFICULTIES.length - 1, meta.difficulty + d));
      if (next === meta.difficulty) return;
      meta.difficulty = next;
      saveMeta(meta);
      sfx.select();
      paint(d);
    };
    $('diff-prev').addEventListener('click', () => go(-1));
    $('diff-next').addEventListener('click', () => go(1));
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-lv]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.lv) - meta.difficulty)));
    // 左右にはらって切り替え
    const screen = el.overlay.querySelector<HTMLElement>('.diff-screen')!;
    screen.addEventListener('pointerdown', (e) => (diffSwipeX = e.clientX));
    screen.addEventListener('pointerup', (e) => {
      const dx = e.clientX - diffSwipeX;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    });
    $('diff-back').addEventListener('click', () => {
      sfx.cancel();
      // 解放していない難しさのままでは戻さない
      if (meta.difficulty > max) {
        meta.difficulty = max;
        saveMeta(meta);
      }
      showPrep();
    });
    $('diff-start').addEventListener('click', () => {
      if (meta.difficulty > max) return;
      sfx.select();
      hooks.startGame();
    });
  };
  paint();
}

// ---- 開店準備：農家を選ぶ（画面いっぱい）----
// 参考：Slay the Spire のキャラクター選び（大きな絵・最初のデッキと持ち物・下に顔の列）、
// Balatro のデッキ選び（左右で切り替え、使えない物は鍵と条件）

const FARMER_COLOR: Record<string, string> = { basic: '#5fae3c', berry: '#e5688f', pumpkin: '#e8862c', rancher: '#a8743e', rain: '#3a86c8' };

export function showFarmerScreen(dir = 0): void {
  const saved = loadRun();
  let confirmNew = false;
  const paint = (d = 0) => {
    const list = FARMERS;
    let idx = Math.max(0, list.findIndex((f) => f.id === meta.farmer));
    const f = list[idx];
    const unlocked = farmerUnlocked(meta, f.id);
    const color = FARMER_COLOR[f.id] ?? '#5fae3c';
    const nextIsDiff = maxDifficulty(meta) > 0;
    // 最初の袋：いつもの袋＋農家の増減（増えた札は色つき、減った札は薄く）
    const bag = SYMBOL_ORDER.flatMap((sym) => {
      const n = Math.max(0, CONFIG.initialBag[sym] + (f.bag[sym] ?? 0));
      const dd = f.bag[sym] ?? 0;
      return n > 0 || dd < 0 ? [`<button class="fs-card" data-ex-sym="${sym}" aria-label="${SYMBOLS[sym].name}"><span class="fs-card-in${dd > 0 ? ' up' : dd < 0 ? ' down' : ''}${SYMBOLS[sym].rarity === 'bad' ? ' bad' : ''}">${art(sym as ArtId)}<b>×${n}</b>${dd ? `<em>${dd > 0 ? '+' : ''}${dd}</em>` : ''}</span></button>`] : [];
    }).join('');
    const extras = [
      ...(Object.keys(f.charms) as CharmId[]).map((id) => `<button class="fs-relic" data-ex-charm="${id}">${art(id as ArtId)}<b>${CHARMS[id].name}</b></button>`),
      ...f.stock.map((id) => `<button class="fs-relic" data-ex-place="${id}">${art(PLACE_ART[id])}<b>${PLACES[id].name}</b></button>`),
    ].join('');
    const favor = [
      ...f.favor.filter((id) => !isCutAdd(id) && !CONFIG.rareOffers.includes(id)).map((id) => `<span class="fs-mini">${ADD_EMOJI[id]}</span>`),
      ...(f.favorPlaces ?? []).map((id) => `<span class="fs-mini">${art(PLACE_ART[id])}</span>`),
    ].join('');
    el.overlay.innerHTML = `
      <div class="farm-screen" style="--fc:${color}" role="dialog" aria-label="${L('開店準備', 'Setup')}">
        <div class="ds-top">
          <button class="ds-back" id="prep-back" aria-label="${L('もどる', 'Back')}">←</button>
          <b class="ds-title">${art('bargain')} ${L('開店準備', 'Opening the stall')}</b>
          ${nextIsDiff ? `<span class="fs-step">1 / 2</span>` : '<span></span>'}
        </div>
        <p class="fs-lead">${L('農家を選ぶ', 'Choose your farmer')}</p>
        <div class="ds-stage">
          <button class="ds-arrow l" id="fs-prev" aria-label="${L('前の農家', 'Previous')}">◀</button>
          <div class="fs-portrait${unlocked ? '' : ' locked'}${d ? (d > 0 ? ' in-r' : ' in-l') : ''}">
            <span class="fs-sun"></span>
            <span class="fs-art">${art(f.art as ArtId)}</span>
          </div>
          <button class="ds-arrow r" id="fs-next" aria-label="${L('次の農家', 'Next')}">▶</button>
        </div>
        <h2 class="ds-name">${unlocked ? f.name : '？？？'}</h2>
        ${unlocked ? `<p class="fs-desc">${f.desc}</p>` : `<p class="fs-desc locked">${art('lock')} ${L(`「${DIFFICULTIES[f.unlockClear!].name}」をクリアで解放`, `Clear "${DIFFICULTIES[f.unlockClear!].name}" to unlock`)}</p>`}
        ${unlocked ? `<div class="ds-rules fs-info">
          <p class="fs-tap">${L('札をタップで説明', 'Tap a card for details')}</p>
          <p class="fs-k">${L('最初の袋', 'Starting bag')}</p>
          <div class="fs-bag">${bag}</div>
          ${extras ? `<p class="fs-k">${L('持ってくる物', 'Brings')}</p><div class="fs-relics">${extras}</div>` : ''}
          ${favor ? `<p class="fs-k">${L('市に出やすい', 'Often at market')}</p><div class="fs-favor">${favor}</div>` : ''}
        </div>` : `<div class="ds-rules fs-info fs-info-locked">${art('lock')}</div>`}
        <div class="fs-roster">${list.map((x) => `<button class="fs-face${x.id === f.id ? ' on' : ''}${farmerUnlocked(meta, x.id) ? '' : ' locked'}" data-farmer="${x.id}" style="--c:${FARMER_COLOR[x.id] ?? '#5fae3c'}" aria-label="${farmerUnlocked(meta, x.id) ? x.name : '？？？'}">${farmerUnlocked(meta, x.id) ? art(x.art as ArtId) : art('lock')}</button>`).join('')}</div>
        <div class="ds-foot">
          <button class="primary ds-go" id="prep-start" ${unlocked ? '' : 'disabled'}>${saved && confirmNew ? L('次へ（続きは消えます）', 'Next (erases saved game)') : nextIsDiff ? `${L('難しさを選ぶ', 'Choose difficulty')} ▶` : L('はじめる！', 'Start!')}</button>
        </div>
      </div>`;
    el.overlay.classList.add('show');
    const pick = (step: number) => {
      idx = (idx + step + list.length) % list.length;
      meta.farmer = list[idx].id;
      saveMeta(meta);
      sfx.select();
      paint(step);
    };
    // 最初の袋の札・持ってくる物をタップすると、その説明（一枚絵）
    el.overlay.querySelectorAll<HTMLElement>('[data-ex-sym]').forEach((b) => b.addEventListener('click', () => void showExplain(symbolCard(b.dataset.exSym as SymbolId, false))));
    el.overlay.querySelectorAll<HTMLElement>('[data-ex-charm]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.exCharm as CharmId;
        void showExplain(`<p class="ex-kicker">${L('お守り', 'Charm')}</p><h2 class="ex-title">${CHARMS[id].name}</h2><div class="ex-row"><span class="ex-art">${art(id as ArtId)}</span></div><p class="ex-line">${CHARMS[id].desc(1)}</p>`);
      }),
    );
    el.overlay.querySelectorAll<HTMLElement>('[data-ex-place]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.exPlace as keyof typeof PLACES;
        void showExplain(`<p class="ex-kicker">${L('畑の品', 'Farm item')}</p><h2 class="ex-title">${PLACES[id].name}</h2><div class="ex-row"><span class="ex-art">${art(PLACE_ART[id])}</span></div><p class="ex-line">${PLACES[id].desc}</p>`);
      }),
    );
    $('fs-prev').addEventListener('click', () => pick(-1));
    $('fs-next').addEventListener('click', () => pick(1));
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-farmer]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = list.findIndex((x) => x.id === b.dataset.farmer);
        if (k !== idx) pick(k - idx);
      }),
    );
    const screen = el.overlay.querySelector<HTMLElement>('.farm-screen')!;
    screen.addEventListener('pointerdown', (e) => (diffSwipeX = e.clientX));
    screen.addEventListener('pointerup', (e) => {
      const dx = e.clientX - diffSwipeX;
      if (Math.abs(dx) > 60 && !(e.target as HTMLElement).closest('.fs-roster, .fs-info')) pick(dx < 0 ? 1 : -1);
    });
    $('prep-back').addEventListener('click', () => {
      sfx.cancel();
      showTitle();
    });
    $('prep-start').addEventListener('click', () => {
      if (!farmerUnlocked(meta, meta.farmer)) return;
      if (saved && !confirmNew) {
        confirmNew = true;
        sfx.error();
        paint();
        return;
      }
      sfx.select();
      if (nextIsDiff) showDifficulty();
      else hooks.startGame();
    });
  };
  paint(dir);
}
