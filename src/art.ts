// 自作のSVGイラスト。絵文字の代わりに使い、端末による見た目の差をなくす。
// すべて 64×64 の格子に描く。外形は濃い茶の 3px の線、面は「地の色・右下の影・左上のハイライト」の3段。
// 形は Fluent Emoji / Noto / Twemoji / OpenMoji / game-icons を参考に、その物と分かる特徴を入れる。
// 生き物と太陽・月には顔（点目・頬紅）、作物と道具には顔を付けない。

const INK = '#3d3326';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const S2 = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

/** 地・影・明るい色の組 */
const C = {
  red: ['#ef5a43', '#c93c2b', '#ffa494'],
  green: ['#72b843', '#4e9230', '#a6dc72'],
  leaf: ['#5fae3c', '#3f8a26', '#93d063'],
  gold: ['#f8c61c', '#d99b06', '#fff0a2'],
  orange: ['#f7962c', '#d8701a', '#ffc982'],
  blue: ['#5aa9e6', '#3a86c8', '#c4e6ff'],
  cloud: ['#f3f7fb', '#cbd8e6', '#ffffff'],
  brown: ['#8a5a32', '#6a4122', '#b37c4c'],
  tan: ['#d39858', '#ad713a', '#f0c48c'],
  straw: ['#ecc65c', '#c99c34', '#fbe49a'],
  purple: ['#9c6ad6', '#7848b6', '#cdb4f0'],
  pink: ['#ff8fb4', '#e5688f', '#ffc6db'],
  black: ['#34303c', '#211e27', '#5a5670'],
  skin: ['#ffd9b0', '#f0b484', '#fff0dc'],
  white: ['#ffffff', '#dfe4ea', '#ffffff'],
  stone: ['#b4b0a8', '#8c8880', '#d8d5cf'],
  indigo: ['#3f5f9f', '#2d4679', '#6f8fcf'],
};
type Tone = (typeof C)[keyof typeof C];

/** 面：影色で塗り、同じ形を (ax,ay) へ k 倍に縮めて地の色で重ね、輪郭を引く（影は右下に残る） */
function face(d: string, t: Tone | string[], ax: number, ay: number, k = 0.86, stroke = S): string {
  const m = `matrix(${k} 0 0 ${k} ${(ax * (1 - k)).toFixed(2)} ${(ay * (1 - k)).toFixed(2)})`;
  return `<path d="${d}" fill="${t[1]}"/><path d="${d}" fill="${t[0]}" transform="${m}"/><path d="${d}" fill="none" ${stroke}/>`;
}
/** 楕円の path */
const E = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
/** 左上のハイライト */
const hl = (x: number, y: number, rx: number, ry: number, rot = -35, op = 0.85) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#fff" opacity="${op}"/>`;
/** 輪郭つきの線（茎・棒）：濃い線の上に色の線 */
const line = (d: string, color: string, w = 4) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 3}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** 点目（白い光つき） */
const eye = (x: number, y: number, r = 2.6) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.4}" r="${r * 0.38}" fill="#fff"/>`;
const blush = (x: number, y: number, rx = 3, ry = 2) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ff8f8f" opacity="0.6"/>`;
const smile = (x: number, y: number, w = 4) => `<path d="M${x - w} ${y} Q${x} ${y + w * 0.9} ${x + w} ${y}" fill="none" ${S2}/>`;
/** 星形の点列（ヘタ・王冠など）。外側の半径 rx,ry と内側の割合 inner */
function starPts(cx: number, cy: number, n: number, rx: number, ry: number, inner: number, rot = -90): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = ((rot + (180 / n) * i) * Math.PI) / 180;
    const r = i % 2 ? inner : 1;
    return `${(cx + Math.cos(a) * rx * r).toFixed(1)} ${(cy + Math.sin(a) * ry * r).toFixed(1)}`;
  }).join(' L');
}
const sparkle = (x: number, y: number, r: number, fill = C.gold[0]) =>
  `<path d="M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z" fill="${fill}" ${S2}/>`;
/** しずく（上がとがる） */
const dropD = (x: number, y: number, s = 1) =>
  `M${x} ${y}C${x + 2 * s} ${y + 4 * s} ${x + 5 * s} ${y + 7 * s} ${x + 5 * s} ${y + 10 * s}A${5 * s} ${5 * s} 0 0 1 ${x - 5 * s} ${y + 10 * s}C${x - 5 * s} ${y + 7 * s} ${x - 2 * s} ${y + 4 * s} ${x} ${y}Z`;
const drop = (x: number, y: number, s = 1) => `${face(dropD(x, y, s), C.blue, x - 2 * s, y + 6 * s, 0.8)}${hl(x - 2 * s, y + 9 * s, 1.1 * s, 2 * s, 20)}`;


/** 雲：ふくらみ3つと平らな底。x,y にずらして s 倍 */
const cloudD = (x = 0, y = 0, s = 1) => {
  const P = (a: number, b: number) => `${(x + a * s).toFixed(1)} ${(y + b * s).toFixed(1)}`;
  return `M${P(14, 40)}C${P(6, 40)} ${P(5, 29)} ${P(13, 28)}C${P(12, 19)} ${P(22, 15)} ${P(28, 20)}C${P(31, 10)} ${P(46, 10)} ${P(47, 21)}C${P(55, 19)} ${P(61, 28)} ${P(55, 33)}C${P(60, 38)} ${P(55, 40)} ${P(50, 40)}Z`;
};
const cloud = (tone: string[], x = 0, y = 0, s = 1) => `${face(cloudD(x, y, s), tone, x + 24 * s, y + 22 * s, 0.86)}${hl(x + 18 * s, y + 27 * s, 4 * s, 2 * s, -20, 0.9)}`;
/** 稲妻：点の並び（64格子）を x,y にずらして s 倍 */
const bolt = (x = 0, y = 0, s = 1) => {
  const pts = [[38, 3], [14, 35], [28, 35], [22, 61], [51, 25], [36, 25], [45, 3]];
  const d = `M${pts.map(([a, b]) => `${(x + a * s).toFixed(1)} ${(y + b * s).toFixed(1)}`).join('L')}Z`;
  return `${face(d, C.gold, x + 32 * s, y + 22 * s, 0.82)}<path d="M${x + 33 * s} ${y + 10 * s}L${x + 24 * s} ${y + 26 * s}" fill="none" stroke="#fff" stroke-width="${2.4 * s}" stroke-linecap="round" opacity="0.8"/>`;
};

// ---- 作物 ----
const tomato = `
  ${face('M32 22C22 17 9 23 9 38C9 51 20 58 32 58C44 58 55 51 55 38C55 23 42 17 32 22Z', C.red, 24, 32, 0.84)}
  ${hl(19, 33, 3.2, 6, -25)}${hl(23, 25.5, 1.6, 1.4, 0)}
  <path d="M${starPts(32, 23, 5, 15, 6.5, 0.32, -90)}Z" fill="${C.green[0]}" ${S}/>
  <path d="M28 22 L32 21 L36 22" fill="none" stroke="${C.green[2]}" stroke-width="2" stroke-linecap="round"/>
  ${line('M32 21Q31 14 35 10', C.green[1], 3.5)}`;

const strawberry = `
  ${face('M32 59C21 55 10 43 10 31C10 22 19 18 32 21C45 18 54 22 54 31C54 43 43 55 32 59Z', C.red, 24, 30, 0.84)}
  ${[
    [21, 30], [32, 29], [43, 30],
    [17, 38], [26, 37], [37, 37], [47, 38],
    [22, 45], [32, 45], [42, 45],
    [27, 52], [37, 52],
  ]
    .map(([x, y]) => `<path d="M${x} ${y - 2.2}Q${x + 1.6} ${y} ${x} ${y + 2.2}Q${x - 1.6} ${y} ${x} ${y - 2.2}Z" fill="#ffe7a0" stroke="#c93c2b" stroke-width="0.8"/>`)
    .join('')}
  ${hl(17, 30, 2.6, 5, -35)}
  <path d="M${starPts(32, 22, 6, 17, 8, 0.38, -90)}Z" fill="${C.green[0]}" ${S}/>
  ${line('M32 20V11', C.green[1], 3.5)}`;

