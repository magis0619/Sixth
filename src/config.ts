// 畑スロットの調整用パラメータ。数値はすべてここで変える。

export type SymbolId =
  | 'seed'
  | 'berrySeed'
  | 'pumpkinSeed'
  | 'goldSeed'
  | 'melonSeed'
  | 'watermelonSeed'
  | 'rain'
  | 'sun'
  | 'fertilizer'
  | 'bee'
  | 'crow'
  | 'bug'
  | 'coin'
  | 'merchant'
  | 'clover'
  | 'moon'
  | 'thunder'
  | 'hoe'
  | 'weed'
  | 'tanuki'
  | 'frost'
  | 'mole';

export type UpgradeId =
  | 'addSeed'
  | 'addBerrySeed'
  | 'addPumpkinSeed'
  | 'addRain'
  | 'addSun'
  | 'addFertilizer'
  | 'addGoldSeed'
  | 'addBee'
  | 'addMerchant'
  | 'addClover'
  | 'addMoon'
  | 'addMelonSeed'
  | 'addThunder'
  | 'addWatermelonSeed'
  | 'addHoe'
  | 'removeCrow'
  | 'removeBug'
  | 'removeWeed'
  | 'removeTanuki'
  | 'removeFrost'
  | 'removeMole';

export type CharmId =
  | 'coinPurse'
  | 'gentleRain'
  | 'crowToll'
  | 'aging'
  | 'seedSack'
  | 'sunBlessing'
  | 'bargain'
  | 'scarecrow'
  | 'bumper'
  | 'goldLuck'
  | 'bugWard'
  | 'taxRelief'
  | 'artisan'
  | 'heater'
  | 'goldenWell'
  | 'queenHive'
  | 'rancher'
  | 'bigGame'
  | 'wheelwright'
  | 'tillMaster'
  // ---- 条件を満たすと出る特別なお守り ----
  | 'thunderstorm'
  | 'tomatoFest'
  | 'sunshower'
  | 'moonFeast'
  | 'bumperHarvest'
  | 'crowReturn'
  | 'lastStraw'
  | 'exhibition';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  emoji: string;
  /** manual: 出目をタップして使う / auto: 停止した瞬間に効果が出る */
  kind: 'manual' | 'auto';
  /** 効く範囲の形（手動の成長系）。選んだマスを中心にこの形のマスへ効く */
  shape?: ShapeId;
  desc: string;
  /** フィーバー時の効果 */
  feverDesc: string;
  /** 演出用のレア度 */
  rarity: 'normal' | 'rare' | 'bad';
}

