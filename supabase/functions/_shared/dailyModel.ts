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
  /** Recent H2H scorelines, or "" when no meeting is on record (unavailable, not poor). */
  h2h: string;
  sampleGames: number;
  h2hCount: number;
  leagueAvgGoals: number;
  odds: number | null;
  /** Data features that exist for this fixture vs. ones we have no feed for. */
  availableFeatures: string[];
  missingFeatures: string[];
  /** Per-component 0-1 values that went into the overall score (null = unavailable, weight redistributed). */
  components: Record<string, number | null>;
  keyFactors: string;
  mainRisk: string;
}

/** Canonical market group used for diversification, correlation and per-market history. */
export type MarketKey =
  | "BTTS" | "Over 1.5" | "Under 2.5" | "Under 3.5" | "Home Win" | "Away Win" | "Not To Win";

export const MARKET_KEYS: MarketKey[] = [
  "BTTS", "Over 1.5", "Under 2.5", "Under 3.5", "Home Win", "Away Win", "Not To Win",
];

export interface Candidate {
  matchId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  market: string;
  marketKey: MarketKey;
  selection: string;
  /** Model probability 0-100 (how likely the outcome is). */
  probability: number;
  /** de-vigged market probability in %, when odds exist */
  marketProbability: number | null;
  /** Model confidence 0-100: how much evidence backs the probability — NOT outcome likelihood. */
  confidence: number;
  /** 0-100, computed only over features that exist (missing ≠ poor). */
  dataQuality: number;
  /** 0-100 blend of probability edge, confidence and data quality. */
  reliabilityScore: number;
  reliability: "High" | "Medium" | "Low";
  risk: "Low" | "Medium" | "High";
  /** Overall prediction strength 0-100 — see scoreCandidate() for the formula. */
  overall: number;
  stats: CandidateStats;
}