const pumpkin = `
  ${face(E(17, 40, 11, 15.5), ['#e77f22', '#c9651a'], 13, 34, 0.84)}
  ${face(E(47, 40, 11, 15.5), ['#e77f22', '#c9651a'], 43, 34, 0.84)}
  ${face(E(25, 40, 10, 17), C.orange, 21, 33, 0.86)}
  ${face(E(39, 40, 10, 17), C.orange, 35, 33, 0.86)}
  ${face(E(32, 40, 9, 18), ['#ffa743', '#e3801f'], 29, 32, 0.86)}
  ${hl(29, 33, 2.2, 6, -10)}
  ${line('M31 23Q30 15 35 10', '#6e8a2a', 5)}
  <path d="M36 15Q46 8 52 16Q44 21 36 15Z" fill="${C.leaf[0]}" ${S2}/>
  <path d="M38 15Q44 13 49 15.5" fill="none" stroke="${C.leaf[1]}" stroke-width="1.5" stroke-linecap="round"/>`;

const corn = `
  ${face('M32 7C40 7 44 18 44 30C44 42 40 50 32 50C24 50 20 42 20 30C20 18 24 7 32 7Z', C.gold, 28, 22, 0.86)}
  ${[11, 17, 23, 29, 35, 41, 46]
    .map((y) => {
      const half = y < 12 ? 4 : y > 44 ? 7 : 9;
      const xs = half <= 4 ? [-2.5, 2.5] : half <= 7 ? [-5, 0, 5] : [-7.5, -2.5, 2.5, 7.5];
      return xs.map((dx) => `<ellipse cx="${32 + dx}" cy="${y}" rx="2.2" ry="2.4" fill="${dx > 3 ? '#f2b91a' : '#ffe27a'}"/>`).join('');
    })
    .join('')}
  ${hl(25, 22, 1.6, 5, -8, 0.7)}
  ${face('M32 59C21 57 14 47 15 33C20 40 26 46 32 59Z', C.leaf, 22, 44, 0.84)}
  ${face('M32 59C43 57 50 47 49 33C44 40 38 46 32 59Z', C.green, 40, 44, 0.84)}
  <path d="M32 7Q30 3 27 2M32 7Q33 3 36 2" fill="none" stroke="#b8862a" stroke-width="2" stroke-linecap="round"/>`;

const melon = `
  ${face(E(32, 37, 22, 21), ['#a9d66e', '#83b54c'], 26, 31, 0.86)}
  <g fill="none" stroke="#f1fadc" stroke-width="1.6" stroke-linecap="round" opacity="0.95">
    <path d="M17 24Q30 30 47 22M12 34Q32 42 52 32M12 44Q32 52 52 44M18 53Q32 58 46 53"/>
    <path d="M22 19Q16 37 24 56M32 16Q27 37 34 58M42 18Q47 37 40 57"/>
  </g>
  ${hl(21, 28, 3, 5, -35, 0.6)}
  ${line('M32 17V9', '#8a9a3a', 3.5)}${line('M26 9H38', '#8a9a3a', 3.5)}`;

/** 種の袋：袋の色と、窓に描いた作物で何が育つか分かるようにする */
const packet = (bag: string[], inner: string) => `
  ${face('M12 14H52V54Q52 58 48 58H16Q12 58 12 54Z', bag, 20, 24, 0.9)}
  <path d="M12 14L15 8L18 12L21 8L24 12L27 8L30 12L33 8L36 12L39 8L42 12L45 8L48 12L51 8L52 14Z" fill="#fff6dc" ${S2}/>
  <rect x="17" y="18" width="30" height="30" rx="7" fill="#fffaf0" ${S2}/>
  <g transform="translate(19 20) scale(0.41)">${inner}</g>
  ${[22, 32, 42].map((x) => `<ellipse cx="${x}" cy="53" rx="2" ry="1.4" fill="#fff6dc" opacity="0.9"/>`).join('')}
  ${hl(15.5, 30, 1.2, 7, 0, 0.45)}`;

/** 作物と育つ途中 */
const CROP_ART = {
  sprout: `
    ${line('M32 58V38', C.leaf[1], 4)}
    ${face('M32 42C27 43 18 41 15 31C23 28 31 32 32 42Z', [C.leaf[2], C.leaf[0]], 20, 33, 0.84)}
    ${face('M32 39C37 40 46 37 49 26C40 24 33 29 32 39Z', C.leaf, 44, 29, 0.84)}
    <path d="M30 40Q24 36 19 32M34 37Q40 33 45 28" fill="none" stroke="${C.leaf[1]}" stroke-width="1.5" stroke-linecap="round"/>`,
  leaf: `
    ${line('M32 60V20', C.leaf[1], 4)}
    ${face('M32 50C26 52 15 50 11 39C19 35 29 40 32 50Z', C.leaf, 16, 41, 0.84)}
    ${face('M32 46C38 48 49 45 53 34C45 30 35 36 32 46Z', [C.leaf[2], C.leaf[0]], 48, 36, 0.84)}
    ${face('M32 32C27 33 19 30 17 21C24 18 31 23 32 32Z', [C.leaf[2], C.leaf[0]], 21, 23, 0.84)}
    ${face('M32 29C37 30 45 27 47 17C40 15 33 20 32 29Z', C.leaf, 43, 19, 0.84)}
    ${face('M32 21C29 17 29 11 32 7C35 11 35 17 32 21Z', [C.leaf[2], C.leaf[0]], 32, 11, 0.84)}`,
  bud: `
    ${line('M32 60V24', C.leaf[1], 4)}
    ${face('M32 52C26 54 15 52 11 41C19 37 29 42 32 52Z', C.leaf, 16, 43, 0.84)}
    ${face('M32 47C38 49 49 46 53 35C45 31 35 37 32 47Z', [C.leaf[2], C.leaf[0]], 48, 37, 0.84)}
    ${face('M32 27C24 25 22 15 26 8C29 10 31 11 32 14C33 11 35 10 38 8C42 15 40 25 32 27Z', C.pink, 28, 14, 0.84)}
    <path d="M32 14V24" fill="none" stroke="${C.pink[1]}" stroke-width="1.6" stroke-linecap="round"/>
    ${hl(27.5, 15, 1.2, 3, -15, 0.7)}
    <path d="M24 22Q28 30 32 27Q36 30 40 22Q37 27 32 26Q27 27 24 22Z" fill="${C.leaf[0]}" ${S2}/>`,
  tomato,
  strawberry,
  pumpkin,
  corn,
  melon,
  goldSeed: `
    ${face('M32 58C22 52 17 42 18 33H46C47 42 42 52 32 58Z', C.gold, 26, 38, 0.84)}
    ${hl(24, 40, 2.4, 6, -15)}
    ${face('M15 33C15 22 23 16 32 16C41 16 49 22 49 33Q32 37 15 33Z', ['#c98a2e', '#9e6a1c'], 26, 22, 0.88)}
    <g fill="none" stroke="#e7b257" stroke-width="1.4" stroke-linecap="round">
      <path d="M21 23L25 31M27 19L31 33M34 18L37 33M41 21L42 31"/>
      <path d="M18 29Q32 24 47 29"/>
    </g>
    ${line('M32 17Q31 11 35 8', '#7a4a24', 3)}
    ${sparkle(52, 13, 6.5, '#fff')}${sparkle(11, 48, 4.5, '#fff')}`,
};


