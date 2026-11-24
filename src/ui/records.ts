// 記録の画面：自分の記録（src/history.ts）を自動で分析して見せる。
// 上から：これまでの数字 → 最近の回 → 難しさごと → 農家ごと → 評価の4つ → 稼ぎの中身 → 負け方 → 置き物 → 自己ベスト → ヒント
// docs/ui-reading.md：1行に1つ・行の頭に絵・後ろに数字。文字は本文16px・補足14px

import { art, type ArtId } from '../art.ts';
import { CONFIG, DIFFICULTIES, FARMERS } from '../config.ts';
import { analyzeHistory, loadHistory, winPct, type HistoryAnalysis, type RunRecord, type WinLoss } from '../history.ts';
import { L } from '../i18n.ts';
import { meta } from './store.ts';

const u = (t: string) => `<i class="u">${t}</i>`;
const diffShort = (r: RunRecord) => (r.lord ? L(`殿${r.lord}`, `L${r.lord}`) : r.diff === 0 ? L('ふ', 'N') : String(r.diff));
const diffName = (d: number) => DIFFICULTIES[d]?.name ?? '';
const farmerOf = (id: string) => FARMERS.find((f) => f.id === id);

const PART_INFO: Record<keyof RunRecord['parts'], [ArtId, string, string]> = {
  line: ['tomato', L('列で売った', 'Sold in lines'), L('3つ以上並べて、列で売ると高い', 'Sell 3+ in a line for more')],
  use: ['seed', L('出目を使い切った', 'Used your reels'), L('種を増やすと、雨・太陽が余らない', 'More seeds keep rain and sun busy')],
  guard: ['crow', L('作物を守った', 'Protected crops'), L('かかしで周り8マスを守れる', 'A scarecrow guards 8 plots')],
  margin: ['coin', L('稼ぎの余裕', 'Earning margin'), L('長い列・堆肥で売値を上げる', 'Long lines and compost raise prices')],
};

function sec(ico: ArtId, title: string, body: string): string {
  return `<section class="rc-sec"><h3 class="rc-h">${art(ico)}<span>${title}</span></h3>${body}</section>`;
}

/** 勝ちの割合の棒（1行） */
function winRow(ico: string, label: string, w: WinLoss): string {
  const pct = winPct(w);
  return `<p class="rc-row">${ico}<span class="rc-label">${label}</span><span class="rc-bar"><i style="width:${pct}%"></i></span><b>${w.wins}${u(`/${w.plays}`)}</b></p>`;
}

function recentHtml(a: HistoryAnalysis): string {
  const chips = a.recent
    .map((r) => `<i class="rc-chip ${r.cleared ? 'w' : 'l'}" title="${r.lord ? L(`殿様 段${r.lord}`, `Lord ${r.lord}`) : diffName(r.diff)}・${r.day}${L('日目', '')}"><b>${diffShort(r)}</b><small>${r.cleared ? art('trophy') : r.day}</small></i>`)
    .join('');
  return `<div class="rc-chips">${chips}</div>
    <p class="rc-note">${L('左上が新しい。上の数字＝難しさ、下＝何日目まで（金杯＝クリア）', 'Newest first. Top: mode, bottom: day (cup = cleared)')}</p>`;
}

function partsHtml(a: HistoryAnalysis): string {
  if (!a.partsRecent) return `<p class="rc-note">${L('ノルマを1回払うと出る', 'Shown after your first quota')}</p>`;
  return (Object.keys(PART_INFO) as (keyof RunRecord['parts'])[])
    .map((k) => {
      const v = a.partsRecent![k];
      const before = a.partsBefore?.[k];
      const diff = before === undefined ? '' : v > before ? `<em class="up">▲${v - before}</em>` : v < before ? `<em class="down">▼${before - v}</em>` : '';
      return `<p class="rc-row${a.weakest === k ? ' weak' : ''}">${art(PART_INFO[k][0])}<span class="rc-label">${PART_INFO[k][1]}</span><span class="rc-bar"><i style="width:${v}%"></i></span><b>${v}${diff}</b></p>`;
    })
    .join('') + `<p class="rc-note">${L('最近10回の平均（点）。▲▼はその前との差', 'Average of last 10 (pts). ▲▼ vs earlier')}</p>`;
}