// feverDesc：同じ絵柄が3つ以上そろったときの「役」。良い絵柄の役には必ず金貨の大当たりが付く
export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  seed: { id: 'seed', name: 'トマトの種', emoji: '🍅', kind: 'manual', desc: 'トマトを2〜4個植える', feverDesc: '品種改良：今日植えるトマトは1段階育った状態から', rarity: 'normal' },
  berrySeed: { id: 'berrySeed', name: '苺の種', emoji: '🍓', kind: 'manual', desc: '苺を3〜5個植える', feverDesc: '品種改良：今日植える苺は1段階育った状態から', rarity: 'normal' },
  pumpkinSeed: { id: 'pumpkinSeed', name: 'かぼちゃの種', emoji: '🎃', kind: 'manual', desc: 'かぼちゃを1個植える', feverDesc: '品種改良：今日植えるかぼちゃは1段階育った状態から', rarity: 'normal' },
  melonSeed: { id: 'melonSeed', name: 'メロンの種', emoji: '🍈', kind: 'manual', desc: 'メロンを1個植える', feverDesc: '品種改良：今日植えるメロンは1段階育った状態から', rarity: 'rare' },
  watermelonSeed: { id: 'watermelonSeed', name: 'スイカの種', emoji: '🍉', kind: 'manual', desc: 'スイカを1個植える（2×2マス）', feverDesc: '品種改良：今日植えるスイカは1段階育った状態から', rarity: 'rare' },
  goldSeed: { id: 'goldSeed', name: '金の種', emoji: '🌟', kind: 'manual', desc: '金のとうもろこしを植える', feverDesc: '黄金の実り：大当たり×3', rarity: 'rare' },
  rain: { id: 'rain', name: '雨', emoji: '🌧️', kind: 'manual', shape: 'cross', desc: '縦横十字 成長+1', feverDesc: '虹：全作物の成長＋1', rarity: 'normal' },
  sun: { id: 'sun', name: '太陽', emoji: '☀️', kind: 'manual', shape: 'column', desc: '縦一列 成長+1', feverDesc: '夏祭り：今日の売値×2', rarity: 'normal' },
  fertilizer: { id: 'fertilizer', name: '肥料', emoji: '🧪', kind: 'manual', desc: '売値×2', feverDesc: '堆肥：畑の全作物に肥料', rarity: 'normal' },
  bee: { id: 'bee', name: '蜂', emoji: '🐝', kind: 'manual', shape: 'x', desc: '斜め 成長+1', feverDesc: 'はちみつ：作物1つにつき＋4金', rarity: 'normal' },
  crow: { id: 'crow', name: 'カラス', emoji: '🐦', kind: 'auto', desc: '作物を1/2で食べる（かぼちゃは平気）', feverDesc: '群れ：食べる確率 1/2 → 3/4', rarity: 'bad' },
  bug: { id: 'bug', name: '虫', emoji: '🐛', kind: 'auto', desc: '成長−1', feverDesc: '群れ：成長−2', rarity: 'bad' },
  coin: { id: 'coin', name: '金貨', emoji: '🪙', kind: 'auto', desc: '+金', feverDesc: '大当たり×3', rarity: 'normal' },
  merchant: { id: 'merchant', name: '商人', emoji: '🧑‍🌾', kind: 'auto', desc: '今日の売値×1.5', feverDesc: '大商い：実った作物を今すぐ×2で全部買い取る', rarity: 'normal' },
  clover: { id: 'clover', name: '四つ葉', emoji: '🍀', kind: 'auto', desc: '明日 金の種↑', feverDesc: '幸運：お守りを1つ選べる', rarity: 'rare' },
  thunder: { id: 'thunder', name: '雷', emoji: '⚡', kind: 'manual', shape: 'row', desc: '横一列 成長+2', feverDesc: '大雷：全作物の成長＋1', rarity: 'rare' },
  hoe: { id: 'hoe', name: '鍬', emoji: '⛏️', kind: 'manual', shape: 'row', desc: '横一列の雑草・霜を消して耕す（次に植えると成長+1）', feverDesc: '大耕し：畑全体を耕す', rarity: 'normal' },
  moon: { id: 'moon', name: '満月', emoji: '🌕', kind: 'manual', shape: 'all', desc: '全作物 成長+1', feverDesc: '月の宴：全作物の成長さらに＋1', rarity: 'rare' },
  // ---- お邪魔系（年貢を納めるたびにどれかが袋に増える） ----
  weed: { id: 'weed', name: '雑草', emoji: '🌾', kind: 'auto', desc: '空きマスを塞ぐ・広がる', feverDesc: '群れ：2か所に生える', rarity: 'bad' },
  tanuki: { id: 'tanuki', name: 'タヌキ', emoji: '🦝', kind: 'auto', desc: '実りを盗む', feverDesc: '群れ：2つ持っていく', rarity: 'bad' },
  frost: { id: 'frost', name: '霜', emoji: '❄️', kind: 'auto', desc: '3日凍らせる', feverDesc: '群れ：2マスが凍る', rarity: 'bad' },
  mole: { id: 'mole', name: 'モグラ', emoji: '🐀', kind: 'auto', desc: '作物を隣の空きマスへ押し出す', feverDesc: '群れ：2つ押し出す', rarity: 'bad' },
};

/** 絵柄袋・ショップでの表示順 */
export const SYMBOL_ORDER: SymbolId[] = [
  'seed', 'berrySeed', 'pumpkinSeed', 'melonSeed', 'watermelonSeed', 'goldSeed', 'rain', 'sun', 'thunder', 'hoe', 'fertilizer', 'bee', 'coin', 'merchant', 'clover', 'moon', 'crow', 'bug', 'weed', 'tanuki', 'frost', 'mole',
];

// ---- 作物 ----

export type CropKind = 'tomato' | 'strawberry' | 'pumpkin' | 'melon' | 'corn' | 'watermelon';

export interface CropDef {
  kind: CropKind;
  name: string;
  /** 実るまでの成長 */
  ripe: number;
  price: number;
  /** カラスに食べられない */
  crowProof?: boolean;
  /** 金の作物（金運のお守りが効く） */
  gold?: boolean;
  /** 2×2マスを占める大物（列に入らず、単品でも半値にならない） */
  big?: boolean;
}

/** 早く安い苺・標準のトマト・遅く高いかぼちゃ・レアな金のとうもろこし */
export const CROPS: Record<CropKind, CropDef> = {
  strawberry: { kind: 'strawberry', name: '苺', ripe: 2, price: 4 },
  tomato: { kind: 'tomato', name: 'トマト', ripe: 3, price: 6 },
  pumpkin: { kind: 'pumpkin', name: 'かぼちゃ', ripe: 5, price: 24, crowProof: true },
  melon: { kind: 'melon', name: 'メロン', ripe: 6, price: 45 },
  corn: { kind: 'corn', name: '金のとうもろこし', ripe: 3, price: 30, gold: true },
  watermelon: { kind: 'watermelon', name: 'スイカ', ripe: 6, price: 90, crowProof: true, big: true },
};

/** 種の絵柄と、植わる作物・1枚で植えられる数の上乗せ */
export const SEEDS: Partial<Record<SymbolId, { crop: CropKind; extra: number; single?: boolean }>> = {
  seed: { crop: 'tomato', extra: 0 },
  berrySeed: { crop: 'strawberry', extra: 1 },
  pumpkinSeed: { crop: 'pumpkin', extra: 0, single: true },
  melonSeed: { crop: 'melon', extra: 0, single: true },
  goldSeed: { crop: 'corn', extra: 0, single: true },
  watermelonSeed: { crop: 'watermelon', extra: 0, single: true },
};

