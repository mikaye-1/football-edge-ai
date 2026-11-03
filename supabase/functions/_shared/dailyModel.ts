// Pure statistical core for the Daily Top 20 engine.
// No Deno- or browser-specific imports, so it can be unit-tested with Vitest.

export interface HistoryGame {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  kickoff_time: string;
  league?: string;
}

export interface Fixture {
  id: string;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
}

export interface MatchOdds {
  home?: number;
  draw?: number;
  away?: number;
  bttsYes?: number;
  bttsNo?: number;
  over15?: number;
  under15?: number;
  over25?: number;
  under25?: number;
  over35?: number;
  under35?: number;
}

export interface PoissonModel {
  att: Record<string, number>;
  def: Record<string, number>;
  baseH: number;
  baseA: number;
  gameCount: number;
  teamGames: Record<string, number>;
  recent: Record<string, HistoryGame[]>;
  leagueAvg: Record<string, number>;
}

export interface CandidateStats {
  expectedGoals: string;
  homeForm: string;
  awayForm: string;
  h2h: string;
  sampleGames: number;
  h2hCount: number;
  trainingMatches: number;
  leagueAvgGoals: number;
  odds: number | null;
}

export interface Candidate {
  matchId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  market: string;
  selection: string;
  /** 0-100 */
  probability: number;
  /** de-vigged market probability in %, when odds exist */
  marketProbability: number | null;
  /** 0-100 */
  confidence: number;
  /** 0-100 */
  dataQuality: number;
  risk: "Low" | "Medium" | "High";
  /** probability × confidence × data quality, normalized to 0-100 */
  overall: number;
  stats: CandidateStats;
}

const HISTORY_CAP = 10000;
const GOAL_STEPS = 10;
const PRIOR = 3;
const HALF_LIFE_DAYS = 180;

function decay(refMs: number, kickoff: string): number {
  return Math.exp(-((refMs - new Date(kickoff).getTime()) / 86400000) / HALF_LIFE_DAYS);
}

function pois(l: number, k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return Math.exp(-l) * l ** k / f;
}

/**
 * Time-decayed bivariate-independence Poisson attack/defence model trained on
 * historical scores — the same engine generate-ai-prediction uses, factored out
 * so a whole day of fixtures shares one training pass.
 */
export function trainPoisson(games: HistoryGame[], refTime?: number): PoissonModel {
  const now = refTime ?? Date.now();
  let sw = 0, sh = 0, sa = 0;
  for (const g of games) {
    const w = decay(now, g.kickoff_time);
    sw += w; sh += w * g.home_score; sa += w * g.away_score;
  }
  const baseH = sw > 0 ? sh / sw : 1.5;
  const baseA = sw > 0 ? sa / sw : 1.15;

  const att: Record<string, number> = {}, def: Record<string, number> = {};
  const teamGames: Record<string, number> = {};
  const recent: Record<string, HistoryGame[]> = {};
  const leagueSum: Record<string, number> = {}, leagueN: Record<string, number> = {};
  for (const g of games) {
    att[g.home_team] ??= 1; att[g.away_team] ??= 1; def[g.home_team] ??= 1; def[g.away_team] ??= 1;
    teamGames[g.home_team] = (teamGames[g.home_team] ?? 0) + 1;
    teamGames[g.away_team] = (teamGames[g.away_team] ?? 0) + 1;
    (recent[g.home_team] ??= []).push(g);
    (recent[g.away_team] ??= []).push(g);
    if (g.league) {
      leagueSum[g.league] = (leagueSum[g.league] ?? 0) + g.home_score + g.away_score;
      leagueN[g.league] = (leagueN[g.league] ?? 0) + 1;
    }
  }

  for (let it = 0; it < 15; it++) {
    const aN: Record<string, number> = {}, aD: Record<string, number> = {};
    const dN: Record<string, number> = {}, dD: Record<string, number> = {};
    for (const g of games) {
      const w = decay(now, g.kickoff_time), h = g.home_team, a = g.away_team;
      aN[h] = (aN[h] ?? 0) + w * g.home_score; aD[h] = (aD[h] ?? 0) + w * baseH * def[a];
      aN[a] = (aN[a] ?? 0) + w * g.away_score; aD[a] = (aD[a] ?? 0) + w * baseA * def[h];
      dN[h] = (dN[h] ?? 0) + w * g.away_score; dD[h] = (dD[h] ?? 0) + w * baseA * att[a];
      dN[a] = (dN[a] ?? 0) + w * g.home_score; dD[a] = (dD[a] ?? 0) + w * baseH * att[h];
    }
    for (const t of Object.keys(att)) {
      att[t] = ((aN[t] ?? 0) + PRIOR) / ((aD[t] ?? 0) + PRIOR);
      def[t] = ((dN[t] ?? 0) + PRIOR) / ((dD[t] ?? 0) + PRIOR);
    }
  }

  const leagueAvg: Record<string, number> = {};
  for (const l of Object.keys(leagueN)) {
    leagueAvg[l] = leagueN[l] > 0 ? leagueSum[l] / leagueN[l] : 2.6;
  }
  return { att, def, baseH, baseA, gameCount: games.length, teamGames, recent, leagueAvg };
}

