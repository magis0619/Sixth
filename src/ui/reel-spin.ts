// リールが回って止まる演出と、リールの下の札（結果・残りの数）

import { L } from '../i18n.ts';
import { CONFIG, SYMBOLS, type SymbolId } from '../config.ts';
import { canUse, drawSymbol } from '../game.ts';
import { sfx } from '../audio.ts';
import { art, type ArtId } from '../art.ts';
import { burst, center, flash, floatText, pop, vibrate, later } from '../fx.ts';
import { roleClass, symHtml } from './view.ts';
import { el, rng, state } from './store.ts';
import { play } from './play.ts';
import { CUTIN_MS, playCutIn } from './shows.ts';

/** 出目の絵（月は満ち欠けの形で） */
export const MOON_PHASE_ART: ArtId[] = ['moonNew', 'moonCrescent', 'moonHalf', 'moon'];

export function resultArt(i: number): string {
  const r = state.results[i];
  if (r?.symbol === 'moon' && r.moon !== undefined) return art(MOON_PHASE_ART[r.moon]);
  return symHtml(r.symbol);
}

export function reelTag(i: number): { text: string; cls: string } {
  const r = state.results[i];
  if (!r) return { text: '—', cls: '' };
  // 満ちていく途中の月：あと何回で満月か
  if (r.symbol === 'moon' && r.moon !== undefined && r.moon < 3) return { text: L(`満ちる ${r.moon}/3`, `Waxing ${r.moon}/3`), cls: 'used moon-wax' };
  const def = SYMBOLS[r.symbol];
  if (def.kind === 'auto') {
    // 絵柄はイラストで分かるので、札には結果だけを短く書く
    const text = play.autoOutcome[i] ?? L('自動', 'Auto');
    return { text, cls: def.rarity === 'bad' ? 'auto-bad used' : 'used' };
  }
  if (r.used) return { text: '', cls: 'used' };
  if (play.selected === i) return { text: '', cls: 'selected' };
  if (canUse(state, i, null)) return { text: '', cls: 'usable' };
  return { text: '', cls: 'dead' };
}

/** 出目の効く形を3×3のマス目で描く（光っているマスに効く） */
/** 種の残り個数バッジ（×2・×3） */
export function renderCount(reel: HTMLElement, i: number): void {
  const r = state.results[i];
  const win = reel.querySelector('.window')!;
  let badge = win.querySelector('.count');
  if (!r || r.total <= 1 || r.left <= 0) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'count';
    win.appendChild(badge);
  }
  badge.textContent = `×${r.left}`;
}

/** 回す前に決める見せ方。結果はもう決まっているので、それに合わせて煽る */
export interface SpinShow {
  /** カットインの色（0 青・1 緑・2 赤・3 虹）。null は出さない */
  cutIn: number | null;
}

