// 自分の記録の分析（難しさ・農家ごとの勝ち・評価の平均・負け方・自己ベスト）
import { describe, expect, it } from 'vitest';
import { analyzeHistory, makeRunRecord, winPct, type RunRecord } from '../src/history.ts';
import { newGame } from '../src/game.ts';

const rec = (o: Partial<RunRecord>): RunRecord => ({
  v: 1, at: '2026-11-24T00:00:00Z', runId: Math.random().toString(36).slice(2), seed: 1, diff: 0, lord: 0, farmer: 'basic', day: 49, taxes: 7, cleared: true,
  short: 0, tax: 100, earned: 1000, rank: 'A', score: 75, parts: { line: 80, use: 70, guard: 90, margin: 60 }, weeks: [100, 200], income: { 列で売る: 800, 注文: 200 },
  lines: 10, expired: 5, eaten: 1, places: 0, expand: 1, charms: 7, charmSkips: 0, challenge: false, ...o,
});

describe('自分の記録の分析', () => {
  it('難しさ・農家ごとの勝ちを数える（殿様モードは難しさに入れない）', () => {
    const a = analyzeHistory([rec({ diff: 3 }), rec({ diff: 3, cleared: false, taxes: 2, short: 5 }), rec({ diff: 5, farmer: 'berry' }), rec({ lord: 1 })]);
    expect(a.byDiff.find((d) => d.diff === 3)).toMatchObject({ plays: 2, wins: 1 });
    expect(a.byDiff.some((d) => d.diff === 0)).toBe(false);
    expect(a.byFarmer.find((f) => f.farmer === 'berry')).toMatchObject({ plays: 1, wins: 1 });
    expect(winPct({ plays: 4, wins: 1 })).toBe(25);
  });
  it('負け方：何週目で負けたか・あと1割以内の負け', () => {
    const a = analyzeHistory([rec({ cleared: false, taxes: 4, short: 5, tax: 100 }), rec({ cleared: false, taxes: 4, short: 50, tax: 100 }), rec({})]);
    expect(a.losses).toBe(2);
    expect(a.lossAtTax[4]).toBe(2);
    expect(a.nearMiss).toBe(1);
  });
  it('評価の4つの平均で一番低いものを出し、稼ぎの中身はクリアした回の割合', () => {
    const a = analyzeHistory([rec({}), rec({ parts: { line: 80, use: 30, guard: 90, margin: 60 } })]);
    expect(a.weakest).toBe('use');
    expect(a.incomeShare[0]).toEqual(['列で売る', 80]);
  });
  it('自己ベスト：一番稼いだ週・稼いだ合計', () => {
    const a = analyzeHistory([rec({ weeks: [100, 900] }), rec({ earned: 5000 })]);
    expect(a.bestWeek?.gold).toBe(900);
    expect(a.bestEarned?.earned).toBe(5000);
  });
  it('ゲームの状態から1回分の要約を作る（週ごとの稼ぎ・負けの不足額）', () => {
    const s = newGame({ shop: [], charmPool: [], seed: 3, difficulty: 2 });
    s.day = 14;
    s.gold = 30;
    s.stats.earnedByDay = [0, 10, 10, 10, 10, 10, 10, 10, 20, 20];
    const r = makeRunRecord(s, 80);
    expect(r.weeks).toEqual([70, 40]);
    expect(r.short).toBe(50);
    expect(r.diff).toBe(2);
  });
});
