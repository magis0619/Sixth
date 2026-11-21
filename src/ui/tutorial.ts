// チュートリアル：初めての人の最初の2日を案内する手順と、光らせる場所・吹き出しの置き方

import { L } from '../i18n.ts';
import { CONFIG, type AddUpgradeId } from '../config.ts';
import { art } from '../art.ts';
import { symHtml, MARK_LINE, MARK_SINGLE } from './view.ts';
import { $, el, state, ui } from './store.ts';
import { harvestPlaying, play } from './play.ts';

export interface TutStep {
  /** 吹き出しの文 */
  text: string;
  /** 光らせる要素 */
  focus: () => Element[];
  /** タップしてよいリール（なければリールは「回す」だけ、spin も false なら触れない） */
  reel?: number;
  /** リールで次の日へ回してよい */
  spin?: boolean;
  /** タップしてよいマス */
  cells?: number[];
  /** 終わったか（ボタンで進む手順は undefined） */
  done?: () => boolean;
  /** 押して進むボタン */
  button?: string;
  /** 指で示す場所（なければ光らせる物の1つ目。ボタンで進む手順は指を出さない） */
  point?: () => Element | null;
}

/** 横一列（真ん中の行）の3マス */
export const tutRow = (): number[] => [0, 1, 2].map((x) => CONFIG.fieldCols + x);

export const reelEl = (i: number): Element[] => (el.reels.children[i] ? [el.reels.children[i]] : []);

export const plotEls = (cells: number[]): Element[] => cells.map((c) => el.field.children[c]).filter(Boolean);

/** まだ植えていない、横一列のいちばん左のマス */
export const nextRowPlot = (): Element | null => el.field.children[tutRow().find((c) => !state.field[c]) ?? tutRow()[1]] ?? null;

export const TUT_STEPS: TutStep[] = [
  // 1日目：回す → 種を横一列に植える → 雨で育てる
  { text: L('<b>リールをタップ</b>して回そう', '<b>Tap the reels</b> to spin'), focus: () => [el.reels], spin: true, done: () => state.day >= 1 && !state.morning && !ui.busy },
  { text: `${symHtml('seed')} ${L('種が出た！<br><b>種のリール</b>をタップ', 'A seed!<br>Tap the <b>seed reel</b>')}`, focus: () => reelEl(0), reel: 0, done: () => play.selected === 0 || tutRow().some((c) => state.field[c]) },
  { text: L('光る<b>横一列の3マス</b>に<br>植えよう（並ぶと高い）', 'Plant in the <b>3 glowing plots</b><br>3 in a row sell high'), focus: () => plotEls(tutRow()), point: nextRowPlot, reel: 0, cells: tutRow(), done: () => tutRow().every((c) => state.field[c]) },
  { text: `${symHtml('rain')} ${L('<b>雨のリール</b> → <b>真ん中</b>へ<br>縦横に育つ', 'Tap the <b>rain reel</b> → the <b>middle</b><br>It grows a cross')}`, focus: () => (play.selected === 1 ? plotEls([tutRow()[1]]) : reelEl(1)), reel: 1, cells: [tutRow()[1]], done: () => !!state.results[1]?.used },
  { text: L('○が増えた＝育った<br><b>リールをタップ</b>で次の日へ', 'More ○ = grown<br><b>Tap the reels</b> for the next day'), focus: () => [el.reels], spin: true, done: () => state.day >= 2 && !state.morning && !ui.busy },
  // 2日目：雷で実らせて、列で売る
  { text: `${symHtml('thunder')} ${L('<b>雷</b> → <b>トマトの列</b>へ<br>横一列が+2育つ', 'Tap <b>thunder</b> → the <b>tomato row</b><br>The row grows +2')}`, focus: () => (play.selected === 0 ? plotEls(tutRow()) : reelEl(0)), point: () => (play.selected === 0 ? el.field.children[tutRow()[1]] : reelEl(0)[0]) ?? null, reel: 0, cells: tutRow(), done: () => !!state.results[0]?.used && !harvestPlaying() },
  { text: L('実った！<br><b>タップで列ごと売ろう</b>', 'Ripe!<br><b>Tap to sell the whole line</b>'), focus: () => plotEls(tutRow()), point: () => el.field.children[tutRow()[1]] ?? null, cells: tutRow(), done: () => state.stats.lineHarvests >= 1 && !ui.busy && !harvestPlaying() },
  { text: L(`${MARK_LINE} 列は<b>×1.3</b><br>同じ作物の列は<b>さらに×1.3</b><br>${MARK_SINGLE} 並ばない<b>単品は半値</b>`, `${MARK_LINE} Lines <b>×1.3</b> · same crop <b>×1.3 more</b><br>${MARK_SINGLE} Singles sell at <b>half price</b>`), focus: () => [], button: L('次へ', 'Next') },
  // 3日目（水曜）：朝に市が開く → 1つ選ぶ → 次へでリールが回る
  { text: L('上の曜日が今日。<b>水曜は市</b><br><b>リールをタップ</b>で次の日へ', 'The top shows today. <b>Wed = market</b><br><b>Tap the reels</b> for the next day'), focus: () => [el.week, el.reels], point: () => el.reels, spin: true, done: () => state.day >= 3 },
  { text: L('<b>3つから1つ</b>選ぶ', 'Pick <b>1 of 3</b>'), focus: () => [document.querySelector('.offer-sec')!], point: () => document.querySelector('#offer-shop [data-take] .cost'), done: () => state.day >= 3 && !state.offer.length },
  { text: L('<b>次へ</b>で市を出ると<br>リールが回る', 'Press <b>Next</b> to leave<br>and spin'), focus: () => [$('market-next')], spin: true, done: () => state.day >= 3 && !state.morning && !ui.busy },
  { text: `${art('bale')} ${L('<b>日曜の終わりに年貢</b><br>足りないと所持金が赤くなる', '<b>Tax at the end of Sunday</b><br>Turns red when short')}`, focus: () => [el.week, el.tax], button: L('次へ', 'Next') },
  { text: L('あとは自由に！<br><b>年貢を7回</b>納めるとクリア', "You're on your own!<br>Pay the tax <b>7 times</b> to win"), focus: () => [], button: L('はじめる', "Let's go") },
];