// ---- 天気・生き物の絵柄 ----
const sunFace = (cx: number, cy: number, r: number) => `
  ${face(E(cx, cy, r), ['#ffd23f', '#f2a91e'], cx - r * 0.3, cy - r * 0.3, 0.86)}
  ${hl(cx - r * 0.45, cy - r * 0.5, r * 0.22, r * 0.13, -35, 0.8)}
  ${eye(cx - r * 0.36, cy - r * 0.05, r * 0.17)}${eye(cx + r * 0.36, cy - r * 0.05, r * 0.17)}
  ${blush(cx - r * 0.6, cy + r * 0.3, r * 0.2, r * 0.13)}${blush(cx + r * 0.6, cy + r * 0.3, r * 0.2, r * 0.13)}
  ${smile(cx, cy + r * 0.28, r * 0.25)}`;
const sunRays = (cx: number, cy: number, r1: number, r2: number, n = 8) =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const w = (Math.PI / n) * 0.62;
    const P = (ang: number, r: number) => `${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)}`;
    // 先を丸めた花びら形の光
    return `<path d="M${P(a - w, r1)}Q${P(a - w * 0.35, r2 + 2)} ${P(a, r2)}Q${P(a + w * 0.35, r2 + 2)} ${P(a + w, r1)}Z" fill="#ffb020" ${S}/>`;
  }).join('');

const crowBody = `
  ${face('M20 40L5 47L8 52L22 47Z', C.black, 12, 46, 0.8)}
  ${line('M27 51L25 58M35 51L35 58', '#f2a33a', 2.5)}
  ${face(E(30, 40, 18, 13), C.black, 24, 34, 0.86)}
  ${face(E(44, 26, 11, 11), C.black, 40, 22, 0.86)}
  ${hl(39, 20, 3, 1.6, -30, 0.35)}
  <path d="M53 22L62 27L53 31Z" fill="#f6a93b" ${S}/>
  <circle cx="46.5" cy="23" r="3.6" fill="#fff" ${S2}/><circle cx="47.3" cy="23" r="1.8" fill="${INK}"/><circle cx="46.6" cy="22.2" r="0.7" fill="#fff"/>
  ${face('M17 37Q28 29 40 39Q30 49 17 37Z', ['#4b465a', '#34303c'], 26, 37, 0.85, S2)}
  <path d="M22 39Q29 37 35 41" fill="none" stroke="#6a6582" stroke-width="1.4" stroke-linecap="round"/>`;