/** 出目の効く範囲の形 */
export type ShapeId = 'cross' | 'column' | 'row' | 'x' | 'all';

export const SHAPE_NAMES: Record<ShapeId, string> = { cross: '縦横十字', column: '縦一列', row: '横一列', x: '斜め', all: '畑全体' };

// ---- 畑に置くもの（道具・特別なマス） ----

/** 道具はマスを占める（植えられない・列に入らない）。特別なマスは作物と重ねられる */
export type PlaceId = 'scarecrow' | 'bigScarecrow' | 'well' | 'goldenWell' | 'hive' | 'queenHive' | 'henhouse' | 'cowshed' | 'compost' | 'water';

export interface PlaceDef {
  id: PlaceId;
  kind: 'tool' | 'tile';
  name: string;
  desc: string;
  /** ショップの価格（null はお守りでしか手に入らない）。同じ物を買うたびに placeGrowth 倍 */
  price: number | null;
}

export const PLACES: Record<PlaceId, PlaceDef> = {
  scarecrow: { id: 'scarecrow', kind: 'tool', name: 'かかし', desc: '周り8マスを守る', price: 20 },
  bigScarecrow: { id: 'bigScarecrow', kind: 'tool', name: '大かかし', desc: '2マス以内を守る', price: null },
  well: { id: 'well', kind: 'tool', name: '井戸', desc: '上下左右 毎日+1', price: 60 },
  goldenWell: { id: 'goldenWell', kind: 'tool', name: '黄金の井戸', desc: '周り8マス 毎日+1', price: null },
  hive: { id: 'hive', kind: 'tool', name: '巣箱', desc: '周り8マス 売値+2・苺が毎晩育つ', price: 30 },
  queenHive: { id: 'queenHive', kind: 'tool', name: '女王蜂の巣箱', desc: '周り8マス 売値+6・苺が毎晩育つ', price: null },
  henhouse: { id: 'henhouse', kind: 'tool', name: '鶏小屋', desc: '毎日+2金・周り8マスの虫を食べ、モグラを追い払う', price: 60 },
  cowshed: { id: 'cowshed', kind: 'tool', name: '牛小屋', desc: '毎日+4金・隣に水路で+2', price: 120 },
  compost: { id: 'compost', kind: 'tile', name: '堆肥のマス', desc: '売値×2', price: 35 },
  water: { id: 'water', kind: 'tile', name: '水路のマス', desc: '毎日+1・3つ並べると水車（隣も育つ）・4方を囲むと釣り堀', price: 30 },
};

export const PLACE_ORDER = Object.keys(PLACES) as PlaceId[];

/**
 * プレイ記録の送り先（Googleスプレッドシートの Apps Script をウェブアプリとして公開したURL）。
 * 空なら送らない。作り方は scripts/telemetry-apps-script.gs の先頭
 */
export const TELEMETRY_URL = '';

/** 感想フォームのURL（Googleフォーム等）。空なら結果画面にボタンを出さない */
export const FEEDBACK_URL = '';

/** 公開URL（結果の共有に使う） */
export const SHARE_URL = 'https://magis0619.github.io/Sixth/';