/** チュートリアルの水曜の市（決まった3つ） */
export const TUT_OFFER: AddUpgradeId[] = ['addRain', 'addSun', 'addSeed'];

export function tutStep(): TutStep | null {
  return play.tut ? TUT_STEPS[play.tut.step] : null;
}

/** そのリールに触れてよいか */
export function tutAllowsReel(i: number): boolean {
  const s = tutStep();
  return !s || s.reel === i || (!!s.spin && s.reel === undefined);
}

/** 次の日へ回してよいか */
export function tutAllowsSpin(): boolean {
  const s = tutStep();
  return !s || !!s.spin;
}

export function tutAllowsCell(cell: number): boolean {
  const s = tutStep();
  return !s || !!s.cells?.includes(cell);
}

/** 暗幕：画面を暗くして、光らせる物のところだけ穴をあける。指：押す場所でトントン */
export function placeTutSpot(): void {
  const s = tutStep();
  let dim = document.getElementById('tut-dim');
  let hand = document.getElementById('tut-hand');
  // 見えている物だけ（大きさのある物）
  const targets = (s?.focus() ?? []).filter((e) => {
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!s || !targets.length) {
    dim?.remove();
    hand?.remove();
    return;
  }
  if (!dim) {
    dim = document.createElement('div');
    dim.id = 'tut-dim';
    dim.className = 'tut-dim';
    document.body.appendChild(dim);
  }
  // 光らせる物ごとに穴をあける（離れた2か所でも、それぞれだけ明るく）。画面全体の四角から穴の四角をくり抜く
  const W = window.innerWidth;
  const H = window.innerHeight;
  const holes = targets
    .map((e) => {
      const r = e.getBoundingClientRect();
      const x = Math.round(r.left - 6);
      const y = Math.round(r.top - 6);
      return `M${x} ${y} h${Math.round(r.width + 12)} v${Math.round(r.height + 12)} h${-Math.round(r.width + 12)} Z`;
    })
    .join(' ');
  dim.style.clipPath = `path(evenodd, 'M0 0 H${W} V${H} H0 Z ${holes}')`;
  placeCoach(targets);
  // 指はボタンで進む手順には出さない（押すのは吹き出しのボタン）
  const point = s.button ? null : (s.point?.() ?? targets[0]);
  if (!point) {
    hand?.remove();
    return;
  }
  if (!hand) {
    hand = document.createElement('div');
    hand.id = 'tut-hand';
    hand.className = 'tut-hand';
    hand.innerHTML = art('hand');
    document.body.appendChild(hand);
  }
  const r = point.getBoundingClientRect();
  Object.assign(hand.style, { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height * 0.55}px` });
}

/**
 * 吹き出しを、光らせる物とかぶらない側へ置く（上下で空きの広い方）。しっぽを光らせる物の方へ向ける。
 * 目は「吹き出しを読む → しっぽの先 → 光っている物」の順に動く
 */
export function placeCoach(targets: Element[]): void {
  const coach = document.getElementById('coach');
  if (!coach || !targets.length) return;
  // 収穫などの演出の最中は吹き出しを隠す（演出の上にかぶらない）
  coach.classList.toggle('quiet', harvestPlaying());
  // 置き場所は、いちばん目の光らせる物に合わせる（曜日とリールの両方を光らせても、曜日の近くに出す）
  const rs = [targets[0].getBoundingClientRect()];
  const top = Math.min(...rs.map((r) => r.top)) - 8;
  const bottom = Math.max(...rs.map((r) => r.bottom)) + 8;
  const cx = (Math.min(...rs.map((r) => r.left)) + Math.max(...rs.map((r) => r.right))) / 2;
  const H = window.innerHeight;
  const h = coach.offsetHeight;
  const gap = 14;
  const safeTop = 8;
  const roomAbove = top - safeTop;
  const roomBelow = H - bottom - 8;
  let y: number;
  let side: 'above' | 'below';
  // タダで1つ選ぶ画面では、上に題があるので札の下に出す
  const preferBelow = !$('offer-screen').hidden && roomBelow >= h + gap;
  if (!preferBelow && (roomAbove >= h + gap || roomAbove >= roomBelow)) {
    side = 'above';
    y = Math.max(safeTop, top - gap - h);
  } else {
    side = 'below';
    y = Math.min(H - h - 8, bottom + gap);
  }
  coach.style.top = `${Math.round(y)}px`;
  coach.style.bottom = 'auto';
  coach.dataset.side = side;
  // しっぽの横位置：光らせる物の真ん中（吹き出しの端からはみ出さない範囲）
  const cr = coach.getBoundingClientRect();
  coach.style.setProperty('--tail-x', `${Math.round(Math.min(cr.width - 28, Math.max(28, cx - cr.left)))}px`);
}
