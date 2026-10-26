// 画面：結果・遊び方・クリア・タイトル・解放・準備

import {
  ACHIEVE_ADDS, CHARM_ORDER, PAUSED_CHARMS, CHARM_TIER_NAMES, CHARMS, CONFIG, DIFFICULTIES, FEEDBACK_URL, META, SHARE_URL, SYMBOL_ORDER, SYMBOLS, THUNDER_LINES, UPGRADES,
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
    <div class="modal over-modal" role="dialog" aria-label="ゲームオーバー">
      <div class="big">${state.cleared ? '🏆' : '🏚️'}</div>
      <h2>${endedAfterClear ? 'クリア！' : state.cleared ? 'エンドレス終了' : '年貢が払えなかった…'}</h2>
      <div class="over-stats">
        <span>${art('calendar')}<b>${state.day}</b>日${isNew ? '<em>最高！</em>' : ''}</span>
        <span>${art('bale')}<b>${state.taxesPaid}</b>回</span>
        <span>${art('coin')}<b>${state.stats.totalEarned}</b>金</span>
      </div>
      ${reviewHtml(endedAfterClear, t.amount)}
      <div class="points-earned">${art('sprout')} <b>+${earned}pt</b><small>計 ${meta.points}pt</small></div>
      ${newly.length ? `<div class="newly">${art('sparkle')} 解放：${newly.map((x) => `<b>${x}</b>`).join('')}</div>` : ''}
      <div class="share-row">
        <button class="secondary" id="share">${typeof navigator.share === 'function' ? '📤 シェア' : '📋 コピー'}</button>
        ${FEEDBACK_URL ? `<a class="secondary" href="${FEEDBACK_URL}" target="_blank" rel="noopener">✉️ 感想</a>` : ''}
      </div>
      <div class="over-actions">
        <button class="primary" id="retry" disabled>もう一度</button>
        <button class="secondary" id="restart" disabled>タイトルへ</button>
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
  // もう一度：準備画面を飛ばして、同じ組み合わせ・難しさですぐ始める
  retry.addEventListener('click', () => {
    sfx.select();
    hooks.startGame();
  });
  $('share').addEventListener('click', () => void shareResult(endedAfterClear));
  hooks.render();
}

/** 振り返り：どこまで届いたか・一番稼いだ日・列の数と、次に試すとよいことをひと言 */
function reviewHtml(endedAfterClear: boolean, taxAmount: number): string {
  const rows: string[] = [];
  if (!state.cleared && !endedAfterClear) {
    const short = Math.max(0, taxAmount - state.gold);
    rows.push(`<li class="short">${art('bale')} 年貢まで <b>あと${short}金</b> 足りなかった</li>`);
  }
  const days = state.stats.earnedByDay;
  let bestDay = 0;
  days.forEach((v, d) => {
    if ((v ?? 0) > (days[bestDay] ?? 0)) bestDay = d;
  });
  if (days[bestDay]) rows.push(`<li>${art('coin')} 一番稼いだ日：<b>${bestDay}日目 +${days[bestDay]}金</b></li>`);
  rows.push(`<li>${art('tomato')} 列で売った：<b>${state.stats.lineHarvests}回</b>・取られた作物：<b>${state.stats.cropsEaten}個</b></li>`);
  const tip =
    state.stats.lineHarvests === 0
      ? '作物を3つ並べて売ると ×1.3。並べずに売ると半値'
      : state.stats.cropsEaten >= 5
        ? 'カラス・タヌキには、かかし（周り8マスを守る）'
        : state.stats.purchases.length < 3
          ? 'ショップで絵柄を足すと、狙った作物を育てやすい'
          : '同じ作物だけの列は、さらに ×1.3';
  return `<ul class="review">${rows.join('')}</ul><p class="tip">${art('sparkle')} 次は：${tip}</p>`;
}

export function restart(): void {
  showTitle();
}