export const CONFIG = {
  /** 畑の最大の広さ（5×5）。マスの番号はこの広さで数える */
  fieldCols: 5,
  fieldRows: 5,
  /** 始めの広さ（3×3）。広げるたびに列→行の順に1つ増える */
  startCols: 3,
  startRows: 3,
  /** 畑を広げる価格（広げた回数ごと。3×3 → 4×3 → 4×4 → 5×4 → 5×5）。かなり高め */
  expandPrices: [70, 130, 220, 340],
  /** 道具・特別なマスは同じ物を買うたびにこの倍率で高くなる */
  placeGrowth: 1.5,
  /** 初期リール本数と上限 */
  initialReels: 3,
  maxReels: 5,
  /** 初期の絵柄袋 */
  initialBag: {
    seed: 3, berrySeed: 0, pumpkinSeed: 0, melonSeed: 0, goldSeed: 0, rain: 2, sun: 1, thunder: 0, fertilizer: 0, bee: 0,
    crow: 2, bug: 0, coin: 1, merchant: 0, clover: 0, moon: 0, weed: 0, tanuki: 0, frost: 0, watermelonSeed: 0, hoe: 0, mole: 0,
  } as Record<SymbolId, number>,
  initialGold: 0,
  /** 成長（実るまでの成長は作物ごとに CROPS で決める） */
  rainGrowth: 1,
  sunGrowth: 1,
  beeGrowth: 1,
  /** 肥料の売値倍率（作物ごとの売値は CROPS） */
  fertilizerMultiplier: 2,
  /** 金貨の額 */
  coinAmount: 3,
  /** カラスが狙った作物を食べる確率（外れると追い払える） */
  crowEatChance: 0.5,
  /** カラスの群れ（フィーバー）のときの食べる確率の倍率 */
  crowFeverMultiplier: 1.5,
  /** 虫が下げる成長 */
  bugDamage: 1,
  /**
   * 年貢を納めるたびに絵柄袋に増えるお邪魔。こちらが強くなるのに合わせて、回を追うごとに数も種類も増える。
   * from 回目の年貢から、pool の中から count 枚（表の最後の行より先はエンドレスでも同じ）
   */
  obstacleSchedule: [
    { from: 1, count: 1, pool: ['bug', 'weed'] },
    { from: 3, count: 1, pool: ['bug', 'weed', 'frost', 'tanuki', 'mole'] },
    { from: 5, count: 2, pool: ['bug', 'weed', 'frost', 'tanuki', 'mole', 'crow'] },
    { from: 7, count: 3, pool: ['bug', 'weed', 'frost', 'tanuki', 'mole', 'crow'] },
  ] as { from: number; count: number; pool: SymbolId[] }[],
  /** 雑草：抜く費用と、毎日となりの空きマスへ広がる確率 */
  weedPullCost: 3,
  weedSpreadChance: 0.5,
  /** 霜：凍っている日数 */
  frostDays: 3,
  /** タヌキ：実った作物がなければ所持金のこの割合を持っていく（最低 tanukiMinSteal） */
  tanukiStealRate: 0.1,
  tanukiMinSteal: 3,
  /** 水車：水路が縦か横に wheelMin 個以上まっすぐつながると、つながった数 × wheelGold が毎晩入る */
  wheelMin: 3,
  wheelGold: 1,
  /** 釣り堀：上下左右（畑の中のもの）がすべて水路で3方以上の空きマスは池。毎晩 fishGold、ときどき大物 */
  fishGold: 4,
  bigFishChance: 0.15,
  bigFishGold: 20,
  /** 牛小屋の隣に水路があると（水飲み場）毎晩の収入に上乗せ */
  cowWaterGold: 2,
  /** 彩りの畑：実った作物がこの種類以上同時にあると売値に上乗せ */
  colorfulKinds: 4,
  colorfulBonus: 0.1,
  /** 鶏小屋・牛小屋の毎晩の収入 */
  henhouseGold: 2,
  cowshedGold: 4,
  /** 市場の相場：週ごとに1品が高値・1品が安値。難しい marketFrom から */
  marketFrom: 2,
  /** 相場は一時停止中（false の間は出ない） */
  marketOn: false,
  marketHigh: 1.5,
  marketLow: 0.7,
  /** 品評会：売値の上乗せ */
  exhibitionBonus: 0.2,
  /** 品評会（お守り）は一時停止中（false の間はもらえない・図鑑にも出ない） */
  exhibitionOn: false,
  /** 商人1枚で上がる今日の売値倍率 */
  merchantBonus: 0.5,
  /** 四つ葉の翌日の金の種の出やすさ（重みの倍率） */
  cloverMultiplier: 3,
  /** 種1枚で植えられる数とその重み（1個:50%・2個:35%・3個:15%）。金の種は常に1個 */
  seedCountWeights: [
    { count: 2, weight: 40 },
    { count: 3, weight: 40 },
    { count: 4, weight: 20 },
  ],

  /** ゾロ目：同じ絵柄がこの数以上そろうとフィーバー。良い絵柄は役＋大当たり、カラス・虫は「群れ」で効果2倍 */
  feverCount: 3,
  feverPower: 2,
  /** 大当たりの金貨 = jackpotBase ×（そろった数 − 2）×（1 + 年貢の納付回数 × jackpotGrowth） */
  jackpotBase: 6,
  jackpotGrowth: 0.5,
  /** はちみつ：畑の作物1つあたりの金 */
  honeyPerCrop: 4,

  /** 注文：年貢の週ごとに1件。報酬 = 必要数 × 売値 × orderRewardMult ＋ orderRewardBase ×（週＋1） */
  orderRewardMult: 1.5,
  orderRewardBase: 5,

  /**
   * 列の収穫：縦・横・斜めに3つ以上そろった実は列ごとまとめて売る。
   * 列に入らない単品は売値×singleMult。列の実は×lineMult、同じ作物だけの列に入っていればさらに×sameCropMult。
   * 1つの実が複数の列に入っていると、2本目以降1本ごとに×(1 + crossBonus) が上乗せされる
   */
  singleMult: 0.5,
  lineMult: 1.3,
  sameCropMult: 1.3,
  crossBonus: 0.15,

  /** 強化の価格 */
  upgradePrices: {
    addSeed: 8,
    addBerrySeed: 8,
    addPumpkinSeed: 14,
    addRain: 8,
    addSun: 10,
    addFertilizer: 12,
    addGoldSeed: 25,
    addMelonSeed: 22,
    addThunder: 30,
    addWatermelonSeed: 28,
    addHoe: 10,
    addBee: 18,
    addMerchant: 15,
    addClover: 20,
    addMoon: 60,
    removeCrow: 15,
    removeBug: 12,
    removeWeed: 12,
    removeTanuki: 15,
    removeFrost: 12,
    removeMole: 15,
  } as Record<UpgradeId, number>,
  /** 満月は足すたびに moonGrowth 倍になる */
  moonGrowth: 1.5,
  /** カラス・虫を消す価格は、消すたびに removeGrowth 倍になる */
  removeGrowth: 2,
  /** お邪魔を消せるのは1週間（次の年貢まで）にこの回数まで。一気に全部消して楽になりすぎないように */
  removesPerWeek: 1,
  /** ショップに週ごとに並ぶ数（絵柄を足す品・畑の品それぞれ）。消す品と畑を広げるはいつも並ぶ */
  weeklyCount: 3,
  /** 毎週1つは必ず並ぶ「作戦が変わる品」と、その作戦のひと言 */
  pivotAdds: {
    addBerrySeed: '苺：2日で実る。巣箱の周りで毎晩育つ',
    addPumpkinSeed: 'かぼちゃ：高くてカラスに強い',
    addMelonSeed: 'メロン：1個で大きく稼ぐ',
    addWatermelonSeed: 'スイカ：2×2の大物で一発',
    addGoldSeed: '金のとうもろこし：レアで高い',
    addHoe: '鍬：耕して次の作物を早く',
    addThunder: '雷：横一列を一気に育てる',
    addMerchant: '商人：売る日を選んで高く',
  } as Partial<Record<string, string>>,
  pivotPlaces: {
    henhouse: '鶏小屋：毎晩のお金＋虫・モグラよけ',
    cowshed: '牛小屋：毎晩のお金で稼ぐ',
    hive: '巣箱：周りの売値アップ＋苺',
    water: '水路：並べて水車・囲んで釣り堀',
    well: '井戸：周りを毎晩育てる',
  } as Partial<Record<string, string>>,

  /** 年貢：taxPeriod 日ごとに、その日の終わり（次の回転前）に自動で徴収 */
  taxPeriod: 7,
  /** 1回目から順の年貢額。表を超えたら（エンドレス）直前の額 × taxGrowth */
  taxSchedule: [5, 22, 60, 120, 175, 235, 295, 360],
  taxGrowth: 1.5,
  /** この回数の年貢を納めるとクリア（その後はエンドレス） */
  winTaxes: 7,
  /** 年貢が近いことを警告し始める残り日数 */
  taxWarnDays: 2,

  /** 年貢を納めたときに出るお守りの選択肢の数 */
  charmChoices: 3,
  /** お守りのレア度ごとの出やすさ（強いお守りほど出にくい） */
  charmTierWeights: { common: 10, uncommon: 5, rare: 1.5 } as Record<CharmTier, number>,
  /** 同じお守りをこの数そろえると金色に進化して効果が2倍 */
  goldenAt: 3,
  /** 豊年満作の大当たり（年貢の回数で増える） */
  bumperJackpot: 30,

  /** 演出のタイミング（ミリ秒） */
  timing: {
    spinBase: 480,
    spinStagger: 170,
    autoStep: 280,
    comboWindow: 1600,
  },

  /** 操作ヒントを出す最終日 */
  hintUntilDay: 10,
};