/** スロットの絵柄（天気・生き物など） */
const SYMBOL_ART = {
  rain: `${cloud(C.cloud, 0, -4)}${drop(19, 41, 1)}${drop(32, 45, 1.05)}${drop(45, 41, 1)}`,
  sun: `${sunRays(32, 32, 16, 28)}${sunFace(32, 32, 17)}`,
  fertilizer: `
    ${face('M25 6H39V16H25Z', [C.purple[2], C.purple[0]], 28, 9, 0.85)}
    ${face('M23 16H41Q49 22 49 32V52Q49 58 43 58H21Q15 58 15 52V32Q15 22 23 16Z', C.purple, 24, 28, 0.88)}
    <rect x="20" y="31" width="24" height="18" rx="4" fill="#fff8e7" ${S2}/>
    ${line('M32 46V39', C.leaf[1], 2)}
    <path d="M32 41C28 42 24 40 24 35C28 34 31 36 32 41Z" fill="${C.leaf[0]}" ${S2}/>
    <path d="M32 39C36 40 40 37 40 33C36 32 33 34 32 39Z" fill="${C.leaf[2]}" ${S2}/>
    ${hl(20, 24, 1.6, 4, -20, 0.7)}
    <circle cx="54" cy="18" r="3" fill="${C.purple[2]}" ${S2}/><circle cx="57" cy="9" r="2" fill="${C.purple[2]}" ${S2}/>`,
  bee: `
    ${face(E(25, 20, 8, 11), ['#e6f4ff', '#bcd9ee'], 23, 16, 0.86, S2)}
    ${face(E(39, 18, 8, 11), ['#e6f4ff', '#bcd9ee'], 37, 14, 0.86, S2)}
    <path d="M24 14V24M38 12V22" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M51 40L59 38L52 45Z" fill="${INK}" ${S2}/>
    ${face(E(32, 39, 20, 14), ['#ffd23f', '#f2a91e'], 26, 34, 0.86)}
    <path d="M31 26Q26 39 31 52" fill="none" stroke="${INK}" stroke-width="5.5"/>
    <path d="M42 28Q38 39 42 50" fill="none" stroke="${INK}" stroke-width="5.5"/>
    <path d="M50.6 33Q48 39 50.6 45" fill="none" stroke="${INK}" stroke-width="3"/>
    <path d="M14 30Q10 20 13 16M18 28Q17 18 21 15" fill="none" ${S2}/>
    <circle cx="13" cy="15" r="2.4" fill="${INK}"/><circle cx="21" cy="14" r="2.4" fill="${INK}"/>
    ${eye(18.5, 36, 2.4)}${blush(16, 42, 2.6, 1.8)}
    <path d="M18 44Q21 46.5 24 44" fill="none" ${S2}/>
    ${hl(26, 31, 3, 1.6, -15, 0.7)}`,
  crow: crowBody,
  bug: `
    ${[[13, 46, 8], [22, 43, 9], [32, 41, 9.5]]
      .map(([x, y, r], i) => `${line(`M${x - 2} ${y + r - 1}V${y + r + 4}M${x + 3} ${y + r - 1}V${y + r + 4}`, C.green[1], 1.6)}${face(E(x, y, r), i % 2 ? C.green : [C.green[2], C.green[0]], x - 2, y - 3, 0.84)}`)
      .join('')}
    ${[[22, 43], [32, 41]].map(([x, y]) => `<circle cx="${x}" cy="${y - 1}" r="2" fill="#ffe27a" ${S2}/>`).join('')}
    ${face(E(45, 33, 12, 11.5), [C.green[2], C.green[0]], 42, 29, 0.86)}
    <path d="M40 23Q36 16 33 13M50 23Q53 16 57 13" fill="none" ${S2}/>
    <circle cx="33" cy="12" r="2.8" fill="${C.red[0]}" ${S2}/><circle cx="57" cy="12" r="2.8" fill="${C.red[0]}" ${S2}/>
    ${eye(41.5, 32, 2.4)}${eye(50.5, 32, 2.4)}${blush(38.5, 37.5, 2.4, 1.6)}${blush(53.5, 37.5, 2.4, 1.6)}
    <path d="M43 38Q46 40.5 49 38" fill="none" ${S2}/>
    ${hl(40, 27, 2.6, 1.5, -30, 0.8)}`,
  coin: `
    ${face(E(32, 32, 25), C.gold, 25, 25, 0.88)}
    <circle cx="32" cy="32" r="18" fill="none" stroke="${C.gold[1]}" stroke-width="2.5"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="${C.gold[2]}" stroke-width="1" transform="translate(-1 -1)"/>
    <rect x="26" y="26" width="12" height="12" rx="1.5" fill="${C.gold[1]}" ${S2}/>
    <path d="M16 23Q20 14 29 11" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity="0.9"/>
    <circle cx="14" cy="29" r="1.5" fill="#fff" opacity="0.9"/>`,
  merchant: `
    ${face('M14 64Q14 48 32 47Q50 48 50 64Z', C.indigo, 24, 52, 0.88)}
    <path d="M26 48L32 58L38 48" fill="#fff8e7" ${S2}/>
    ${face(E(32, 36, 14, 13), C.skin, 27, 31, 0.88)}
    <path d="M23.5 35Q26.5 32 29.5 35M34.5 35Q37.5 32 40.5 35" fill="none" ${S2}/>
    ${blush(22.5, 40, 2.8, 1.9)}${blush(41.5, 40, 2.8, 1.9)}
    <path d="M27.5 41Q32 46 36.5 41Z" fill="#fff" ${S2}/>
    ${face('M15 26Q22 9 32 9Q42 9 49 26Z', C.straw, 26, 15, 0.86)}
    <path d="M17.5 23Q32 18 46.5 23" fill="none" stroke="${C.red[0]}" stroke-width="3.5"/>
    ${face('M4 28Q32 18 60 28Q32 34 4 28Z', C.straw, 22, 25, 0.88)}
    <path d="M22 13Q26 11 29 12" fill="none" stroke="${C.straw[2]}" stroke-width="2" stroke-linecap="round"/>`,
  clover: `
    ${line('M34 34Q38 48 47 58', C.leaf[1], 3.5)}
    ${[45, 135, 225, 315]
      .map((deg, i) => `<g transform="translate(32 32) rotate(${deg})">${face('M0 0C-4 -4 -13 -7 -13 -15C-13 -21 -5 -23 0 -17C5 -23 13 -21 13 -15C13 -7 4 -4 0 0Z', i % 2 ? C.leaf : [C.leaf[2], C.leaf[0]], -4, -14, 0.84)}<path d="M0 -3V-15" fill="none" stroke="${C.leaf[2]}" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/></g>`)
      .join('')}
    ${hl(20, 20, 2.6, 1.6, -45, 0.6)}`,
  weed: `
    ${face('M30 58C26 46 18 38 9 34C19 33 26 39 29 46C27 34 20 23 17 11C27 19 32 31 33 44C34 31 40 20 50 14C45 26 39 36 37 48C42 41 49 37 57 37C48 42 41 50 38 58Z', ['#86a332', '#66801f'], 30, 30, 0.86)}
    <path d="M22 18Q28 28 31 42M45 20Q40 28 36 42M14 35Q21 37 27 44" fill="none" stroke="#b4cc5a" stroke-width="1.8" stroke-linecap="round"/>
    ${face('M38 58C38 52 43 47 50 47C49 53 45 57 38 58Z', ['#9fbd3e', '#7a9628'], 44, 51, 0.84, S2)}
    ${face('M30 58C29 52 23 49 16 50C18 56 23 58 30 58Z', ['#9fbd3e', '#7a9628'], 22, 53, 0.84, S2)}`,
  tanuki: `
    ${face(E(16, 16, 7, 7), ['#9a6a40', '#7a5030'], 14, 14, 0.8)}${face(E(48, 16, 7, 7), ['#9a6a40', '#7a5030'], 46, 14, 0.8)}
    <circle cx="16" cy="16" r="3" fill="#4a3324"/><circle cx="48" cy="16" r="3" fill="#4a3324"/>
    ${face('M32 13C47 13 56 23 56 34C56 41 53 45 48 47C44 54 39 56 32 56C25 56 20 54 16 47C11 45 8 41 8 34C8 23 17 13 32 13Z', ['#b8834f', '#946238'], 26, 25, 0.88)}
    <path d="M11 33C13 27 20 26 26 30C27 36 24 41 18 42C14 41 11 38 11 33Z" fill="#4a3324"/>
    <path d="M53 33C51 27 44 26 38 30C37 36 40 41 46 42C50 41 53 38 53 33Z" fill="#4a3324"/>
    <circle cx="21" cy="34" r="3.2" fill="#fff"/><circle cx="21.5" cy="34.3" r="1.9" fill="${INK}"/><circle cx="20.8" cy="33.4" r="0.7" fill="#fff"/>
    <circle cx="43" cy="34" r="3.2" fill="#fff"/><circle cx="42.5" cy="34.3" r="1.9" fill="${INK}"/><circle cx="41.8" cy="33.4" r="0.7" fill="#fff"/>
    ${face(E(32, 45, 10, 7.5), ['#f6e2c8', '#e2c6a2'], 29, 42, 0.86, S2)}
    <ellipse cx="32" cy="41.5" rx="3.6" ry="2.6" fill="${INK}"/><circle cx="31" cy="40.8" r="0.9" fill="#fff"/>
    <path d="M28 47Q30 49.5 32 47Q34 49.5 36 47" fill="none" ${S2}/>
    <path d="M32 16Q29 22 32 27Q35 22 32 16Z" fill="#7a5030"/>`,
  frost: `
    ${[0, 60, 120]
      .map((deg) => `<g transform="rotate(${deg} 32 32)">${line('M32 5V59', '#8fd0ff', 3.5)}${line('M25 11L32 18L39 11M25 53L32 46L39 53', '#8fd0ff', 3)}</g>`)
      .join('')}
    ${face('M32 25L38 28.5V35.5L32 39L26 35.5V28.5Z', ['#eaf7ff', '#bfe3fb'], 30, 29, 0.8)}`,
  heater: `
    <path d="M44 14Q41 10 44 6M51 18Q48 14 51 10" fill="none" stroke="#ffb3a0" stroke-width="2.4" stroke-linecap="round"/>
    ${face('M26 9H38V17H26Z', C.gold, 28, 11, 0.84, S2)}
    ${face('M24 17H40V22Q50 23 50 32V50Q50 58 42 58H22Q14 58 14 50V32Q14 23 24 22Z', ['#ff7f5c', '#de5a3a'], 24, 30, 0.9)}
    <path d="M20 31H44M19 37H45M19 43H45M20 49H44" fill="none" stroke="#c9472b" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
    ${face('M32 47C26 43 23 40 23 37C23 34 27 33 29 35L32 37L35 35C37 33 41 34 41 37C41 40 38 43 32 47Z', ['#fff0e6', '#ffd2c0'], 30, 38, 0.84, S2)}
    ${hl(19, 30, 1.4, 4, -5, 0.7)}`,
  moon: `
    ${face(E(32, 32, 23), ['#ffe98a', '#e9c556'], 26, 26, 0.86)}
    <circle cx="22" cy="22" r="4" fill="#f0d272"/><circle cx="43" cy="41" r="5" fill="#f0d272"/><circle cx="43" cy="22" r="2.5" fill="#f0d272"/>
    <path d="M22 34Q25.5 37.5 29 34M35 34Q38.5 37.5 42 34" fill="none" ${S2}/>
    ${blush(21, 40, 3, 2)}${blush(43, 40, 3, 2)}
    <path d="M30 41Q32 43 34 41" fill="none" ${S2}/>
    ${sparkle(9, 11, 5, '#fff')}${sparkle(56, 54, 4, '#fff')}`,
  thunder: bolt(),
};

// ---- お守り ----
const feather = (dark = true) => `
  ${face('M12 57Q15 30 34 16Q44 9 54 8Q53 20 46 30Q34 48 12 57Z', dark ? C.black : C.tan, 30, 26, 0.86)}
  <path d="M12 57Q30 38 50 12" fill="none" stroke="${dark ? '#7a7694' : '#fff'}" stroke-width="2" stroke-linecap="round"/>
  <path d="M24 44L18 41M31 35L24 31M38 27L32 22M30 40L36 44M37 32L44 35" fill="none" stroke="${dark ? '#5a5670' : C.tan[1]}" stroke-width="1.6" stroke-linecap="round"/>`;
const coinSmall = (x: number, y: number, r = 10) =>
  `${face(E(x, y, r), C.gold, x - r * 0.3, y - r * 0.3, 0.86)}<rect x="${x - r * 0.28}" y="${y - r * 0.28}" width="${r * 0.56}" height="${r * 0.56}" rx="1" fill="${C.gold[1]}" ${S2}/><path d="M${x - r * 0.6} ${y - r * 0.25}Q${x - r * 0.45} ${y - r * 0.6} ${x - r * 0.1} ${y - r * 0.72}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`;
const scrollD = 'M16 14H48V50H16Z';
const scroll = (paper: string[], rod: string[]) => `
  ${face(scrollD, paper, 24, 22, 0.9)}
  ${face('M11 9H53Q56 9 56 13Q56 17 53 17H11Q8 17 8 13Q8 9 11 9Z', rod, 20, 11, 0.8)}
  ${face('M11 47H53Q56 47 56 51Q56 55 53 55H11Q8 55 8 51Q8 47 11 47Z', rod, 20, 49, 0.8)}`;