export function matchLambdas(model: PoissonModel, f: Fixture): { lamH: number; lamA: number } {
  const lamH = model.baseH * (model.att[f.home_team] ?? 1) * (model.def[f.away_team] ?? 1);
  const lamA = model.baseA * (model.att[f.away_team] ?? 1) * (model.def[f.home_team] ?? 1);
  return { lamH, lamA };
}

export interface GoalProbs {
  home: number;
  draw: number;
  away: number;
  btts: number;
  over15: number;
  over25: number;
  over35: number;
}

/** Independent-Poisson score matrix folded into the supported market probabilities (0-1). */
export function goalProbs(lamH: number, lamA: number): GoalProbs {
  let home = 0, draw = 0, away = 0, btts = 0, over15 = 0, over25 = 0, over35 = 0;
  for (let i = 0; i <= GOAL_STEPS; i++) {
    for (let j = 0; j <= GOAL_STEPS; j++) {
      const p = pois(lamH, i) * pois(lamA, j);
      if (i > j) home += p; else if (i === j) draw += p; else away += p;
      if (i > 0 && j > 0) btts += p;
      if (i + j > 1) over15 += p;
      if (i + j > 2) over25 += p;
      if (i + j > 3) over35 += p;
    }
  }
  const tot = home + draw + away || 1;
  return { home: home / tot, draw: draw / tot, away: away / tot, btts, over15, over25, over35 };
}

/** De-vig a list of decimal odds into normalized probabilities; null when odds are missing. */
export function devig(odds: (number | undefined)[]): number[] | null {
  if (odds.some((o) => !o || o <= 1)) return null;
  const imp = odds.map((o) => 1 / (o as number));
  const sum = imp.reduce((s, x) => s + x, 0);
  return sum > 0 ? imp.map((x) => x / sum) : null;
}

export function formString(games: HistoryGame[] | undefined, team: string, n = 5): string {
  return (games ?? [])
    .slice(0, n)
    .map((g) => {
      const isHome = g.home_team === team;
      const tg = isHome ? g.home_score : g.away_score;
      const og = isHome ? g.away_score : g.home_score;
      return tg > og ? "W" : tg < og ? "L" : "D";
    })
    .join("");
}

export function h2hGames(games: HistoryGame[] | undefined, a: string, b: string, n = 5): HistoryGame[] {
  return (games ?? [])
    .filter((g) => (g.home_team === a && g.away_team === b) || (g.home_team === b && g.away_team === a))
    .slice(0, n);
}

interface RawCandidate {
  market: string;
  selection: string;
  model: number; // 0-1
  marketProb: number | null; // 0-1
  odds: number | null;
}