export const UPGRADES: { id: UpgradeId; name: string; emoji: string; desc: string }[] = [
  { id: 'addSeed', name: 'トマトの種を足す', emoji: '🍅', desc: '絵柄袋にトマトの種を1枚追加' },
  { id: 'addBerrySeed', name: '苺の種を足す', emoji: '🍓', desc: '絵柄袋に苺の種を1枚追加' },
  { id: 'addPumpkinSeed', name: 'かぼちゃの種を足す', emoji: '🎃', desc: '絵柄袋にかぼちゃの種を1枚追加' },
  { id: 'addRain', name: '雨を足す', emoji: '🌧️', desc: '絵柄袋に雨を1枚追加' },
  { id: 'addSun', name: '太陽を足す', emoji: '☀️', desc: '絵柄袋に太陽を1枚追加' },
  { id: 'addFertilizer', name: '肥料を足す', emoji: '🧪', desc: '絵柄袋に肥料を1枚追加' },
  { id: 'addGoldSeed', name: '金の種を足す', emoji: '🌟', desc: '絵柄袋に金の種を1枚追加' },
  { id: 'addMelonSeed', name: 'メロンの種を足す', emoji: '🍈', desc: '絵柄袋にメロンの種を1枚追加' },
  { id: 'addThunder', name: '雷を足す', emoji: '⚡', desc: '絵柄袋に雷を1枚追加' },
  { id: 'addWatermelonSeed', name: 'スイカの種を足す', emoji: '🍉', desc: '絵柄袋にスイカの種を1枚追加' },
  { id: 'addHoe', name: '鍬を足す', emoji: '⛏️', desc: '絵柄袋に鍬を1枚追加' },
  { id: 'addBee', name: '蜂を足す', emoji: '🐝', desc: '絵柄袋に蜂を1枚追加' },
  { id: 'addMerchant', name: '商人を足す', emoji: '🧑‍🌾', desc: '絵柄袋に商人を1枚追加' },
  { id: 'addClover', name: '四つ葉を足す', emoji: '🍀', desc: '絵柄袋に四つ葉を1枚追加' },
  { id: 'addMoon', name: '満月を足す', emoji: '🌕', desc: '絵柄袋に満月（全作物＋1）を1枚追加。足すたびに高くなる' },
  { id: 'removeCrow', name: 'カラスを消す', emoji: '🐦', desc: '絵柄袋からカラスを1枚削除' },
  { id: 'removeBug', name: '虫を消す', emoji: '🐛', desc: '絵柄袋から虫を1枚削除' },
  { id: 'removeWeed', name: '雑草を消す', emoji: '🌾', desc: '絵柄袋から雑草を1枚削除' },
  { id: 'removeTanuki', name: 'タヌキを消す', emoji: '🦝', desc: '絵柄袋からタヌキを1枚削除' },
  { id: 'removeFrost', name: '霜を消す', emoji: '❄️', desc: '絵柄袋から霜を1枚削除' },
  { id: 'removeMole', name: 'モグラを消す', emoji: '🐀', desc: '絵柄袋からモグラを1枚削除' },
];

