// 自作のSVGイラスト。絵文字の代わりに使い、端末による見た目の差をなくす。
// すべて 64×64 の格子に、太めの輪郭線＋平塗り＋ハイライト1つで描く。

const INK = '#3d3326';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const C = {
  brown: '#7a4a24',
  tan: '#c98a4b',
  tanLight: '#e6b07a',
  gold: '#f5c518',
  goldDark: '#d49b00',
  goldLight: '#fff1a8',
  red: '#e5533d',
  redLight: '#ff9a8a',
  green: '#6fb03e',
  greenLight: '#9bd56a',
  greenDark: '#3f7a22',
  blue: '#5aa6e0',
  cloud: '#eef3f8',
  purple: '#9b6bd3',
  purpleLight: '#c9b8e8',
  black: '#2e2a35',
  blackLight: '#4a4456',
  skin: '#ffd9b0',
  straw: '#e8c25a',
  pink: '#ff8fb1',
  white: '#ffffff',
};

const acorn = (body: string, cap: string, hi: string) => `
  <ellipse cx="32" cy="38" rx="15" ry="18" fill="${body}" ${S}/>
  <path d="M14 29 Q32 9 50 29 Q32 35 14 29Z" fill="${cap}" ${S}/>
  <path d="M32 15 L34 6" fill="none" ${S}/>
  <ellipse cx="26" cy="40" rx="4" ry="8" fill="${hi}"/>`;

