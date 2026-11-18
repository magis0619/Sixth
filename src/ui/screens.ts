// 画面：結果・遊び方・クリア・タイトル・解放・準備

import { L } from '../i18n.ts';
import {
  ACHIEVE_ADDS, PLACES, CHARM_ORDER, FARMERS, COMBOS, CUT, isCutAdd, type CharmId, type SymbolId, PAUSED_CHARMS, CHARM_TIER_NAMES, CHARMS, CONFIG, DIFFICULTIES, FEEDBACK_URL, META, SHARE_URL, SYMBOL_ORDER, SYMBOLS, THUNDER_LINES, UPGRADES,
  UPGRADE_SYMBOL, type FarmerPerk,
} from '../config.ts';
import { difficultyTaxMult, nextTax, placePrice, rateRun, taxPlan } from '../game.ts';
import {
  awardPoints, buyComboHint, buyLineFx, buyMastery, capacity, masteryPrice, nextComboHint, farmerUnlocked, isAchieveAdd, loadoutCost, maxDifficulty, recordRun, saveMeta, toggleLoadout, unlockAdd, unlockCharm,
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
import { activeLineFx, playLineFx } from './linefx.ts';
import { explainOnce, overviewCard, showExplain, symbolCard } from './explain.ts';

/** 結果画面。cleared=true はクリア後にここで終えたとき */

/** ランクの境目（rateRun と同じ）。次のランクまでの点の差を見せるため */
const RANK_STEPS: [string, number][] = [['S', 85], ['A', 70], ['B', 55], ['C', 40]];

/** 一番稼いだ日（stats.earnedByDay から） */
function bestDay(): { day: number; gold: number } {
  const days = state.stats.earnedByDay;
  let day = 0;
  days.forEach((v, d) => {
    if ((v ?? 0) > (days[day] ?? 0)) day = d;
  });
  return { day, gold: days[day] ?? 0 };
}

/**
 * 結果画面の中身（上から A 結果 → B 総合評価 → C 経営成績 → D ハイライト → E アドバイス）。
 * 点数・ランク・年貢・ポイントの計算はしない（rateRun・nextTax・awardPoints の値を並べるだけ）
 */
/** 数字のあとの単位（細く小さめ） */
const u = (t: string) => `<i class="u">${t}</i>`;

function resultBody(kind: 'fail' | 'clear' | 'endless', opts: { taxAmount: number; isNew: boolean; earned: number; newly: string[]; total?: boolean }): string {
  const st = state.stats;
  const r = rateRun(state);
  const short = Math.max(0, opts.taxAmount - state.gold);
  const failed = kind === 'fail' || kind === 'endless';
  // A：プレイ結果
  const badge = kind === 'clear' ? `${art('trophy')}<b>${L('クリア', 'Cleared')}</b>` : kind === 'endless' ? `${art('trophy')}<b>${L('クリア済み', 'Cleared')}</b>` : `${art('warn')}<b>${L('失敗', 'Failed')}</b>`;
  const title = kind === 'clear' ? L('クリア！', 'You win!') : kind === 'endless' ? L('エンドレス終了', 'Endless over') : L('年貢が払えなかった…', "Couldn't pay the tax…");
  const money = failed
    ? `<div class="rs-money">
        <p><span>${art('bale')}${L('必要な年貢', 'Tax due')}</span><b>${opts.taxAmount}</b></p>
        <p><span>${art('coin')}${L('持っていたお金', 'Your gold')}</span><b>${state.gold}</b></p>
        <p class="neg"><span>${art('warn')}${L('足りなかった', 'Short by')}</span><b>−${short}</b></p>
      </div>`
    : `<div class="rs-money">
        <p><span>${art('coin')}${L('稼いだ合計', 'Total earned')}</span><b>${st.totalEarned}</b></p>
        <p><span>${art('bale')}${L('納めた年貢', 'Taxes paid')}</span><b>${st.taxTotal ?? 0}</b></p>
        <p class="pos"><span>${art('sparkle')}${L('手元に残った', 'Left over')}</span><b>${state.gold}</b></p>
      </div>`;
  const result = `<section class="rs-sec rs-result ${failed ? 'is-fail' : 'is-clear'}">
      <p class="rs-badge">${badge}</p>
      <h2 class="rs-title">${title}</h2>
      <div class="rs-pills">
        <span>${art('calendar')}${L(`<b>${state.day}${u('日目')}</b>`, `Day <b>${state.day}</b>`)}${opts.isNew ? `<em>${L('最高', 'Best')}</em>` : ''}</span>
        <span>${art('bale')}${L(`年貢 <b>${state.taxesPaid}${u(`/${CONFIG.winTaxes}回`)}</b>`, `Tax <b>${state.taxesPaid}</b>/${CONFIG.winTaxes}`)}</span>
      </div>
      ${money}
    </section>`;
  // 1回も年貢を納めずに終わったとき（最初の週など）は、評価の数字が育っていないので出さない
  const showRating = r.score > 0 && state.taxesPaid > 0;
  // B：総合評価（腕前の平均 × 進み具合 ＝ 総合）
  const skill = Math.round(r.parts.reduce((n, p) => n + p.value, 0) / r.parts.length);
  const next = RANK_STEPS.filter(([, at]) => at > r.score).pop();
  const total = `<section class="rs-sec">
      <h3 class="rs-h">${L('総合評価', 'Overall')}</h3>
      <div class="rs-total rank-${r.rank}">
        <div class="rs-stamp"><b>${r.rank}</b><span>${r.score}${L('点', 'pts')}</span></div>
        <div class="rs-calc">
          <p><span>${L('腕前（4つの平均）', 'Skill (avg of 4)')}</span><b>${skill}${L('点', '')}</b></p>
          <p><span>${L(`進み具合 ${state.taxesPaid}/${CONFIG.winTaxes}`, `Progress ${state.taxesPaid}/${CONFIG.winTaxes}`)}</span><b>×${Math.round((0.2 + 0.008 * r.progress) * 100)}%</b></p>
          <p class="eq"><span>${L('総合', 'Total')}</span><b>${r.score}${L('点', '')}</b></p>
          ${next ? `<p class="next">${L(`${next[0]}まで あと${next[1] - r.score}点`, `${next[1] - r.score} more for ${next[0]}`)}</p>` : ''}
        </div>
      </div>
    </section>`;
  // C：経営成績（4つを縦に。根拠の数字を文で）
  const sold = st.cropsSold;
  const lineCrops = st.lineCrops ?? 0;
  const manual = st.manualTotal ?? 0;
  const ratio = st.taxTotal ? (st.totalEarned / st.taxTotal).toFixed(1) : null;
  const why: Record<string, [ArtId, string]> = {
    line: ['tomato', sold ? L(`${sold}個中 ${lineCrops}個を列で`, `${lineCrops} of ${sold} in lines`) : L('まだ売っていない', 'Nothing sold yet')],
    use: ['seed', L(`${manual}回中 ${st.expired}回が使わず消えた`, `${st.expired} of ${manual} went unused`)],
    guard: ['crow', st.cropsEaten ? L(`${st.cropsEaten}個 取られた`, `${st.cropsEaten} lost`) : L('1つも取られなかった', 'None lost')],
    margin: ['coin', ratio ? L(`年貢の${ratio}倍 稼いだ（2.5倍で満点）`, `Earned ${ratio}× the tax (2.5× is full marks)`) : L('まだ年貢を納めていない', 'No tax paid yet')],
  };
  const low = Math.min(...r.parts.map((p) => p.value));
  const parts = `<section class="rs-sec">
      <h3 class="rs-h">${L('経営成績', 'Farm report')}</h3>
      ${r.parts
        .map((p) => `<div class="rs-part${p.value === low && low < 100 ? ' low' : ''}"><p><span>${art(why[p.key][0])}${p.label}</span><b>${p.value}<small>${L('点', '')}</small></b></p><i><u style="width:${p.value}%"></u></i><small>${why[p.key][1]}</small></div>`)
        .join('')}
    </section>`;
  // D：今回のハイライト
  const best = bestDay();
  const tile = (ico: ArtId, label: string, value: string) => `<div>${art(ico)}<small>${label}</small><b>${value}</b></div>`;
  const highlights = `<section class="rs-sec">
      <h3 class="rs-h">${L('今回のハイライト', 'Highlights')}</h3>
      <div class="rs-hi">
        ${tile('coin', L('一番稼いだ日', 'Best day'), best.gold ? L(`${best.day}${u('日目')} +${best.gold}`, `Day ${best.day} +${best.gold}`) : '—')}
        ${tile('tomato', L('列で売った', 'Lines sold'), L(`${st.lineHarvests}${u('回')}`, `${st.lineHarvests}`))}
        ${tile('crow', L('取られた作物', 'Crops lost'), L(`${st.cropsEaten}${u('個')}`, `${st.cropsEaten}`))}
        ${tile('bale', L('年貢を納めた', 'Taxes paid'), L(`${state.taxesPaid}${u('回')}`, `${state.taxesPaid}`))}
      </div>
    </section>`;
  // E：次へのアドバイス（このプレイの数字から、最大3つ）
  const tips: [ArtId, string, string][] = [];
  const add = (t: [ArtId, string, string]) => tips.length < 3 && !tips.some((x) => x[1] === t[1]) && tips.push(t);
  const scare = placePrice(state, 'scarecrow') ?? PLACES.scarecrow.price ?? 20;
  const tipFor: Record<string, () => [ArtId, string, string] | null> = {
    line: () => (sold - lineCrops > 0 ? ['tomato', L(`単品で${sold - lineCrops}個売った`, `Sold ${sold - lineCrops} as singles`), L('3つ並べて×1.3、4つで×1.5', '3 in a row ×1.3, 4 ×1.5')] : null),
    use: () => (st.expired > 0 ? ['seed', L(`出目が${st.expired}回消えた`, `${st.expired} reels went unused`), L('種が少ないと、雨・太陽が余る', 'Few seeds leave rain and sun idle')] : null),
    guard: () => (st.cropsEaten > 0 ? ['crow', L(`作物を${st.cropsEaten}個取られた`, `Lost ${st.cropsEaten} crops`), L(`かかし（${scare}）で周り8マスを守れる`, `A scarecrow (${scare}) guards 8 plots`)] : null),
    margin: () => (ratio ? ['coin', L(`稼ぎは年貢の${ratio}倍`, `Earned ${ratio}× the tax`), L('長い列・堆肥で売値を上げよう', 'Long lines and compost raise prices')] : null),
  };
  // 負けたときは不足額を先に、そのあと一番低い成績から順に
  if (failed && short > 0) add(['coin', L(`あと${short}足りなかった`, `${short} short`), L(`最後の週に1日+${Math.ceil(short / CONFIG.taxPeriod)}で届いた`, `+${Math.ceil(short / CONFIG.taxPeriod)} a day in the last week would have done it`)]);
  [...r.parts].sort((x, y) => x.value - y.value).forEach((p) => p.value < 90 && tipFor[p.key]() && add(tipFor[p.key]()!));
  if (st.lineHarvests === 0) add(['tomato', L('列で売っていない', 'No lines sold'), L('3つ並べて売ると×1.3', 'Sell 3 in a line: ×1.3')]);
  if (!tips.length) add(['sparkle', L('同じ作物の列はさらに×1.3', 'Same-crop lines: ×1.3 more'), L('1種類にそろえると高く売れる', 'Stick to one crop for higher prices')]);
  const advice = `<section class="rs-sec rs-tips">
      <h3 class="rs-h">${L('次へのアドバイス', 'Next time')}</h3>
      ${tips.map(([ico, head, sub]) => `<p>${art(ico)}<span><b>${head}</b><small>${sub}</small></span></p>`).join('')}
    </section>`;
  const points = `<p class="rs-pt">${art('sprout')}<b>+${opts.earned}pt</b>${opts.total === false ? '' : `<span>${L('計', 'Total')} ${meta.points}pt</span>`}</p>
    ${opts.newly.length ? `<p class="rs-newly">${art('sparkle')}${L('解放', 'Unlocked')}：${opts.newly.map((x) => `<b>${x}</b>`).join('')}</p>` : ''}
    ${FEEDBACK_URL ? `<p class="rs-feedback"><a href="${FEEDBACK_URL}" target="_blank" rel="noopener">${art('mail')}${L('感想を送る', 'Send feedback')}</a></p>` : ''}`;
  return `<div class="rs">${result}${showRating ? total + parts : ''}${highlights}${advice}${points}</div>`;
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
  const kind = endedAfterClear ? 'clear' : state.cleared ? 'endless' : 'fail';
  el.overlay.innerHTML = `
    <div class="modal over-modal result-modal" role="dialog" aria-label="${L('結果', 'Result')}">
      ${resultBody(kind, { taxAmount: t.amount, isNew, earned, newly })}
      <div class="rs-foot">
        <button class="rs-main" id="retry" disabled>${L('もう一度', 'Play again')}</button>
        <div class="rs-sub">
          <button id="restart" disabled>${L('タイトルへ', 'Title')}</button>
          <button id="share">${typeof navigator.share === 'function' ? `${art('share')}${L('シェア', 'Share')}` : `${art('copy')}${L('コピー', 'Copy')}`}</button>
        </div>
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
/** ヒントを買った組み合わせ：最初の絵柄だけ見せ、残りは「？」 */
export function comboHintPair(id: CharmId): string {
  const syms = (Object.entries(COMBOS[id]!) as [SymbolId, number][]).flatMap(([sym, n]) => Array.from({ length: n }, () => sym));
  return syms.map((sym, k) => (k === 0 ? symHtml(sym) : '<span class="q">？</span>')).join('<span class="fc-plus">＋</span>');
}

export function showHelp(tab: HelpTab = 'rules', onClose?: () => void): void {
  const tabs: [HelpTab, string][] = [['rules', L('遊び方', 'How to play')], ['symbols', L('絵柄', 'Symbols')], ['combos', L('組み合わせ', 'Combos')], ['charms', L('お守り', 'Charms')]];
  const rules = `
    <button class="set-row help-overview" id="help-overview"><span>${art('calendar')} ${L('全体の流れを一枚絵で見る', 'See the whole game in one picture')}</span></button>
    <h4 class="help-k">${L('1日', 'A day')}</h4>
    <ul class="help-list icons">
      <li>${art('calendar')}<span>${L('1回転＝1日', 'One spin = one day')}</span></li>
      <li>${art('seed')}<span>${L('光る出目 → マスをタップ', 'Glowing reel → tap a plot')}</span></li>
    </ul>
    <h4 class="help-k">${L('育てる', 'Grow')}</h4>
    <ul class="help-list icons">
      <li>${art('rain')}<span>${L('雨＝縦横十字', 'Rain = cross')}</span></li>
      <li>${art('sun')}<span>${L('太陽＝縦一列', 'Sun = column')}</span></li>
      <li>${art('bee')}<span>${L('蜂＝斜め', 'Bee = diagonals')}</span></li>
      <li>${art('moon')}<span>${L('満月＝畑全体', 'Full moon = whole field')}</span></li>
    </ul>
    <h4 class="help-k">${L('売る', 'Sell')}</h4>
    <ul class="help-list icons">
      <li>${art('tomato')}${art('tomato')}${art('tomato')}<span>${L('3つ並べて売る＝×1.3', '3 in a row = ×1.3')}</span></li>
      <li>${art('tomato')}${art('tomato')}${art('tomato')}${art('tomato')}<span>${L(`4つ＝×${Math.round(CONFIG.lineMult * CONFIG.longLineMult[4] * 10) / 10}`, `4 in a row = ×${Math.round(CONFIG.lineMult * CONFIG.longLineMult[4] * 10) / 10}`)}</span></li>
      <li>${art('tomato')}${art('tomato')}${art('tomato')}${art('tomato')}${art('tomato')}<span>${L(`5つ＝×${Math.round(CONFIG.lineMult * CONFIG.longLineMult[5] * 10) / 10}`, `5 in a row = ×${Math.round(CONFIG.lineMult * CONFIG.longLineMult[5] * 10) / 10}`)}</span></li>
      <li>${art('tomato')}<span>${L('並ばない単品＝半値', 'Singles = half price')}</span></li>
      <li>${art('flame')}<span>${L('同じ絵柄3つ＝フィーバー', '3 of a symbol = FEVER')}</span></li>
    </ul>
    <h4 class="help-k">${L('年貢', 'Tax')}</h4>
    <ul class="help-list icons">
      <li>${art('bale')}<span>${L(`${CONFIG.taxPeriod}日ごとに年貢`, `Tax every ${CONFIG.taxPeriod} days`)}</span></li>
      <li>${art('warn')}<span>${L('払えないと終わり', "Can't pay = game over")}</span></li>
      <li>${art('trophy')}<span>${L(`${CONFIG.winTaxes}回納めたらクリア`, `Pay ${CONFIG.winTaxes} times to win`)}</span></li>
      <li>${art('gift')}<span>${L('年貢のあと お守りを1つ', 'After tax: pick a charm')}</span></li>
      <li>${art('crow')}<span>${L('年貢のあと お邪魔が増える', 'After tax: pests join')}</span></li>
    </ul>
    <h4 class="help-k">${L('市と畑の品', 'Market & farm items')}</h4>
    <ul class="help-list icons">
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
  const symIds = SYMBOL_ORDER.filter((id) => !CUT.symbols.includes(id) || state.bag[id] > 0);
  const symSeen = symIds.filter((id) => meta.seenSymbols.includes(id) || state.bag[id] > 0).length;
  // 組み合わせ：同じ日のスロットにそろうと起きること。たまたまそろったものから明かす
  const comboIds = Object.keys(COMBOS) as CharmId[];
  const found = comboIds.filter((id) => meta.discovered.includes(id));
  const combos = comboIds
    .map((id) => {
      if (!found.includes(id) && meta.comboHints.includes(id)) {
        return `<div class="dex-row combo-row hinted"><span class="combo-pair">${comboHintPair(id)}</span><div><b>？？？</b><span class="dex-desc">${L('ヒント：この絵柄から', 'Hint: starts with this')}</span></div></div>`;
      }
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
  const charmIds = CHARM_ORDER.filter((id) => !PAUSED_CHARMS.includes(id) && CHARMS[id].special?.kind !== 'combo');
  const charmSeen = charmIds.filter((id) => meta.discovered.includes(id) || meta.seenCharms.includes(id) || state.charms[id]).length;
  const foundLine = (n: number, all: number) => `<p class="help-found">${L('見つけた', 'Found')} <b>${n}</b> / ${all}</p>`;
  const charms = charmIds.map((id) => {
    const c = CHARMS[id];
    if (!meta.discovered.includes(id) && !meta.seenCharms.includes(id) && !state.charms[id]) return secret(art(id));
    const locked = id in META.charmUnlock && !meta.unlockedCharms.includes(id);
    return `<div class="dex-row tier-${c.tier}${locked ? ' needs-unlock' : ''}"><span class="e">${art(id)}</span>
      <div><b>${c.name}</b> <span class="tag-k">${CHARM_TIER_NAMES[c.tier]}</span>
      <small>${c.desc(1)}${Number.isFinite(c.max) ? L(`（最大${c.max}個）`, ` (max ${c.max})`) : ''}</small>
      ${locked ? `<small class="fv">${art('lock')} ${L('解放', 'Unlock')} ${META.charmUnlock[id]}pt</small>` : ''}</div>
      <span class="own">${state.charms[id] ? L(`所持${state.charms[id]}`, `Own ${state.charms[id]}`) : ''}</span></div>`;
  }).join('');
  el.overlay.innerHTML = `
    <div class="modal help-modal" role="dialog" aria-label="${L('遊び方と図鑑', 'How to play')}">
      <div class="help-tabs">${tabs.map(([k, label]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
      <div class="help-body">${tab === 'rules' ? rules : tab === 'symbols' ? `${foundLine(symSeen, symIds.length)}${symbols}` : tab === 'combos' ? `${foundLine(found.length, comboIds.length)}<p class="combo-lead">${L('3つそろった日だけ起きる', 'Works on the day all 3 appear')}</p>${combos}` : `${foundLine(charmSeen, charmIds.length)}${charms}`}</div>
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
    <div class="modal clear-modal result-modal" role="dialog" aria-label="${L('クリア', 'Win')}">
      ${resultBody('clear', { taxAmount: 0, isNew: false, earned: META.clearBonus, newly: [], total: false })}
      <div class="rs-foot">
        <button class="rs-main" id="clear-continue" disabled>${L('エンドレスへ', 'Keep going (endless)')}</button>
        <div class="rs-sub one"><button id="clear-end" disabled>${L('ここで終える', 'Finish here')}</button></div>
      </div>
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
        <button class="icon-pill" id="title-help">${art('question')}<span>${L('遊び方', 'How to play')}</span></button>
        <button class="icon-pill" id="title-records">${art('calendar')}<span>${L('記録', 'Records')}</span></button>
        <button class="icon-pill" id="title-settings">${art('gear')}<span>${L('設定', 'Settings')}</span></button>
        <button class="icon-pill" id="title-unlock">${art('lock')}<span>${L('解放', 'Unlocks')}</span><em class="pt-tag">${meta.points} pt</em></button>
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
        ${row(art('calendar'), L('最高到達', 'Best run'), best.day ? L(`${best.day}${u('日目')}（年貢${best.taxes}${u('回')}）`, `Day ${best.day} (${best.taxes} taxes)`) : '—')}
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

/** 図鑑：達成で解放されるもの。未達成は影絵と短いヒント。[カードのhtml, 達成した数, 全部の数] */
export function collection(): [string, number, number] {
  const items: [boolean, string][] = [];
  const item = (done: boolean, ico: string, name: string, hint: string) =>
    items.push([done, `<div class="ul-ach${done ? ' done' : ''}"><span class="ico${done ? '' : ' silhouette'}">${ico}</span><span class="text"><b>${done ? name : '？？？'}</b><span class="effect">${done ? L('解放した', 'Unlocked') : hint}</span></span>${done ? `<span class="ul-badge">✓</span>` : ''}</div>`]);
  CHARM_ORDER.filter((id) => CHARMS[id].special && !PAUSED_CHARMS.includes(id)).forEach((id) => item(meta.discovered.includes(id), art(id), CHARMS[id].name, CHARMS[id].special!.hint));
  (Object.keys(ACHIEVE_ADDS) as (keyof typeof ACHIEVE_ADDS)[]).filter((id) => !isCutAdd(id)).forEach((id) => {
    const hint = id === 'addThunder' ? `${L('列で売る', 'Lines sold')} ${Math.min(meta.lines, THUNDER_LINES)}/${THUNDER_LINES}` : ACHIEVE_ADDS[id]!.hint;
    item(meta.unlockedAdds.includes(id), ADD_EMOJI[id], shortName(id), hint);
  });
  DIFFICULTIES.slice(1).forEach((d, k) => item(maxDifficulty(meta) >= k + 1, art('skull'), d.name, L(`${DIFFICULTIES[k].name}をクリア`, `Clear ${DIFFICULTIES[k].name}`)));
  item(meta.skins.includes('gold'), art('coin'), L('金色のスロット', 'Golden slot machine'), L('初めてクリアすると…？', 'Clear the game once…?'));
  // 達成したものは後ろへ（まだのものと、その条件を先に）
  const sorted = [...items.filter((x) => !x[0]), ...items.filter((x) => x[0])];
  return [sorted.map((x) => x[1]).join(''), items.filter((x) => x[0]).length, items.length];
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
    // ポイントで解放する品：まだの物は「絵・名前・効き目1行・値札」の行、解放した物は小さな札にまとめる
    type Buy = { attr: string; ico: string; name: string; effect: string; price: number; done: boolean };
    const row = (it: Buy) => {
      const can = meta.points >= it.price;
      return `<button class="ul-item${can ? ' affordable' : ''}" ${it.attr} ${can ? '' : 'disabled'}><span class="ico">${it.ico}</span>
        <span class="text"><b>${it.name}</b><span class="effect">${it.effect}</span></span>
        <span class="cost">${can ? '' : art('lock')}<b>${it.price}</b><small>pt</small></span></button>`;
    };
    const section = (ico: ArtId, title: string, note: string, list: Buy[]) => {
      const todo = list.filter((it) => !it.done);
      const done = list.filter((it) => it.done);
      return `<section class="ul-sec"><h3>${art(ico)}<span>${title}</span><span class="cat-note">${note}</span><span class="ul-count">${done.length}/${list.length}</span></h3>
        ${todo.length ? `<div class="ul-list">${todo.map(row).join('')}</div>` : `<p class="ul-all">${art('trophy')} ${L('全部解放した', 'All unlocked')}</p>`}
        ${done.length ? `<div class="ul-done"><span class="ul-done-k">${L('解放済み', 'Unlocked')}</span>${done.map((it) => `<span class="ul-chip">${it.ico}<b>${it.name}</b></span>`).join('')}</div>` : ''}
      </section>`;
    };
    const adds: Buy[] = (Object.keys(META.adds) as (keyof typeof META.adds)[])
      .filter((id) => !CONFIG.rareOffers.includes(id) && !isAchieveAdd(id) && !isCutAdd(id))
      .map((id) => ({ attr: `data-unlock="${id}"`, ico: ADD_EMOJI[id], name: shortName(id), effect: SYMBOLS[UPGRADE_SYMBOL[id]!.symbol].desc, price: META.adds[id].unlock, done: meta.unlockedAdds.includes(id) }));
    const charms: Buy[] = (Object.keys(META.charmUnlock) as (keyof typeof META.charmUnlock)[])
      .map((id) => ({ attr: `data-charm="${id}"`, ico: art(id as ArtId), name: CHARMS[id].name, effect: CHARMS[id].desc(1), price: META.charmUnlock[id]!, done: meta.unlockedCharms.includes(id) }));
    // 農家の腕前：解放した農家ごとに次の段（上げきった農家は小さな札）
    const masteries: Buy[] = FARMERS.filter((f) => farmerUnlocked(meta, f.id) && f.mastery?.length).map((f) => {
      const lv = meta.mastery[f.id] ?? 0;
      const max = f.mastery!.length;
      const price = masteryPrice(meta, f.id);
      return { attr: `data-mastery="${f.id}"`, ico: art(f.art as ArtId), name: `${f.name} ${masteryStars(lv, max)}`, effect: price === null ? L('上げきった', 'Maxed') : L(`段${lv + 1}：${perkText(f.mastery![lv])}`, `Lv${lv + 1}: ${perkText(f.mastery![lv])}`), price: price ?? 0, done: price === null };
    });
    // 組み合わせのヒント：まだの物があれば1行（買うと、まだの組み合わせの絵柄を1つ見せる）
    const comboAll = Object.keys(COMBOS).length;
    const hintNext = nextComboHint(meta);
    const hintRow = hintNext
      ? row({ attr: 'data-hint', ico: art('question'), name: L('組み合わせのヒント', 'Combo hint'), effect: L(`まだの組み合わせの絵柄を1つ見せる（残り${comboAll - meta.discovered.filter((id) => id in COMBOS).length - meta.comboHints.length}）`, `Reveal one symbol of an unfound combo`), price: META.comboHintPrice, done: false })
      : '';
    const hinted = meta.comboHints.filter((id) => !meta.discovered.includes(id));
    // 列の演出（見た目だけ）：まだの物は値札の行、解放した物は「使う」を選ぶ札
    const fxRows = META.lineFx.filter((f) => !meta.lineFx.includes(f.id)).map((f) => row({ attr: `data-linefx="${f.id}"`, ico: art(f.ico as ArtId), name: f.name, effect: f.desc, price: f.price, done: false })).join('');
    const fxOwned = META.lineFx.filter((f) => meta.lineFx.includes(f.id));
    const fxPick = (id: string, ico: string, label: string) => `<button class="ul-pick${meta.lineFxOn === id ? ' on' : ''}" data-fxon="${id}">${ico}<b>${label}</b></button>`;
    const fxSec = `<section class="ul-sec"><h3>${art('sparkle')}<span>${L('列の演出', 'Line effects')}</span><span class="cat-note">${L('見た目だけ', 'Looks only')}</span><span class="ul-count">${fxOwned.length}/${META.lineFx.length}</span></h3>
      ${fxRows ? `<div class="ul-list">${fxRows}</div>` : `<p class="ul-all">${art('trophy')} ${L('全部解放した', 'All unlocked')}</p>`}
      ${fxOwned.length ? `<p class="ul-done-k ul-picks-k">${L('使う演出（タップで見られる）', 'Use (tap to preview)')}</p><div class="ul-picks">${fxPick('', art('puff'), L('なし', 'None'))}${fxOwned.map((f) => fxPick(f.id, art(f.ico as ArtId), f.name)).join('')}${fxOwned.length >= 2 ? fxPick('random', art('question'), L('おまかせ', 'Random')) : ''}</div>` : ''}
    </section>`;
    const [ach, achDone, achAll] = collection();
    setModal('unlock', 'prep-modal unlock-modal', L('強化の解放', 'Unlocks'), `
        <div class="ul-head"><h2>${art('lock')} ${L('解放', 'Unlocks')}</h2><span class="ul-pts"><small>${L('所持', 'Have')}</small><b>${meta.points}</b><small>pt</small></span></div>
        <div class="ul-body">
          ${section('seed', L('絵柄', 'Symbols'), L('市に並ぶ', 'Appear at market'), adds)}
          ${section('sunBlessing', L('お守り', 'Charms'), L('年貢のあとに出る', 'Offered after tax'), charms)}
          ${fxSec}
          ${masteries.length ? section('farmMaster', L('農家の腕前', 'Farmer mastery'), L('始めに足される', 'Added at start'), masteries) : ''}
          <section class="ul-sec"><h3>${art('question')}<span>${L('組み合わせのヒント', 'Combo hints')}</span><span class="ul-count">${meta.comboHints.length}</span></h3>
            ${hintRow ? `<div class="ul-list">${hintRow}</div>` : `<p class="ul-all">${art('trophy')} ${L('全部わかった', 'All known')}</p>`}
            ${hinted.length ? `<div class="ul-done"><span class="ul-done-k">${L('ヒント', 'Hints')}</span>${hinted.map((id) => `<span class="ul-chip">${comboHintPair(id)}</span>`).join('')}</div>` : ''}
          </section>
          <section class="ul-sec"><h3>${art('star')}<span>${L('達成で解放', 'Achievements')}</span><span class="ul-count">${achDone}/${achAll}</span></h3><div class="ul-achs">${ach}</div></section>
          ${meta.skins.length ? `<section class="ul-sec"><h3>${art('artisan')}<span>${L('見た目', 'Looks')}</span></h3><div class="prep-grid">${skinItems()}</div></section>` : ''}
        </div>
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
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-mastery]').forEach((b) =>
      b.addEventListener('click', () => {
        if (buyMastery(meta, b.dataset.mastery!)) unlocked(b);
      }),
    );
    // 列の演出：解放したらその場で見せる。選んだ演出もタップで見せる
    const preview = (id: string | null) => {
      const r = el.overlay.querySelector('.ul-body')?.getBoundingClientRect();
      playLineFx(id, 2, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
    };
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-linefx]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.linefx!;
        if (!buyLineFx(meta, id)) return;
        unlocked(b);
        preview(id);
      }),
    );
    el.overlay.querySelectorAll<HTMLButtonElement>('[data-fxon]').forEach((b) =>
      b.addEventListener('click', () => {
        meta.lineFxOn = b.dataset.fxon!;
        saveMeta(meta);
        sfx.select();
        paint();
        preview(activeLineFx());
      }),
    );
    el.overlay.querySelector<HTMLButtonElement>('[data-hint]')?.addEventListener('click', (e) => {
      if (buyComboHint(meta)) unlocked(e.currentTarget as HTMLElement);
    });
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
    // この難しさで増える縛り（NEW）と、前から続く縛りを分けて見せる
    const newRules = DIFF_RULES[lv] ?? [];
    const oldRules = DIFF_RULES.slice(1, lv).flat();
    const mult = (k: number) => difficultyTaxMult(k).toFixed(1);
    // 年貢は段ごとに上がる：NEW の行に「前→今」
    const tax = lv > 0 ? `<li class="dr-tax new">${art('bale')}<span>${L(`年貢 ×${mult(lv - 1)} → <b>×${mult(lv)}</b>`, `Tax ×${mult(lv - 1)} → <b>×${mult(lv)}</b>`)}</span><em>NEW</em></li>` : '';
    // 年貢のグラフ：クリアまでの7回。いちばん難しい段を天井にして、段を上げると棒が伸びて見えるように
    const plan = taxPlan(lv);
    const top = Math.max(...taxPlan(DIFFICULTIES.length - 1));
    const taxChart = `<div class="ds-tax" aria-label="${L('年貢の額', 'Tax amounts')}">
      <p class="dt-head">${art('bale')}<b>${L('年貢の額', 'Tax amounts')}</b></p>
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
            ${lv > 0 && !locked ? `<span class="ds-mult">${art('bale')}<small>${L('年貢', 'Tax')}</small><b>×${mult(lv)}</b></span>` : ''}
          </div>
          <button class="ds-arrow r" id="diff-next" ${lv >= DIFFICULTIES.length - 1 ? 'disabled' : ''} aria-label="${L('むずかしく', 'Harder')}">▶</button>
        </div>
        <h2 class="ds-name">${DIFFICULTIES[lv].name}</h2>
        <div class="ds-rules">
          <p class="ds-goal">${art('trophy')}<b>${L(`年貢を${plan.length}回納めたらクリア`, `Pay tax ${plan.length} times to win`)}</b></p>
          ${lv === 0
            ? `<p class="ds-plain">${art('sprout')} ${L('縛りなし。まずはここから', 'No extra rules. Start here')}</p>`
            : `<p class="ds-k new">${L('この難しさで増える', 'New at this level')}</p><ul>${tax}${newRules.map((r) => `<li class="new">${art(r.ico)}<span>${r.text}</span><em>NEW</em></li>`).join('')}</ul>
              ${oldRules.length ? `<p class="ds-k">${L('前から続く', 'Still in effect')}</p><ul class="ds-old">${oldRules.map((r) => `<li>${art(r.ico)}<span>${r.text}</span></li>`).join('')}</ul>` : ''}`}
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

/** 農家の狙い（1行）と得意なビルド（docs/builds.md の名前）。絵は狙いの要になる物 */
const FARMER_GOAL: Record<string, { ico: ArtId; goal: string; build: string }> = {
  basic: { ico: 'rain', goal: L('横一列のトマトを雨と太陽で育てる', 'Grow tomato rows with rain and sun'), build: L('トマトと天気雨', 'Tomato & weather') },
  berry: { ico: 'hive', goal: L('巣箱の周りで苺を毎日実らせる', 'Ripen berries daily around hives'), build: L('苺と巣箱', 'Berries & hives') },
  pumpkin: { ico: 'fertilizer', goal: L('かぼちゃの列に肥料で高く売る', 'Fertilize pumpkin rows, sell high'), build: L('かぼちゃと肥料', 'Pumpkin & fertilizer') },
  rancher: { ico: 'henhouse', goal: L('小屋を早く置いて毎晩稼ぐ', 'Place coops early, earn nightly'), build: L('牧場', 'Ranch') },
  rain: { ico: 'thunder', goal: L('雨の十字と雷でまとめて育てる', 'Grow many with rain and thunder'), build: L('雨と雷', 'Rain & thunder') },
};

/** 腕前の1段を短い言葉で（例：苺の種+1・所持金+15・堆肥のマスを持って始める） */
export function perkText(p: FarmerPerk): string {
  const parts = [
    ...(p.gold ? [L(`所持金+${p.gold}`, `Gold +${p.gold}`)] : []),
    ...(Object.entries(p.bag ?? {}) as [SymbolId, number][]).map(([sym, n]) => `${SYMBOLS[sym].name}+${n}`),
    ...(p.stock ?? []).map((id) => L(`${PLACES[id].name}を持って始める`, `Start with ${PLACES[id].name}`)),
  ];
  return parts.join('・');
}
const perkIco = (p: FarmerPerk): string => (p.stock?.length ? art(PLACE_ART[p.stock[0]]) : p.bag ? art(Object.keys(p.bag)[0] as ArtId) : art('coin'));
/** 腕前の星（★ 上げた段・☆ まだの段） */
const masteryStars = (lv: number, max: number) => `<span class="stars" aria-label="${L(`腕前 段${lv}`, `Mastery ${lv}`)}"><b>${'★'.repeat(lv)}</b>${'☆'.repeat(Math.max(0, max - lv))}</span>`;

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
    // 腕前で上げた段の分も足す（札・所持金・畑の品）
    const lvM = meta.mastery[f.id] ?? 0;
    const perks = (f.mastery ?? []).slice(0, lvM);
    const bagD: Partial<Record<SymbolId, number>> = { ...f.bag };
    perks.forEach((p) => (Object.entries(p.bag ?? {}) as [SymbolId, number][]).forEach(([sym, n]) => (bagD[sym] = (bagD[sym] ?? 0) + n)));
    const goldD = perks.reduce((n, p) => n + (p.gold ?? 0), 0);
    const stockAll = [...f.stock, ...perks.flatMap((p) => p.stock ?? [])];
    // 増える・減る：農家で変わる札だけを、名前と数で（緑と赤の札）
    const deltas = (Object.keys(bagD) as SymbolId[]).filter((sym) => bagD[sym]);
    const chip = (sym: SymbolId, d: number) => `<button class="fs-chip ${d > 0 ? 'up' : 'down'}" data-ex-sym="${sym}">${art(sym as ArtId)}<b>${SYMBOLS[sym].name}</b><em>${d > 0 ? '+' : '−'}${Math.abs(d)}</em></button>`;
    const ups = [
      ...deltas.filter((sym) => bagD[sym]! > 0).map((sym) => chip(sym, bagD[sym]!)),
      ...(goldD ? [`<span class="fs-chip up">${art('coin')}<b>${L('所持金', 'Gold')}</b><em>+${goldD}</em></span>`] : []),
      ...(Object.keys(f.charms) as CharmId[]).map((id) => `<button class="fs-chip up" data-ex-charm="${id}">${art(id as ArtId)}<b>${CHARMS[id].name}</b></button>`),
      ...stockAll.map((id) => `<button class="fs-chip up" data-ex-place="${id}">${art(PLACE_ART[id])}<b>${PLACES[id].name}</b></button>`),
    ].join('');
    const downs = deltas.filter((sym) => bagD[sym]! < 0).map((sym) => chip(sym, bagD[sym]!)).join('');
    // 最初の袋：全部の札を小さな札で（タップで説明）
    let bagN = 0;
    const bag = SYMBOL_ORDER.flatMap((sym) => {
      const n = Math.max(0, CONFIG.initialBag[sym] + (bagD[sym] ?? 0));
      bagN += n;
      return n > 0 ? [`<button class="fs-mini-card${SYMBOLS[sym].rarity === 'bad' ? ' bad' : ''}" data-ex-sym="${sym}" aria-label="${SYMBOLS[sym].name}">${art(sym as ArtId)}<b>×${n}</b></button>`] : [];
    }).join('');
    // 市に出やすい：絵と名前（いつも並ぶ物は「いつも」）
    const favor = [
      ...(f.favorPlaces ?? []).map((id) => `<span class="fs-fav">${art(PLACE_ART[id])}<b>${PLACES[id].name}</b><em>${L('いつも', 'always')}</em></span>`),
      ...f.favor.filter((id) => !isCutAdd(id) && !CONFIG.rareOffers.includes(id)).map((id) => `<span class="fs-fav">${ADD_EMOJI[id]}<b>${SYMBOLS[UPGRADE_SYMBOL[id]!.symbol].name}</b></span>`),
    ].join('');
    const g = FARMER_GOAL[f.id];
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
          ${g ? `<p class="fs-goal">${art(g.ico)}<b>${g.goal}</b></p><p class="fs-build"><span>${L('得意', 'Best')}：${L(`${g.build}ビルド`, g.build)}</span>${f.mastery?.length ? `<b class="fs-mastery">${L('腕前', 'Mastery')}${masteryStars(lvM, f.mastery.length)}</b>` : ''}</p>` : ''}
          ${ups || downs ? `<div class="fs-delta"><span class="fs-k">${L('変わる', 'Changes')}</span>${ups}${downs}</div>` : ''}
          <p class="fs-k">${L(`最初の袋（${bagN}枚）`, `Starting bag (${bagN})`)}<span class="fs-tap">${L('タップで説明', 'Tap for details')}</span></p>
          <div class="fs-bag">${bag}</div>
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