/** 強化と、それが増減させる絵柄 */
export const UPGRADE_SYMBOL: Partial<Record<UpgradeId, { symbol: SymbolId; delta: number }>> = {
  addSeed: { symbol: 'seed', delta: 1 },
  addBerrySeed: { symbol: 'berrySeed', delta: 1 },
  addPumpkinSeed: { symbol: 'pumpkinSeed', delta: 1 },
  addRain: { symbol: 'rain', delta: 1 },
  addSun: { symbol: 'sun', delta: 1 },
  addFertilizer: { symbol: 'fertilizer', delta: 1 },
  addGoldSeed: { symbol: 'goldSeed', delta: 1 },
  addMelonSeed: { symbol: 'melonSeed', delta: 1 },
  addThunder: { symbol: 'thunder', delta: 1 },
  addWatermelonSeed: { symbol: 'watermelonSeed', delta: 1 },
  addHoe: { symbol: 'hoe', delta: 1 },
  addBee: { symbol: 'bee', delta: 1 },
  addMerchant: { symbol: 'merchant', delta: 1 },
  addClover: { symbol: 'clover', delta: 1 },
  addMoon: { symbol: 'moon', delta: 1 },
  removeCrow: { symbol: 'crow', delta: -1 },
  removeBug: { symbol: 'bug', delta: -1 },
  removeWeed: { symbol: 'weed', delta: -1 },
  removeTanuki: { symbol: 'tanuki', delta: -1 },
  removeFrost: { symbol: 'frost', delta: -1 },
  removeMole: { symbol: 'mole', delta: -1 },
};

/** 道具をもらえるお守りと、もらえる道具 */
export const CHARM_PLACE: Partial<Record<CharmId, PlaceId>> = {
  scarecrow: 'bigScarecrow',
  goldenWell: 'goldenWell',
  queenHive: 'queenHive',
};

/** お守りのレア度。強さ（シミュレーターでの生存日数の伸び）で決めている */
export type CharmTier = 'common' | 'uncommon' | 'rare';

export const CHARM_TIER_NAMES: Record<CharmTier, string> = { common: 'コモン', uncommon: 'アンコモン', rare: 'レア' };

export interface CharmDef {
  id: CharmId;
  tier: CharmTier;
  name: string;
  emoji: string;
  /** n 個持っているときの効果の説明 */
  desc: (n: number) => string;
  /** 重ねられる上限 */
  max: number;
  /**
   * 条件で出る特別なお守り。bag＝袋の中身を満たすと次の年貢後の3択に必ず並ぶ（ふだんの抽選には出ない）、
   * event＝出来事を満たしたその場でもらえる。hint は図鑑で未達成のときに出す短いヒント
   */
  special?: { kind: 'bag' | 'event'; hint: string };
}