const sparkle = (x: number, y: number, r: number, fill = C.gold) =>
  `<path d="M${x} ${y - r} Q${x + r * 0.2} ${y - r * 0.2} ${x + r} ${y} Q${x + r * 0.2} ${y + r * 0.2} ${x} ${y + r} Q${x - r * 0.2} ${y + r * 0.2} ${x - r} ${y} Q${x - r * 0.2} ${y - r * 0.2} ${x} ${y - r}Z" fill="${fill}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;

const drop = (x: number, y: number, s = 1) =>
  `<path d="M${x} ${y} Q${x - 5 * s} ${y + 8 * s} ${x} ${y + 11 * s} Q${x + 5 * s} ${y + 8 * s} ${x} ${y}Z" fill="${C.blue}" ${S}/>`;

const star5 = (cx: number, cy: number, r: number, fill: string) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
  });
  return `<polygon points="${pts.join(' ')}" fill="${fill}" ${S}/>`;
};

const strawberry = `
  <path d="M32 58 Q12 44 14 28 Q20 18 32 20 Q44 18 50 28 Q52 44 32 58Z" fill="${C.red}" ${S}/>
  ${[
    [24, 30],
    [32, 28],
    [40, 30],
    [22, 40],
    [32, 38],
    [42, 40],
    [28, 48],
    [36, 48],
  ]
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="2.4" fill="#ffe08a"/>`)
    .join('')}
  <path d="M20 22 L28 14 L32 20 L36 14 L44 22 L36 24 L32 22 L28 24Z" fill="${C.green}" ${S}/>
  <path d="M32 18 V8" fill="none" stroke="${C.greenDark}" stroke-width="4" stroke-linecap="round"/>`;

const pumpkin = `
  <path d="M30 18 Q30 10 36 6" fill="none" stroke="${C.greenDark}" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="18" cy="38" rx="11" ry="17" fill="#f08a24" ${S}/>
  <ellipse cx="46" cy="38" rx="11" ry="17" fill="#f08a24" ${S}/>
  <ellipse cx="32" cy="38" rx="12" ry="19" fill="#ff9f3a" ${S}/>
  <path d="M38 14 Q48 10 52 18 Q44 20 38 14Z" fill="${C.green}" ${S}/>
  <ellipse cx="27" cy="32" rx="3" ry="7" fill="#ffc77a"/>`;

/** 種の袋：袋の色と、表に描いた作物で何が育つか分かるようにする */
const packet = (bag: string, inner: string) => `
  <path d="M12 12 H52 V58 H12Z" fill="${bag}" ${S}/>
  <path d="M12 12 L16 6 H48 L52 12" fill="#fff6dc" ${S}/>
  <rect x="17" y="18" width="30" height="30" rx="6" fill="#fffaf0" stroke="${INK}" stroke-width="2"/>
  <g transform="translate(18 19) scale(0.44)">${inner}</g>
  <circle cx="22" cy="53" r="1.8" fill="${C.brown}"/><circle cx="32" cy="53" r="1.8" fill="${C.brown}"/><circle cx="42" cy="53" r="1.8" fill="${C.brown}"/>`;

const ART = {
  // ---- 絵柄 ----
  // seed は「トマトの種」。袋の絵で作物が分かる
  seed: '',
  berrySeed: '',
  pumpkinSeed: '',
  goldSeed: `${acorn(C.gold, C.goldDark, C.goldLight)}${sparkle(52, 12, 7, C.white)}${sparkle(12, 48, 5, C.white)}`,
  rain: `
    <path d="M16 36 Q7 36 8 28 Q9 20 18 21 Q21 10 32 11 Q43 11 46 21 Q56 20 57 29 Q57 36 48 36 Z" fill="${C.cloud}" ${S}/>
    <path d="M18 27 Q20 22 25 22" fill="none" stroke="${C.white}" stroke-width="3" stroke-linecap="round"/>
    ${drop(20, 42)}${drop(32, 46)}${drop(44, 42)}`,
  sun: `
    ${Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i;
      const x1 = 32 + Math.cos(a) * 19;
      const y1 = 32 + Math.sin(a) * 19;
      const x2 = 32 + Math.cos(a) * 28;
      const y2 = 32 + Math.sin(a) * 28;
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${C.goldDark}" stroke-width="5" stroke-linecap="round"/>`;
    }).join('')}
    <circle cx="32" cy="32" r="15" fill="#ffc93c" ${S}/>
    <circle cx="27" cy="30" r="2" fill="${INK}"/><circle cx="37" cy="30" r="2" fill="${INK}"/>
    <path d="M26 36 Q32 41 38 36" fill="none" ${S}/>
    <circle cx="23" cy="35" r="2.5" fill="${C.redLight}"/><circle cx="41" cy="35" r="2.5" fill="${C.redLight}"/>`,
  fertilizer: `
    <rect x="25" y="7" width="14" height="10" rx="3" fill="${C.purpleLight}" ${S}/>
    <path d="M22 17 H42 L49 50 Q49 57 42 57 H22 Q15 57 15 50 Z" fill="${C.purple}" ${S}/>
    <path d="M19 34 H45" fill="none" stroke="${C.purpleLight}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="26" cy="44" r="3" fill="${C.white}"/><circle cx="36" cy="48" r="2" fill="${C.white}"/><circle cx="38" cy="40" r="2.5" fill="${C.white}"/>`,
  bee: `
    <ellipse cx="26" cy="19" rx="8" ry="11" fill="#dff1ff" ${S}/>
    <ellipse cx="39" cy="17" rx="8" ry="11" fill="#dff1ff" ${S}/>
    <path d="M51 38 L60 38" fill="none" ${S}/>
    <ellipse cx="32" cy="38" rx="19" ry="13" fill="#ffd23f" ${S}/>
    <path d="M30 26 Q26 38 30 50" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M40 27 Q37 38 40 49" fill="none" stroke="${INK}" stroke-width="5"/>
    <circle cx="19" cy="35" r="2.5" fill="${INK}"/>
    <path d="M17 41 Q20 44 23 41" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  crow: `
    <path d="M12 40 L3 50 L19 45Z" fill="${C.black}" ${S}/>
    <path d="M27 52 L25 59 M35 52 L35 59" fill="none" ${S}/>
    <ellipse cx="30" cy="40" rx="18" ry="13" fill="${C.black}" ${S}/>
    <circle cx="44" cy="25" r="11" fill="${C.black}" ${S}/>
    <path d="M53 22 L62 27 L53 31Z" fill="#f2a33a" ${S}/>
    <circle cx="46" cy="22" r="3" fill="${C.white}"/><circle cx="47" cy="22" r="1.4" fill="${INK}"/>
    <path d="M19 37 Q29 30 38 40 Q28 47 19 37Z" fill="${C.blackLight}" ${S}/>`,
  bug: `
    ${[14, 24, 34].map((x, i) => `<circle cx="${x}" cy="${44 - i * 2}" r="9" fill="${i % 2 ? C.green : C.greenLight}" ${S}/>`).join('')}
    <circle cx="46" cy="34" r="11" fill="${C.greenLight}" ${S}/>
    <path d="M42 24 L38 13 M50 24 L54 13" fill="none" ${S}/>
    <circle cx="38" cy="12" r="3" fill="${C.red}" ${S}/><circle cx="54" cy="12" r="3" fill="${C.red}" ${S}/>
    <circle cx="44" cy="32" r="2.5" fill="${INK}"/><circle cx="51" cy="32" r="2.5" fill="${INK}"/>
    <path d="M44 39 Q47.5 41 51 39" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  coin: `
    <circle cx="32" cy="32" r="24" fill="${C.gold}" ${S}/>
    <circle cx="32" cy="32" r="17" fill="none" stroke="${C.goldDark}" stroke-width="3"/>
    <rect x="26" y="26" width="12" height="12" rx="1" fill="${C.goldLight}" ${S}/>
    <path d="M17 22 Q21 14 30 12" fill="none" stroke="${C.white}" stroke-width="3" stroke-linecap="round"/>`,
  merchant: `
    <circle cx="32" cy="40" r="16" fill="${C.skin}" ${S}/>
    <path d="M24 39 Q26.5 36 29 39 M35 39 Q37.5 36 40 39" fill="none" ${S}/>
    <path d="M26 46 Q32 52 38 46" fill="none" ${S}/>
    <circle cx="22" cy="45" r="2.5" fill="${C.redLight}"/><circle cx="42" cy="45" r="2.5" fill="${C.redLight}"/>
    <path d="M14 27 Q32 4 50 27 Z" fill="${C.straw}" ${S}/>
    <ellipse cx="32" cy="27" rx="27" ry="6" fill="${C.straw}" ${S}/>
    <path d="M18 24 Q32 18 46 24" fill="none" stroke="${C.red}" stroke-width="4"/>`,
  clover: `
    <path d="M33 34 Q38 48 46 58" fill="none" stroke="${C.greenDark}" stroke-width="4" stroke-linecap="round"/>
    ${[
      [22, 22],
      [42, 22],
      [22, 42],
      [42, 42],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="${C.green}" ${S}/>`)
      .join('')}
    <circle cx="32" cy="32" r="4" fill="${C.greenLight}" ${S}/>
    <path d="M17 18 Q19 14 23 14" fill="none" stroke="${C.greenLight}" stroke-width="3" stroke-linecap="round"/>`,

  // ---- 作物 ----
  sprout: `
    <path d="M32 58 V40" fill="none" stroke="${C.greenDark}" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 44 Q19 43 17 31 Q30 30 32 44Z" fill="${C.greenLight}" ${S}/>
    <path d="M32 42 Q45 41 47 29 Q34 28 32 42Z" fill="${C.green}" ${S}/>`,
  leaf: `
    <path d="M32 60 V22" fill="none" stroke="${C.greenDark}" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 48 Q16 48 12 34 Q28 32 32 48Z" fill="${C.green}" ${S}/>
    <path d="M32 44 Q48 44 52 30 Q36 28 32 44Z" fill="${C.greenLight}" ${S}/>
    <path d="M32 30 Q20 28 20 14 Q32 16 32 30Z" fill="${C.greenLight}" ${S}/>
    <path d="M32 28 Q44 26 45 12 Q33 14 32 28Z" fill="${C.green}" ${S}/>`,
  bud: `
    <path d="M32 60 V22" fill="none" stroke="${C.greenDark}" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 50 Q16 50 12 36 Q28 34 32 50Z" fill="${C.green}" ${S}/>
    <path d="M32 46 Q48 46 52 32 Q36 30 32 46Z" fill="${C.greenLight}" ${S}/>
    <path d="M32 6 Q42 16 38 26 Q32 30 26 26 Q22 16 32 6Z" fill="${C.pink}" ${S}/>
    <path d="M26 26 Q32 20 38 26 Q36 32 32 32 Q28 32 26 26Z" fill="${C.green}" ${S}/>`,
  tomato: `
    <circle cx="32" cy="38" r="20" fill="${C.red}" ${S}/>
    <path d="M32 20 L27 13 L32 17 L37 13 Z M20 22 L32 22 L44 22 L36 27 L32 24 L28 27 Z" fill="${C.green}" ${S}/>
    <path d="M32 12 V18" fill="none" stroke="${C.greenDark}" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="23" cy="34" rx="4" ry="6" fill="${C.redLight}"/>`,
  strawberry,
  pumpkin,
  corn: `
    <path d="M18 58 Q12 40 22 26 Q24 44 30 58Z" fill="${C.green}" ${S}/>
    <path d="M46 58 Q52 40 42 26 Q40 44 34 58Z" fill="${C.greenLight}" ${S}/>
    <path d="M24 50 Q20 26 32 8 Q44 26 40 50 Q32 56 24 50Z" fill="${C.gold}" ${S}/>
    ${[
      [29, 20],
      [35, 20],
      [27, 28],
      [33, 28],
      [39, 28],
      [27, 36],
      [33, 36],
      [39, 36],
      [29, 44],
      [35, 44],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${C.goldDark}"/>`)
      .join('')}`,

  // ---- お守り ----
  coinPurse: `
    <path d="M14 30 Q14 56 32 56 Q50 56 50 30 Z" fill="${C.pink}" ${S}/>
    <path d="M14 30 H50" fill="none" ${S}/>
    <circle cx="26" cy="24" r="4" fill="${C.gold}" ${S}/><circle cx="38" cy="24" r="4" fill="${C.gold}" ${S}/>
    <path d="M22 40 Q24 36 28 36" fill="none" stroke="${C.white}" stroke-width="3" stroke-linecap="round"/>`,
  gentleRain: `
    <path d="M8 32 Q32 2 56 32 Q50 28 44 32 Q38 28 32 32 Q26 28 20 32 Q14 28 8 32Z" fill="${C.blue}" ${S}/>
    <path d="M32 32 V52 Q32 58 26 56" fill="none" ${S}/>
    ${drop(14, 40, 0.7)}${drop(50, 42, 0.7)}`,
  crowToll: `
    <path d="M14 54 Q20 22 50 8 Q46 36 14 54Z" fill="${C.blackLight}" ${S}/>
    <path d="M14 54 Q30 32 46 14" fill="none" stroke="${C.white}" stroke-width="2"/>
    <circle cx="46" cy="46" r="10" fill="${C.gold}" ${S}/>
    <rect x="43" y="43" width="6" height="6" fill="${C.goldLight}" stroke="${INK}" stroke-width="2"/>`,
  aging: `
    <path d="M16 12 H48 Q54 32 48 52 H16 Q10 32 16 12Z" fill="${C.tan}" ${S}/>
    <path d="M13 24 H51 M13 40 H51" fill="none" stroke="${C.brown}" stroke-width="4"/>
    <path d="M24 14 V50 M40 14 V50" fill="none" stroke="${C.brown}" stroke-width="2"/>`,
  seedSack: `
    <path d="M18 22 Q10 56 32 56 Q54 56 46 22 Z" fill="${C.tanLight}" ${S}/>
    <path d="M18 22 Q32 14 46 22 Q40 10 32 12 Q24 10 18 22Z" fill="${C.tan}" ${S}/>
    <path d="M20 24 Q32 30 44 24" fill="none" stroke="${C.red}" stroke-width="4" stroke-linecap="round"/>
    <g transform="translate(20 28) scale(0.4)">${acorn(C.tan, C.brown, C.tanLight)}</g>`,
  sunBlessing: `
    <path d="M32 40 V60" fill="none" stroke="${C.greenDark}" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 54 Q42 46 50 52 Q42 58 32 54Z" fill="${C.green}" ${S}/>
    ${Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI / 5) * i;
      return `<ellipse cx="${(32 + Math.cos(a) * 15).toFixed(1)}" cy="${(26 + Math.sin(a) * 15).toFixed(1)}" rx="6" ry="9" transform="rotate(${(a * 180) / Math.PI + 90} ${(32 + Math.cos(a) * 15).toFixed(1)} ${(26 + Math.sin(a) * 15).toFixed(1)})" fill="${C.gold}" ${S}/>`;
    }).join('')}
    <circle cx="32" cy="26" r="10" fill="${C.brown}" ${S}/>`,
  bargain: `
    <path d="M8 30 L30 8 H54 V32 L32 54 Z" fill="#ffb347" ${S}/>
    <circle cx="44" cy="18" r="4" fill="${C.white}" ${S}/>
    <path d="M22 32 L30 40 M26 26 L36 36" fill="none" stroke="${C.white}" stroke-width="3" stroke-linecap="round"/>`,
  scarecrow: `
    <path d="M32 30 V60 M12 38 H52" fill="none" stroke="${C.brown}" stroke-width="5" stroke-linecap="round"/>
    <path d="M22 36 H42 V52 H22Z" fill="${C.blue}" ${S}/>
    <circle cx="32" cy="24" r="11" fill="${C.tanLight}" ${S}/>
    <path d="M27 22 L29 24 M37 22 L35 24" fill="none" ${S}/><path d="M27 29 Q32 32 37 29" fill="none" ${S}/>
    <path d="M16 16 Q32 0 48 16 Z" fill="${C.straw}" ${S}/>`,
  bumper: `
    <circle cx="24" cy="26" r="9" fill="${C.red}" ${S}/><circle cx="40" cy="26" r="9" fill="${C.red}" ${S}/>
    <circle cx="32" cy="20" r="9" fill="${C.gold}" ${S}/>
    <path d="M10 30 H54 L48 56 H16Z" fill="${C.tan}" ${S}/>
    <path d="M14 40 H50 M16 48 H48" fill="none" stroke="${C.brown}" stroke-width="3"/>`,
  goldLuck: `
    <path d="M14 26 L16 8 L28 18 Z M50 26 L48 8 L36 18Z" fill="${C.white}" ${S}/>
    <circle cx="32" cy="34" r="20" fill="${C.white}" ${S}/>
    <path d="M22 32 Q25 29 28 32 M36 32 Q39 29 42 32" fill="none" ${S}/>
    <path d="M28 40 Q32 43 36 40" fill="none" ${S}/>
    <path d="M18 50 Q32 56 46 50" fill="none" stroke="${C.red}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="32" cy="55" r="5" fill="${C.gold}" ${S}/>`,
  bugWard: `
    <path d="M32 60 V26" fill="none" stroke="${C.greenDark}" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 50 Q14 46 14 30 Q30 32 32 50Z" fill="${C.green}" ${S}/>
    <path d="M32 44 Q50 40 50 24 Q34 26 32 44Z" fill="${C.greenLight}" ${S}/>
    <path d="M32 30 Q22 22 28 8 Q38 16 32 30Z" fill="${C.green}" ${S}/>`,
  taxRelief: `
    <rect x="14" y="14" width="36" height="36" fill="#fff6dc" ${S}/>
    <rect x="10" y="10" width="44" height="8" rx="4" fill="${C.tan}" ${S}/>
    <rect x="10" y="46" width="44" height="8" rx="4" fill="${C.tan}" ${S}/>
    <path d="M22 26 H42 M22 32 H42 M22 38 H34" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  artisan: `
    <rect x="10" y="12" width="38" height="42" rx="6" fill="${C.red}" ${S}/>
    <rect x="15" y="22" width="28" height="16" rx="3" fill="${C.white}" ${S}/>
    <path d="M24 22 V38 M34 22 V38" fill="none" stroke="${INK}" stroke-width="2"/>
    <circle cx="19.5" cy="30" r="2.5" fill="${C.gold}"/><circle cx="29" cy="30" r="2.5" fill="${C.green}"/><circle cx="38.5" cy="30" r="2.5" fill="${C.blue}"/>
    <path d="M48 30 H54 V16" fill="none" ${S}/><circle cx="54" cy="13" r="4" fill="${C.gold}" ${S}/>
    <rect x="18" y="44" width="22" height="5" rx="2" fill="${C.black}"/>`,

  // ---- 画面・演出 ----
  calendar: `
    <rect x="10" y="14" width="44" height="40" rx="6" fill="${C.white}" ${S}/>
    <path d="M10 26 H54" fill="none" ${S}/><rect x="10" y="14" width="44" height="12" rx="6" fill="${C.red}" ${S}/>
    <path d="M22 8 V18 M42 8 V18" fill="none" ${S}/>
    <circle cx="22" cy="36" r="2.5" fill="${INK}"/><circle cx="32" cy="36" r="2.5" fill="${INK}"/><circle cx="42" cy="36" r="2.5" fill="${INK}"/><circle cx="22" cy="45" r="2.5" fill="${INK}"/><circle cx="32" cy="45" r="2.5" fill="${INK}"/>`,
  bale: `
    <path d="M14 18 H50 Q58 32 50 48 H14 Q6 32 14 18Z" fill="${C.straw}" ${S}/>
    <ellipse cx="14" cy="33" rx="6" ry="15" fill="#d9a93e" ${S}/>
    <path d="M24 20 V46 M40 20 V46" fill="none" stroke="${C.brown}" stroke-width="4"/>
    <path d="M18 26 H50 M18 33 H52 M18 40 H50" fill="none" stroke="#c99a3a" stroke-width="1.5"/>
    <path d="M11 27 L15 30 M11 36 L16 37" fill="none" stroke="#a87a28" stroke-width="1.5" stroke-linecap="round"/>`,
  sparkle: sparkle(32, 32, 24),
  star: star5(32, 33, 25, C.gold),
  drop: drop(32, 10, 3.6),
  feather: `<path d="M12 56 Q18 22 52 8 Q46 38 12 56Z" fill="${C.blackLight}" ${S}/><path d="M12 56 Q28 34 48 12" fill="none" stroke="${C.white}" stroke-width="2"/>`,
  leafBit: `<path d="M10 52 Q10 14 54 10 Q52 52 10 52Z" fill="${C.green}" ${S}/><path d="M12 50 L50 14" fill="none" stroke="${C.greenLight}" stroke-width="3"/>`,
  heart: `<path d="M32 54 Q8 38 10 22 Q14 10 26 12 Q30 14 32 20 Q34 14 38 12 Q50 10 54 22 Q56 38 32 54Z" fill="${C.pink}" ${S}/>`,
  skull: `<path d="M16 30 Q16 10 32 10 Q48 10 48 30 Q48 40 42 42 V52 H22 V42 Q16 40 16 30Z" fill="${C.white}" ${S}/><circle cx="25" cy="30" r="5" fill="${INK}"/><circle cx="39" cy="30" r="5" fill="${INK}"/><path d="M28 46 V52 M36 46 V52" fill="none" ${S}/>`,
  puff: `<path d="M14 40 Q6 40 8 32 Q10 24 18 26 Q20 16 30 18 Q38 10 46 18 Q56 18 54 28 Q60 34 54 40 Q50 46 42 42 Q36 50 28 44 Q20 48 14 40Z" fill="${C.cloud}" ${S}/>`,
  lock: `<rect x="14" y="28" width="36" height="28" rx="5" fill="${C.goldDark}" ${S}/><path d="M22 28 V20 Q22 10 32 10 Q42 10 42 20 V28" fill="none" ${S}/><circle cx="32" cy="41" r="4" fill="${INK}"/>`,
};

// 種の袋は作物の絵を使うので、作物を定義したあとに組み立てる
ART.seed = packet('#e5533d', ART.tomato);
ART.berrySeed = packet('#ff8fb1', strawberry);
ART.pumpkinSeed = packet('#f08a24', pumpkin);

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
  '🎊': 'star',
  '🎉': 'star',
};

export function glyph(ch: string): string {
  if (ch.startsWith('<')) return ch;
  const id = EMOJI_ART[ch];
  return id ? art(id) : ch;
}
