// 一枚絵の説明カード：ゲームの全体像（初めてのスタート）・初めて出た絵柄・初めての組み合わせ。
// 文字は1行まで。形・数字・矢印の絵で伝える。タップで閉じる。一度出たものは meta.hints に残して二度と出さない

import { L } from '../i18n.ts';
import { CHARMS, COMBOS, CONFIG, CROPS, type CharmId, SEEDS, SHAPE_NAMES, type ShapeId, symbolBase, type SymbolId, SYMBOLS } from '../config.ts';
import { symbolShape } from '../game.ts';
import { art, type ArtId } from '../art.ts';
import { sfx } from '../audio.ts';
import { later } from '../fx.ts';
import { saveMeta } from '../meta.ts';
import { el, meta, state } from './store.ts';
import { armFresh } from './tapguard.ts';
import { FRUIT } from './view.ts';

/** チュートリアルで教える絵柄（チュートリアルを終えたら、カードは出さない） */
export const TUTORIAL_SYMBOLS: SymbolId[] = ['seed', 'rain', 'thunder', 'sun', 'coin'];

/** 自動の確認（画面の点検・通しのテスト）では出さない */
function noExplain(): boolean {
  try {
    return localStorage.getItem('hatake-slot:noexplain') === '1';
  } catch {
    return false;
  }
}

/** 一度だけ出す。もう出したか、チュートリアル中なら何もしない */
export async function explainOnce(key: string, html: string, tut = false): Promise<void> {
  if (tut || meta.hints.includes(key) || noExplain()) return;
  meta.hints.push(key);
  saveMeta(meta);
  await showExplain(html);
}

/** 説明カードを全部もう一度出すようにする（設定から） */
export function resetExplains(): void {
  meta.hints = meta.hints.filter((k) => !k.startsWith('ex:'));
  saveMeta(meta);
}

/** チュートリアルで教えた絵柄は、もう出さない */
export function markTutorialSymbols(): void {
  TUTORIAL_SYMBOLS.forEach((s) => meta.hints.includes(`ex:sym:${s}`) || meta.hints.push(`ex:sym:${s}`));
  saveMeta(meta);
}

export function showExplain(html: string): Promise<void> {
  return new Promise((resolve) => {
    // ほかの窓（お守りの3択など）が開いているときは、閉じてから重ねる
    const layer = document.createElement('div');
    layer.className = 'explain-layer';
    layer.innerHTML = `<div class="explain-card" role="dialog">${html}<p class="ex-tap">${L('タップで閉じる', 'Tap to close')}</p></div>`;
    document.body.appendChild(layer);
    armFresh(layer);
    sfx.charmOffer();
    const card = layer.querySelector('.explain-card') as HTMLElement;
    card.animate([{ transform: 'translateY(30px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    // 連打で読まずに閉じないよう、少し待ってから閉じられる
    let ready = false;
    later(() => (ready = true), 600);
    // 下の画面（タップで早送りなど）には伝えない
    const stop = (e: Event) => e.stopPropagation();
    layer.addEventListener('pointerdown', stop);
    layer.addEventListener('pointerup', stop);
    layer.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!ready) return;
      ready = false;
      sfx.select();
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).onfinish = () => {
        layer.remove();
        resolve();
      };
    });
  });
}

// ---- 絵の部品 ----

const big = (id: ArtId, cls = ''): string => `<span class="ex-art ${cls}">${art(id)}</span>`;

/** 効く形を5×5のマス目で。真ん中が選んだマス、色のマスに効く */
function shapeGrid(shape: ShapeId, amount: string, center?: string, mini = false): string {
  const on = (dx: number, dy: number): boolean => {
    switch (shape) {
      case 'all': return true;
      case 'one': return !dx && !dy;
      case 'cross': return !dx || !dy;
      case 'column': return !dx;
      case 'row': return !dy;
      case 'x': return Math.abs(dx) === Math.abs(dy) && Math.abs(dx) <= 1;
      case 'xline': return Math.abs(dx) === Math.abs(dy);
      case 'col3': return Math.abs(dx) <= 1;
      case 'box': return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      case 'plus': return Math.abs(dx) + Math.abs(dy) <= 1;
    }
  };
  let cells = '';
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++) {
      const hit = on(x, y);
      const mid = !x && !y;
      cells += `<i class="${hit ? 'on' : ''}${mid ? ' mid' : ''}">${hit ? `<b>${mid && center ? center : amount}</b>` : ''}</i>`;
    }
  return `<span class="ex-grid${mini ? ' mini' : ''}">${cells}</span>`;
}

