// 殿様モードの表示：年貢の札の条件の印・月曜のお触れのカード・結果画面の殿様の顔
// ルールは src/game.ts の「殿様モード」（rollLordWeek・lordPenalty など）

import { art, type ArtId } from '../art.ts';
import { CONFIG, CROPS, type WhimId } from '../config.ts';
import { harvestShown, lordPenalty, taxCondGot, type GameState, type TaxCond } from '../game.ts';
import { L } from '../i18n.ts';
import { FRUIT, MARK_LINE } from './view.ts';

/** 条件の絵（作物の数は作物の絵） */
export function condIcon(c: TaxCond): string {
  switch (c.kind) {
    case 'crop':
      return art(FRUIT[c.crop ?? 'tomato']);
    case 'line':
      return MARK_LINE;
    case 'sameLine':
      return `${art(FRUIT.tomato)}${MARK_LINE}`;
    case 'big':
      return art('pumpkin');
    case 'keep':
      return art('calendar');
  }
}

/** 条件の短いことば（1行に1つ） */
export function condText(c: TaxCond): string {
  switch (c.kind) {
    case 'crop':
      return L(`${CROPS[c.crop ?? 'tomato'].name}を売る`, `Sell ${CROPS[c.crop ?? 'tomato'].name}`);
    case 'line':
      return L('列で売る', 'Sell in lines');
    case 'sameLine':
      return L('同じ作物の列で売る', 'Same-crop lines');
    case 'big':
      return L('かぼちゃかスイカを売る', 'Sell a pumpkin or melon');
    case 'keep':
      return L('日曜に実りを残す', 'Keep ripe crops on Sunday');
  }
}

export const WHIM_TEXT: Record<WhimId, { name: string; line: string; ico: ArtId }> = {
  frugal: { name: L('質素倹約', 'Frugality'), line: L('今週の市は開かない', 'No market this week'), ico: 'bargain' },
  flashy: { name: L('派手好き', 'Flashy taste'), line: L('単品はさらに半値', 'Singles sell for half again'), ico: 'coin' },
  patrol: { name: L('見回り', 'Patrol'), line: L('毎晩、実りを1つ持っていく', 'Takes a ripe crop every night'), ico: 'scarecrow' },
  harvest: { name: L('豊作を見たい', 'Show me a harvest'), line: L('日曜に畑の半分に作物', 'Half the field planted on Sunday'), ico: 'sprout' },
};

/** 年貢の札の横の印：条件の絵と「2/5」（届いたら緑）、気まぐれの殿様の顔、増える割合 */
export function lordChip(state: GameState): string {
  if (!state.lordLevel || (!state.taxCond && !state.whim)) return '';
  const c = state.taxCond;
  const got = c ? taxCondGot(state) : 0;
  return (
    (c ? `<em class="tax-cond${got >= c.need ? ' met' : ''}">${condIcon(c)}<b>${Math.min(got, c.need)}/${c.need}</b></em>` : '') +
    (state.whim ? `<em class="tax-whim">${art('lord')}</em>` : '')
  );
}

/** 月曜のお触れ：今週の年貢の条件と殿様の気まぐれ */
export function lordWeekCard(state: GameState): string {
  const rows: string[] = [];
  const c = state.taxCond;
  if (c) rows.push(`<p class="lw-row">${condIcon(c)}<span>${condText(c)}</span><b>${c.need}</b></p>`);
  if (state.whim) {
    const w = WHIM_TEXT[state.whim];
    rows.push(`<p class="lw-row whim">${art(w.ico)}<span><b>${w.name}</b><small>${w.line}</small></span></p>`);
  }
  if (state.whim === 'harvest') rows.push(`<p class="lw-row">${art('sprout')}<span>${L('植えるマス', 'Planted plots')}</span><b>${harvestShown(state).need}</b></p>`);
  return `<p class="ex-kicker">${L(`殿様のお触れ・${Math.ceil(state.day / CONFIG.taxPeriod)}週目`, `Lord's decree · week ${Math.ceil(state.day / CONFIG.taxPeriod)}`)}</p>
    <div class="lw-face">${art('lord')}</div>
    <div class="lw-rows">${rows.join('')}</div>
    <p class="ex-note">${c ? L(`日曜までに届かないと、1つごとに年貢+${Math.round(CONFIG.lord.condStep * 100)}%`, `Each one short by Sunday: tax +${Math.round(CONFIG.lord.condStep * 100)}%`) : L('今週だけ', 'This week only')}</p>`;
}