/** Settled history for one market (from previous Daily Top 20 picks). */
export interface MarketHistory { n: number; hits: number; avgPred: number }
/** Settled history for one probability band. */
export interface BandHistory { n: number; hits: number; avgPred: number }
export interface LearnedPerformance {
  markets: Partial<Record<MarketKey, MarketHistory>>;
  bands: Record<string, BandHistory>;
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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function marketKeyOf(market: string, selection: string): MarketKey {
  if (market === "Not to Win") return "Not To Win";
  if (market === "BTTS") return "BTTS";
  if (selection === "Home Win") return "Home Win";
  if (selection === "Away Win") return "Away Win";
  if (selection === "Over 1.5") return "Over 1.5";
  if (selection === "Under 2.5") return "Under 2.5";
  return "Under 3.5";
}

/** Probability bands used for calibration reporting. */
export const PROB_BANDS: { label: string; lo: number; hi: number }[] = [
  { label: "60–65%", lo: 60, hi: 65 }, { label: "65–70%", lo: 65, hi: 70 },
  { label: "70–75%", lo: 70, hi: 75 }, { label: "75–80%", lo: 75, hi: 80 },
  { label: "80–85%", lo: 80, hi: 85 }, { label: "85–90%", lo: 85, hi: 90 },
  { label: "90–95%", lo: 90, hi: 95 }, { label: "95%+", lo: 95, hi: 101 },
];

export function bandOf(probability: number): string | null {
  return PROB_BANDS.find((b) => probability >= b.lo && probability < b.hi)?.label ?? null;
}

/**
 * Weighted mean over only the components that exist. A null component is
 * "data unavailable": its weight is redistributed proportionally to the rest
 * instead of being counted as zero.
 */
export function weightedAvailable(parts: { w: number; v: number | null }[]): number {
  let sw = 0, s = 0;
  for (const p of parts) if (p.v != null) { sw += p.w; s += p.w * p.v; }
  return sw > 0 ? s / sw : 0;
}

/** Minimum settled picks before a market/band history is allowed to move the score. */
export const MIN_HISTORY = 10;
const SHRINK = 20;

/**
 * Settle one Daily Top 20 pick against a final score. Returns null if the
 * selection can't be resolved.
 */
export function settlePick(
  marketKey: MarketKey, selection: string, homeTeam: string, awayTeam: string, hs: number, as: number,
): boolean | null {
  switch (marketKey) {
    case "BTTS": return hs > 0 && as > 0;
    case "Over 1.5": return hs + as > 1;
    case "Under 2.5": return hs + as < 3;
    case "Under 3.5": return hs + as < 4;
    case "Home Win": return hs > as;
    case "Away Win": return as > hs;
    case "Not To Win":
      if (selection.startsWith(homeTeam)) return hs <= as;
      if (selection.startsWith(awayTeam)) return as <= hs;
      return null;
  }
}

/** Build market and band history from settled picks ({marketKey, probability, won}). */
export function learnPerformance(
  settled: { marketKey: MarketKey; probability: number; won: boolean }[],
): LearnedPerformance {
  const markets: LearnedPerformance["markets"] = {};
  const bands: LearnedPerformance["bands"] = {};
  const add = (h: { n: number; hits: number; avgPred: number }, p: number, won: boolean) => {
    h.avgPred = (h.avgPred * h.n + p) / (h.n + 1);
    h.n += 1; if (won) h.hits += 1;
  };
  for (const s of settled) {
    add((markets[s.marketKey] ??= { n: 0, hits: 0, avgPred: 0 }), s.probability, s.won);
    const b = bandOf(s.probability);
    if (b) add((bands[b] ??= { n: 0, hits: 0, avgPred: 0 }), s.probability, s.won);
  }
  return { markets, bands };
}

/** Calibration table: per band count, avg predicted %, actual hit %, error (pp). */
export function calibrationTable(perf: LearnedPerformance) {
  return PROB_BANDS.map((b) => {
    const h = perf.bands[b.label];
    const hitRate = h && h.n > 0 ? (h.hits / h.n) * 100 : null;
    return {
      band: b.label,
      count: h?.n ?? 0,
      avgPredicted: h ? round1(h.avgPred) : null,
      hitRate: hitRate != null ? round1(hitRate) : null,
      calibrationError: h && hitRate != null ? round1(hitRate - h.avgPred) : null,
    };
  });
}

/**
 * OVERALL SCORE (0-100) — transparent formula.
 *
 *   overall = 100 × Σ wᵢ·xᵢ / Σ wᵢ   over components xᵢ ∈ [0,1] that are AVAILABLE
 *
 *   component        weight  value
 *   probability      0.30    (p − 50) / 45, clamped           (p in %)
 *   confidence       0.15    confidence / 100
 *   dataQuality      0.15    dataQuality / 100
 *   sampleSize       0.10    n / (n + 10), n = smaller team history
 *   agreement        0.10    1 − |p − market p| / 20           (null if no odds)
 *   marketHistory    0.10    0.5 + 2.5·(shrunk hit rate − avg predicted) (null if < MIN_HISTORY settled)
 *   calibration      0.10    1 − |band error| / 15             (null if band has < MIN_HISTORY settled)
 *
 * Unavailable components are dropped and their weight redistributed — so a
 * missing odds feed or a market with no history neither helps nor penalizes.
 */
export const SCORE_WEIGHTS = {
  probability: 0.3, confidence: 0.15, dataQuality: 0.15, sampleSize: 0.1,
  agreement: 0.1, marketHistory: 0.1, calibration: 0.1,
} as const;

export function scoreComponents(input: {
  probability: number; confidence: number; dataQuality: number; sample: number;
  marketProbability: number | null; market?: MarketHistory; band?: BandHistory;
}): Record<keyof typeof SCORE_WEIGHTS, number | null> {
  const { probability: p, market, band } = input;
  let marketHistory: number | null = null;
  if (market && market.n >= MIN_HISTORY) {
    const shrunk = (market.hits + SHRINK * (market.avgPred / 100)) / (market.n + SHRINK);
    marketHistory = clamp01(0.5 + 2.5 * (shrunk - market.avgPred / 100));
  }
  let calibration: number | null = null;
  if (band && band.n >= MIN_HISTORY) {
    calibration = clamp01(1 - Math.abs((band.hits / band.n) * 100 - band.avgPred) / 15);
  }
  return {
    probability: clamp01((p - 50) / 45),
    confidence: input.confidence / 100,
    dataQuality: input.dataQuality / 100,
    sampleSize: input.sample / (input.sample + 10),
    agreement: input.marketProbability == null ? null : clamp01(1 - Math.abs(p - input.marketProbability) / 20),
    marketHistory,
    calibration,
  };
}

export function overallScore(components: Record<keyof typeof SCORE_WEIGHTS, number | null>): number {
  return round1(100 * weightedAvailable(
    (Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]).map((k) => ({ w: SCORE_WEIGHTS[k], v: components[k] })),
  ));
}

/** Reliability = how far a probability can be trusted: probability edge + confidence + data quality. */
export function reliabilityOf(probability: number, confidence: number, dataQuality: number) {
  const score = round1(0.3 * clamp01((probability - 50) / 45) * 100 + 0.35 * confidence + 0.35 * dataQuality);
  const label: Candidate["reliability"] = score >= 70 ? "High" : score >= 55 ? "Medium" : "Low";
  return { score, label };
}

/** Features we have no feed for at all — always reported as unavailable, never scored. */
const NO_FEED = ["injuries", "lineups", "measured xG"];

