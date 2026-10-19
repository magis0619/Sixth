// 貪欲ボットで遊ばせてバランスを確認する。 npm run sim [-- 回数]

import { CONFIG, type SymbolId } from '../src/config.ts';
import {
  addReel, bagTotal, canBuy, canUse, chooseDraft, isRipe, newGame, nextTax, openDraft, removeSymbol, resolveAllAuto,
  sell, startDay, upgradePrice, useSymbol, validTargets, type GameState,
} from '../src/game.ts';

// ドラフトの好み。種の割合が減りすぎたら種を優先する
function draftScore(s: GameState, id: SymbolId): number {
  const share = (sym: SymbolId) => s.bag[sym] / bagTotal(s.bag);
  const base: Partial<Record<SymbolId, number>> = { goldSeed: 9, clover: 6, rain: 6, bee: 5, sun: 5, fertilizer: 4, merchant: 4, coin: 3, seed: 5 };
  let score = base[id] ?? 0;
  if (id === 'seed' && share('seed') < 0.25) score += 5;
  if (id === 'sun' && s.bag.sun >= 3) score -= 3;
  return score;
}

function playDay(s: GameState): void {
  const order = ['goldSeed', 'seed', 'rain', 'bee', 'fertilizer', 'sun'];
  const idx = s.results.map((_, i) => i).sort((a, b) => order.indexOf(s.results[a].symbol) - order.indexOf(s.results[b].symbol));
  for (const i of idx) while (canUse(s, i, null)) {
    if (s.results[i].symbol === 'sun') { useSymbol(s, i, null); continue; }
    const targets = validTargets(s, i);
    // 育ち切りに近い作物（金を優先）に回す
    targets.sort((a, b) => {
      const ca = s.field[a], cb = s.field[b];
      const va = ca ? (ca.kind === 'gold' ? 10 : 0) + ca.growth : 0;
      const vb = cb ? (cb.kind === 'gold' ? 10 : 0) + cb.growth : 0;
      return vb - va;
    });
    useSymbol(s, i, targets[0]);
  }
  s.field.forEach((c, i) => { if (isRipe(c)) sell(s, i); });
  const t = nextTax(s);
  const reserve = t.daysLeft <= 3 ? t.amount : 0;
  for (let bought = true; bought;) {
    bought = false;
    const bad: SymbolId | undefined = s.bag.bug > 0 ? 'bug' : s.bag.crow > 0 ? 'crow' : undefined;
    if (bad && canBuy(s, 'removeSymbol') && s.gold - upgradePrice(s, 'removeSymbol') >= reserve) bought = removeSymbol(s, bad);
    else if (canBuy(s, 'addReel') && s.gold - upgradePrice(s, 'addReel') >= reserve) bought = addReel(s);
  }
}

const runs = Number(process.argv[2] ?? 2000);
const days: number[] = [];
const taxes: number[] = [];
let clears = 0;
const goldAtTax: number[][] = [];
for (let n = 0; n < runs; n++) {
  const s = newGame();
  while (!s.over && s.day < 200) {
    if (s.day > 0) {
      const offer = openDraft(s, Math.random);
      chooseDraft(s, [...offer].sort((a, b) => draftScore(s, b) - draftScore(s, a))[0]);
    }
    if (s.day > 0 && s.day % CONFIG.taxPeriod === 0) (goldAtTax[s.day / CONFIG.taxPeriod - 1] ??= []).push(s.gold - nextTax(s).amount);
    const r = startDay(s, Math.random);
    if (!r.ok) break;
    if (r.cleared) clears++;
    resolveAllAuto(s, Math.random);
    playDay(s);
  }
  days.push(s.day);
  taxes.push(s.taxesPaid);
}

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
console.log(`runs=${runs} クリア率=${((clears / runs) * 100).toFixed(1)}%`);
console.log(`到達日数 p10=${pct(days, 0.1)} p50=${pct(days, 0.5)} p90=${pct(days, 0.9)}`);
goldAtTax.slice(0, 10).forEach((g, i) => {
  const pass = g.filter((x) => x >= 0).length;
  console.log(`年貢${i + 1}回目 到達${g.length} 通過${pass}（全体の${((pass / runs) * 100).toFixed(0)}%） 納付後の残金p50=${pct(g, 0.5)}`);
});