/** お守り。年貢を納めるたびに charmChoices 個から1つ選ぶ。同じものは重ねて効果アップ */
export const CHARMS: Record<CharmId, CharmDef> = {
  coinPurse: { id: 'coinPurse', tier: 'uncommon', name: '金貨袋', emoji: '👛', desc: (n) => `金貨の額＋${2 * n}`, max: Infinity },
  gentleRain: { id: 'gentleRain', tier: 'uncommon', name: '恵みの雨', emoji: '☔', desc: (n) => `雨の中心 さらに成長＋${n}`, max: Infinity },
  crowToll: { id: 'crowToll', tier: 'common', name: 'カラスの通行料', emoji: '🪶', desc: (n) => `カラスが来るたびに＋${2 * n}金`, max: Infinity },
  aging: { id: 'aging', tier: 'common', name: '熟成', emoji: '🍷', desc: (n) => `実ったまま1日ごとに売値＋${3 * n}`, max: Infinity },
  seedSack: { id: 'seedSack', tier: 'rare', name: '大きな種袋', emoji: '🎒', desc: (n) => `全部の種で植えられる数＋${n}`, max: Infinity },
  sunBlessing: { id: 'sunBlessing', tier: 'rare', name: '日だまり', emoji: '🌻', desc: (n) => `太陽の成長＋${n}`, max: 2 },
  goldenWell: { id: 'goldenWell', tier: 'rare', name: '黄金の井戸', emoji: '⛲', desc: () => '黄金の井戸を置く（周り8マス 毎日+1）', max: Infinity },
  queenHive: { id: 'queenHive', tier: 'uncommon', name: '女王蜂の巣箱', emoji: '👑', desc: () => '女王蜂の巣箱を置く（周り8マス 売値+6）', max: Infinity },
  bargain: { id: 'bargain', tier: 'uncommon', name: '値切り上手', emoji: '🏷️', desc: (n) => `強化の価格−${Math.min(50, 10 * n)}%`, max: 5 },
  scarecrow: { id: 'scarecrow', tier: 'common', name: '大かかし', emoji: '🎃', desc: () => '大かかしを置く（2マス以内を守る）', max: Infinity },
  bumper: { id: 'bumper', tier: 'rare', name: '豊作', emoji: '🧺', desc: (n) => `金以外の作物 売値＋${2 * n}`, max: Infinity },
  goldLuck: { id: 'goldLuck', tier: 'uncommon', name: '金運', emoji: '🐱', desc: (n) => `金のとうもろこし 売値＋${10 * n}`, max: Infinity },
  bugWard: { id: 'bugWard', tier: 'common', name: '草よけ', emoji: '🌿', desc: (n) => `虫・雑草を${Math.round((1 - Math.pow(0.5, n)) * 100)}%防ぐ・草むしり無料`, max: 4 },
  heater: { id: 'heater', tier: 'common', name: '湯たんぽ', emoji: '♨️', desc: () => '霜が1日で溶ける', max: 1 },
  artisan: { id: 'artisan', tier: 'rare', name: 'からくり職人', emoji: '🎰', desc: (n) => `リール＋${n}`, max: 2 },
  rancher: { id: 'rancher', tier: 'uncommon', name: '牧場主', emoji: '🤠', desc: (n) => `鶏小屋・牛小屋の収入＋${n}`, max: Infinity },
  bigGame: { id: 'bigGame', tier: 'uncommon', name: '大物狙い', emoji: '🍉', desc: (n) => `スイカの売値＋${30 * n}`, max: Infinity },
  wheelwright: { id: 'wheelwright', tier: 'uncommon', name: '水車職人', emoji: '🛞', desc: () => '水車のお金×2', max: 1 },
  tillMaster: { id: 'tillMaster', tier: 'common', name: '耕作上手', emoji: '⛏️', desc: () => '耕した土に植えると成長+2', max: 1 },
  taxRelief: { id: 'taxRelief', tier: 'common', name: '年貢の減免', emoji: '📜', desc: (n) => `年貢−${Math.min(50, 10 * n)}%`, max: 5 },
  thunderstorm: { id: 'thunderstorm', tier: 'rare', name: '雷雨', emoji: '⛈️', desc: () => '雨が斜めにも効く', max: 1, special: { kind: 'bag', hint: '雨をたくさん…？' } },
  tomatoFest: { id: 'tomatoFest', tier: 'rare', name: 'トマト祭り', emoji: '🍅', desc: () => 'トマトだけの列 さらに×1.5', max: 1, special: { kind: 'bag', hint: 'トマトの種をたくさん…？' } },
  sunshower: { id: 'sunshower', tier: 'rare', name: '天気雨', emoji: '🌦️', desc: () => '同じ日の雨と太陽が重なったマス +1', max: 1, special: { kind: 'bag', hint: '雨と太陽を両方…？' } },
  moonFeast: { id: 'moonFeast', tier: 'rare', name: '月の宴', emoji: '🎑', desc: () => '満月が全体+2', max: 1, special: { kind: 'bag', hint: '満月と太陽を…？' } },
  bumperHarvest: { id: 'bumperHarvest', tier: 'rare', name: '豊年満作', emoji: '🌾', desc: () => '畑を一度に全部売ると大当たり', max: 1, special: { kind: 'event', hint: '畑をまるごと…？' } },
  crowReturn: { id: 'crowReturn', tier: 'rare', name: 'カラス返し', emoji: '🪃', desc: () => 'カラスが来るたび +3金', max: 1, special: { kind: 'event', hint: 'カラスにたくさん食べられると…？' } },
  lastStraw: { id: 'lastStraw', tier: 'rare', name: '首の皮', emoji: '🧵', desc: () => '次の年貢が半分', max: 1, special: { kind: 'event', hint: '年貢をギリギリで…？' } },
  exhibition: { id: 'exhibition', tier: 'rare', name: '品評会', emoji: '🏅', desc: () => '作物の売値+20%', max: 1, special: { kind: 'event', hint: '作物を全種類売ると…？' } },
};

