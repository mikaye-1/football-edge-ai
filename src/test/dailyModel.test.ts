import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  goalProbs,
  matchLambdas,
  rankCandidates,
  trainPoisson,
  type Candidate,
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

  it("computes overall = probability × confidence × data quality on a 0-100 scale", () => {
    const cands = buildCandidates(model, [fixture], {}, { wModel: 0.5, wOdds: 0.5 });
    const c = cands[0];
    const expected = Math.round(c.probability * c.confidence * c.dataQuality) / 10000;
    expect(c.overall).toBeCloseTo(expected, 1);
  });
});

describe("rankCandidates", () => {
  const cand = (matchId: string, probability: number, overall: number): Candidate => ({
    matchId, league: "L", homeTeam: "A", awayTeam: "B", kickoffTime: "",
    market: "BTTS", selection: "Yes", probability, marketProbability: null,
    confidence: 80, dataQuality: 80, risk: "Low", overall,
    stats: {
      expectedGoals: "", homeForm: "", awayForm: "", h2h: "", sampleGames: 0,
      h2hCount: 0, trainingMatches: 0, leagueAvgGoals: 0, odds: null,
    },
  });

  it("caps the number of markets taken from a single match", () => {
    const many = ["a", "b", "c", "d", "e"].map((m, i) => cand(m, 90, 90 - i));
    const ranked = rankCandidates([...many, ...many.map((c) => ({ ...c, matchId: "one", overall: c.overall, market: c.market + c.matchId }))], { minProbability: 0, minConfidence: 0, maxPerMatch: 3, limit: 20 });
    const fromOne = ranked.filter((c) => c.matchId === "one");
    expect(fromOne.length).toBe(3);
  });

  it("selects at most 20 and drops selections below the minimum confidence", () => {
    const many = Array.from({ length: 40 }, (_, i) => cand(`m${i}`, i % 2 === 0 ? 90 : 30, 90 - i));
    const ranked = rankCandidates(many, { minProbability: 50, minConfidence: 40, limit: 20 });
    expect(ranked.length).toBe(20);
    expect(ranked.every((c) => c.probability >= 50)).toBe(true);
  });
});
