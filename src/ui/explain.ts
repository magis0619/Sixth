// 一枚絵の説明カード：ゲームの全体像（初めてのスタート）・初めて出た絵柄・初めての組み合わせ。
// 文字は1行まで。形・数字・矢印の絵で伝える。タップで閉じる。一度出たものは meta.hints に残して二度と出さない

import { L } from '../i18n.ts';
import { CHARMS, COMBOS, CONFIG, CROPS, type CharmId, SEEDS, type ShapeId, type SymbolId, SYMBOLS } from '../config.ts';
import { symbolShape } from '../game.ts';
import { art, type ArtId } from '../art.ts';
import { sfx } from '../audio.ts';
import { later } from '../fx.ts';
import { saveMeta } from '../meta.ts';
import { el, meta, state } from './store.ts';
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
function shapeGrid(shape: ShapeId, amount: string, center?: string): string {
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
  return `<span class="ex-grid">${cells}</span>`;
}

/** 手で使う成長系の、効く量（形のマスに書く数） */
const AMOUNT: Partial<Record<SymbolId, [string, string?]>> = {
  rain: ['+1'], bigRain: ['+1', '+2'], sun: ['+1'], bigSun: ['+1'], thunder: ['+2'], raijin: ['+3'], bee: ['+1'], queenBee: ['+1'], moon: ['+1'],
  hoe: [L('耕', 'T')], superFert: ['×1.5'],
};

const KIND_TAG = (sym: SymbolId): string => {
  const d = SYMBOLS[sym];
  if (d.rarity === 'bad') return `<span class="ex-tag bad">${L('お邪魔', 'Pest')}</span>`;
  if (d.kind === 'auto') return `<span class="ex-tag auto">${L('出たら勝手に効く', 'Works by itself')}</span>`;
  return `<span class="ex-tag manual">${L('タップして畑に使う', 'Tap, then use on the field')}</span>`;
};