export function buildCandidates(
  model: PoissonModel,
  fixtures: Fixture[],
  oddsByMatch: Record<string, MatchOdds>,
  weights: { wModel: number; wOdds: number },
  perf: LearnedPerformance = { markets: {}, bands: {} },
): Candidate[] {
  const out: Candidate[] = [];
  for (const f of fixtures) {
    const odds = oddsByMatch[f.id] ?? {};
    const { lamH, lamA } = matchLambdas(model, f);
    const probs = goalProbs(lamH, lamA);
    const sample = Math.min(model.teamGames[f.home_team] ?? 0, model.teamGames[f.away_team] ?? 0);
    const h2h = h2hGames(model.recent[f.home_team], f.home_team, f.away_team);
    const has1x2 = !!(odds.home && odds.draw && odds.away);
    const dataTrust = sample / (sample + 8);
    const share = has1x2
      ? Math.min(0.8, (weights.wModel / (weights.wModel + weights.wOdds || 1)) * dataTrust * 1.4)
      : 1;
    const blend = (m: number, mk: number | null) => (mk != null ? share * m + (1 - share) * mk : m);
    const homeForm = formString(model.recent[f.home_team], f.home_team);
    const awayForm = formString(model.recent[f.away_team], f.away_team);

    for (const rc of rawCandidates(probs, odds, f.home_team, f.away_team)) {
      const probability = round1(blend(rc.model, rc.marketProb) * 100);
      const marketKey = marketKeyOf(rc.market, rc.selection);

      // DATA QUALITY: mean quality of features that exist. null = unavailable → weight redistributed.
      const dqParts = {
        odds: rc.marketProb != null ? 1 : null,
        teamHistory: sample > 0 ? Math.min(1, sample / 10) : 0, // zero games IS poor data, not missing
        h2h: h2h.length > 0 ? Math.min(1, h2h.length / 3) : null, // no meeting on record = unavailable
        form: homeForm.length && awayForm.length ? Math.min(homeForm.length, awayForm.length) / 5 : null,
      };
      const dataQuality = round1(100 * weightedAvailable([
        { w: 35, v: dqParts.odds }, { w: 35, v: dqParts.teamHistory },
        { w: 15, v: dqParts.h2h }, { w: 15, v: dqParts.form },
      ]));
      const available = Object.entries(dqParts).filter(([, v]) => v != null).map(([k]) => k);
      const missing = [...Object.entries(dqParts).filter(([, v]) => v == null).map(([k]) => k), ...NO_FEED];

      // CONFIDENCE: strength of evidence behind the number, independent of the probability itself.
      const agree = rc.marketProb == null ? null : clamp01(1 - Math.abs(probability - rc.marketProb * 100) / 20);
      const confidence = round1(100 * weightedAvailable([
        { w: 0.45, v: sample / (sample + 10) },
        { w: 0.3, v: agree },
        { w: 0.25, v: clamp01(model.gameCount / 500) },
      ]));

      const components = scoreComponents({
        probability, confidence, dataQuality, sample,
        marketProbability: rc.marketProb != null ? rc.marketProb * 100 : null,
        market: perf.markets[marketKey], band: perf.bands[bandOf(probability) ?? ""],
      });
      const overall = overallScore(components);
      const rel = reliabilityOf(probability, confidence, dataQuality);
      const risk: Candidate["risk"] = rel.label === "High" ? "Low" : rel.label === "Medium" ? "Medium" : "High";

      const factors: string[] = [];
      factors.push(`Model ${probability.toFixed(1)}% from xG ${lamH.toFixed(2)}–${lamA.toFixed(2)}`);
      if (agree != null && agree >= 0.75) factors.push(`market agrees (${(rc.marketProb! * 100).toFixed(1)}%)`);
      if (homeForm || awayForm) factors.push(`form ${homeForm || "—"} / ${awayForm || "—"}`);
      if (h2h.length) factors.push(`H2H ${h2h.map((g) => `${g.home_score}-${g.away_score}`).join(", ")}`);
      const mh = perf.markets[marketKey];
      if (mh && mh.n >= MIN_HISTORY) factors.push(`${marketKey} hit ${((mh.hits / mh.n) * 100).toFixed(0)}% of ${mh.n} past picks`);

      const risks: [number, string][] = [];
      if (sample < 6) risks.push([3, `thin team history (${sample} games)`]);
      if (rc.marketProb == null) risks.push([2, "no bookmaker odds to cross-check"]);
      else if (agree != null && agree < 0.5) risks.push([3, `model ${probability.toFixed(0)}% vs market ${(rc.marketProb * 100).toFixed(0)}% disagree`]);
      if (marketKey === "Under 2.5" || marketKey === "Under 3.5") risks.push([1, "one early goal changes game state"]);
      if (marketKey === "Over 1.5" || marketKey === "BTTS") risks.push([1, "low-tempo or defensive match"]);
      if (marketKey === "Not To Win") risks.push([1, "favourite wins outright"]);
      if (marketKey === "Home Win" || marketKey === "Away Win") risks.push([1, "draw or upset"]);
      risks.push([0.5, "no injury/lineup data"]);
      risks.sort((a, b) => b[0] - a[0]);

      out.push({
        matchId: f.id, league: f.league, homeTeam: f.home_team, awayTeam: f.away_team,
        kickoffTime: f.kickoff_time, market: rc.market, marketKey, selection: rc.selection,
        probability,
        marketProbability: rc.marketProb != null ? round1(rc.marketProb * 100) : null,
        confidence, dataQuality, reliabilityScore: rel.score, reliability: rel.label, risk, overall,
        stats: {
          expectedGoals: `${lamH.toFixed(2)} – ${lamA.toFixed(2)}`,
          homeForm, awayForm,
          h2h: h2h.map((g) => `${g.home_score}-${g.away_score}`).join(", "),
          sampleGames: sample, h2hCount: h2h.length,
          leagueAvgGoals: round1(model.leagueAvg[f.league] ?? 2.6),
          odds: rc.odds != null ? round1(rc.odds) : null,
          availableFeatures: available, missingFeatures: missing,
          components,
          keyFactors: factors.join("; "),
          mainRisk: risks[0][1],
        },
      });
    }
  }
  return out;
}