/** 手で使う成長系の、効く量（形のマスに書く数） */
const AMOUNT: Partial<Record<SymbolId, [string, string?]>> = {
  rain: ['+1'], bigRain: ['+1', '+2'], sun: ['+1'], bigSun: ['+1'], thunder: ['+2'], raijin: ['+3'], bee: ['+1'], queenBee: ['+1'], moon: ['+1'],
  hoe: [L('耕', 'T')], superFert: ['×1.5'], can: ['+2'],
};

const KIND_TAG = (sym: SymbolId): string => {
  const d = SYMBOLS[sym];
  if (d.rarity === 'bad') return `<span class="ex-tag bad">${L('お邪魔', 'Pest')}</span>`;
  if (d.kind === 'auto') return `<span class="ex-tag auto">${L('出たら勝手に効く', 'Works by itself')}</span>`;
  return `<span class="ex-tag manual">${L('タップして畑に使う', 'Tap, then use on the field')}</span>`;
};

/** 初めて出た絵柄のカード */
/** お邪魔の狙う所・効き目（説明カードとお邪魔の窓で同じ言葉を使う） */
export const PEST_TARGET: Partial<Record<SymbolId, string>> = { crow: L('一番高い実り', 'Best ripe crop'), bug: L('もうすぐ実る作物', 'Nearly ripe crop'), weed: L('作物の隣の空き', 'Gaps by crops'), locust: L('袋（畑は無事）', 'Your bag (not crops)'), tanuki: L('一番高い実り', 'Best ripe crop') };
export const PEST_EFFECT: Partial<Record<SymbolId, string>> = { crow: L('1/2で食べる', 'Eats 1/2'), bug: L('成長 −1', 'Growth −1'), weed: L('ふさいで広がる', 'Blocks, spreads'), locust: L('1/2で袋に+1', '1/2: +1 in bag'), tanuki: L('盗む', 'Steals') };

/** 説明の1行：頭に絵、真ん中に何のことか、後ろに数字か一言（どの行も同じ幅） */
const row = (ico: string, label: string, value: string): string => `<div class="ex-r"><span class="ex-r-ico">${ico}</span><span class="ex-r-k">${label}</span><b class="ex-r-v">${value}</b></div>`;

/** 札ごとの説明の行（docs/ui-reading.md：1行に1つ・短く・同じ幅） */
function symbolRows(sym: SymbolId): string[] {
  const d = SYMBOLS[sym];
  const seed = SEEDS[sym];
  if (seed) {
    const crop = CROPS[seed.crop];
    const counts = CONFIG.seedCountWeights.map((w) => w.count);
    const n = seed.single ? '1' : `${Math.min(...counts) + seed.extra}〜${Math.max(...counts) + seed.extra}`;
    return [
      row(art(FRUIT[seed.crop]), L('植わる数', 'Plants'), L(`${n}個`, n)),
      row(art('sprout'), L('実るまで', 'Ripens in'), L(`${crop.ripe}回`, `${crop.ripe}`)),
      row(art('coin'), L('売値', 'Price'), `${crop.price}`),
      ...(crop.big ? [row(art('expand'), L('大きさ', 'Size'), '2×2')] : []),
    ];
  }
  if (sym === 'moon') return [row(art('moonHalf'), L('満ちる', 'Waxes'), L('出るたびに1つ', 'Each time')), row(art('moon'), L('満月で', 'Full moon'), L('畑全体 +1', 'Whole field +1'))];
  if (sym === 'egg') return [row(art('eggCrack2'), L('孵るまで', 'Hatches in'), L(`${CONFIG.eggHatch}回`, `${CONFIG.eggHatch}`)), row(art('swallow'), L('生まれる', 'Becomes'), L('ツバメ', 'Swallow'))];
  if (sym === 'swallow') return [row(art('bug'), L('袋の虫', 'Bag bugs'), L('1枚 追い出す', '−1')), row(art('coin'), L('虫がいない', 'No bugs'), '+2')];
  if (sym === 'hawk') return [row(art('crow'), L('袋のカラス', 'Bag crows'), L('1枚 追い出す', '−1')), row(art('coin'), L('カラスがいない', 'No crows'), '+2')];
  if (sym === 'coin') return [row(art('coin'), L('お金', 'Gold'), `+${CONFIG.coinAmount}`)];
  if (symbolBase(sym) === 'fertilizer') return [row(art('fertilizer'), L('売値', 'Price'), '×1.5')];
  if (d.kind === 'manual') {
    const shape = symbolShape(state, sym);
    const [amt, mid] = AMOUNT[sym] ?? ['+1'];
    return [
      ...(shape ? [row(shapeGrid(shape, '', undefined, true), L('効く所', 'Area'), SHAPE_NAMES[shape])] : []),
      row(art('sprout'), L('育つ', 'Growth'), mid ? `${amt}（${L('真ん中', 'center')}${mid}）` : amt),
    ];
  }
  if (d.rarity === 'bad') {
    const target = PEST_TARGET;
    const effect = PEST_EFFECT;
    return [
      row(art('warn'), L('狙う所', 'Targets'), target[sym] ?? '—'),
      row(art(sym as ArtId), L('効き目', 'Effect'), effect[sym] ?? d.desc),
      row(art('scarecrow'), L('守り', 'Guard'), sym === 'tanuki' || sym === 'crow' ? L('かかし', 'Scarecrow') : L('かかし・鶏小屋', 'Scarecrow, hen')),
      row(art('bargain'), L('市で', 'Market'), L('消せる', 'Remove')),
    ];
  }
  return [row(art(sym as ArtId), L('効き目', 'Effect'), d.desc)];
}