/** 初めて出た絵柄のカード */
export function symbolCard(sym: SymbolId): string {
  const d = SYMBOLS[sym];
  const seed = SEEDS[sym];
  let pic = '';
  if (seed) {
    // 種：袋 → 作物（何個・何日で実る・いくらで売れる）
    const crop = CROPS[seed.crop];
    const counts = CONFIG.seedCountWeights.map((w) => w.count);
    const n = seed.single ? '×1' : `×${Math.min(...counts) + seed.extra}〜${Math.max(...counts) + seed.extra}`;
    pic = `<div class="ex-row">${big(sym)}<span class="ex-arrow">▶</span>${big(FRUIT[seed.crop])}<b class="ex-num">${n}</b></div>
      <div class="ex-facts"><span>${art('sprout')}<b>${crop.ripe}</b>${L('回で実る', ' to ripen')}</span><span>${art('coin')}<b>${crop.price}</b>${crop.big ? L('（2×2）', ' (2×2)') : ''}</span></div>`;
  } else if (sym === 'moon') {
    // 月：出るたびに満ちて、満月のときだけ畑全体+1
    pic = `<div class="ex-row ex-moon">${(['moonNew', 'moonCrescent', 'moonHalf'] as ArtId[]).map((a) => big(a, 'small')).join('<span class="ex-arrow">▶</span>')}<span class="ex-arrow">▶</span>${big('moon')}</div>
      <div class="ex-row">${shapeGrid('all', '+1')}</div>`;
  } else if (d.kind === 'manual' && (symbolShape(state, sym) || sym === 'fertilizer')) {
    const shape = sym === 'fertilizer' ? 'one' : symbolShape(state, sym)!;
    const [amt, mid] = sym === 'fertilizer' ? ['×1.5'] : (AMOUNT[sym] ?? ['+1']);
    pic = `<div class="ex-row">${big(sym)}<span class="ex-arrow">▶</span>${shapeGrid(shape, amt, mid)}</div>`;
  } else {
    pic = `<div class="ex-row">${big(sym, d.rarity === 'bad' ? 'bad' : '')}</div>`;
  }
  const pestNote = d.rarity === 'bad' ? `<p class="ex-note">${art('bargain')} ${L('市で消せる', 'Remove it at the market')}</p>` : '';
  return `<p class="ex-kicker">${L('はじめての絵柄', 'New symbol')}</p>
    <h2 class="ex-title">${d.name}</h2>${KIND_TAG(sym)}
    ${pic}
    <p class="ex-line">${d.desc}</p>${pestNote}
    <p class="ex-fever">${art('flame')} ${L('3つそろうと', '3 of a kind:')} ${d.feverDesc.split('：')[0]}</p>`;
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
export function overviewCard(): string {
  const step = (n: number, pic: string, label: string) => `<div class="ov-step"><span class="ov-n">${n}</span><span class="ov-pic">${pic}</span><b>${label}</b></div>`;
  const days = (L('月火水木金土日', 'MTWTFSS')).split('');
  return `<p class="ex-kicker">${L('畑スロットの遊び方', 'How Farm Slots works')}</p>
    <h2 class="ex-title">${L('1日の流れ', 'Each day')}</h2>
    <div class="ov-loop">
      ${step(1, `${art('seed')}${art('rain')}${art('coin')}`, L('リールを回す', 'Spin the reels'))}
      <span class="ov-arrow">▶</span>
      ${step(2, `${art('sprout')}${art('leaf')}${art('tomato')}`, L('畑に植えて育てる', 'Plant and grow'))}
      <span class="ov-arrow">▶</span>
      ${step(3, `${art('tomato')}${art('tomato')}${art('tomato')}`, L('3つ並べて売る', 'Sell 3 in a row'))}
    </div>
    <h2 class="ex-title">${L('1週間の流れ', 'Each week')}</h2>
    <div class="ov-week">${days.map((d, k) => `<span class="${k === 2 || k === 5 ? 'mk' : ''}${k === 6 ? ' tx' : ''}"><b>${d}</b>${k === 2 || k === 5 ? art('bargain') : k === 6 ? art('bale') : ''}</span>`).join('')}</div>
    <div class="ov-legend"><span>${art('bargain')} ${L(`水・土は市（袋に絵柄を足す・売値×${CONFIG.marketDaySell}）`, `Wed/Sat: market (add symbols, prices ×${CONFIG.marketDaySell})`)}</span><span>${art('bale')} ${L('日曜の終わりに年貢', 'Tax at the end of Sunday')}</span></div>
    <div class="ov-goal">${art('trophy')}<b>${L(`年貢を${CONFIG.winTaxes}回納めたらクリア`, `Pay ${CONFIG.winTaxes} taxes to win`)}</b><span>${L('払えないと終わり', "Can't pay = game over")}</span></div>`;
}

// ---- 初めての場面のカード ----

/** 初めての市 */
export function marketCard(): string {
  return `<p class="ex-kicker">${L('はじめての市', 'Your first market')}</p>
    <h2 class="ex-title">${L('水・土の朝は市', 'Wed & Sat mornings: market')}</h2>
    <div class="ex-row"><span class="ex-trio">${big('rain', 'small')}${big('sun', 'small')}${big('seed', 'small')}</span><span class="ex-arrow">▶</span>${big('seed', 'bag')}</div>
    <p class="ex-line">${L('3つから<b>1つ必ず</b>、タダで袋に入る', 'Pick <b>one of three</b>, free, into your bag')}</p>
    <div class="ex-icons">${[['expand', L('畑を広げる', 'Expand')], ['scarecrow', L('道具', 'Tools')], ['crow', L('お邪魔を消す', 'Remove pests')]].map(([a, t]) => `<span>${art(a as ArtId)}<b>${t}</b></span>`).join('')}</div>
    <p class="ex-line">${art('coin')} ${L(`市の日は<b>売値×${CONFIG.marketDaySell}</b>。この日に実るように育てよう`, `Crops sell for <b>×${CONFIG.marketDaySell}</b> on market days. Time your harvest`)}</p>`;
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
