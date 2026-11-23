// 結果のシェア：結果カードの画像（難しさ・評価の判子・最後の畑・数字・記録番号）を作り、
// 「画像で送る」「画像を保存」「文をコピー」を選ぶ板を出す。
// 記録番号は送っているプレイ記録（スプレッドシート）の run と同じなので、あとで本当のクリアか照らし合わせられる。

import { art, artDataUrl, type ArtId } from '../art.ts';
import { CONFIG, CROPS, DIFFICULTIES, FARMERS, SHARE_URL } from '../config.ts';
import { rateRun } from '../game.ts';
import { L } from '../i18n.ts';
import { sfx } from '../audio.ts';
import { confetti, floatText, isCalm } from '../fx.ts';
import { state } from './store.ts';
import { FRUIT, PLACE_ART, say } from './view.ts';

/** 難しさの色（難しさを選ぶ画面と同じ） */
const DIFF_COLOR = ['#5fae3c', '#3a86c8', '#e0a40a', '#e8743b', '#c93c2b', '#6a3d8f', '#7a5320', '#3d3a8f', '#2f6a5a', '#8f2a4a'];
const INK = '#3d3326';
const FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif';
const NUM = '"M PLUS Rounded 1c", "Zen Maru Gothic", sans-serif';

const artCache = new Map<ArtId, Promise<HTMLImageElement>>();
/** 絵（SVG）を画像にして読み込む（カンバスに描くため） */
function artImage(id: ArtId): Promise<HTMLImageElement> {
  let p = artCache.get(id);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = artDataUrl(id);
    });
    artCache.set(id, p);
  }
  return p;
}

function bestDay(): { day: number; gold: number } {
  const days = state.stats.earnedByDay;
  let day = 0;
  days.forEach((v, d) => {
    if ((v ?? 0) > (days[day] ?? 0)) day = d;
  });
  return { day, gold: days[day] ?? 0 };
}

/** 結果の見出し（クリア！／◯日目まで） */
function headline(endedAfterClear: boolean): string {
  if (endedAfterClear) return L('クリア！', 'Cleared!');
  if (state.cleared) return L(`エンドレス ${state.day}日目`, `Endless day ${state.day}`);
  return L(`${state.day}日目まで`, `Reached day ${state.day}`);
}

function modeName(): string {
  if (state.lordLevel) return L(`殿様モード 段${state.lordLevel}`, `Lord mode ${state.lordLevel}`);
  return DIFFICULTIES[state.difficulty]?.name ?? '';
}

