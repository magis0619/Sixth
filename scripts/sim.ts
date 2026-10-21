// 貪欲ボットで遊ばせてバランスを確認する。 npm run sim [-- 回数]

import { CHARM_ORDER, CONFIG, META, type UpgradeId } from '../src/config.ts';
import { SEEDS } from '../src/config.ts';
import {
  adjacencyBonus, pullWeed, buy, canBuy, canUse, chooseCharm, isRipe, newCrop, newGame, nextTax, resolveAllAuto, resolveFever, sell,
  startDay, upgradePrice, useSymbol, validTargets, type GameState,
} from '../src/game.ts';

// 絵柄袋を薄めすぎないよう、良い絵柄は枚数に上限を設けて買う
function wants(s: GameState, id: UpgradeId): boolean {
  if (id === 'addSun') return s.bag.sun < 3;
  if (id === 'addGoldSeed') return s.bag.goldSeed < 3;
  if (id === 'addFertilizer') return s.bag.fertilizer < 2;
  if (id === 'addBee') return s.bag.bee < 2;
  if (id === 'addMerchant') return s.bag.merchant < 2;
  if (id === 'addClover') return s.bag.clover < 1;
  if (id === 'addSeed') return s.bag.seed < 5;
  if (id === 'addRain') return s.bag.rain < 4;
  if (id === 'addBerrySeed') return s.bag.berrySeed < 3;
  if (id === 'addPumpkinSeed') return s.bag.pumpkinSeed < 2;
  return true;
}
const PRIORITY: UpgradeId[] = ['removeTanuki', 'removeFrost', 'removeWeed', 'removeBug', 'removeCrow', 'addSeed', 'addBerrySeed', 'addPumpkinSeed', 'addRain', 'addGoldSeed', 'addSun', 'addBee', 'addFertilizer', 'addMerchant', 'addClover'];

function playDay(s: GameState): void {
  // 雑草は抜けるだけ抜く
  s.weeds.forEach((w, i) => { if (w) pullWeed(s, i); });
  // 種 → 雨・肥料 → 太陽 の順で使う
  const order = ['goldSeed', 'pumpkinSeed', 'seed', 'berrySeed', 'rain', 'bee', 'fertilizer', 'sun'];
  const idx = s.results.map((r, i) => i).sort((a, b) => order.indexOf(s.results[a].symbol) - order.indexOf(s.results[b].symbol));
  for (const i of idx) while (canUse(s, i, null)) {
    const sym = s.results[i].symbol;
    if (sym === 'sun') { useSymbol(s, i, null); continue; }
    const targets = validTargets(s, i);
    const seed = SEEDS[sym];
    if (seed) {
      // 相性が一番高くなる空きマスに植える
      const score = (c: number) => { s.field[c] = newCrop(seed.crop); const v = adjacencyBonus(s, c); s.field[c] = null; return v; };
      targets.sort((a, b) => score(b) - score(a));
      useSymbol(s, i, targets[0]);
      continue;
    }
    // 育ち切りに近い作物（金を優先）に回す
    targets.sort((a, b) => {
      const ca = s.field[a], cb = s.field[b];
      const va = ca ? (ca.kind === 'corn' ? 10 : 0) + ca.growth : 0;
      const vb = cb ? (cb.kind === 'corn' ? 10 : 0) + cb.growth : 0;
      return vb - va;
    });
    useSymbol(s, i, targets[0]);
  }
  s.field.forEach((c, i) => { if (isRipe(c)) sell(s, i); });
  const t = nextTax(s);
  const reserve = t.daysLeft <= 3 ? t.amount : 0;
  for (let bought = true; bought;) {
    bought = false;
    for (const id of PRIORITY) {
      if (wants(s, id) && canBuy(s, id) && s.gold - upgradePrice(s, id) >= reserve) { buy(s, id); bought = true; break; }
    }
  }
}

const runs = Number(process.argv[2] ?? 2000);
// starter: 初回プレイ相当（太陽・雨のみ、レアのお守りなし） / full: 全解放
const mode = process.argv[3] ?? 'full';
// starter: 初回プレイ相当 / full: 全解放 / それ以外: ショップに並べる強化をカンマ区切りで指定（例 addSun,addGoldSeed）
const setup = mode === 'full'
  ? undefined
  : {
      shop: mode === 'starter' ? META.startUnlocked : (mode.split(',') as typeof META.startUnlocked),
      charmPool: CHARM_ORDER.filter((id) => !(id in META.charmUnlock)),
    };
console.log(`mode=${mode}`);
const days: number[] = [];
const firstBuy: number[] = [];
const goldAtTax: number[][] = [];
for (let n = 0; n < runs; n++) {
  const s = newGame(setup);
  while (!s.over && s.day < 200) {
    if (s.day > 0 && s.day % CONFIG.taxPeriod === 0) (goldAtTax[s.day / CONFIG.taxPeriod - 1] ??= []).push(s.gold);
    const r = startDay(s, Math.random);
    if (!r.ok) break;
    resolveFever(s, Math.random);
    if (s.charmOffer) chooseCharm(s, s.charmOffer[0]);
    resolveAllAuto(s, Math.random);
    playDay(s);
  }
  days.push(s.day);
  firstBuy.push(s.stats.purchases[0]?.day ?? NaN);
}

const avg = (a: number[]) => a.filter((x) => !Number.isNaN(x)).reduce((x, y) => x + y, 0) / a.filter((x) => !Number.isNaN(x)).length;
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
console.log(`runs=${runs}`);
console.log(`到達日数 avg=${avg(days).toFixed(1)} p10=${pct(days, 0.1)} p50=${pct(days, 0.5)} p90=${pct(days, 0.9)}`);
console.log(`最初の強化 avg=${avg(firstBuy).toFixed(1)}日目`);
goldAtTax.slice(0, 9).forEach((g, i) => {
  const passRate = g.filter((x) => x >= (CONFIG.taxSchedule[i] ?? Infinity)).length / runs;
  console.log(`年貢${i + 1}回目 到達${g.length} 所持金p50=${pct(g, 0.5)} 通過率(全体比)=${(passRate * 100).toFixed(0)}%`);
});

