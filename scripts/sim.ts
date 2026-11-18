// ボットで遊ばせてバランスを確認する。
// npm run sim -- [回数] [starter|full|addX,addY…] [player|smart|random]   （FOCUS=1 で買い物を絞る）
//   player: プレイヤー程度に考える（scripts/player-bot.ts）。STOPCLEAR=1 でクリアしたら止める
//   LOOPSTATS=1 で1日の中身（種・育てる・お邪魔の出目、植えた・育った・売った量、空きマス）を週ごとに出す
//   NONEW=1 で、2026-11-18に足したお守り6つを候補から外して比べる
//   試し：DIFF=難しさ / TAX=年貢の表 / DMULT=難しさごとの年貢の倍率 / REELUP=2,4（その回数の年貢でリール+1）/ SEEDW=トマトの種の出やすさ
//   smart: 列を狙って置き、列がそろうまで待つ / random: 置き場所・使う場所・買い物を適当に決め、実ったらすぐ売る

import { CHARMS, CHARM_ORDER, CONFIG, FARMERS, CROPS, META, PLACES, SEEDS, SYMBOLS, type CropKind, type PlaceId, type UpgradeId } from '../src/config.ts';
import {
  takeOffer,
  buy, buyPlace, canBuy, canBuyPlace, canExpand, canPlace, expand, expandPrice, canUse, cellAt, cellX, cellY, chooseCharm, fieldCells,
  isOpen, isRipe, newGame, nextTax, place, placePrice, pullWeed, resolveAllAuto, resolveFever, ripeGroup, sell, shapeCells,
  startDay, takeContract, logSnapshot, mergeable, mergeSymbol, upgradePrice, useSymbol, validTargets, type GameState,
} from '../src/game.ts';
import { pickCharm, pickOffer, playerDay } from './player-bot.ts';

const runs = Number(process.argv[2] ?? 2000);
const mode = process.argv[3] ?? 'full';
const bot = process.argv[4] ?? 'smart';
// player はプレイヤー程度に考えるボット（scripts/player-bot.ts）
const player = bot === 'player';
const smart = bot === 'smart' || player;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// 絵柄袋を薄めすぎないよう、良い絵柄は枚数に上限を設けて買う
function wants(s: GameState, id: UpgradeId): boolean {
  if (id === 'addSun') return s.bag.sun < 3;
  if (id === 'addGoldSeed') return s.bag.goldSeed < 3;
  if (id === 'addFertilizer') return s.bag.fertilizer < 2;
  if (id === 'addBee') return s.bag.bee < 2;
  if (id === 'addMerchant') return s.bag.merchant < 2;
  if (id === 'addClover') return s.bag.clover < 1;
  if (id === 'addMoon') return s.bag.moon < 3;
  if (id === 'addSeed') return s.bag.seed < 5;
  if (id === 'addRain') return s.bag.rain < 4;
  if (id === 'addBerrySeed') return s.bag.berrySeed < 3;
  if (id === 'addPumpkinSeed') return s.bag.pumpkinSeed < 2;
  if (id === 'addWatermelonSeed') return s.bag.watermelonSeed < 2;
  if (id === 'addHoe') return s.bag.hoe < 1 && (s.bag.weed > 0 || s.bag.frost > 0);
  return true;
}
// FOCUS=1 は種をトマトに絞って買う（袋を薄めない買い方）
const PRIORITY: UpgradeId[] = process.env.FOCUS
  ? ['removeLocust', 'removeTanuki', 'removeFrost', 'removeWeed', 'removeMole', 'removeBug', 'removeCrow', 'addSeed', 'addRain', 'addSun', 'addMoon', 'addBee', 'addFertilizer']
  : ['removeLocust', 'removeTanuki', 'removeFrost', 'removeWeed', 'removeMole', 'removeBug', 'removeCrow', 'addHoe', 'addSeed', 'addBerrySeed', 'addPumpkinSeed', 'addWatermelonSeed', 'addRain', 'addGoldSeed', 'addSun', 'addMoon', 'addBee', 'addFertilizer', 'addMerchant', 'addClover'];

