// 効果音は素材ファイルを使わず WebAudio で合成する。

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem('hatake-slot:muted') === '1';
} catch {
  // ストレージが使えない環境では既定値のまま
}

/** ユーザー操作の中で呼んで AudioContext を起こす */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  try {
    localStorage.setItem('hatake-slot:muted', muted ? '1' : '0');
  } catch {
    // 保存できなくても動作は続ける
  }
  return muted;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slideTo?: number } = {}): void {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  const vol = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { vol?: number; delay?: number; freq?: number; q?: number } = {}): void {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.freq ?? 1200;
  filter.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  const vol = opts.vol ?? 0.2;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 9) / 12); // n=0 が C4

export const sfx = {
  tick() {
    tone(1400 + Math.random() * 300, 0.03, { type: 'square', vol: 0.05 });
  },
  reelStop(i: number) {
    tone(NOTE(7 + i * 4), 0.12, { type: 'triangle', vol: 0.35 });
    noise(0.05, { vol: 0.15, freq: 3000 });
  },
  rare() {
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(NOTE(12 + n), 0.25, { type: 'triangle', vol: 0.22, delay: i * 0.05 }));
  },
  select() {
    tone(NOTE(19), 0.06, { type: 'sine', vol: 0.25 });
  },
  cancel() {
    tone(NOTE(12), 0.06, { type: 'sine', vol: 0.2 });
  },
  error() {
    tone(160, 0.15, { type: 'square', vol: 0.12 });
  },
  plant() {
    tone(NOTE(7), 0.08, { type: 'sine', vol: 0.3, slideTo: NOTE(14) });
    noise(0.08, { vol: 0.12, freq: 600 });
  },
  rain() {
    for (let i = 0; i < 8; i++) tone(NOTE(24 + Math.floor(Math.random() * 7)), 0.05, { type: 'sine', vol: 0.12, delay: i * 0.04 });
    noise(0.4, { vol: 0.1, freq: 5000, q: 0.5 });
  },
  sun() {
    [0, 4, 7, 11].forEach((n, i) => tone(NOTE(12 + n), 0.5, { type: 'sine', vol: 0.15, delay: i * 0.06 }));
  },
  fertilizer() {
    tone(NOTE(0), 0.18, { type: 'triangle', vol: 0.3, slideTo: NOTE(12) });
  },
  grow() {
    tone(NOTE(16), 0.1, { type: 'sine', vol: 0.18, slideTo: NOTE(23) });
  },
  sell(value: number, combo: number) {
    const base = 12 + Math.min(combo, 8) * 2;
    const notes = value >= 30 ? [0, 4, 7, 12, 16] : value >= 12 ? [0, 4, 7, 12] : [0, 7];
    notes.forEach((n, i) => tone(NOTE(base + n), 0.18, { type: 'square', vol: 0.12, delay: i * 0.05 }));
  },
  coin() {
    tone(NOTE(23), 0.08, { type: 'square', vol: 0.12 });
    tone(NOTE(28), 0.25, { type: 'square', vol: 0.12, delay: 0.08 });
  },
  crow() {
    tone(900, 0.18, { type: 'sawtooth', vol: 0.15, slideTo: 500 });
    tone(800, 0.2, { type: 'sawtooth', vol: 0.15, slideTo: 400, delay: 0.22 });
  },
  shoo() {
    tone(700, 0.12, { type: 'sawtooth', vol: 0.1, slideTo: 1200 });
    noise(0.3, { vol: 0.2, freq: 2500, q: 0.7, delay: 0.05 });
    [7, 12].forEach((n, i) => tone(NOTE(12 + n), 0.15, { type: 'triangle', vol: 0.2, delay: 0.15 + i * 0.07 }));
  },
  bonus() {
    [0, 4, 7, 12].forEach((n, i) => tone(NOTE(16 + n), 0.15, { type: 'triangle', vol: 0.2, delay: i * 0.04 }));
  },
  bug() {
    for (let i = 0; i < 4; i++) tone(300 + i * 40, 0.05, { type: 'square', vol: 0.08, delay: i * 0.06 });
  },
  bee() {
    tone(220, 0.4, { type: 'sawtooth', vol: 0.06, slideTo: 260 });
    [12, 16, 19].forEach((n, i) => tone(NOTE(12 + n), 0.12, { type: 'sine', vol: 0.18, delay: 0.1 + i * 0.06 }));
  },
  merchant() {
    [0, 7, 12, 7, 12, 16].forEach((n, i) => tone(NOTE(12 + n), 0.1, { type: 'square', vol: 0.1, delay: i * 0.05 }));
  },
  fever() {
    [0, 4, 7, 12, 4, 7, 12, 16, 7, 12, 16, 19, 24].forEach((n, i) => tone(NOTE(12 + n), 0.14, { type: 'square', vol: 0.11, delay: i * 0.055 }));
    noise(0.5, { vol: 0.12, freq: 6000, q: 0.4, delay: 0.1 });
  },
  danger() {
    [0, -1, -5, -6].forEach((n, i) => tone(NOTE(n), 0.35, { type: 'sawtooth', vol: 0.12, delay: i * 0.16 }));
    tone(70, 0.9, { type: 'triangle', vol: 0.35, slideTo: 40 });
    noise(0.6, { vol: 0.15, freq: 300, q: 0.6 });
  },
  lineHarvest() {
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(NOTE(12 + n), 0.2, { type: 'triangle', vol: 0.2, delay: i * 0.05 }));
  },
  charmOffer() {
    [0, 7, 12, 19].forEach((n, i) => tone(NOTE(12 + n), 0.35, { type: 'sine', vol: 0.2, delay: i * 0.09 }));
  },
  charmGet() {
    [0, 4, 7, 12, 16].forEach((n, i) => tone(NOTE(17 + n), 0.2, { type: 'triangle', vol: 0.22, delay: i * 0.05 }));
  },
  poof() {
    noise(0.25, { vol: 0.25, freq: 400 });
  },
  buy() {
    [0, 4, 7, 12].forEach((n, i) => tone(NOTE(12 + n), 0.15, { type: 'triangle', vol: 0.25, delay: i * 0.06 }));
  },
  bigBuy() {
    [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((n, i) => tone(NOTE(12 + n), 0.18, { type: 'square', vol: 0.12, delay: i * 0.06 }));
  },
  tax() {
    tone(110, 0.35, { type: 'triangle', vol: 0.4, slideTo: 60 });
    noise(0.2, { vol: 0.25, freq: 200 });
  },
  taxPaid() {
    [0, 7, 12].forEach((n, i) => tone(NOTE(n), 0.3, { type: 'triangle', vol: 0.3, delay: 0.3 + i * 0.1 }));
  },
  gameOver() {
    [12, 11, 10, 9, 7, 4, 0].forEach((n, i) => tone(NOTE(n), 0.3, { type: 'triangle', vol: 0.25, delay: i * 0.12 }));
  },
  /** リーチ：最後のリールが回る間の緊張音（低い鼓動＋上がっていく音） */
  reach() {
    for (let i = 0; i < 6; i++) {
      tone(70, 0.12, { type: 'sine', vol: 0.4, delay: i * 0.32 });
      tone(62, 0.12, { type: 'sine', vol: 0.3, delay: i * 0.32 + 0.14 });
    }
    tone(NOTE(0), 1.9, { type: 'sawtooth', vol: 0.05, slideTo: NOTE(12) });
  },
  /** カットインの飛び込み。段階が上がるほど高く派手に */
  cutIn(level: number) {
    noise(0.25, { vol: 0.25, freq: 1800 + level * 900, q: 0.6 });
    tone(NOTE(level * 3), 0.25, { type: 'sawtooth', vol: 0.12, slideTo: NOTE(12 + level * 4) });
    if (level >= 2) [0, 7, 12].forEach((n, i) => tone(NOTE(12 + level * 2 + n), 0.15, { type: 'square', vol: 0.1, delay: 0.2 + i * 0.06 }));
  },
  /** フリーズ：ブラウン管が消えるような音 */
  crt() {
    tone(1600, 0.35, { type: 'sine', vol: 0.2, slideTo: 60 });
    noise(0.2, { vol: 0.3, freq: 4000, q: 0.3 });
  },
  /** 静寂のあとの鐘 */
  bell() {
    [0, 12, 19, 24].forEach((n, i) => tone(NOTE(n - 12), 2.4, { type: 'sine', vol: [0.45, 0.25, 0.12, 0.08][i] }));
    tone(NOTE(-12) * 1.01, 2.4, { type: 'sine', vol: 0.2 });
  },
  /** 筐体が割れる */
  glass() {
    noise(0.5, { vol: 0.45, freq: 6000, q: 0.4 });
    for (let i = 0; i < 10; i++) tone(2500 + Math.random() * 3000, 0.08, { type: 'triangle', vol: 0.1, delay: 0.05 + Math.random() * 0.4 });
    tone(90, 0.4, { type: 'square', vol: 0.25, slideTo: 40 });
  },
  /** フリーズ明けのファンファーレ */
  fanfare() {
    const seq = [0, 0, 0, 4, 7, 7, 12, 16, 19, 24];
    const len = [0.12, 0.12, 0.12, 0.3, 0.12, 0.12, 0.3, 0.15, 0.15, 0.8];
    let t = 0;
    seq.forEach((n, i) => {
      tone(NOTE(12 + n), len[i], { type: 'square', vol: 0.13, delay: t });
      tone(NOTE(n), len[i], { type: 'triangle', vol: 0.18, delay: t });
      t += len[i];
    });
    noise(1.2, { vol: 0.1, freq: 7000, q: 0.3, delay: t - 0.8 });
  },
  /** 実った瞬間の「ポンッ」 */
  pon() {
    tone(NOTE(19), 0.08, { type: 'sine', vol: 0.3, slideTo: NOTE(31) });
    noise(0.05, { vol: 0.12, freq: 2500, q: 2 });
  },
  /** 年貢が払えそうにないときの鼓動 */
  heartbeat() {
    tone(58, 0.14, { type: 'sine', vol: 0.5 });
    tone(52, 0.16, { type: 'sine', vol: 0.4, delay: 0.18 });
  },
  /** 役人の登場（拍子木） */
  official() {
    tone(NOTE(24), 0.06, { type: 'square', vol: 0.15 });
    tone(NOTE(24), 0.06, { type: 'square', vol: 0.15, delay: 0.18 });
    noise(0.04, { vol: 0.2, freq: 3500, q: 3 });
    noise(0.04, { vol: 0.2, freq: 3500, q: 3, delay: 0.18 });
  },
  /** 花火：打ち上げと破裂 */
  firework() {
    tone(300, 0.5, { type: 'sine', vol: 0.08, slideTo: 1400 });
    noise(0.6, { vol: 0.35, freq: 900, q: 0.5, delay: 0.5 });
    tone(80, 0.4, { type: 'triangle', vol: 0.3, slideTo: 40, delay: 0.5 });
  },
  /** 畑が枯れる */
  wither() {
    tone(NOTE(7), 1.2, { type: 'sawtooth', vol: 0.06, slideTo: NOTE(-5) });
    noise(1, { vol: 0.12, freq: 500, q: 0.4 });
  },
  newReel() {
    for (let i = 0; i < 6; i++) tone(NOTE(12 + i * 2), 0.1, { type: 'square', vol: 0.1, delay: i * 0.04 });
  },
};