export function resultText(endedAfterClear: boolean): string {
  const head = state.cleared ? (endedAfterClear ? '🏆 クリア！' : `🏆 クリア後エンドレスで${state.day}日目まで`) : `${state.day}日目まで`;
  const charms = state.stats.charms.map((c) => CHARMS[c.id].emoji).join('');
  return [
    `🌾畑スロット ${head}`,
    `年貢 ${state.taxesPaid}回納付 / 総収入 ${state.stats.totalEarned}金 / リール${state.reels}本`,
    charms ? `お守り ${charms}` : '',
    `フィーバー${state.stats.fevers}回・列${state.stats.lineHarvests}回`,
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
    say('コピーした');
    floatText(window.innerWidth / 2, window.innerHeight * 0.3, 'コピーした！', { cls: 'good', size: 1 });
  } catch {
    // 共有を閉じた・権限がない場合は何もしない
  }
}

// ---- 遊び方・図鑑 ----

export type HelpTab = 'rules' | 'symbols' | 'charms';

/** onClose：閉じたあとに戻す画面（準備画面から開いたとき） */
export function showHelp(tab: HelpTab = 'rules', onClose?: () => void): void {
  const tabs: [HelpTab, string][] = [['rules', '遊び方'], ['symbols', '絵柄'], ['charms', 'お守り']];
  const rules = `
    <ul class="help-list icons">
      <li>${art('calendar')}<span>1回転＝1日</span></li>
      <li>${art('seed')}<span>光る出目 → マスをタップ</span></li>
      <li>${art('rain')}<span>雨＝縦横十字　${art('sun')}太陽＝縦一列　${art('bee')}蜂＝斜め　${art('moon')}満月＝全体</span></li>
      <li>${art('tomato')}${art('tomato')}${art('tomato')}<span>縦・横・斜めに3つ＝高く売れる（単品は½）</span></li>
      <li>${art('bale')}<span>${CONFIG.taxPeriod}日ごとに年貢。払えないと終わり／${CONFIG.winTaxes}回でクリア</span></li>
      <li>${art('coinPurse')}<span>年貢のあと：お守り1つ＋お邪魔が増える</span></li>
      <li>${art('bargain')}<span>ショップ：絵柄・道具・畑を広げる</span></li>
      <li>${art('waterwheel')}<span>水路：3つ並べると水車・4方を囲むと釣り堀（毎晩お金）</span></li>
      <li>${art('sprout')}<span>遊ぶほどポイント → 解放</span></li>
    </ul>`;
  const symbols = SYMBOL_ORDER.map((id) => {
    const d = SYMBOLS[id];
    return `<div class="dex-row${d.rarity === 'bad' ? ' bad' : ''}"><span class="e">${symHtml(id)}</span>
      <div><b>${d.name}</b> <span class="tag-k">${d.kind === 'manual' ? '手動' : '自動'}</span>
      <small>${d.desc}</small><small class="fv">フィーバー：${d.feverDesc}</small></div>
      <span class="own">袋に${state.bag[id]}枚</span></div>`;
  }).join('');
  const charms = CHARM_ORDER.filter((id) => !PAUSED_CHARMS.includes(id)).map((id) => {
    const c = CHARMS[id];
    if (c.special && !meta.discovered.includes(id) && !state.charms[id]) {
      return `<div class="dex-row locked"><span class="e silhouette">${art(id)}</span><div><b>？？？</b><small>${c.special.hint}</small></div></div>`;
    }
    const locked = id in META.charmUnlock && !meta.unlockedCharms.includes(id);
    return `<div class="dex-row tier-${c.tier}${locked ? ' locked' : ''}"><span class="e">${art(id)}</span>
      <div><b>${c.name}</b> <span class="tag-k">${CHARM_TIER_NAMES[c.tier]}</span>
      <small>${c.desc(1)}${Number.isFinite(c.max) ? `（最大${c.max}個）` : ''}</small>
      ${locked ? `<small class="fv">🔒 解放 ${META.charmUnlock[id]}pt</small>` : ''}</div>
      <span class="own">${state.charms[id] ? `所持${state.charms[id]}` : ''}</span></div>`;
  }).join('');
  el.overlay.innerHTML = `
    <div class="modal help-modal" role="dialog" aria-label="遊び方と図鑑">
      <div class="help-tabs">${tabs.map(([k, label]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
      <div class="help-body">${tab === 'rules' ? rules : tab === 'symbols' ? symbols : charms}</div>
      <button class="secondary" id="tutorial-again">チュートリアルをもう一度<small>次に「はじめる」から</small></button>
      <button class="secondary" id="calm-toggle">演出控えめ：${isCalm() ? 'オン' : 'オフ'}<small>揺れ・点滅・フリーズを弱める</small></button>
      <button class="primary" id="help-close">閉じる</button>
    </div>`;
  el.overlay.classList.add('show');
  $('tutorial-again').addEventListener('click', (e) => {
    meta.tutorialDone = false;
    saveMeta(meta);
    (e.currentTarget as HTMLElement).firstChild!.textContent = 'チュートリアル：次に始めるときに出ます';
    sfx.select();
  });
  $('calm-toggle').addEventListener('click', (e) => {
    const on = toggleCalm();
    (e.currentTarget as HTMLElement).firstChild!.textContent = `演出控えめ：${on ? 'オン' : 'オフ'}`;
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
    <div class="modal clear-modal" role="dialog" aria-label="クリア">
      <div class="big">🏆</div>
      <h2>クリア！</h2>
      <div class="record">${state.day}日目でクリア / 総収入 ${state.stats.totalEarned}金</div>
      <p class="sub">+${META.clearBonus}pt</p>
      <button class="primary" id="clear-continue" disabled>エンドレスへ</button>
      <button class="secondary" id="clear-end" disabled>ここで終える</button>
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
  return ADD_NAME[id].replace(/を足す$/, '');
}

/** スタート画面：スタート（と続きから）だけ。強化の解放は小さなボタンから */
export function showTitle(): void {
  const saved = loadRun();
  el.overlay.innerHTML = `
    <div class="title-screen" role="dialog" aria-label="畑スロット">
      <div class="title-logo">
        <span class="title-art">${art('tomato')}${art('coin')}${art('corn')}</span>
        <h1>畑スロット</h1>
      </div>
      <div class="title-actions">
        <button class="primary title-start" id="title-start">スタート</button>
        ${saved ? `<button class="secondary" id="title-resume">続きから <small>${saved.day}日目</small></button>` : ''}
      </div>
      <div class="title-sub">
        <button class="icon-pill" id="title-unlock">${art('lock')}<span>解放</span><b>${meta.points}pt</b></button>
        <button class="icon-pill" id="title-help">?<span>遊び方</span></button>
        <button class="icon-pill" id="title-records">${art('calendar')}<span>記録</span></button>
        <button class="icon-pill" id="title-settings">⚙<span>設定</span></button>
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
    <div class="modal records-modal" role="dialog" aria-label="記録">
      <h2>${art('calendar')} 記録</h2>
      <ul class="records">
        ${row(art('sprout'), '遊んだ回数', `${meta.plays}回`)}
        ${row('🏆', 'クリア', `${meta.clears}回`)}
        ${row(art('calendar'), '最高到達', best.day ? `${best.day}日目（年貢${best.taxes}回）` : '—')}
        ${row(art('skull'), '一番上の難しさ', meta.maxCleared >= 0 ? DIFFICULTIES[meta.maxCleared].name : 'まだクリアしていない')}
        ${row(art('tomato'), '列で売った（累計）', `${meta.lines}回`)}
        ${row(art('sparkle'), '特別なお守り', `${meta.discovered.filter((id) => specials.includes(id)).length} / ${specials.length}`)}
        ${row(art('coin'), 'これまでの豊穣ポイント', `${meta.totalPoints}pt`)}
      </ul>
      <button class="primary" id="records-close">もどる</button>
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
    const hint = id === 'addThunder' ? `列 ${Math.min(meta.lines, THUNDER_LINES)}/${THUNDER_LINES}` : ACHIEVE_ADDS[id]!.hint;
    return item(done, ADD_EMOJI[id], shortName(id), hint);
  });
  const levels = DIFFICULTIES.slice(1).map((d, k) => item(maxDifficulty(meta) >= k + 1, art('skull'), d.name, `${DIFFICULTIES[k].name}をクリア`));
  const skin = item(meta.skins.includes('gold'), art('coin'), '金色のスロット', '初めてクリアすると…？');
  return [...specials, ...adds, ...levels, skin].join('');
}

export function skinItems(): string {
  return meta.skins
    .map((id) => `<button class="prep-item${meta.skin === id ? ' on' : ''}" data-skin="${id}"><span class="e">${art('coin')}</span><b>金色のスロット</b><small>${meta.skin === id ? '✓ 使う' : 'タップで使う'}</small></button>`)
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
          <span class="e">${ADD_EMOJI[id]}</span><b>${shortName(id)}</b><small>${can ? '' : '🔒'}${def.unlock}pt</small></button>`;
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
          <span class="e">${art(id as ArtId)}</span><b>${c.name}</b><small>${can ? '' : '🔒'}${price}pt</small></button>`;
      })
      .join('');
    el.overlay.innerHTML = `
      <div class="modal prep-modal" role="dialog" aria-label="強化の解放">
        <h2>${art('lock')} 解放</h2>
        <div class="points"><b>${meta.points}pt</b></div>
        <h3>${art('seed')} 絵柄</h3>
        <div class="prep-grid">${adds}</div>
        <h3>${art('sunBlessing')} レアのお守り</h3>
        <div class="prep-grid">${charms}</div>
        <h3>${art('star')} 達成で解放</h3>
        <div class="prep-grid">${collection()}</div>
        ${meta.skins.length ? `<h3>${art('artisan')} 見た目</h3><div class="prep-grid">${skinItems()}</div>` : ''}
        <h3>${art('bargain')} 並べられる数</h3>
        ${capPrice !== null ? `<button class="secondary prep-cap" id="prep-cap" ${meta.points < capPrice ? 'disabled' : ''}>コスト上限 ${capacity(meta)} → ${capacity(meta) + META.capacityStep}<small>${capPrice}pt</small></button>` : `<p class="sub">コスト上限 ${capacity(meta)}（最大）</p>`}
        <div class="prep-actions"><button class="secondary" id="unlock-back">← もどる</button></div>
      </div>`;
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

/** 準備画面：今回ショップに並べる組み合わせを選んで始める（スタートとプレイの間） */
export function showPrep(): void {
  leaveTitle();
  const saved = loadRun();
  let confirmNew = false;
  const paint = () => {
    const cap = capacity(meta);
    const used = loadoutCost(meta.loadout.filter((id) => meta.unlockedAdds.includes(id)));
    const adds = (Object.keys(META.adds) as (keyof typeof META.adds)[])
      .filter((id) => id !== 'addMoon' && meta.unlockedAdds.includes(id))
      .map((id) => {
        const def = META.adds[id];
        const on = meta.loadout.includes(id);
        const fits = on || used + def.cost <= cap;
        return `<button class="prep-item${on ? ' on' : ''}${fits ? '' : ' full'}" data-toggle="${id}">
          <span class="e">${ADD_EMOJI[id]}</span><b>${shortName(id)}</b><span class="cost">${'●'.repeat(def.cost)}</span></button>`;
      })
      .join('');
    el.overlay.innerHTML = `
      <div class="modal prep-modal" role="dialog" aria-label="準備">
        <h2>${art('bargain')} ショップに並べる</h2>
        ${maxDifficulty(meta) > 0 ? `<div class="diff-row">${DIFFICULTIES.slice(0, maxDifficulty(meta) + 1).map((d, k) => `<button class="diff-chip${meta.difficulty === k ? ' on' : ''}" data-diff="${k}">${d.name}${d.desc ? `<small>${d.desc}</small>` : ''}</button>`).join('')}</div>` : ''}
        <div class="cap-meter${used > cap ? ' over' : ''}">${Array.from({ length: cap }, (_, k) => `<i class="${k < used ? 'on' : ''}"></i>`).join('')}<span>${used} / ${cap}</span></div>
        <div class="prep-grid">${adds}</div>
        <div class="prep-actions">
          <button class="primary" id="prep-start">${saved ? (confirmNew ? 'はじめる（続きは消えます）' : 'はじめる') : 'はじめる！'}</button>
          <button class="secondary" id="prep-back">← もどる</button>
        </div>
      </div>`;
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