/** 3マスの並び（縦・横・斜め）全部。列になり得る窓 */
function windows(s: GameState): number[][] {
  const out: number[][] = [];
  for (const c of fieldCells(s)) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const w = [0, 1, 2].map((k) => cellAt(s, cellX(c) + dx * k, cellY(c) + dy * k));
      if (w.every((x) => x !== null)) out.push(w as number[]);
    }
  }
  return out;
}

/** 列になり得る（道具・雑草がない）窓 */
const usable = (s: GameState, w: number[]) => w.every((c) => !s.tools[c] && !s.weeds[c]);

/** kind を cell に植えたときの列の見込み */
function plantScore(s: GameState, cell: number, kind: CropKind): number {
  let v = 0;
  for (const w of windows(s)) {
    if (!w.includes(cell) || !usable(s, w)) continue;
    const crops = w.map((c) => s.field[c]).filter(Boolean);
    const same = crops.every((c) => c!.kind === kind);
    v += 1 + crops.length * (same ? 3 : 1);
  }
  return v;
}

/** ripe な cell に、そろう見込みの列が残っているか */
function hasPotential(s: GameState, cell: number): boolean {
  return windows(s).some((w) => w.includes(cell) && usable(s, w) && w.every((c) => c === cell || s.field[c] || isOpen(s, c)));
}

function placeStock(s: GameState): void {
  while (s.stock.length) {
    const cells = fieldCells(s).filter((c) => canPlace(s, c));
    if (!cells.length) return;
    if (!smart) { place(s, pick(cells)); continue; }
    const id = s.stock[0];
    if (id === 'water') {
      cells.sort((a, b) => cellY(a) - cellY(b) || cellX(a) - cellX(b));
      place(s, cells[0]);
      continue;
    }
    // 道具は列を潰しにくい端へ、特別なマスは列の多い中央へ
    const lines = (c: number) => windows(s).filter((w) => w.includes(c)).length;
    cells.sort((a, b) => (PLACES[id].kind === 'tool' ? lines(a) - lines(b) : lines(b) - lines(a)));
    place(s, cells[0]);
  }
}