export function spinReels(show: SpinShow = { cutIn: null }): Promise<void> {
  const reels = [...el.reels.children] as HTMLElement[];
  const h = reels[0].querySelector('.window')!.clientHeight;
  const last = state.results.length - 1;
  // リーチ：最後のリールより前で良い絵柄があと1つでそろう
  const counts = new Map<SymbolId, number>();
  state.results.slice(0, last).forEach((r) => counts.set(r.symbol, (counts.get(r.symbol) ?? 0) + 1));
  const reachSym = [...counts].find(([s, n]) => n >= CONFIG.feverCount - 1 && SYMBOLS[s].rarity !== 'bad')?.[0];
  const reach = reachSym !== undefined;
  // 最後のリールが金の種なら溜めを入れる。外れでもたまに溜めて読めないようにする
  const suspense = reach || state.results[last].symbol === 'goldSeed' || state.fever.some((s) => SYMBOLS[s].rarity !== 'bad') || (state.bag.goldSeed > 0 && rng() < 0.15);
  // カットインが出る日は、出ている間リールを回し続ける
  const extra = show.cutIn !== null ? CUTIN_MS : 0;
  const hold = reach ? 1500 : 600;
  if (show.cutIn !== null) later(() => void playCutIn(show.cutIn!), 150);
  // 前の回転のリーチが残っていれば片づける（念のため）
  el.machine.classList.remove('spotlight');
  el.machine.querySelector('.reach-call')?.remove();
  // 回転が終わったか。溜めの合図は時間で出すので、途中で早送りになると、止まったあとに届くことがある
  let landed = false;
  el.machine.classList.add('rumble');
  let tick = window.setInterval(() => sfx.tick(), 70);
  const promises = reels.map((reel, i) => {
    const strip = reel.querySelector('.strip') as HTMLElement;
    const prevSym = reel.querySelector('.cell-sym')!.innerHTML;
    const dur = CONFIG.timing.spinBase + i * CONFIG.timing.spinStagger + extra + (suspense && i === last ? hold : 0);
    const fillers = Math.max(8, Math.round(dur / 40));
    const items = [prevSym, ...Array.from({ length: fillers }, () => symHtml(drawSymbol(state.bag, rng))), resultArt(i)];
    strip.innerHTML = items.map((s) => `<div class="cell-sym">${s}</div>`).join('');
    reel.className = 'reel spinning';
    reel.querySelector('.tag')!.textContent = '…';
    if (suspense && i === last) {
      // ひとつ前のリールが止まったところから溜める
      later(() => {
        // 早送りで先に止まっていたら、リーチは出さない（出すと、暗くしたリールと「リーチ！」が残る）
        if (landed || !reel.classList.contains('spinning')) return;
        reel.classList.add('suspense');
        if (reach) {
          reel.classList.add('reach');
          el.machine.classList.add('spotlight');
          sfx.reach();
          vibrate([30, 290, 30, 290, 30]);
          // 何がそろいそうで、そろうと何が起きるか
          const call = document.createElement('div');
          call.className = 'reach-call';
          call.innerHTML = L(`リーチ！ あと1つで ${symHtml(reachSym!)}`, `REACH! One more ${symHtml(reachSym!)}`);
          el.machine.appendChild(call);
        }
      }, dur - hold);
    }
    const anim = strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-(items.length - 1) * h}px)` }], {
      duration: dur,
      easing: 'cubic-bezier(.15,.55,.25,1.04)',
      fill: 'forwards',
    });
    return anim.finished.then(() => {
      anim.cancel();
      strip.innerHTML = `<div class="cell-sym">${resultArt(i)}</div>`;
      reel.classList.remove('spinning', 'suspense', 'reach');
      sfx.reelStop(i);
      // 行き過ぎて戻る「ガコッ」
      strip.firstElementChild!.animate(
        [
          { transform: 'translateY(-22%) scale(1, 1.08)' },
          { transform: 'translateY(9%) scale(1.08, 0.92)', offset: 0.45 },
          { transform: 'translateY(-3%) scale(1)', offset: 0.75 },
          { transform: 'translateY(0)' },
        ],
        { duration: 260, easing: 'ease-out' },
      );
      if (i === reels.length - 1) clearInterval(tick);
      onReelLanded(i, reel);
    });
  });
  return Promise.all(promises).then(() => {
    landed = true;
    clearInterval(tick);
    tick = 0;
    el.machine.classList.remove('rumble', 'spotlight');
    el.machine.querySelector('.reach-call')?.remove();
  });
}

export function onReelLanded(i: number, reel: HTMLElement): void {
  const sym = state.results[i].symbol;
  const c = center(reel);
  if (sym === 'goldSeed') {
    sfx.rare();
    flash('#ffe680', 500);
    burst(c.x, c.y, ['✨', '🌟', '💛'], 16, 110);
    floatText(c.x, c.y - 40, L('レア！金の種', 'Rare! Golden seed'), { cls: 'gold', size: 1 });
    vibrate([30, 30, 60]);
  }
  const total = state.results[i].total;
  if (total > 1) {
    renderCount(reel, i);
    pop(reel.querySelector('.count')!, 1.6);
    if (total >= 3) {
      sfx.bonus();
      burst(c.x, c.y, ['🌰', '✨'], 12, 80);
      vibrate(40);
    }
  }
  const tag = reelTag(i);
  reel.className = `reel ${roleClass(sym)} ${sym === 'goldSeed' ? 'rare ' : ''}${SYMBOLS[sym].kind === 'auto' ? '' : tag.cls}`;
  reel.querySelector('.tag')!.textContent = SYMBOLS[sym].kind === 'auto' ? '…' : tag.text;
}