function incomeHtml(a: HistoryAnalysis): string {
  if (!a.incomeShare.length) return `<p class="rc-note">${L('クリアすると出る', 'Shown after a clear')}</p>`;
  const ico: Record<string, ArtId> = { 列で売る: 'tomato', 注文: 'gift', 単品: 'coin', 夜の収入: 'henhouse', フィーバー: 'flame', 大豊作: 'trophy', 余った出目: 'seed' };
  return a.incomeShare
    .slice(0, 5)
    .map(([k, v]) => `<p class="rc-row">${art(ico[k] ?? 'coin')}<span class="rc-label">${k}</span><span class="rc-bar"><i style="width:${v}%"></i></span><b>${v}${u('%')}</b></p>`)
    .join('');
}

function lossHtml(a: HistoryAnalysis): string {
  if (!a.losses) return `<p class="rc-note">${L('まだ負けていない', 'No losses yet')}</p>`;
  const max = Math.max(1, ...a.lossAtTax);
  const bars = a.lossAtTax
    .map((n, i) => `<span class="rc-col"><i style="height:${Math.round((n / max) * 100)}%"></i><b>${n || ''}</b><small>${i + 1}</small></span>`)
    .join('');
  return `<p class="rc-sub">${L('何週目のノルマで負けたか', 'Week you lost at')}</p>
    <div class="rc-cols">${bars}</div>
    <p class="rc-row">${art('warn')}<span class="rc-label">${L('あと1割以内の負け', 'Lost by ≤10%')}</span><b>${a.nearMiss}${u(`/${a.losses}`)}</b></p>`;
}

function bestHtml(a: HistoryAnalysis): string {
  const rows: string[] = [];
  const mode = (r: RunRecord) => (r.lord ? L(`殿様 段${r.lord}`, `Lord ${r.lord}`) : diffName(r.diff));
  if (a.bestWeek) rows.push(`<p class="rc-row">${art('sparkle')}<span class="rc-label">${L('一番稼いだ週', 'Best week')}</span><b>+${a.bestWeek.gold}</b></p><p class="rc-sub2">${mode(a.bestWeek.rec)}・${farmerOf(a.bestWeek.rec.farmer)?.name ?? ''}</p>`);
  if (a.bestEarned) rows.push(`<p class="rc-row">${art('coin')}<span class="rc-label">${L('稼いだ合計', 'Most earned')}</span><b>${a.bestEarned.earned}</b></p>`);
  if (a.bestScore) rows.push(`<p class="rc-row">${art('star')}<span class="rc-label">${L('一番の評価', 'Best rank')}</span><b>${a.bestScore.rank}${u(`（${a.bestScore.score}）`)}</b></p>`);
  return rows.join('');
}

/** データから出すヒント（最大3つ） */
function tipsHtml(a: HistoryAnalysis): string {
  const tips: [ArtId, string, string][] = [];
  if (a.weakest && a.partsRecent && a.partsRecent[a.weakest] < 85) {
    const [ico, label, how] = PART_INFO[a.weakest];
    tips.push([ico, L(`一番低いのは「${label}」`, `Weakest: ${label}`), how]);
  }
  const fs = a.byFarmer.filter((f) => f.plays >= 3);
  if (fs.length >= 2) {
    const best = [...fs].sort((x, y) => winPct(y) - winPct(x))[0];
    const name = farmerOf(best.farmer)?.name ?? '';
    if (winPct(best) > 0) tips.push([(farmerOf(best.farmer)?.art ?? 'sprout') as ArtId, L(`${name}の勝ちが一番多い（${winPct(best)}%）`, `${name} wins most (${winPct(best)}%)`), L('上の難しさは得意な農家で', 'Use your best farmer for harder modes')]);
  }
  if (a.withPlaces.plays >= 3 && a.withoutPlaces.plays >= 3 && winPct(a.withPlaces) > winPct(a.withoutPlaces) + 10)
    tips.push(['hive', L(`置き物を買った回は勝ち${winPct(a.withPlaces)}%`, `With items: ${winPct(a.withPlaces)}% wins`), L(`買わなかった回は${winPct(a.withoutPlaces)}%`, `Without: ${winPct(a.withoutPlaces)}%`)]);
  if (a.losses >= 3 && a.nearMiss / a.losses >= 0.4) tips.push(['coin', L('あと少しの負けが多い', 'Many close losses'), L('ノルマの週は市で使いすぎない', 'Spend less at the market in quota weeks')]);
  const worstWeek = a.lossAtTax.indexOf(Math.max(...a.lossAtTax));
  if (tips.length < 3 && a.losses >= 3) tips.push(['calendar', L(`${worstWeek + 1}週目で負けることが多い`, `You often lose in week ${worstWeek + 1}`), L('その前の週から稼ぎを増やしておく', 'Grow income the week before')]);
  if (!tips.length) return `<p class="rc-note">${L('もう少し遊ぶと出る', 'Play a bit more to see tips')}</p>`;
  return tips
    .slice(0, 3)
    .map(([ico, head, sub]) => `<p class="rc-tip">${art(ico)}<span><b>${head}</b><small>${sub}</small></span></p>`)
    .join('');
}