export function symbolCard(sym: SymbolId, fresh = true): string {
  const d = SYMBOLS[sym];
  const seed = SEEDS[sym];
  // 大きな絵：種は袋 → 作物、月・卵は移り変わり、ほかは絵1つ
  let pic = '';
  if (seed) pic = `<div class="ex-row">${big(sym)}<span class="ex-arrow">▶</span>${big(FRUIT[seed.crop])}</div>`;
  else if (sym === 'egg') pic = `<div class="ex-row ex-moon">${(['egg', 'eggCrack1', 'eggCrack2'] as ArtId[]).map((a) => big(a, 'small')).join('<span class="ex-arrow">▶</span>')}<span class="ex-arrow">▶</span>${big('swallow', 'small')}</div>`;
  else if (sym === 'moon') pic = `<div class="ex-row ex-moon">${(['moonNew', 'moonCrescent', 'moonHalf'] as ArtId[]).map((a) => big(a, 'small')).join('<span class="ex-arrow">▶</span>')}<span class="ex-arrow">▶</span>${big('moon', 'small')}</div>`;
  else {
    // 畑のマスに効く札（雨・太陽・雷・蜂・じょうろ・肥料など）は、大きなマス目だけで分かる（行は出さない）
    const shape = d.kind === 'manual' ? (symbolBase(sym) === 'fertilizer' && !symbolShape(state, sym) ? 'one' : symbolShape(state, sym)) : undefined;
    if (shape && shape !== 'all') {
      const [amt, mid] = symbolBase(sym) === 'fertilizer' ? ['×1.5'] : (AMOUNT[sym] ?? ['+1']);
      return `<p class="ex-kicker">${fresh ? L('はじめての絵柄', 'New symbol') : L('絵柄', 'Symbol')}</p>
        <h2 class="ex-title">${d.name}</h2>${KIND_TAG(sym)}
        <div class="ex-row ex-shape">${big(sym)}<span class="ex-arrow">▶</span>${shapeGrid(shape, amt, mid)}</div>`;
    }
    pic = `<div class="ex-row">${big(sym, d.rarity === 'bad' ? 'bad' : '')}</div>`;
  }
  return `<p class="ex-kicker">${fresh ? L('はじめての絵柄', 'New symbol') : L('絵柄', 'Symbol')}</p>
    <h2 class="ex-title">${d.name}</h2>${KIND_TAG(sym)}
    ${pic}
    <div class="ex-rows">${symbolRows(sym).join('')}</div>`;
}

/** 初めての組み合わせのカード：絵柄＋絵柄＝効果 */
export function comboCard(id: CharmId): string {
  const need = COMBOS[id] ?? {};
  const parts = (Object.entries(need) as [SymbolId, number][]).flatMap(([s, n]) => Array.from({ length: n }, () => big(s, 'small')));
  return `<p class="ex-kicker">${L('はじめての組み合わせ', 'New combo')}</p>
    <h2 class="ex-title">${CHARMS[id].name}</h2>
    <div class="ex-row combo">${parts.join('<span class="ex-plus">＋</span>')}<span class="ex-arrow">＝</span>${big(id as ArtId)}</div>
    <p class="ex-line">${CHARMS[id].desc(1)}</p>
    <p class="ex-note">${L('同じ日のリールにそろうと、その日だけ効く', 'Works for the day when they show up together')}</p>`;
}