/** Pairs of markets on the same fixture that largely win/lose together. */
export function correlated(a: Candidate, b: Candidate): boolean {
  const pair = new Set([a.marketKey, b.marketKey]);
  const has = (x: MarketKey, y: MarketKey) => pair.has(x) && pair.has(y) && x !== y;
  if (a.marketKey === b.marketKey) return true; // e.g. both Not-To-Win sides
  if (has("Under 2.5", "Under 3.5") || has("Over 1.5", "BTTS")) return true;
  // Win for one side ≈ Not-To-Win for the other side
  const ntw = a.marketKey === "Not To Win" ? a : b.marketKey === "Not To Win" ? b : null;
  const win = a.marketKey === "Home Win" || a.marketKey === "Away Win" ? a
    : b.marketKey === "Home Win" || b.marketKey === "Away Win" ? b : null;
  if (ntw && win) {
    const loser = win.marketKey === "Home Win" ? win.awayTeam : win.homeTeam;
    if (ntw.selection.startsWith(loser)) return true;
  }
  return false;
}

export interface RankOptions {
  maxPerMatch?: number;
  maxPerMarket?: number;
  limit?: number;
  minProbability?: number;
  minConfidence?: number;
  minOverall?: number;
}

export interface RankResult {
  picks: Candidate[];
  rejected: { belowThreshold: number; perMatchCap: number; perMarketCap: number; correlated: number; beyondLimit: number };
}

export const DEFAULT_RANK: Required<RankOptions> = {
  maxPerMatch: 2, maxPerMarket: 6, limit: 20, minProbability: 60, minConfidence: 50, minOverall: 50,
};

/**
 * Greedy selection by overall score. Caps only ever SKIP a candidate — they
 * never pull in a weaker one to fill a quota, and the list may be shorter than
 * `limit` when not enough candidates clear the quality thresholds.
 */
export function rankCandidates(candidates: Candidate[], opts: RankOptions = {}): RankResult {
  const o = { ...DEFAULT_RANK, ...opts };
  const rejected = { belowThreshold: 0, perMatchCap: 0, perMarketCap: 0, correlated: 0, beyondLimit: 0 };
  const eligible = candidates.filter((c) => {
    const ok = c.probability >= o.minProbability && c.confidence >= o.minConfidence && c.overall >= o.minOverall;
    if (!ok) rejected.belowThreshold++;
    return ok;
  });
  eligible.sort((a, b) => b.overall - a.overall || b.probability - a.probability);
  const byMatch = new Map<string, Candidate[]>();
  const perMarket = new Map<MarketKey, number>();
  const picks: Candidate[] = [];
  for (const c of eligible) {
    if (picks.length >= o.limit) { rejected.beyondLimit++; continue; }
    const same = byMatch.get(c.matchId) ?? [];
    if (same.length >= o.maxPerMatch) { rejected.perMatchCap++; continue; }
    if (same.some((s) => correlated(s, c))) { rejected.correlated++; continue; }
    if ((perMarket.get(c.marketKey) ?? 0) >= o.maxPerMarket) { rejected.perMarketCap++; continue; }
    same.push(c); byMatch.set(c.matchId, same);
    perMarket.set(c.marketKey, (perMarket.get(c.marketKey) ?? 0) + 1);
    picks.push(c);
  }
  return { picks, rejected };
}