function playDay(s: GameState): void {
  s.weeds.forEach((w, i) => { if (w) pullWeed(s, i); });
  placeStock(s);
  const order = ['goldSeed', 'pumpkinSeed', 'seed', 'berrySeed', 'rain', 'bee', 'fertilizer', 'sun'];
  const idx = s.results.map((_, i) => i).sort((a, b) => order.indexOf(s.results[a].symbol) - order.indexOf(s.results[b].symbol));
  for (const i of idx) while (canUse(s, i, null)) {
    const sym = s.results[i].symbol;
    const targets = validTargets(s, i);
    if (!smart) { useSymbol(s, i, pick(targets)); continue; }
    const seed = SEEDS[sym];
    const shape = SYMBOLS[sym].shape;
    let score: (c: number) => number;
    if (seed && CROPS[seed.crop].big) score = (c) => (cellX(c) === 0 || cellY(c) === 0 ? 2 : 0) - plantScore(s, c, 'tomato') * 0.01;
    else if (seed) score = (c) => plantScore(s, c, seed.crop);
    else if (sym === 'hoe') score = (c) => shapeCells(s, 'row', c).reduce((n, x) => n + (s.weeds[x] ? 3 : s.frost[x] ? 2 : !s.field[x] && !s.tilled[x] ? 1 : 0), 0);
    else if (shape) score = (c) => shapeCells(s, shape, c).reduce((n, x) => {
      const crop = s.field[x];
      return n + (crop && !isRipe(crop) && !s.frost[x] ? 1 : 0);
    }, 0);
    else score = (c) => (s.field[c] ? ({ corn: 4, pumpkin: 3, tomato: 2, strawberry: 1 } as const)[s.field[c]!.kind] : 0);
    targets.sort((a, b) => score(b) - score(a));
    useSymbol(s, i, targets[0]);
  }
  const t = nextTax(s);
  const pressed = t.daysLeft <= 1 && s.gold < t.amount;
  const full = fieldCells(s).every((c) => !isOpen(s, c));
  for (const c of fieldCells(s)) {
    if (!isRipe(s.field[c])) continue;
    if (!smart) { sell(s, c); continue; }
    // 列がそろっていれば売る。そろう見込みがない・畑が詰まった・年貢が足りないときは単品で
    if (ripeGroup(s, c).length >= 3 || !hasPotential(s, c) || full || pressed) sell(s, c);
  }
  const reserve = t.daysLeft <= 3 ? t.amount : 0;
  for (let bought = true; bought;) {
    bought = false;
    if (!smart) {
      const opts: (() => boolean)[] = [];
      if (canExpand(s) && s.gold - expandPrice(s)! >= reserve) opts.push(() => expand(s));
      (Object.keys(PLACES) as PlaceId[]).forEach((id) => { if (canBuyPlace(s, id) && s.gold - placePrice(s, id)! >= reserve && Math.random() < 0.3) opts.push(() => buyPlace(s, id)); });
      PRIORITY.forEach((id) => { if (wants(s, id) && canBuy(s, id) && s.gold - upgradePrice(s, id) >= reserve) opts.push(() => buy(s, id)); });
      if (opts.length) { pick(opts)(); bought = true; }
      continue;
    }
    if (canExpand(s) && s.gold - expandPrice(s)! >= reserve) { expand(s); bought = true; continue; }
    if (!s.bought.compost && canBuyPlace(s, 'compost') && s.gold - placePrice(s, 'compost')! >= reserve) { buyPlace(s, 'compost'); bought = true; continue; }
    // ANIMALS=1 で鶏小屋・牛小屋も買う（毎晩お金が入る道具の強さを見る）
    if (process.env.ANIMALS) {
      // RANCH=1 は巣箱も1つ買って牧場（セット効果）を作る
      const kinds = process.env.RANCH ? (['henhouse', 'cowshed', 'hive'] as const) : (['henhouse', 'cowshed'] as const);
      const animal = kinds.find((id) => (s.bought[id] ?? 0) < (id === 'hive' ? 1 : 2) && canBuyPlace(s, id) && s.gold - placePrice(s, id)! >= reserve);
      if (animal) { buyPlace(s, animal); bought = true; continue; }
    }
    // WATER=1 で水路を一列に並べて水車を作る
    if (process.env.WATER && (s.bought.water ?? 0) < 4 && canBuyPlace(s, 'water') && s.gold - placePrice(s, 'water')! >= reserve) { buyPlace(s, 'water'); bought = true; continue; }
    for (const id of PRIORITY) {
      if (wants(s, id) && canBuy(s, id) && s.gold - upgradePrice(s, id) >= reserve) { buy(s, id); bought = true; break; }
    }
  }
  placeStock(s);
}

const setup = mode === 'full'
  ? undefined
  : {
      shop: process.env.FARMER ? (FARMERS.find((f) => f.id === process.env.FARMER)!.favor as typeof META.startUnlocked) : mode === 'starter' ? META.startUnlocked : (mode.split(',') as typeof META.startUnlocked),
      pool: mode === 'starter' ? META.startUnlocked : undefined,
      charmPool: CHARM_ORDER.filter((id) => !(id in META.charmUnlock) && !(process.env.NONEW && ['autumnHarvest', 'thunderGod', 'moonViewing', 'bigSpender', 'declutter', 'farmMaster'].includes(id))),
      // DIFF=1〜4 で難しいモード
      difficulty: Number(process.env.DIFF ?? 0),
      // FARMER=berry などで農家を選ぶ（市に出やすい品も農家のもの）
      farmer: process.env.FARMER ?? 'basic',
    };
