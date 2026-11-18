// 列の演出（解放で選べる見た目）。遊び・お金には関わらない
import { art, type ArtId } from '../art.ts';
import { META } from '../config.ts';
import { burst, coinRain, firework, flutter, later } from '../fx.ts';
import { meta } from './store.ts';

const A = (id: ArtId) => art(id);

/** 今回の列で使う演出（なし・選んだ物・おまかせなら解放した中から1つ） */
export function activeLineFx(): string | null {
  const on = meta.lineFxOn;
  if (!on) return null;
  if (on === 'random') return meta.lineFx.length ? meta.lineFx[Math.floor(Math.random() * meta.lineFx.length)] : null;
  return meta.lineFx.includes(on) ? on : null;
}

/** 作物1つずつから飛ぶ粒 */
export function lineFxBits(id: string | null): string[] {
  switch (id) {
    case 'leaves': return [A('leafBit'), A('sprout')];
    case 'coins': return [A('coin')];
    case 'stars': return [A('star'), A('sparkle')];
    case 'hearts': return [A('heart')];
    case 'butterflies': return [A('butterfly')];
    case 'fireworks': return [A('sparkle'), A('star')];
    default: return ['✨', '🌟'];
  }
}

/** 合計が出るときの締め（level＝そろった列の数 1〜4） */
export function playLineFx(id: string | null, level: number, at?: { x: number; y: number }): void {
  const n = 18 + level * 8;
  switch (id) {
    case 'leaves': flutter([A('leafBit'), A('leafBit'), A('sprout')], n); break;
    case 'coins': coinRain(24 + level * 10); break;
    case 'stars':
      flutter([A('star'), A('sparkle')], n);
      if (at) burst(at.x, at.y, [A('star'), A('sparkle')], 14, 120);
      break;
    case 'hearts': flutter([A('heart')], n); break;
    case 'butterflies': flutter([A('butterfly')], Math.round(n * 0.7), true); break;
    case 'fireworks': {
      const colors = ['#ff5a5a', '#ffd84a', '#5ad1ff', '#b98bff', '#7dff8a'];
      const W = window.innerWidth;
      const H = window.innerHeight;
      for (let k = 0; k < 2 + level; k++) later(() => firework(W * (0.2 + Math.random() * 0.6), H * (0.15 + Math.random() * 0.25), colors[k % colors.length]), k * 260);
      break;
    }
  }
}

export const LINE_FX = META.lineFx;