const skep = (body: string[], band: string) => `
  ${face('M32 9C44 9 51 20 51 31C55 36 55 45 51 50H13C9 45 9 36 13 31C13 20 20 9 32 9Z', body, 26, 22, 0.88)}
  <g fill="none" stroke="${band}" stroke-width="2.4" stroke-linecap="round"><path d="M18 20Q32 16 46 20"/><path d="M14 31Q32 27 50 31"/><path d="M12 41Q32 37 52 41"/></g>
  ${hl(21, 17, 2, 3.5, -40, 0.6)}
  ${face('M8 50H56V57H8Z', C.brown, 20, 52, 0.8)}
  <path d="M27 50Q27 43 32 43Q37 43 37 50Z" fill="#4a3324" ${S2}/>`;
const wellD = (roof: string[], post: string, stone: string[], line2: string) => `
  ${face('M10 25L32 9L54 25Z', roof, 26, 17, 0.84)}
  ${line('M16 25V40M48 25V40', post, 4)}
  ${line('M16 31H48', post, 2.5)}
  <path d="M32 31V36" fill="none" stroke="${INK}" stroke-width="1.6"/>
  ${face('M27 36H37L36 42H28Z', C.brown, 30, 38, 0.8, S2)}
  ${face('M10 42Q32 36 54 42V55Q32 61 10 55Z', stone, 22, 46, 0.9)}
  <path d="M10 42Q32 47 54 42" fill="none" ${S2}/>
  <path d="M14 49H24M28 51H38M42 49H50M19 55V49M33 57V51M45 55V49" fill="none" stroke="${line2}" stroke-width="1.8" stroke-linecap="round"/>`;
const scarecrowD = (shirt: string[], hat: string[], extra = '') => `
  ${line('M32 26V61', C.brown[0], 4.5)}
  ${line('M8 37H56', C.brown[0], 4.5)}
  ${[[8, 37, -1], [56, 37, 1]].map(([x, y, d]) => `<path d="M${x} ${y - 5}L${x + d * 6} ${y - 4}L${x + d * 7} ${y}L${x + d * 6} ${y + 4}L${x} ${y + 5}" fill="${C.straw[0]}" ${S2}/>`).join('')}
  ${face('M19 33H45L43 54H21Z', shirt, 26, 38, 0.88)}
  <rect x="35" y="44" width="6" height="6" fill="${shirt[2]}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="2 1.4"/>
  <path d="M23 54L22 59M28 54V60M36 54V60M41 54L42 59" fill="none" stroke="${C.straw[1]}" stroke-width="2" stroke-linecap="round"/>
  ${face(E(32, 24, 10.5), ['#f4dcb0', '#dfbd85'], 29, 21, 0.86)}
  ${eye(28, 23, 1.9)}${eye(36, 23, 1.9)}${blush(25.5, 27.5, 2, 1.4)}${blush(38.5, 27.5, 2, 1.4)}
  <path d="M28.5 28.5Q32 31.5 35.5 28.5" fill="none" ${S2}/>
  ${face('M20 17Q24 4 32 4Q40 4 44 17Z', hat, 28, 9, 0.86)}
  ${face('M10 18Q32 11 54 18Q32 23 10 18Z', hat, 24, 16, 0.86)}
  ${extra}`;