function rawCandidates(probs: GoalProbs, odds: MatchOdds, homeTeam: string, awayTeam: string): RawCandidate[] {
  const x1 = devig([odds.home, odds.draw, odds.away]);
  const btts = devig([odds.bttsYes, odds.bttsNo]);
  const ou15 = devig([odds.over15, odds.under15]);
  const ou25 = devig([odds.over25, odds.under25]);
  const ou35 = devig([odds.over35, odds.under35]);
  const mk = (d: number[] | null, i: number) => (d ? d[i] : null);
  return [
    {
      market: "Match Result", selection: "Home Win", model: probs.home,
      marketProb: mk(x1, 0), odds: odds.home ?? null,
    },
    {
      market: "Match Result", selection: "Away Win", model: probs.away,
      marketProb: mk(x1, 2), odds: odds.away ?? null,
    },
    {
      // Not To Win, derived from the outcome probabilities as the spec requires
      market: "Not to Win", selection: `${homeTeam} Not To Win`,
      model: probs.draw + probs.away, marketProb: x1 ? x1[1] + x1[2] : null, odds: null,
    },
    {
      market: "Not to Win", selection: `${awayTeam} Not To Win`,
      model: probs.draw + probs.home, marketProb: x1 ? x1[1] + x1[0] : null, odds: null,
    },
    {
      market: "BTTS", selection: "Both Teams To Score — Yes", model: probs.btts,
      marketProb: mk(btts, 0), odds: odds.bttsYes ?? null,
    },
    {
      market: "Over/Under 1.5", selection: "Over 1.5", model: probs.over15,
      marketProb: mk(ou15, 0), odds: odds.over15 ?? null,
    },
    {
      market: "Over/Under 2.5", selection: "Under 2.5", model: 1 - probs.over25,
      marketProb: mk(ou25, 1), odds: odds.under25 ?? null,
    },
    {
      market: "Over/Under 3.5", selection: "Under 3.5", model: 1 - probs.over35,
      marketProb: mk(ou35, 1), odds: odds.under35 ?? null,
    },
  ];
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Build every market candidate for a fixture list: blended probability,
 * data-quality score, confidence score, risk level and the overall ranking
 * score (probability × confidence × data quality, normalized 0-100).
 */
export function buildCandidates(
  model: PoissonModel,
  fixtures: Fixture[],
  oddsByMatch: Record<string, MatchOdds>,
  weights: { wModel: number; wOdds: number },
): Candidate[] {
  const out: Candidate[] = [];
  for (const f of fixtures) {
    const odds = oddsByMatch[f.id] ?? {};
    const { lamH, lamA } = matchLambdas(model, f);
    const probs = goalProbs(lamH, lamA);
    const sample = Math.min(model.teamGames[f.home_team] ?? 0, model.teamGames[f.away_team] ?? 0);
    const h2h = h2hGames(model.recent[f.home_team], f.home_team, f.away_team);
    const dataTrust = sample / (sample + 8);
    const share = odds.home && odds.draw && odds.away
      ? Math.min(0.8, (weights.wModel / (weights.wModel + weights.wOdds || 1)) * dataTrust * 1.4)
      : 1;
    const blend = (m: number, mk: number | null) =>
      mk != null ? share * m + (1 - share) * mk : m;

    for (const rc of rawCandidates(probs, odds, f.home_team, f.away_team)) {
      const probability = round1(blend(rc.model, rc.marketProb) * 100);

      // Data quality: odds coverage, team sample, H2H depth, training size.
      const dqOdds = odds.home && odds.draw && odds.away ? 40 : rc.marketProb != null ? 20 : 0;
      const dqSample = Math.min(1, sample / 10) * 30;
      const dqH2h = Math.min(1, h2h.length / 3) * 15;
      const dqTrain = Math.min(1, model.gameCount / 500) * 15;
      const dataQuality = round1(dqOdds + dqSample + dqH2h + dqTrain);

      // Confidence: evidence strength, not outcome likelihood.
      const agree = rc.marketProb == null
        ? 55
        : Math.max(0, 100 - Math.min(100, Math.abs(probability - rc.marketProb * 100) * 2.5));
      const confidence = round1(0.45 * probability + 0.4 * dataQuality + 0.15 * agree);

      const risk: Candidate["risk"] =
        dataQuality < 45 ? "High" : dataQuality < 65 || probability < 55 ? "Medium" : "Low";

      const overall = round1((probability * confidence * dataQuality) / 10000);

      out.push({
        matchId: f.id,
        league: f.league,
        homeTeam: f.home_team,
        awayTeam: f.away_team,
        kickoffTime: f.kickoff_time,
        market: rc.market,
        selection: rc.selection,
        probability,
        marketProbability: rc.marketProb != null ? round1(rc.marketProb * 100) : null,
        confidence,
        dataQuality,
        risk,
        overall,
        stats: {
          expectedGoals: `${lamH.toFixed(2)} – ${lamA.toFixed(2)}`,
          homeForm: formString(model.recent[f.home_team], f.home_team),
          awayForm: formString(model.recent[f.away_team], f.away_team),
          h2h: h2h.map((g) => `${g.home_score}-${g.away_score}`).join(", "),
          sampleGames: sample,
          h2hCount: h2h.length,
          trainingMatches: model.gameCount,
          leagueAvgGoals: round1(model.leagueAvg[f.league] ?? 2.6),
          odds: rc.odds != null ? round1(rc.odds) : null,
        },
      });
    }
  }
  return out;
}

export interface RankOptions {
  maxPerMatch?: number;
  limit?: number;
  minProbability?: number;
  minConfidence?: number;
}

/**
 * Rank all opportunities by overall score, drop weak ones, allow several strong
 * markets per match (capped so one fixture cannot flood the list) and select the
 * strongest opportunities of the day.
 */
export function rankCandidates(candidates: Candidate[], opts: RankOptions = {}): Candidate[] {
  const { maxPerMatch = 3, limit = 20, minProbability = 50, minConfidence = 40 } = opts;
  const eligible = candidates.filter((c) => c.probability >= minProbability && c.confidence >= minConfidence);
  eligible.sort((a, b) => b.overall - a.overall || b.probability - a.probability);
  const perMatch = new Map<string, number>();
  const picked: Candidate[] = [];
  for (const c of eligible) {
    const used = perMatch.get(c.matchId) ?? 0;
    if (used >= maxPerMatch) continue;
    perMatch.set(c.matchId, used + 1);
    picked.push(c);
    if (picked.length >= limit) break;
  }
  return picked;
}