export const CHARM_ORDER = Object.keys(CHARMS) as CharmId[];
/** 一時停止中のお守り（図鑑・解放の一覧に出さない） */
export const PAUSED_CHARMS: CharmId[] = CONFIG.exhibitionOn ? [] : ['exhibition'];

/** ふだんの抽選に出るお守り（特別なお守りは条件でしか出ない） */
export const NORMAL_CHARMS = CHARM_ORDER.filter((id) => !CHARMS[id].special);

/** 袋の中身で開く特別なお守りの条件（この枚数以上） */
export const BAG_CONDITIONS: Partial<Record<CharmId, Partial<Record<SymbolId, number>>>> = {
  thunderstorm: { rain: 5 },
  tomatoFest: { seed: 6 },
  sunshower: { rain: 3, sun: 3 },
  moonFeast: { moon: 3, sun: 4 },
};

/** 出来事で開く特別なお守りの条件の数 */
export const EVENT_CONDITIONS = {
  /** カラスに食べられた回数 */
  crowReturn: 5,
  /** 年貢を払ったあとの残りがこの金額以下（lastStrawFrom 回目の年貢から） */
  lastStraw: 10,
  lastStrawFrom: 3,
};

/** 道具の進化：この回数働くと上位の道具に変わる */
export const TOOL_EVOLVE: Partial<Record<PlaceId, { to: PlaceId; need: number; what: string }>> = {
  scarecrow: { to: 'bigScarecrow', need: 10, what: '守る' },
  well: { to: 'goldenWell', need: 20, what: '育てる' },
  hive: { to: 'queenHive', need: 10, what: '列で売る' },
};

/** 難しいモードの段階。1つ下をクリアすると次が開く。厳しさは積み重なる */
export const DIFFICULTIES = [
  { name: 'ふつう', desc: '' },
  { name: '難しい1', desc: '年貢×1.3' },
  { name: '難しい2', desc: '＋ショップ×1.3' },
  { name: '難しい3', desc: '＋お邪魔が早く多い' },
  { name: '難しい4', desc: '＋単品×0.3' },
];

/** 「足す」強化（ゲーム開始時にショップへ並べるものを選ぶ対象） */
export type AddUpgradeId = Exclude<UpgradeId, `remove${string}`>;

/**
 * 遊ぶたびに増える要素（メタ進行）。
 * ゲーム終了時に豊穣ポイントを獲得し、準備画面で「足す」強化やレアのお守りを解放する。
 * 解放した「足す」強化は、毎回コスト上限内でショップに並べるものを選ぶ。
 */
export const META = {
  /** 豊穣ポイント = 到達日数 × perDay + 年貢の納付回数 × perTax（クリアしていれば clearBonus を加算） */
  pointsPerDay: 0.5,
  pointsPerTax: 3,
  clearBonus: 20,
  /** 最初から解放されている「足す」強化 */
  startUnlocked: ['addSun', 'addRain'] as AddUpgradeId[],
  /** 「足す」強化の解放ポイントと、ショップに並べるコスト */
  adds: {
    addSun: { unlock: 0, cost: 2 },
    addRain: { unlock: 0, cost: 1 },
    addSeed: { unlock: 20, cost: 1 },
    addBerrySeed: { unlock: 15, cost: 1 },
    addPumpkinSeed: { unlock: 30, cost: 2 },
    addFertilizer: { unlock: 25, cost: 2 },
    addBee: { unlock: 35, cost: 2 },
    addMerchant: { unlock: 35, cost: 2 },
    addGoldSeed: { unlock: 45, cost: 3 },
    // メロン・雷はポイントでは買えず、達成で解放される（ACHIEVE_ADDS）
    addMelonSeed: { unlock: 0, cost: 2 },
    addThunder: { unlock: 0, cost: 3 },
    addClover: { unlock: 60, cost: 3 },
    addHoe: { unlock: 25, cost: 1 },
    addWatermelonSeed: { unlock: 40, cost: 3 },
    // 満月はいつもショップに並ぶ（組み合わせに入れなくてよい）
    addMoon: { unlock: 0, cost: 0 },
  } as Record<AddUpgradeId, { unlock: number; cost: number }>,
  /** レアのお守りは解放するまで出ない */
  charmUnlock: { sunBlessing: 50, bumper: 50, seedSack: 40 } as Partial<Record<CharmId, number>>,
  /** ショップに並べられるコストの上限と、その拡張 */
  baseCapacity: 4,
  capacityStep: 2,
  capacityPrices: [70, 130, 220],
};

/** 達成で解放される「足す」強化と、その条件（meta.ts の achievements で判定） */
export const ACHIEVE_ADDS: Partial<Record<AddUpgradeId, { hint: string; done: string }>> = {
  addMelonSeed: { hint: '初めてクリアすると…？', done: '初めてクリア' },
  addThunder: { hint: '列をたくさん売ると…？', done: '累計で列を100回売る' },
};

/** 累計の列の数で雷が解放される */
export const THUNDER_LINES = 100;