/** ゲームの全体像：1日の流れと、週の流れ */
export function overviewCard(start = true): string {
  // 遊び方の一枚絵（画面いっぱい）：文は使わず、単語・数字・絵だけで、上から下へ4つの手順
  // 1 回す → 2 育つ → 3 並べて売る（×1.3 → お金）→ 4 年貢（7日ごと ×7 → クリア）
  const down = '<span class="ov4-down">▼</span>';
  const step = (n: number, word: string) => `<p class="ov4-step"><span class="ov4-num">${n}</span>${word}</p>`;
  // 絵の下に一言（絵だけだと何か分からないので、短い単語と組にする）
  const cap = (a: ArtId, word: string) => `<span class="ov4-cap">${art(a)}<small>${word}</small></span>`;
  const machine = `<span class="ov3-machine ov4-big"><span class="ov3-win">${([['seed', L('種', 'Seed')], ['rain', L('雨', 'Rain')], ['sun', L('太陽', 'Sun')]] as [ArtId, string][]).map(([a, w]) => `<i>${cap(a, w)}</i>`).join('')}</span></span>`;
  const grow = `<span class="ov4-grow"><i>${cap('sprout', L('芽', 'Sprout'))}</i><b>▶</b><i>${cap('leaf', L('葉', 'Leaf'))}</i><b>▶</b><i>${cap('tomato', L('実り', 'Ripe'))}</i></span>`;
  const sell = `<span class="ov4-sell"><span class="ov3-plots">${art('tomato')}${art('tomato')}${art('tomato')}</span><em class="ov3-hint">×1.3</em><b>▶</b>${cap('coin', L('お金', 'Gold'))}</span>`;
  const tax = `<span class="ov4-tax">${cap('bale', L(`${CONFIG.taxPeriod}日ごと`, `Every ${CONFIG.taxPeriod} days`))}<em>×${CONFIG.winTaxes}</em><b>▶</b>${cap('trophy', L('クリア', 'Clear'))}</span>`;
  return `<div class="ov4" aria-label="${L('遊び方', 'How to play')}">
    ${step(1, L('回す', 'Spin'))}${machine}${down}
    ${step(2, L('育つ', 'Grow'))}${grow}${down}
    ${step(3, L('3つ並べて売る', 'Sell 3 in a row'))}${sell}${down}
    ${step(4, L('年貢', 'Tax'))}${tax}
    <button class="ov4-go" aria-label="${start ? L('はじめる', 'Start') : L('とじる', 'Close')}">${start ? '▶' : '✕'}</button>
  </div>`;
}

// ---- 初めての場面のカード ----

/** 初めての「タダで1つ選ぶ」（市の日の朝。選ばないと先に進めない） */
export function offerCard(): string {
  return `<p class="ex-kicker">${L('市の日の朝', 'Market morning')}</p>
    <h2 class="ex-title">${L('タダで1つ選ぶ', 'Pick one, free')}</h2>
    <div class="ex-row"><span class="ex-trio">${big('rain', 'small')}<span class="ex-pick">${big('seed', 'small')}</span>${big('sun', 'small')}</span><span class="ex-arrow">▶</span>${big('seed', 'bag')}</div>
    <p class="ex-line">${L('<b>必ず1つ</b>。袋に入って、次の日から出る', '<b>You must pick one.</b> It joins your bag from tomorrow')}</p>`;
}

/** 初めての市（買い物） */
export function marketCard(): string {
  return `<p class="ex-kicker">${L('はじめての市', 'Your first market')}</p>
    <h2 class="ex-title">${L('市で買い物', 'Shop at the market')}</h2>
    <div class="ex-icons">${[['expand', L('畑を広げる', 'Expand')], ['hive', L('置き物', 'Items')], ['crow', L('お邪魔を消す', 'Remove pests')]].map(([a, t]) => `<span>${art(a as ArtId)}<b>${t}</b></span>`).join('')}</div>
    <p class="ex-line">${art('coin')} ${L(`市の日は<b>売値×${CONFIG.marketDaySell}</b>`, `Crops sell for <b>×${CONFIG.marketDaySell}</b> on market days`)}</p>
    <p class="ex-note">${L('買わなくてもよい。次へで市を出る', 'Buying is optional. Press Next to leave')}</p>`;
}