/** シェアの文（絵文字・絵は入れない） */
export function shareText(endedAfterClear: boolean): string {
  const r = rateRun(state);
  const head = state.cleared ? (endedAfterClear ? L(`${modeName()}をクリア！`, `Cleared ${modeName()}!`) : L(`${modeName()}をクリアして、エンドレス${state.day}日目まで`, `Cleared ${modeName()}, endless to day ${state.day}`)) : L(`${modeName()}で${state.day}日目まで`, `${modeName()}: reached day ${state.day}`);
  return [
    `${L('畑スロット', 'Farm Slots')}｜${head}`,
    L(`評価${r.rank}（${r.score}点）・稼いだ合計 ${state.stats.totalEarned}・列で売った ${state.stats.lineHarvests}回`, `Rank ${r.rank} (${r.score}) · earned ${state.stats.totalEarned} · ${state.stats.lineHarvests} lines`),
    L('#畑スロット', '#FarmSlots'),
    SHARE_URL,
  ].join('\n');
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 太い縁取りの文字 */
function boldText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, stroke = INK, align: CanvasTextAlign = 'center', font = FONT): void {
  g.font = `900 ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.16;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/** 結果カード（1080×1350）を描く */
export async function drawShareCard(endedAfterClear: boolean): Promise<HTMLCanvasElement> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  try {
    await Promise.race([document.fonts.load(`900 80px "Zen Maru Gothic"`, '畑スロットクリア日目評価'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    // 書体が読めなくても描く
  }
  const r = rateRun(state);
  const clear = state.cleared;
  // 空と畑
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#8fd0f2');
  sky.addColorStop(0.45, '#d6f0fb');
  sky.addColorStop(0.46, '#9fd56c');
  sky.addColorStop(1, '#6fb544');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // 札（板）
  roundRect(g, 56, 56, W - 112, H - 112, 44);
  g.fillStyle = '#fff8e7';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = INK;
  g.stroke();
  // 題名と難しさ
  boldText(g, L('畑スロット', 'Farm Slots'), W / 2, 150, 76, '#f6c343');
  const mode = modeName();
  g.font = `900 40px ${FONT}`;
  const mw = g.measureText(mode).width + 70;
  roundRect(g, W / 2 - mw / 2, 212, mw, 66, 33);
  g.fillStyle = state.lordLevel ? '#7a2b1d' : DIFF_COLOR[state.difficulty] ?? '#5fae3c';
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(mode, W / 2, 247);
  // 見出し
  boldText(g, headline(endedAfterClear), W / 2, 365, clear ? 120 : 96, clear ? '#ff6a4a' : '#fff3d6');
  // 評価の判子
  const sx = 250;
  const sy = 560;
  const stampCol = r.rank === 'S' ? '#d4a017' : r.rank === 'A' ? '#c0281b' : r.rank === 'B' ? '#3a86c8' : '#7c7263';
  g.save();
  g.translate(sx, sy);
  g.rotate(-0.12);
  g.beginPath();
  g.arc(0, 0, 118, 0, Math.PI * 2);
  g.fillStyle = '#fff';
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = stampCol;
  g.stroke();
  g.beginPath();
  g.arc(0, 0, 100, 0, Math.PI * 2);
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = stampCol;
  g.font = `900 120px ${NUM}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(r.rank, 0, -12);
  g.font = `900 34px ${NUM}`;
  g.fillText(`${r.score}${L('点', 'pts')}`, 0, 66);
  g.restore();
  // 数字（3行）
  const best = bestDay();
  const rows: [ArtId, string, string][] = [
    ['coin', L('稼いだ合計', 'Earned'), String(state.stats.totalEarned)],
    ['sparkle', L('一番稼いだ日', 'Best day'), best.gold ? `+${best.gold}` : '—'],
    ['tomato', L('列で売った', 'Lines'), L(`${state.stats.lineHarvests}回`, `${state.stats.lineHarvests}`)],
  ];
  const icons = await Promise.all(rows.map(([a]) => artImage(a)));
  rows.forEach(([, label, value], k) => {
    const y = 470 + k * 92;
    g.drawImage(icons[k], 420, y - 30, 60, 60);
    g.fillStyle = '#5b5245';
    g.font = `700 36px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, 496, y);
    g.fillStyle = INK;
    g.font = `900 52px ${NUM}`;
    g.textAlign = 'right';
    g.fillText(value, 990, y);
  });
  // 最後の畑
  const cols = state.cols;
  const rowsN = state.rows;
  const areaW = 760;
  const areaH = 420;
  const gap = 10;
  const cell = Math.min(130, Math.floor((areaW - (cols - 1) * gap) / cols), Math.floor((areaH - (rowsN - 1) * gap) / rowsN));
  const fw = cols * cell + (cols - 1) * gap;
  const fh = rowsN * cell + (rowsN - 1) * gap;
  const fx = (W - fw) / 2;
  const fy = 720 + (areaH - fh) / 2;
  roundRect(g, fx - 22, fy - 22, fw + 44, fh + 44, 26);
  g.fillStyle = '#5a3a1e';
  g.fill();
  const draws: Promise<void>[] = [];
  for (let y = 0; y < rowsN; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * CONFIG.fieldCols + x;
      const px = fx + x * (cell + gap);
      const py = fy + y * (cell + gap);
      roundRect(g, px, py, cell, cell, 14);
      g.fillStyle = '#8a5a32';
      g.fill();
      const crop = state.field[i];
      const tool = state.tools?.[i];
      if (crop && crop.anchor === undefined) {
        const def = CROPS[crop.kind];
        const ripe = crop.growth >= def.ripe;
        const size = def.big ? cell * 2 + gap : cell;
        const id = ripe ? FRUIT[crop.kind] : ('sprout' as ArtId);
        draws.push(artImage(id).then((img) => g.drawImage(img, px + size * (ripe ? 0.12 : 0.24), py + size * (ripe ? 0.12 : 0.24), size * (ripe ? 0.76 : 0.52), size * (ripe ? 0.76 : 0.52))));
      } else if (tool) {
        draws.push(artImage(PLACE_ART[tool]).then((img) => g.drawImage(img, px + cell * 0.14, py + cell * 0.14, cell * 0.72, cell * 0.72)));
      }
    }
  await Promise.all(draws);
  // 下：農家・日付・記録番号・URL
  const farmer = FARMERS.find((f) => f.id === state.farmer);
  if (farmer) {
    const img = await artImage(farmer.art as ArtId);
    g.drawImage(img, 96, 1180, 64, 64);
  }
  g.fillStyle = INK;
  g.font = `700 36px ${FONT}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(`${farmer?.name ?? ''}・${new Date().toLocaleDateString('ja-JP')}`, 176, 1212);
  g.fillStyle = '#7c7263';
  g.font = `700 28px ${NUM}`;
  g.textAlign = 'right';
  g.fillText(`No.${state.runId}`, 984, 1212);
  g.font = `700 26px ${NUM}`;
  g.textAlign = 'center';
  g.fillText(SHARE_URL.replace(/^https?:\/\//, ''), W / 2, 1268);
  return c;
}

function toBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

/** シェアの板を出す */
export async function showShareSheet(endedAfterClear: boolean): Promise<void> {
  sfx.select();
  const layer = document.createElement('div');
  layer.className = 'share-layer';
  layer.innerHTML = `<div class="share-sheet" role="dialog" aria-label="${L('結果をシェア', 'Share result')}">
      <div class="share-img-wrap"><div class="share-loading">${art('sprout')}</div></div>
      <div class="share-actions">
        <button class="share-go" data-act="image" disabled>${art('share')}<span>${L('画像で送る', 'Share image')}</span></button>
        <div class="share-row">
          <button data-act="save" disabled>${art('download')}<span>${L('画像を保存', 'Save')}</span></button>
          <button data-act="text">${art('copy')}<span>${L('文をコピー', 'Copy text')}</span></button>
        </div>
        <button class="share-close" data-act="close">${L('とじる', 'Close')}</button>
      </div>
    </div>`;
  document.body.appendChild(layer);
  const close = (): void => {
    layer.classList.add('out');
    window.setTimeout(() => layer.remove(), 200);
  };
  layer.addEventListener('click', (e) => {
    if (e.target === layer) close();
  });
  const text = shareText(endedAfterClear);
  const canvas = await drawShareCard(endedAfterClear);
  const blob = await toBlob(canvas);
  const file = blob ? new File([blob], `hatake-slot-${state.runId}.png`, { type: 'image/png' }) : null;
  const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
  const wrap = layer.querySelector('.share-img-wrap')!;
  wrap.innerHTML = `<img class="share-img" src="${url}" alt="${L('結果カード', 'Result card')}"><span class="share-shine"></span>`;
  if (state.cleared && !isCalm()) confetti(14);
  const canFiles = !!file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const goBtn = layer.querySelector<HTMLButtonElement>('[data-act="image"]')!;
  const saveBtn = layer.querySelector<HTMLButtonElement>('[data-act="save"]')!;
  saveBtn.disabled = false;
  // 画像で送れない（パソコンのブラウザなど）ときは、文と一緒に送る／コピーにする
  if (canFiles) goBtn.disabled = false;
  else if (typeof navigator.share === 'function') {
    goBtn.disabled = false;
    goBtn.querySelector('span')!.textContent = L('文で送る', 'Share text');
  } else goBtn.hidden = true;
  layer.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
    b.addEventListener('click', async () => {
      const act = b.dataset.act;
      try {
        if (act === 'close') return close();
        if (act === 'image') {
          sfx.select();
          if (canFiles) await navigator.share({ files: [file!], text });
          else await navigator.share({ text });
        } else if (act === 'save') {
          sfx.select();
          const a = document.createElement('a');
          a.href = url;
          a.download = `hatake-slot-${state.runId}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else if (act === 'text') {
          await navigator.clipboard.writeText(text);
          sfx.select();
          say(L('コピーした', 'Copied'));
          const rc = b.getBoundingClientRect();
          floatText(rc.left + rc.width / 2, rc.top, L('コピーした', 'Copied'), { cls: 'good', size: 0.8 });
        }
      } catch {
        // 共有を閉じた・権限がないときは何もしない
      }
    }),
  );
}

