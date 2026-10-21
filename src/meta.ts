// 遊ぶたびに増える要素（豊穣ポイント・解放・ショップの組み合わせ）。ブラウザに保存する。

import { CHARM_ORDER, META, type AddUpgradeId, type CharmId } from './config.ts';
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
  };
}

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return { ...fresh(), ...(JSON.parse(raw) as Partial<MetaState>) };
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

export function setupFrom(meta: MetaState): GameSetup {
  return {
    shop: ALL_ADDS.filter((id) => meta.loadout.includes(id) && meta.unlockedAdds.includes(id)),
    charmPool: CHARM_ORDER.filter((id) => !(id in META.charmUnlock) || meta.unlockedCharms.includes(id)),
    // 週替わりは解放済みの「足す」強化から
    pool: ALL_ADDS.filter((id) => meta.unlockedAdds.includes(id)),
  };
}