/** 初めての年貢の日 */
export function taxCard(amount: number): string {
  return `<p class="ex-kicker">${L('はじめての年貢', 'Your first tax')}</p>
    <h2 class="ex-title">${L('日曜の終わりに年貢', 'Tax at the end of Sunday')}</h2>
    <div class="ex-row">${big('bale')}<b class="ex-num">${amount}</b><span class="ex-arrow">▶</span>${big('official', 'small')}</div>
    <p class="ex-line">${L('<b>足りないと終わり</b>。今日のうちに売って稼ぐ', '<b>Short = game over.</b> Sell today to make it')}</p>
    <div class="ex-icons"><span>${art('gift')}<b>${L('払うとお守り1つ', 'Pay → pick a charm')}</b></span><span>${art('crow')}<b>${L('お邪魔が袋に増える', 'Pests join your bag')}</b></span></div>`;
}

/** 初めての週契約 */
export function contractCard(): string {
  return `<p class="ex-kicker">${L('はじめての週契約', 'Your first contract')}</p>
    <h2 class="ex-title">${L('今週だけの縛り', 'A rule for this week only')}</h2>
    <div class="ex-ribbon"><span>${L('月', 'M')}</span><i></i><span>${L('日', 'S')}</span></div>
    <div class="ex-row">${big('lock', 'small')}<span class="ex-arrow">▶</span>${big('bale', 'small')}<span class="ex-arrow">▶</span>${big('gift', 'small')}</div>
    <p class="ex-line">${L('3つから<b>1つ必ず</b>選ぶ。日曜の年貢を払えたら見返り', 'Pick <b>one</b>. Pay Sunday’s tax to get the reward')}</p>
    <p class="ex-note">${L('★が多いほど縛りがきつく、見返りも大きい', 'More ★ = harder rule, bigger reward')}</p>`;
}

/** 初めて合体できるようになった */
export function mergeCard(sym: SymbolId, to: SymbolId, cost: number): string {
  return `<p class="ex-kicker">${L('はじめての合体', 'Your first merge')}</p>
    <h2 class="ex-title">${L(`同じ札${CONFIG.mergeNeed}枚で合体`, `${CONFIG.mergeNeed} of a kind → merge`)}</h2>
    <div class="ex-row"><span class="ex-stack">${Array.from({ length: CONFIG.mergeNeed }, () => art(sym)).join('')}</span><span class="ex-arrow">▶</span>${big(to)}</div>
    <p class="ex-line">${L('袋が薄くなって、強い札が1枚に', 'A thinner bag and one strong card')}</p>
    <div class="ex-icons"><span>${art('coin')}<b>${cost}${L('（年貢の30%）', ' (30% of tax)')}</b></span><span>${art('bargain')}<b>${L('市で1回まで', 'Once per market')}</b></span></div>`;
}

/** 初めてのフィーバー：通常の効き目 → フィーバーで変わること → 大当たり（docs/ui-reading.md：同じ幅の行） */
export function feverCard(sym: SymbolId, jackpot: number): string {
  const d = SYMBOLS[sym];
  const bad = d.rarity === 'bad';
  const [name, effect] = d.feverDesc.includes('：') ? d.feverDesc.split('：') : ['', d.feverDesc];
  const rows = [
    row(art(sym as ArtId), L('ふだん', 'Normally'), d.kind === 'manual' && SEEDS[sym] ? L('植える', 'Plant') : bad ? L('お邪魔', 'Pest') : d.desc.length <= 10 ? d.desc : L('いつもの効き目', 'Usual effect')),
    row(art('flame'), name || L('フィーバー', 'Fever'), effect.length <= 12 ? effect : L('効き目が変わる', 'Effect changes')),
    ...(bad ? [row(art('warn'), L('お邪魔は', 'Pests'), L('効き目2倍', '×2 effect'))] : [row(art('coin'), L('大当たり', 'Jackpot'), `+${jackpot}`)]),
  ];
  return `<p class="ex-kicker">${L('はじめてのフィーバー', 'Your first fever')}</p>
    <h2 class="ex-title">${L('同じ絵柄が3つ！', '3 of a kind!')}</h2>
    <div class="ex-row ex-trio">${big(sym, 'small')}${big(sym, 'small')}${big(sym, 'small')}</div>
    <div class="ex-rows">${rows.join('')}</div>
    ${bad || effect.length <= 12 ? '' : `<p class="ex-note">${effect}</p>`}`;
}
