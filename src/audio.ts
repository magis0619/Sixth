// 効果音は素材ファイルを使わず WebAudio で合成する。

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** BGM だけの音量のつまみ（効果音とは別） */
let bgmBus: GainNode | null = null;
let bgmVolume = 0.5;
let muted = false;
/** 音量（設定。0〜1） */
let volume = 0.7;

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
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    bgmBus = ctx.createGain();
    bgmBus.gain.value = muted ? 0 : bgmVolume;
    bgmBus.connect(ctx.destination);
    startBgm();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** BGM の音量を変える（0〜1。0 で止める） */
export function setBgmVolume(v: number): void {
  bgmVolume = Math.max(0, Math.min(1, v));
  if (bgmBus) bgmBus.gain.value = muted ? 0 : bgmVolume;
}

/** 大きな演出の間だけ BGM を小さくする */
export function duckBgm(ms: number): void {
  if (!ctx || !bgmBus || muted) return;
  const t = ctx.currentTime;
  bgmBus.gain.cancelScheduledValues(t);
  bgmBus.gain.setValueAtTime(bgmBus.gain.value, t);
  bgmBus.gain.linearRampToValueAtTime(bgmVolume * 0.15, t + 0.15);
  bgmBus.gain.setValueAtTime(bgmVolume * 0.15, t + ms / 1000);
  bgmBus.gain.linearRampToValueAtTime(bgmVolume, t + ms / 1000 + 1.2);
}

/** 音量を変える（0〜1） */
export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = muted ? 0 : volume;
}

/** 画面を離れている間は音を止める */
export function suspendAudio(on: boolean): void {
  if (!ctx) return;
  void (on ? ctx.suspend() : ctx.resume());
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : volume;
  if (bgmBus) {
    bgmBus.gain.cancelScheduledValues(0);
    bgmBus.gain.value = muted ? 0 : bgmVolume;
  }
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
    duckBgm(4000);
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

// ---- BGM：のんびりした畑の曲（素材を使わず、その場で鳴らす） ----

/** [音の高さ（C4=0。null は休み）, 拍の長さ] */
type Phrase = [number | null, number][];
const BPM = 100;
/** 1小節ごとの和音（根音, 和音の構成音） */
const CHORDS: [number, number[]][] = [
  [0, [0, 4, 7]], [-3, [-3, 0, 4]], [-7, [-7, -3, 0]], [-5, [-5, -1, 2]],
  [0, [0, 4, 7]], [-3, [-3, 0, 4]], [-10, [-10, -7, -3]], [-5, [-5, -1, 2]],
  [-7, [-7, -3, 0]], [-5, [-5, -1, 2]], [-8, [-8, -5, -1]], [-3, [-3, 0, 4]],
  [-7, [-7, -3, 0]], [-5, [-5, -1, 2]], [0, [0, 4, 7]], [0, [0, 4, 7]],
];
const MELODY: Phrase = [
  [7, 1], [9, 0.5], [7, 0.5], [4, 1], [2, 1],
  [0, 1], [2, 0.5], [4, 0.5], [9, 2],
  [9, 1], [12, 0.5], [9, 0.5], [7, 1], [5, 1],
  [7, 1.5], [4, 0.5], [2, 2],
  [7, 1], [9, 0.5], [7, 0.5], [12, 1], [9, 1],
  [7, 0.5], [4, 0.5], [2, 1], [4, 2],
  [2, 1], [4, 0.5], [2, 0.5], [0, 1], [-3, 1],
  [2, 2], [null, 2],
  [9, 0.5], [12, 0.5], [14, 1], [12, 1], [9, 1],
  [11, 0.5], [14, 0.5], [12, 1], [11, 1], [7, 1],
  [7, 1.5], [11, 0.5], [12, 1], [11, 1],
  [9, 2], [7, 1], [4, 1],
  [5, 1], [9, 1], [12, 1], [14, 1],
  [16, 1.5], [14, 0.5], [12, 1], [11, 1],
  [12, 0.5], [7, 0.5], [4, 0.5], [7, 0.5], [12, 2],
  [null, 4],
];

let bgmTimer = 0;
/** 次に鳴らす拍（曲の頭からの拍数）と、その時刻 */
let beat = 0;
let beatTime = 0;
/** 旋律の何番目の音まで鳴らしたか・その音の始まりの拍 */
let melIdx = 0;
let melBeat = 0;

function startBgm(): void {
  if (!ctx || bgmTimer) return;
  beatTime = ctx.currentTime + 0.3;
  // 先読みして少し先までの音を予約する（タイマーの遅れで音がずれないように）
  bgmTimer = window.setInterval(scheduleBgm, 50);
}

function bgmVoice(freq: number, t: number, dur: number, type: OscillatorType, vol: number, attack = 0.01): void {
  if (!ctx || !bgmBus) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bgmBus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function bgmTick(t: number, vol: number): void {
  if (!ctx || !bgmBus) return;
  const len = 0.04;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(bgmBus);
  src.start(t);
}

function scheduleBgm(): void {
  if (!ctx || ctx.state !== 'running') return;
  const spb = 60 / BPM;
  // 休んでいて時刻が過ぎていたら今から鳴らし直す
  if (beatTime < ctx.currentTime - 0.2) beatTime = ctx.currentTime + 0.1;
  while (beatTime < ctx.currentTime + 0.4) {
    const total = CHORDS.length * 4;
    const b = beat % total;
    const [root, chord] = CHORDS[Math.floor(b / 4)];
    const inBar = b % 4;
    // ベース：1拍目と3拍目
    if (inBar === 0 || inBar === 2) bgmVoice(NOTE(root - 12 + (inBar === 2 ? 7 : 0)), beatTime, spb * 0.9, 'triangle', 0.22);
    // 和音：裏拍に軽く（ん・チャ）
    chord.forEach((n) => bgmVoice(NOTE(n), beatTime + spb / 2, spb * 0.45, 'sine', 0.045));
    // 刻み
    bgmTick(beatTime, inBar === 0 ? 0.05 : 0.025);
    bgmTick(beatTime + spb / 2, 0.018);
    // 旋律：この拍の中で始まる音を鳴らす
    if (b === 0) {
      melIdx = 0;
      melBeat = 0;
    }
    while (melIdx < MELODY.length && melBeat < b + 1) {
      const [n, len] = MELODY[melIdx];
      const t = beatTime + (melBeat - b) * spb;
      if (n !== null) {
        bgmVoice(NOTE(n + 12), t, len * spb * 0.95, 'triangle', 0.09);
        bgmVoice(NOTE(n + 24), t, len * spb * 0.5, 'sine', 0.02);
      }
      melBeat += len;
      melIdx++;
    }
    beat++;
    beatTime += spb;
  }
}
