import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  goalProbs,
  matchLambdas,
  rankCandidates,
  trainPoisson,
  calibrationTable,
  learnPerformance,
  MARKET_KEYS,
  overallScore,
  reliabilityOf,
  weightedAvailable,
  type Candidate,
  type MarketKey,
  type HistoryGame,
} from "../../supabase/functions/_shared/dailyModel";

function history(n = 20): HistoryGame[] {
  const games: HistoryGame[] = [];
  for (let i = 0; i < n; i++) {
    games.push({
      home_team: i % 2 === 0 ? "Strong FC" : "Weak FC",
      away_team: i % 2 === 0 ? "Weak FC" : "Strong FC",
      home_score: i % 2 === 0 ? 3 : 0,
      away_score: i % 2 === 0 ? 0 : 2,
      kickoff_time: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
      league: "Test League",
    });
  }
  return games;
}

const fixture = {
  id: "m1",
  league: "Test League",
  home_team: "Strong FC",
  away_team: "Weak FC",
  kickoff_time: new Date(Date.UTC(2026, 9, 10, 15)).toISOString(),
};

describe("goalProbs", () => {
  it("keeps 1X2 probabilities summing to 1 and ordered by team strength", () => {
    const p = goalProbs(1.8, 0.9);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 5);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it("is monotonic across goal lines: over 1.5 > over 2.5 > over 3.5", () => {
    const p = goalProbs(1.4, 1.1);
    expect(p.over15).toBeGreaterThan(p.over25);
    expect(p.over25).toBeGreaterThan(p.over35);
  });
});

describe("buildCandidates", () => {
  const model = trainPoisson(history(), Date.UTC(2026, 9, 10));

  it("derives Not To Win from outcome probabilities (draw + other win)", () => {
    const model = trainPoisson(history(), Date.UTC(2026, 9, 10));
    const { lamH, lamA } = matchLambdas(model, fixture);
    const p = goalProbs(lamH, lamA);
    const cands = buildCandidates(model, [fixture], {}, { wModel: 0.5, wOdds: 0.5 });
    const homeNtw = cands.find((c) => c.selection === "Strong FC Not To Win")!;
    expect(homeNtw.probability / 100).toBeCloseTo(p.draw + p.away, 1);
    const awayNtw = cands.find((c) => c.selection === "Weak FC Not To Win")!;
    expect(awayNtw.probability / 100).toBeCloseTo(p.draw + p.home, 1);
  });

  it("emits exactly the spec markets: result, not-to-win, BTTS, over 1.5, under 2.5, under 3.5", () => {
    const cands = buildCandidates(model, [fixture], {}, { wModel: 0.5, wOdds: 0.5 });
    const keys = cands.map((c) => `${c.market}:${c.selection}`).sort();
    expect(keys).toEqual([
      "BTTS:Both Teams To Score — Yes",
      "Match Result:Away Win",
      "Match Result:Home Win",
      "Not to Win:Strong FC Not To Win",
      "Not to Win:Weak FC Not To Win",
      "Over/Under 1.5:Over 1.5",
      "Over/Under 2.5:Under 2.5",
      "Over/Under 3.5:Under 3.5",
    ]);
  });

  it("treats missing H2H/odds as unavailable, not as zero quality", () => {
    const c = buildCandidates(model, [fixture], {}, { wModel: 0.5, wOdds: 0.5 })[0];
    expect(c.stats.missingFeatures).toContain("odds");
    // all available features are perfect here (20 games, H2H, form) → full quality
    expect(c.dataQuality).toBe(100);
  });
});

describe("scoring", () => {
  it("redistributes weight of unavailable components", () => {
    expect(weightedAvailable([{ w: 1, v: 0.8 }, { w: 3, v: null }])).toBeCloseTo(0.8);
  });

  it("overall is normalized to 0-100", () => {
    const all1 = { probability: 1, confidence: 1, dataQuality: 1, sampleSize: 1, agreement: null, marketHistory: null, calibration: null };
    expect(overallScore(all1)).toBe(100);
  });

  it("labels 90.9% / 72.3 confidence / 57.8 quality as Medium reliability", () => {
    expect(reliabilityOf(90.9, 72.3, 57.8).label).toBe("Medium");
  });
});

describe("calibration", () => {
  it("buckets settled picks into probability bands with hit rate and error", () => {
    const settled = Array.from({ length: 10 }, (_, i) => ({ marketKey: "BTTS" as const, probability: 92, won: i < 7 }));
    const row = calibrationTable(learnPerformance(settled)).find((r) => r.band === "90–95%")!;
    expect(row.count).toBe(10);
    expect(row.hitRate).toBe(70);
    expect(row.calibrationError).toBe(-22);
  });
});

describe("rankCandidates", () => {
  let n = 0;
  const cand = (matchId: string, marketKey: MarketKey, overall: number, probability = 80): Candidate => ({
    matchId, league: "L", homeTeam: "A", awayTeam: "B", kickoffTime: "",
    market: marketKey, marketKey, selection: `${marketKey}-${n++}`, probability, marketProbability: null,
    confidence: 80, dataQuality: 80, reliabilityScore: 80, reliability: "High", risk: "Low", overall,
    stats: {
      expectedGoals: "", homeForm: "", awayForm: "", h2h: "", sampleGames: 0, h2hCount: 0,
      leagueAvgGoals: 0, odds: null, availableFeatures: [], missingFeatures: [], components: {}, keyFactors: "", mainRisk: "",
    },
  });

  it("takes at most 2 predictions per fixture", () => {
    const keys: MarketKey[] = ["BTTS", "Home Win", "Under 3.5", "Away Win"];
    const { picks } = rankCandidates(keys.map((k, i) => cand("one", k, 90 - i)));
    expect(picks.length).toBe(2);
  });

  it("skips correlated markets on the same fixture", () => {
    const { picks } = rankCandidates([cand("m", "Under 2.5", 90), cand("m", "Under 3.5", 89)]);
    expect(picks.length).toBe(1);
  });

  it("caps a single market without padding with weaker ones", () => {
    const many = Array.from({ length: 10 }, (_, i) => cand(`m${i}`, "Over 1.5", 90 - i));
    const { picks } = rankCandidates(many, { maxPerMarket: 4 });
    expect(picks.length).toBe(4);
  });

  it("never manufactures picks to reach 20", () => {
    const many = Array.from({ length: 30 }, (_, i) => cand(`m${i}`, MARKET_KEYS[i % 7], i < 13 ? 80 : 30));
    expect(rankCandidates(many).picks.length).toBe(13);
  });
});