// TAX=10,40,90,... で年貢の表を差し替えて試す（7回目まで。8回目以降は最後の値から伸びる）
if (process.env.TAX) (CONFIG as { taxSchedule: number[] }).taxSchedule = process.env.TAX.split(',').map(Number);
// 試し（ゲームには入れていない）：SEEDW=6 でトマトの種の出やすさ、REELS=4 で最初のリールの数
if (process.env.SEEDW) (CONFIG.offerWeights as Record<string, number>).addSeed = Number(process.env.SEEDW);
// DMULT=1,1.1,1.2,... で難しさごとの年貢の倍率を差し替えて試す
if (process.env.DMULT) (CONFIG as { difficultyTaxMult: number[] }).difficultyTaxMult = process.env.DMULT.split(',').map(Number);
// DAILY=0 で前の「週替わりの3品をショップで買う」と比べる
if (process.env.DAILY === '0') (CONFIG as { dailyPick: boolean }).dailyPick = false;
console.log(`mode=${mode} bot=${bot} daily=${CONFIG.dailyPick}`);
const days: number[] = [];
const dump: unknown[] = [];
const taxes: number[] = [];
const goldAtTax: number[][] = [];
const weekly: number[][] = [];
const loop: Record<string, number>[] = [];
for (let n = 0; n < runs; n++) {
  const s = newGame(setup);
  if (process.env.REELS) s.reels = Number(process.env.REELS);
  while (!s.over && s.day < 200 && !(process.env.STOPCLEAR && s.taxesPaid >= CONFIG.winTaxes)) {
    if (s.day > 0 && s.day % CONFIG.taxPeriod === 0) (goldAtTax[s.day / CONFIG.taxPeriod - 1] ??= []).push(s.gold);
    // 試し：REELUP=2,4 で、その回数の年貢を納めたらリール+1
    if (process.env.REELUP) s.reels = Math.max(s.reels, 3 + process.env.REELUP.split(',').map(Number).filter((k) => s.taxesPaid >= k).length);
    // 試し：NIGHTGROW=k で毎晩、育ち中の作物 k マスが+1（もうすぐ実る物から）。NIGHTGROW=tax なら k＝納めた回数
    if (process.env.NIGHTGROW && s.day > 0) {
      const k = process.env.NIGHTGROW === 'tax' ? s.taxesPaid : Number(process.env.NIGHTGROW);
      fieldCells(s).filter((c) => s.field[c] && !isRipe(s.field[c]) && s.field[c]!.anchor === undefined)
        .sort((a, b) => (CROPS[s.field[b]!.kind].ripe - s.field[b]!.growth) - (CROPS[s.field[a]!.kind].ripe - s.field[a]!.growth))
        .reverse().slice(0, k).forEach((c) => s.field[c]!.growth++);
    }
    const r = startDay(s, Math.random);
    if (!r.ok) break;
    resolveFever(s, Math.random);
    // 週契約：必ず1つ受ける（並んだ中からでたらめに）
    if (s.contractOffer.length) takeContract(s, pick(s.contractOffer));
    if (s.contractDone) s.contractDone = null;
    // RANDCHARM=1 はお守りをでたらめに選ぶ（どのお守りが強いかを比べる用）
    if (s.charmOffer) {
      if (player && !process.env.RANDCHARM) pickCharm(s);
      else chooseCharm(s, smart && !process.env.RANDCHARM ? (s.charmOffer.find((id) => !CHARMS[id].special) ?? s.charmOffer[0]) : pick(s.charmOffer));
    }
    resolveAllAuto(s, Math.random);
    if (player) {
      const o = pickOffer(s);
      if (o) takeOffer(s, o as never);
      playerDay(s);
      continue;
    }
    // 毎日の仕入れ：買い物の優先順で欲しい物があれば取る。なければ見送る（袋を薄めない）
    const want = PRIORITY.find((id) => s.offer.includes(id as never) && wants(s, id));
    if (want) takeOffer(s, want as never);
    // 見送れない仕入れは、欲しい物がなくても1つ取る
    else if (CONFIG.offerForced && s.offer.length) takeOffer(s, s.offer[0]);
    // 合体：MERGE=1 なら市で合体できる札があれば合体する
    if (process.env.MERGE === '1') { const m = mergeable(s); if (m.length) mergeSymbol(s, m[0]); }
    playDay(s);
  }
  // LOG=ファイル で最後の1プレイのプレイログ（画面の書き出しと同じ中身）を書き出す
  if (process.env.LOG && n === runs - 1) (await import('node:fs')).writeFileSync(process.env.LOG, [...logSnapshot(s), '---', ...s.log].join('\n'));
  // LOOPSTATS=1：1日の中身を数える（ログの行から）
  if (process.env.LOOPSTATS) {
    for (const line of s.log) {
      const m = line.match(/^D(\d+)/);
      if (!m) continue;
      const w = Math.floor((Number(m[1]) - 1) / CONFIG.taxPeriod);
      const b = (loop[w] ??= { days: 0, seedReels: 0, growReels: 0, pestReels: 0, planted: 0, sold: 0, expiredSeed: 0, expiredGrow: 0, empty: 0, cells: 0, growPts: 0 });
      if (line.includes(' 回す ')) {
        b.days++;
        const out = line.split('出目: ')[1]?.split(' フィーバー')[0].split(' 組み合わせ')[0].split(' / ') ?? [];
        for (const x of out) {
          const name = x.replace(/×\d+.*/, '');
          if (name.includes('種')) b.seedReels++;
          else if (['雨', '太陽', '雷', '蜂', 'じょうろ', '月', '大雨', '真夏の太陽', '雷神', '女王蜂'].includes(name)) b.growReels++;
          else if (['カラス', '虫', '雑草', 'タヌキ', 'イナゴ', '霜', 'モグラ'].includes(name)) b.pestReels++;
        }
      }
      if (line.includes(' 植える ')) b.planted++;
      const gp = line.match(/ 使う (雨|太陽|雷|蜂|じょうろ|月|大雨|真夏の太陽|雷神|女王蜂) .*効いたマス(\d+)/);
      if (gp) b.growPts += Number(gp[2]) * (gp[1] === '雷' || gp[1] === 'じょうろ' ? 2 : 1);
      const sold = line.match(/ 売る .*×(\d+) /);
      if (sold) b.sold += Number(sold[1]);
      const exp = line.split('使わず消えた:')[1];
      if (exp) for (const x of exp.split(' ')[0].split('・')) { if (x.includes('種')) b.expiredSeed++; else b.expiredGrow++; }
      const f = line.match(/ 畑 空き(\d+) 育ち中(\d+).*実り(\d+)/);
      if (f) { b.empty += Number(f[1]); b.cells += Number(f[1]) + Number(f[2]) + Number(f[3]); }
    }
  }
  days.push(s.day);
  taxes.push(s.taxesPaid);
  // 週ごとの稼ぎ（生きていた週だけ）
  for (let w = 0; w * CONFIG.taxPeriod < s.day; w++) {
    const sum = s.stats.earnedByDay.slice(w * CONFIG.taxPeriod + 1, (w + 1) * CONFIG.taxPeriod + 1).reduce((a: number, b) => a + (b ?? 0), 0);
    (weekly[w] ??= []).push(sum);
  }
  // DUMP=ファイル で1プレイごとの記録（持っていたお守り・置いた畑の品・袋）を書き出す
  if (process.env.DUMP) dump.push({ taxes: s.taxesPaid, got: s.stats.charms, buys: s.stats.purchases, charms: Object.fromEntries(Object.entries(s.charms).filter(([, v]) => v > 0)), bought: s.bought, bag: Object.fromEntries(Object.entries(s.bag).filter(([, v]) => v > 0)), cols: s.cols, rows: s.rows });
}
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(dump));

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
const passed = (k: number) => ((taxes.filter((t) => t >= k).length / runs) * 100).toFixed(0);
console.log(`runs=${runs} クリア率=${passed(CONFIG.winTaxes)}%`);
console.log(`到達日数 p10=${pct(days, 0.1)} p50=${pct(days, 0.5)} p90=${pct(days, 0.9)}`);
console.log(`年貢の通過率 ${CONFIG.taxSchedule.map((a, i) => `${i + 1}回目(${a})=${passed(i + 1)}%`).join(' ')}`);
if (process.env.LOOPSTATS) {
  console.log('週 | 種の出目/日 | 育てる出目/日 | お邪魔の出目/日 | 植えた個数/日 | 育った量/日 | 売った個数/日 | 消えた種/日 | 消えた育てる/日 | 朝の空きマス率');
  loop.slice(0, 7).forEach((b, w) => {
    const d = b.days || 1;
    const f = (x: number) => (x / d).toFixed(2);
    console.log(`${w + 1} | ${f(b.seedReels)} | ${f(b.growReels)} | ${f(b.pestReels)} | ${f(b.planted)} | ${f(b.growPts)} | ${f(b.sold)} | ${f(b.expiredSeed)} | ${f(b.expiredGrow)} | ${((b.empty / (b.cells || 1)) * 100).toFixed(0)}%`);
  });
}
console.log(`週の稼ぎp50 ${weekly.slice(0, 8).map((g) => `${pct(g, 0.5)}(${g.length})`).join(' / ')}`);
console.log(`年貢日の所持金p50 ${goldAtTax.slice(0, 8).map((g) => pct(g, 0.5)).join(' / ')}`);
