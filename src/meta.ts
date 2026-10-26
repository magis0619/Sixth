// 遊ぶたびに増える要素（豊穣ポイント・解放・ショップの組み合わせ）。ブラウザに保存する。

import { L } from './i18n.ts';
import { ACHIEVE_ADDS, CHARMS, CHARM_ORDER, DIFFICULTIES, META, THUNDER_LINES, type AddUpgradeId, type CharmId } from './config.ts';
import { ALL_ADDS, type GameSetup, type GameState } from './game.ts';

export interface MetaState {
  points: number;
  /** これまでに稼いだ合計（表示用） */
  totalPoints: number;
  unlockedAdds: AddUpgradeId[];
  unlockedCharms: CharmId[];
  /** ショップに並べるコスト上限の拡張回数 */
  capacityLevel: number;
  /** 前回選んだ組み合わせ（次回の初期値） */
  loadout: AddUpgradeId[];
  plays: number;
  /** クリアした一番上の難しさ（-1＝まだクリアしていない） */
  maxCleared: number;
  /** 累計で売った列の数 */
  lines: number;
  /** 一度でも手に入れた特別なお守り（図鑑） */
  discovered: CharmId[];
  /** 解放した見た目と、選んでいる見た目 */
  skins: string[];
  skin: string;
  /** 次に遊ぶ難しさ */
  difficulty: number;
  /** チュートリアルを終えた（スキップも含む） */
  tutorialDone: boolean;
  /** クリアした回数 */
  clears: number;
}

const KEY = 'hatake-slot:meta';

function fresh(): MetaState {
  return {
    points: 0,
    totalPoints: 0,
    unlockedAdds: [...META.startUnlocked],
    unlockedCharms: [],
    capacityLevel: 0,
    loadout: [...META.startUnlocked],
    plays: 0,
    maxCleared: -1,
    lines: 0,
    discovered: [],
    skins: [],
    skin: '',
    difficulty: 0,
    tutorialDone: false,
    clears: 0,
  };
}

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const m = { ...fresh(), ...(JSON.parse(raw) as Partial<MetaState>) };
    // チュートリアルを入れる前から遊んでいる人には出さない
    if ((JSON.parse(raw) as Partial<MetaState>).tutorialDone === undefined) m.tutorialDone = m.plays > 0;
    return m;
  } catch {
    return fresh();
  }
}

export function saveMeta(meta: MetaState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // 保存できなくても遊べる（その回限りになる）
  }
}

export function capacity(meta: MetaState): number {
  return META.baseCapacity + META.capacityStep * meta.capacityLevel;
}

export function nextCapacityPrice(meta: MetaState): number | null {
  return META.capacityPrices[meta.capacityLevel] ?? null;
}

export function loadoutCost(ids: AddUpgradeId[]): number {
  return ids.reduce((n, id) => n + META.adds[id].cost, 0);
}

/** ゲーム終了時のポイント */
export function pointsFor(state: GameState): number {
  return Math.floor(state.day * META.pointsPerDay + state.taxesPaid * META.pointsPerTax + (state.cleared ? META.clearBonus : 0));
}

export function awardPoints(meta: MetaState, state: GameState): number {
  const p = pointsFor(state);
  meta.points += p;
  meta.totalPoints += p;
  meta.plays++;
  saveMeta(meta);
  return p;
}

export function unlockAdd(meta: MetaState, id: AddUpgradeId): boolean {
  const price = META.adds[id].unlock;
  if (meta.unlockedAdds.includes(id) || meta.points < price) return false;
  meta.points -= price;
  meta.unlockedAdds.push(id);
  saveMeta(meta);
  return true;
}

export function unlockCharm(meta: MetaState, id: CharmId): boolean {
  const price = META.charmUnlock[id];
  if (price === undefined || meta.unlockedCharms.includes(id) || meta.points < price) return false;
  meta.points -= price;
  meta.unlockedCharms.push(id);
  saveMeta(meta);
  return true;
}

export function buyCapacity(meta: MetaState): boolean {
  const price = nextCapacityPrice(meta);
  if (price === null || meta.points < price) return false;
  meta.points -= price;
  meta.capacityLevel++;
  saveMeta(meta);
  return true;
}

/** 組み合わせの切り替え。上限を超えるなら false */
export function toggleLoadout(meta: MetaState, id: AddUpgradeId): boolean {
  if (meta.loadout.includes(id)) {
    meta.loadout = meta.loadout.filter((x) => x !== id);
  } else {
    if (!meta.unlockedAdds.includes(id) || loadoutCost([...meta.loadout, id]) > capacity(meta)) return false;
    meta.loadout = [...meta.loadout, id];
  }
  saveMeta(meta);
  return true;
}

/** 選べる一番上の難しさ（クリアした段階の1つ上まで） */
export function maxDifficulty(meta: MetaState): number {
  return Math.min(DIFFICULTIES.length - 1, meta.maxCleared + 1);
}

/**
 * 達成で解放されるものを記録する。final＝プレイが終わったとき（累計の列を足す）。
 * 新しく解放されたものの名前を返す
 */
export function recordRun(meta: MetaState, state: GameState, final: boolean): string[] {
  const newly: string[] = [];
  CHARM_ORDER.forEach((id) => {
    if (CHARMS[id].special && state.charms[id] > 0 && !meta.discovered.includes(id)) meta.discovered.push(id);
  });
  if (final) meta.lines += state.stats.lineHarvests;
  if (final && state.cleared) meta.clears++;
  const add = (id: AddUpgradeId, label: string) => {
    if (meta.unlockedAdds.includes(id)) return;
    meta.unlockedAdds.push(id);
    newly.push(label);
  };
  if (state.cleared) {
    if (state.difficulty > meta.maxCleared) {
      meta.maxCleared = state.difficulty;
      if (state.difficulty + 1 < DIFFICULTIES.length) newly.push(DIFFICULTIES[state.difficulty + 1].name);
    }
    add('addMelonSeed', L('メロンの種', 'Melon Seed'));
    if (!meta.skins.includes('gold')) {
      meta.skins.push('gold');
      newly.push(L('金色のスロット', 'Golden slot machine'));
    }
  }
  if (meta.lines >= THUNDER_LINES) add('addThunder', L('雷', 'Thunder'));
  saveMeta(meta);
  return newly;
}

/** 達成で解放される強化か（ポイントでは買えない） */
export function isAchieveAdd(id: AddUpgradeId): boolean {
  return id in ACHIEVE_ADDS;
}

export function setupFrom(meta: MetaState): GameSetup {
  return {
    difficulty: Math.min(meta.difficulty, maxDifficulty(meta)),
    shop: ALL_ADDS.filter((id) => meta.loadout.includes(id) && meta.unlockedAdds.includes(id)),
    charmPool: CHARM_ORDER.filter((id) => !(id in META.charmUnlock) || meta.unlockedCharms.includes(id)),
    // 週替わりは解放済みの「足す」強化から
    pool: ALL_ADDS.filter((id) => meta.unlockedAdds.includes(id)),
  };
}