/** 記録の画面の中身（自分の記録の分析）。endless は難しさごとのエンドレスの最高、extra は累計の行 */
export function recordsBodyHtml(endless: string, extra = ''): string {
  const list = loadHistory();
  const a = analyzeHistory(list);
  const best = Object.values(meta.endlessBest ?? {}).reduce((n, b) => Math.max(n, b.day), 0);
  const tiles = `<div class="rc-tiles">
      <div>${art('sprout')}<b>${meta.plays}</b><small>${L('遊んだ回数', 'Games')}</small></div>
      <div>${art('trophy')}<b>${meta.clears}</b><small>${L('クリア', 'Wins')}</small></div>
      <div>${art('skull')}<b>${meta.maxCleared >= 0 ? (meta.maxCleared === 0 ? L('ふつう', 'Normal') : meta.maxCleared) : '—'}</b><small>${L('一番上のクリア', 'Hardest cleared')}</small></div>
      <div>${art('calendar')}<b>${best || '—'}${best ? u(L('日目', '')) : ''}</b><small>${L('エンドレスの最高', 'Endless best')}</small></div>
    </div>`;
  if (!list.length) return `${tiles}<p class="rc-empty">${art('sprout')}<span>${L('1回遊ぶと、ここに自分の記録の分析が出る', 'Finish a game to see your analysis here')}</span></p>${endless}${extra}`;
  const diffRows = a.byDiff.map((d) => winRow(`<span class="rc-dot" style="--c:${['#5fae3c', '#3a86c8', '#e0a40a', '#e8743b', '#c93c2b', '#6a3d8f', '#7a5320', '#3d3a8f', '#2f6a5a', '#8f2a4a'][d.diff] ?? '#5fae3c'}"></span>`, diffName(d.diff), d)).join('');
  const farmerRows = a.byFarmer.map((f) => winRow(art((farmerOf(f.farmer)?.art ?? 'sprout') as ArtId), farmerOf(f.farmer)?.name ?? f.farmer, f)).join('');
  return `${tiles}
    ${sec('question', L('あなたへのヒント', 'Tips for you'), tipsHtml(a))}
    ${sec('calendar', L(`最近の${a.recent.length}回`, `Last ${a.recent.length} games`), recentHtml(a))}
    ${sec('skull', L('難しさごとの勝ち', 'Wins by mode'), diffRows || `<p class="rc-note">—</p>`)}
    ${sec('sprout', L('農家ごとの勝ち', 'Wins by farmer'), farmerRows)}
    ${sec('star', L('評価の4つ', 'Your 4 skills'), partsHtml(a))}
    ${sec('coin', L('稼ぎの中身（クリアした回）', 'Where income came from'), incomeHtml(a))}
    ${sec('warn', L('負け方', 'How you lost'), lossHtml(a))}
    ${sec('hive', L('置き物と勝ち', 'Items and wins'), winRow(art('hive'), L('置き物を買った回', 'Bought items'), a.withPlaces) + winRow(art('sprout'), L('買わなかった回', 'No items'), a.withoutPlaces))}
    ${sec('trophy', L('自己ベスト', 'Personal bests'), bestHtml(a))}
    ${endless}
    ${extra}
    <p class="rc-note">${L(`この端末の最近${a.plays}回から（${CONFIG.taxPeriod}日＝1週）`, `From your last ${a.plays} games on this device`)}</p>`;
}