/** お守り・畑に置くもの */
const CHARM_ART = {
  coinPurse: `
    ${coinSmall(40, 19, 8)}
    ${face('M14 28H50Q57 44 50 54Q46 58 32 58Q18 58 14 54Q7 44 14 28Z', C.pink, 24, 36, 0.88)}
    ${line('M14 28Q14 22 21 22H43Q50 22 50 28', C.gold[1], 3)}
    <circle cx="28" cy="19.5" r="3.2" fill="${C.gold[0]}" ${S2}/><circle cx="36" cy="19.5" r="3.2" fill="${C.gold[0]}" ${S2}/>
    ${hl(19, 37, 1.8, 5, -10, 0.7)}
    <path d="M24 46Q32 50 40 46" fill="none" stroke="${C.pink[2]}" stroke-width="2" stroke-linecap="round"/>`,
  gentleRain: `
    ${line('M32 30V52Q32 58 26 57Q22 56 23 52', C.brown[0], 3.5)}
    ${face('M6 31C8 17 19 9 32 9C45 9 56 17 58 31Q52 27 45 31Q39 26 32 31Q25 26 19 31Q12 27 6 31Z', C.blue, 24, 18, 0.86)}
    <path d="M32 9Q26 18 19 31M32 9Q38 18 45 31" fill="none" stroke="${C.blue[2]}" stroke-width="1.8" stroke-linecap="round"/>
    ${hl(17, 19, 2, 4, 40, 0.7)}
    <circle cx="32" cy="8" r="2" fill="${C.blue[1]}" ${S2}/>
    ${drop(11, 38, 0.75)}${drop(53, 40, 0.75)}${drop(44, 50, 0.6)}`,
  crowToll: `${feather(true)}${coinSmall(46, 46, 10)}`,
  aging: `
    ${face('M17 8H47Q55 32 47 56H17Q9 32 17 8Z', C.tan, 26, 20, 0.88)}
    <path d="M24 9Q20 32 24 55M32 9V55M40 9Q44 32 40 55" fill="none" stroke="${C.tan[1]}" stroke-width="1.8"/>
    ${line('M13 20Q32 23 51 20', '#8f969c', 3)}${line('M13 44Q32 41 51 44', '#8f969c', 3)}
    ${hl(19, 30, 1.4, 6, 0, 0.55)}
    ${face(E(32, 32, 4.5, 4), C.brown, 31, 31, 0.8, S2)}`,
  seedSack: `
    ${face('M20 22Q8 40 12 52Q15 58 32 58Q49 58 52 52Q56 40 44 22Z', C.tan, 26, 32, 0.88)}
    ${face('M20 22Q16 10 24 10Q28 15 32 12Q36 15 40 10Q48 10 44 22Z', ['#e9b779', C.tan[1]], 28, 14, 0.84)}
    ${line('M19 22Q32 26 45 22', C.red[0], 3)}
    <path d="M45 22L50 27M45 22L51 21" fill="none" stroke="${C.red[0]}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="32" cy="41" r="9.5" fill="#fff3dc" ${S2}/>
    ${line('M32 47V40', C.leaf[1], 1.8)}
    <path d="M32 42C28 43 25 41 24.5 37C28.5 36 31 38 32 42Z" fill="${C.leaf[0]}" ${S2}/>
    <path d="M32 40C36 41 39 38 39.5 34.5C35.5 34 33 36 32 40Z" fill="${C.leaf[2]}" ${S2}/>
    ${[[12, 58], [52, 59], [57, 55]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="1.6" fill="${C.brown[0]}" ${S2}/>`).join('')}
    ${hl(17, 40, 1.6, 5, 10, 0.6)}`,
  sunBlessing: `
    ${line('M32 40V61', C.leaf[1], 4)}
    ${face('M32 54Q42 45 52 50Q43 59 32 54Z', C.leaf, 40, 51, 0.84, S2)}
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI / 6) * i;
      const x = 32 + Math.cos(a) * 15, y = 25 + Math.sin(a) * 15;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="5" ry="8.5" transform="rotate(${((a * 180) / Math.PI + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${i % 2 ? '#ffc21f' : '#ffd84a'}" ${S2}/>`;
    }).join('')}
    ${face(E(32, 25, 10), C.brown, 29, 22, 0.86)}
    ${[[28, 22], [33, 21], [36, 25], [30, 27], [34, 29], [27, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#4a2e16"/>`).join('')}`,
  bargain: `
    ${line('M45 13Q52 4 58 9', C.brown[0], 2)}
    ${face('M8 33L31 10H52V31L29 54Q26 57 23 54L8 39Q5 36 8 33Z', ['#ffbe4d', '#ec9a28'], 28, 22, 0.88)}
    <circle cx="45" cy="17" r="3.6" fill="#fff8e7" ${S2}/>
    ${line('M27 25V41M21 35L27 41L33 35', C.red[0], 3)}
    ${hl(24, 24, 1.4, 4, 45, 0.6)}`,
  scarecrow: scarecrowD(C.blue, C.straw),
  bumper: `
    ${face('M27 31C26 17 30 7 34 7C38 7 42 17 41 31Z', C.gold, 33, 14, 0.84)}
    ${face(E(20, 27, 10.5), C.red, 17, 23, 0.84)}${hl(16, 24, 1.6, 3, -30, 0.8)}
    ${face(E(45, 27, 10.5), C.orange, 42, 23, 0.84)}
    ${line('M14 31Q32 8 50 31', C.tan[1], 3)}
    ${face('M8 30H56L50 56Q49 58 46 58H18Q15 58 14 56Z', C.tan, 24, 38, 0.9)}
    <g fill="none" stroke="${C.tan[1]}" stroke-width="1.8"><path d="M10 39H54M12 48H52"/><path d="M20 30L22 58M32 30V58M44 30L42 58"/></g>
    ${hl(14, 36, 1.4, 3, 10, 0.6)}`,
  goldLuck: `
    ${face('M14 58Q12 40 20 34H44Q52 40 50 58Z', C.white, 24, 42, 0.9)}
    ${face('M8 22L14 7L25 16Z', C.white, 15, 15, 0.8)}${face('M56 22L50 7L39 16Z', C.white, 49, 15, 0.8)}
    <path d="M12 18L15 11L20 16ZM52 18L49 11L44 16Z" fill="${C.pink[0]}"/>
    ${face(E(32, 26, 22, 17), C.white, 25, 20, 0.9)}
    <path d="M21 25Q24 22 27 25M37 25Q40 22 43 25" fill="none" ${S2}/>
    ${blush(19, 31, 3, 2)}${blush(45, 31, 3, 2)}
    <path d="M28 31Q30 34 32 31Q34 34 36 31" fill="none" ${S2}/>
    ${face('M45 36Q46 22 50 14Q54 10 57 14Q58 24 53 38Z', C.white, 51, 20, 0.84)}
    <path d="M50 14.5V18M53 13.5V17" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>
    ${line('M16 42Q32 48 48 42', C.red[0], 4)}
    ${face(E(32, 48, 5), C.gold, 31, 47, 0.84, S2)}
    <path d="M29 49H35" fill="none" stroke="${INK}" stroke-width="1.4"/>`,
  bugWard: `
    ${face('M32 6Q42 12 54 12Q54 40 32 58Q10 40 10 12Q22 12 32 6Z', ['#9ad37a', '#6fb04e'], 24, 18, 0.88)}
    ${line('M32 48V24', C.leaf[1], 2.5)}
    <path d="M32 40C26 41 19 38 18 30C25 29 31 33 32 40Z" fill="${C.leaf[0]}" ${S2}/>
    <path d="M32 34C38 35 45 31 46 23C39 22 33 27 32 34Z" fill="#fff8e7" ${S2}/>
    ${hl(18, 18, 1.8, 4, 20, 0.7)}`,
  taxRelief: `
    ${scroll(['#fff6dc', '#ead9b2'], C.tan)}
    <path d="M22 24H42M22 30H42M22 36H34" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="41" cy="40" r="6" fill="${C.red[0]}" ${S2}/>
    <path d="M41 36.5V43M38.5 40.5L41 43L43.5 40.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  artisan: `
    ${face('M9 16Q9 11 14 11H44Q49 11 49 16V52Q49 57 44 57H14Q9 57 9 52Z', C.red, 20, 22, 0.9)}
    ${face('M13 6H45V13H13Z', C.gold, 22, 8, 0.8, S2)}
    <rect x="14" y="20" width="30" height="18" rx="3" fill="#fffaf0" ${S2}/>
    <path d="M24 20V38M34 20V38" fill="none" stroke="${INK}" stroke-width="1.6"/>
    ${sparkle(19, 29, 3.2, C.gold[0])}<circle cx="29" cy="29" r="3" fill="${C.red[0]}" ${S2}/>${sparkle(39, 29, 3.2, C.gold[0])}
    <rect x="17" y="44" width="24" height="6" rx="2" fill="${C.black[0]}"/>
    ${line('M49 34H55V16', '#9aa3ab', 2.5)}
    ${face(E(55, 13, 4.2), C.red, 54, 12, 0.8, S2)}
    ${hl(13, 22, 1.2, 4, 0, 0.6)}`,
  tomatoFest: `${tomato}${line('M45 26V3', C.brown[0], 2)}<path d="M46 4L60 8.5L46 14Z" fill="${C.red[0]}" ${S2}/><path d="M46 9H55" fill="none" stroke="#fff" stroke-width="1.5"/>`,
  thunderstorm: `${cloud(['#8f95ae', '#6e7390', '#b6bbd0'], 0, -6)}${bolt(14, 26, 0.6)}`,
  sunshower: `
    ${sunRays(21, 21, 11, 18, 8)}${sunFace(21, 21, 10)}
    ${cloud(C.cloud, 14, 14, 0.78)}
    ${drop(30, 50, 0.7)}${drop(42, 52, 0.7)}${drop(54, 50, 0.7)}`,
  moonFeast: `
    ${face(E(42, 18, 14), ['#ffe98a', '#e9c556'], 38, 14, 0.86)}
    ${line('M11 60Q12 44 9 30M17 60Q17 46 21 34', '#a8894a', 1.6)}
    ${face('M9 30C4 26 5 16 9 10C13 16 13 25 9 30Z', ['#f2e2b8', '#d9c08a'], 9, 18, 0.84, S2)}
    ${face('M21 34C17 31 18 22 23 17C26 23 25 30 21 34Z', ['#f2e2b8', '#d9c08a'], 22, 24, 0.84, S2)}
    <path d="M9 13V27M22.5 20L21.5 32" fill="none" stroke="#c9a45a" stroke-width="1" stroke-linecap="round"/>
    ${face('M22 52H52L48 58H26Z', C.tan, 32, 54, 0.8, S2)}
    ${face(E(37, 47, 6), C.white, 35, 45, 0.84)}${face(E(31, 39.5, 6), ['#ffe0ea', '#f5b3c8'], 29, 38, 0.84)}${face(E(43, 39.5, 6), ['#b6df8f', '#8cc062'], 41, 38, 0.84)}${face(E(37, 32, 6), C.white, 35, 30, 0.84)}`,
  crowReturn: `${crowBody}${coinSmall(57, 37, 7.5)}${sparkle(10, 14, 5, C.gold[2])}`,
  lastStraw: `
    <circle cx="32" cy="6" r="3" fill="#9aa3ab" ${S2}/>
    <path d="M32 8L33 19" fill="none" stroke="${C.red[0]}" stroke-width="1.8" stroke-linecap="round"/>
    <g transform="rotate(-14 33 20)">
      ${face('M16 24H50V54H16Z', ['#fff6dc', '#ead9b2'], 24, 30, 0.9)}
      ${face('M12 19H54Q57 19 57 22.5Q57 26 54 26H12Q9 26 9 22.5Q9 19 12 19Z', C.tan, 20, 21, 0.8)}
      <path d="M22 33H44M22 39H44M22 45H36" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      <path d="M50 54L45 48L40 54" fill="#fff6dc" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    </g>
    <path d="M52 40Q56 44 54 48" fill="none" stroke="#8fc9f0" stroke-width="2" stroke-linecap="round"/>
    <path d="M57 36Q60 40 58.5 44" fill="none" stroke="#8fc9f0" stroke-width="2" stroke-linecap="round"/>`,
  bigScarecrow: scarecrowD(C.red, C.gold, `${sparkle(54, 50, 5.5, C.gold[2])}${sparkle(10, 52, 4, C.gold[2])}`),
  well: wellD(C.red, C.brown[0], C.stone, '#8c8880'),
  goldenWell: `${wellD(C.gold, C.gold[1], ['#ffe98a', '#e9c24a'], '#c99a1e')}${sparkle(55, 10, 5.5, '#fff')}${sparkle(8, 40, 4, '#fff')}`,
  hive: `${skep(C.straw, '#b8862a')}`,
  queenHive: `${skep(C.gold, C.gold[1])}<path d="M21 12L22 2L28 8L32 1L36 8L42 2L43 12Z" fill="${C.gold[2]}" ${S2}/><circle cx="32" cy="7" r="1.6" fill="${C.red[0]}"/>`,
};

// ---- 畑に置くもの・景色・演出 ----
const star5 = (cx: number, cy: number, r: number, t: string[]) => {
  const d = `M${starPts(cx, cy, 5, r, r, 0.48, -90)}Z`;
  return `${face(d, t, cx - r * 0.2, cy - r * 0.25, 0.84)}${hl(cx - r * 0.35, cy - r * 0.2, r * 0.1, r * 0.2, 30, 0.8)}`;
};
const bale = `
  ${face('M14 17H50Q59 32 50 48H14Z', C.straw, 30, 26, 0.9)}
  <path d="M24 18Q20 33 24 47M32 18Q28 33 32 47M40 18Q44 33 40 47" fill="none" stroke="${C.straw[1]}" stroke-width="1.4"/>
  ${face(E(14, 32.5, 7, 15.5), ['#e1b24a', '#c4952e'], 12, 28, 0.84)}
  <circle cx="14" cy="32.5" r="2.5" fill="${C.straw[1]}"/>
  <path d="M10 25L13 28M17 24L15 28M9 38L13 36M18 41L15 37" fill="none" stroke="#a87a28" stroke-width="1.3" stroke-linecap="round"/>
  ${line('M22 17Q19 32.5 22 48M44 17Q48 32.5 44 48', C.brown[0], 2.5)}
  ${hl(36, 22, 6, 1.4, 0, 0.55)}`;

/** 景色・画面・演出 */
const SCENE_ART = {
  compost: `
    ${face('M8 34H56V54Q56 57 53 57H11Q8 57 8 54Z', C.tan, 24, 40, 0.9)}
    <path d="M8 45H56M24 34V57M40 34V57" fill="none" stroke="${C.tan[1]}" stroke-width="1.8"/>
    ${face('M10 36Q14 24 26 25Q32 18 42 23Q53 24 54 36Z', ['#6a4428', '#4a2e18'], 30, 28, 0.86)}
    ${[[20, 32], [30, 28], [42, 30], [36, 34], [24, 35]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="1.6" fill="#8a5d3b"/>`).join('')}
    <path d="M44 26C42 20 44 14 50 12C52 18 50 23 44 26Z" fill="${C.leaf[0]}" ${S2}/>
    <path d="M20 28C18 23 13 21 9 22C11 27 15 29 20 28Z" fill="#c9a45a" ${S2}/>
    <path d="M30 18Q28 13 31 9M36 17Q34 12 37 8" fill="none" stroke="#d8c8b8" stroke-width="2" stroke-linecap="round"/>`,
  water: `
    ${face('M4 20Q16 13 28 20T52 20T64 20V46Q52 53 40 46T16 46T0 46V22Z', C.blue, 22, 26, 0.9)}
    <path d="M8 29Q15 25 22 29M30 34Q37 30 44 34M14 40Q20 37 26 40M44 26Q50 23 56 26" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  expand: `
    ${face('M10 14Q10 10 14 10H50Q54 10 54 14V50Q54 54 50 54H14Q10 54 10 50Z', C.brown, 20, 20, 0.9)}
    <path d="M10 24.7H54M10 39.3H54M24.7 10V54M39.3 10V54" fill="none" stroke="#5a3517" stroke-width="2.2"/>
    ${[[17, 17], [32, 17], [17, 32]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.5" fill="#a8764a"/>`).join('')}
    ${face(E(48, 48, 12.5), C.green, 44, 44, 0.86)}
    ${line('M48 41V55M41 48H55', '#fff', 3.6)}`,
  hut: `
    ${face('M12 30H52V58H12Z', C.tan, 24, 36, 0.9)}
    <path d="M12 37H52M12 44H52M12 51H52" fill="none" stroke="${C.tan[1]}" stroke-width="1.4"/>
    ${face('M40 9H48V24H40Z', C.brown, 42, 12, 0.8, S2)}
    ${face('M5 32L32 9L59 32Z', ['#c9502f', '#9e3a20'], 28, 18, 0.86)}
    <path d="M14 28L32 13L50 28" fill="none" stroke="#e0785a" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="17" y="37" width="11" height="10" rx="1" fill="#ffe680" ${S2}/>
    <path d="M22.5 37V47M17 42H28" fill="none" stroke="${INK}" stroke-width="1.4"/>
    ${face('M35 40H47V58H35Z', C.brown, 38, 44, 0.84, S2)}
    <circle cx="44" cy="50" r="1.2" fill="${C.gold[0]}"/>`,
  cat: `
    ${line('M14 40Q4 36 7 24', '#f2a65a', 5)}
    ${line('M20 50V57M28 50V57M40 50V57M48 50V57', '#f2a65a', 3.2)}
    ${face('M14 46Q14 31 30 31H44Q54 31 54 43V50H14Z', ['#f6b06a', '#df8d42'], 26, 36, 0.88)}
    <path d="M26 32Q25 40 28 46M34 31Q33 39 36 46" fill="none" stroke="#df8d42" stroke-width="2.2" stroke-linecap="round"/>
    ${face('M44 31L46 20L52 27Z', ['#f6b06a', '#df8d42'], 47, 26, 0.84, S2)}${face('M54 29L58 21L59 32Z', ['#f6b06a', '#df8d42'], 57, 27, 0.84, S2)}
    ${face(E(52, 37, 9), ['#f6b06a', '#df8d42'], 50, 34, 0.86)}
    ${eye(55, 35.5, 1.8)}${blush(56.5, 40, 1.8, 1.2)}
    <path d="M58.5 39L60.5 39.5" fill="none" ${S2}/>`,
  bird: `
    ${face('M16 34L6 32L9 40Z', ['#4a98d6', '#3a7fbf'], 12, 35, 0.8, S2)}
    ${face(E(30, 37, 16, 11), ['#62b0ea', '#3f8fcf'], 25, 33, 0.88)}
    <path d="M22 42Q30 48 40 42" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>
    ${face(E(44, 28, 8.5), ['#62b0ea', '#3f8fcf'], 42, 26, 0.86)}
    <path d="M51.5 27L59 29.5L51.5 32Z" fill="${C.gold[0]}" ${S2}/>
    ${eye(46, 26.5, 1.8)}${blush(46, 31.5, 1.8, 1.2)}
    <path class="wing" d="M22 33Q28 14 41 30Q32 36 22 33Z" fill="#9fd0f5" ${S}/>`,
  butterfly: `
    <path class="wing" d="M32 31C24 15 13 9 9 15C6 21 11 31 32 34Z" fill="${C.pink[0]}" ${S}/>
    <path class="wing" d="M32 31C40 15 51 9 55 15C58 21 53 31 32 34Z" fill="${C.pink[0]}" ${S}/>
    <path class="wing" d="M32 34C20 38 16 46 20 52C25 55 30 47 32 37Z" fill="${C.pink[2]}" ${S}/>
    <path class="wing" d="M32 34C44 38 48 46 44 52C39 55 34 47 32 37Z" fill="${C.pink[2]}" ${S}/>
    <circle cx="17" cy="20" r="3" fill="#fff" opacity="0.8"/><circle cx="47" cy="20" r="3" fill="#fff" opacity="0.8"/>
    ${face(E(32, 36, 3, 12), C.black, 31, 32, 0.8, S2)}
    <path d="M31 25Q27 17 24 15M33 25Q37 17 40 15" fill="none" ${S2}/>`,
  official: `
    ${face('M12 64Q12 42 32 40Q52 42 52 64Z', C.indigo, 24, 48, 0.9)}
    <path d="M24 42L32 56L40 42" fill="#fff8e7" ${S2}/>
    ${face(E(32, 27, 12, 11.5), C.skin, 28, 23, 0.88)}
    <path d="M24.5 23.5L29 25M39.5 23.5L35 25" fill="none" ${S2}/>
    ${eye(27.5, 27.5, 1.8)}${eye(36.5, 27.5, 1.8)}
    <path d="M29 33H35" fill="none" ${S2}/>
    ${face('M20 18Q22 5 32 5Q42 5 44 18Q32 15 20 18Z', C.black, 28, 9, 0.86)}
    <path d="M38 6L50 2" fill="none" stroke="${C.black[0]}" stroke-width="3.5" stroke-linecap="round"/>
    ${face('M46 42H56V60H46Z', ['#fff6dc', '#ead9b2'], 49, 46, 0.86, S2)}
    <path d="M48.5 47H53.5M48.5 51H53.5M48.5 55H52" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`,
  calendar: `
    ${face('M10 18Q10 14 14 14H50Q54 14 54 18V52Q54 56 50 56H14Q10 56 10 52Z', C.white, 20, 24, 0.92)}
    <path d="M10 18Q10 14 14 14H50Q54 14 54 18V27H10Z" fill="${C.red[0]}" ${S}/>
    ${line('M22 8V19M42 8V19', '#9aa3ab', 2.5)}
    ${[[22, 37], [32, 37], [42, 37], [22, 46], [32, 46]].map(([x, y]) => `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" rx="1.5" fill="${C.cloud[1]}"/>`).join('')}
    <rect x="39" y="43" width="6" height="6" rx="1.5" fill="${C.red[0]}"/>`,
  bale,
  bumperHarvest: `
    ${[[-14, 0], [0, -4], [14, 0]].map(([dx, dy]) => `${line(`M32 42Q${32 + dx * 0.4} ${26 + dy} ${32 + dx} ${16 + dy}`, '#b89848', 1.8)}${face(`M${32 + dx} ${8 + dy}C${38 + dx} ${12 + dy} ${38 + dx} ${24 + dy} ${32 + dx} ${30 + dy}C${26 + dx} ${24 + dy} ${26 + dx} ${12 + dy} ${32 + dx} ${8 + dy}Z`, C.gold, 31 + dx, 14 + dy, 0.84)}<path d="M${29 + dx} ${14 + dy}L${32 + dx} ${17 + dy}L${35 + dx} ${14 + dy}M${29 + dx} ${20 + dy}L${32 + dx} ${23 + dy}L${35 + dx} ${20 + dy}" fill="none" stroke="${C.gold[1]}" stroke-width="1.4" stroke-linecap="round"/>`).join('')}
    ${face('M26 40H38L41 60H23Z', C.straw, 30, 46, 0.86)}
    ${line('M24 45H40', C.red[0], 3)}
    ${sparkle(53, 44, 6, C.gold[2])}${sparkle(10, 46, 4.5, C.gold[2])}${sparkle(54, 8, 4, '#fff')}`,
  sparkle: `${sparkle(32, 32, 26, C.gold[0])}${hl(27, 27, 2, 5, 45, 0.8)}`,
  star: star5(32, 34, 27, C.gold),
  drop: `${face(dropD(32, 5, 3.7), C.blue, 27, 34, 0.84)}${hl(25, 42, 2.6, 6, 20, 0.85)}`,
  feather: feather(true),
  leafBit: `${face('M10 52Q10 14 54 10Q52 52 10 52Z', C.leaf, 26, 26, 0.86)}<path d="M12 50L50 14M24 38L22 28M32 30L42 32M36 26L34 18" fill="none" stroke="${C.leaf[2]}" stroke-width="2" stroke-linecap="round"/>`,
  heart: `${face('M32 55C18 46 8 36 9 23C10 13 20 9 27 13Q30 15 32 19Q34 15 37 13C44 9 54 13 55 23C56 36 46 46 32 55Z', C.pink, 24, 24, 0.86)}${hl(18, 21, 3, 5, -35, 0.85)}`,
  skull: `
    ${face('M14 30C14 15 22 8 32 8C42 8 50 15 50 30C50 38 46 42 43 43V51Q43 55 39 55H25Q21 55 21 51V43C18 42 14 38 14 30Z', C.white, 26, 22, 0.88)}
    <ellipse cx="24.5" cy="31" rx="5.5" ry="6" fill="${INK}"/><ellipse cx="39.5" cy="31" rx="5.5" ry="6" fill="${INK}"/>
    <circle cx="22.8" cy="29" r="1.6" fill="#fff"/><circle cx="37.8" cy="29" r="1.6" fill="#fff"/>
    <path d="M30 41L32 37L34 41Z" fill="${INK}"/>
    <path d="M27 48V55M32 48V55M37 48V55" fill="none" ${S2}/>
    ${hl(20, 18, 2.4, 4, 40, 0.8)}`,
  puff: `${face('M14 42Q5 42 7 33Q9 25 17 27Q19 17 29 19Q37 11 45 19Q55 18 54 28Q60 34 54 41Q50 47 42 43Q36 51 28 45Q20 49 14 42Z', C.cloud, 24, 26, 0.86)}${hl(20, 31, 3, 1.8, -20, 0.9)}`,
  lock: `
    ${line('M22 30V21Q22 11 32 11Q42 11 42 21V30', '#9aa3ab', 3.5)}
    ${face('M12 32Q12 28 16 28H48Q52 28 52 32V52Q52 56 48 56H16Q12 56 12 52Z', C.gold, 22, 34, 0.88)}
    <circle cx="32" cy="40" r="4" fill="${INK}"/><path d="M30.5 42H33.5L34.5 49H29.5Z" fill="${INK}"/>
    ${hl(17, 35, 1.4, 4, 0, 0.7)}`,
};

export const ART = {
  ...CROP_ART,
  ...SYMBOL_ART,
  ...CHARM_ART,
  ...SCENE_ART,
  seed: packet(C.red, tomato),
  berrySeed: packet(C.pink, strawberry),
  pumpkinSeed: packet(C.orange, pumpkin),
  melonSeed: packet(C.green, melon),
};

export type ArtId = keyof typeof ART;

/** SVG文字列。大きさは周りの font-size に合わせる（1em 四方） */
export function art(id: ArtId, cls = ''): string {
  return `<svg class="art ${cls}" viewBox="0 0 64 64" width="1em" height="1em" aria-hidden="true">${ART[id]}</svg>`;
}

/** 演出で使っていた絵文字をイラストに置き換える。対応がなければそのまま */
const EMOJI_ART: Record<string, ArtId> = {
  '✨': 'sparkle',
  '⭐': 'star',
  '🌟': 'star',
  '🪙': 'coin',
  '💰': 'coin',
  '🪶': 'feather',
  '💧': 'drop',
  '🍂': 'leafBit',
  '🍃': 'leafBit',
  '🌿': 'leafBit',
  '🌱': 'sprout',
  '🌰': 'seed',
  '🐝': 'bee',
  '🐛': 'bug',
  '🍀': 'clover',
  '☀️': 'sun',
  '🎰': 'artisan',
  '🌼': 'sunBlessing',
  '💛': 'heart',
  '💜': 'heart',
  '🖤': 'feather',
  '💀': 'skull',
  '💨': 'puff',
  '🔓': 'sparkle',
  '🌾': 'bale',
  '❄️': 'frost',
  '🦝': 'tanuki',
  '🎊': 'star',
  '🎉': 'star',
};

export function glyph(ch: string): string {
  if (ch.startsWith('<')) return ch;
  const id = EMOJI_ART[ch];
  return id ? art(id) : ch;
}
