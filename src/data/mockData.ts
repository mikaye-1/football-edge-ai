import type { Match, Prediction, TeamStats, OddsEntry, HeadToHead, OddsMovement, League, ConfidenceLevel } from "./types";

const leagues: League[] = [
  "Premier League", "La Liga", "Serie A", "Ligue 1",
  "Saudi Pro League", "MLS", "Süper Lig"
];

export const matches: Match[] = [
  { id: "m1", league: "Premier League", homeTeam: "Arsenal", awayTeam: "Chelsea", kickoffTime: "2026-03-30T15:00:00Z", status: "live", score: { home: 1, away: 0 }, minute: 34 },
  { id: "m2", league: "Premier League", homeTeam: "Liverpool", awayTeam: "Man City", kickoffTime: "2026-03-30T17:30:00Z", status: "upcoming" },
  { id: "m3", league: "Premier League", homeTeam: "Man United", awayTeam: "Tottenham", kickoffTime: "2026-03-30T20:00:00Z", status: "upcoming" },
  { id: "m4", league: "La Liga", homeTeam: "Real Madrid", awayTeam: "Barcelona", kickoffTime: "2026-03-30T20:00:00Z", status: "upcoming" },
  { id: "m5", league: "La Liga", homeTeam: "Atlético Madrid", awayTeam: "Sevilla", kickoffTime: "2026-03-30T18:00:00Z", status: "upcoming" },
  { id: "m6", league: "Serie A", homeTeam: "AC Milan", awayTeam: "Inter Milan", kickoffTime: "2026-03-30T19:45:00Z", status: "upcoming" },
  { id: "m7", league: "Serie A", homeTeam: "Juventus", awayTeam: "Napoli", kickoffTime: "2026-03-30T17:00:00Z", status: "live", score: { home: 2, away: 1 }, minute: 67 },
  { id: "m8", league: "Ligue 1", homeTeam: "PSG", awayTeam: "Marseille", kickoffTime: "2026-03-30T20:45:00Z", status: "upcoming" },
  { id: "m9", league: "Saudi Pro League", homeTeam: "Al Hilal", awayTeam: "Al Nassr", kickoffTime: "2026-03-30T19:00:00Z", status: "upcoming" },
  { id: "m10", league: "MLS", homeTeam: "LA Galaxy", awayTeam: "LAFC", kickoffTime: "2026-03-31T02:00:00Z", status: "upcoming" },
  { id: "m11", league: "Süper Lig", homeTeam: "Galatasaray", awayTeam: "Fenerbahçe", kickoffTime: "2026-03-30T18:00:00Z", status: "upcoming" },
  { id: "m12", league: "Premier League", homeTeam: "Newcastle", awayTeam: "Aston Villa", kickoffTime: "2026-03-30T15:00:00Z", status: "live", score: { home: 0, away: 0 }, minute: 22 },
];

function getConfidence(score: number): ConfidenceLevel {
  if (score >= 0.72) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

function genPrediction(matchId: string, market: string, outcome: string, mp: number, oi: number, fs: number, cons: number, explanation: string): Prediction {
  const finalScore = 0.35 * mp + 0.3 * oi + 0.2 * fs + 0.15 * cons;
  return {
    matchId, market: market as any, outcome,
    modelProbability: mp, oddsImpliedProbability: oi, formScore: fs, consistency: cons,
    finalScore, confidence: getConfidence(finalScore), explanation
  };
}

export const predictions: Prediction[] = [
  genPrediction("m1", "Over/Under 2.5", "Over 2.5", 0.78, 0.72, 0.85, 0.80, "Arsenal avg 2.3 goals at home, Chelsea concede 1.4 per away match. Combined xG of 3.1."),
  genPrediction("m1", "BTTS", "Yes", 0.74, 0.68, 0.76, 0.72, "Both teams have scored in 7 of last 10 H2H. Chelsea rarely fail to score away."),
  genPrediction("m1", "1X2", "Home Win", 0.61, 0.58, 0.72, 0.65, "Arsenal unbeaten in 12 home matches. Strong defensive record at Emirates."),
  genPrediction("m1", "Clean Sheet", "No Clean Sheet", 0.82, 0.76, 0.79, 0.85, "Only 2 clean sheets in last 10 meetings between these sides."),

  genPrediction("m2", "1X2", "Home Win", 0.55, 0.52, 0.68, 0.60, "Liverpool strong at Anfield but City's away form makes this tight."),
  genPrediction("m2", "Over/Under 2.5", "Over 2.5", 0.81, 0.75, 0.88, 0.82, "Last 8 meetings produced 3+ goals. Combined scoring avg of 3.8."),
  genPrediction("m2", "BTTS", "Yes", 0.85, 0.79, 0.82, 0.88, "Both scored in 9 of last 10 H2H. Two most prolific attacks in the league."),
  genPrediction("m2", "Correct Score", "2-1", 0.14, 0.11, 0.65, 0.45, "Most common scoreline in recent meetings between these two."),

  genPrediction("m3", "1X2", "Home Win", 0.48, 0.45, 0.55, 0.50, "United inconsistent. Tottenham dangerous on counter."),
  genPrediction("m3", "Over/Under 2.5", "Under 2.5", 0.56, 0.52, 0.60, 0.58, "Both sides defensively improved recently. Tactical, cagey affair expected."),

  genPrediction("m4", "1X2", "Home Win", 0.52, 0.50, 0.65, 0.55, "Bernabéu advantage. Madrid's home form dominant this season."),
  genPrediction("m4", "Over/Under 2.5", "Over 2.5", 0.76, 0.71, 0.82, 0.78, "El Clásico typically high-scoring. Both teams average 2+ goals."),
  genPrediction("m4", "BTTS", "Yes", 0.80, 0.74, 0.78, 0.82, "Both teams have scored in 12 of last 15 Clásicos."),
  genPrediction("m4", "Double Chance", "1X", 0.78, 0.73, 0.80, 0.75, "Madrid rarely lose at home to Barcelona in recent years."),

  genPrediction("m5", "1X2", "Home Win", 0.68, 0.64, 0.75, 0.70, "Atlético dominant at Metropolitano. Sevilla struggling away."),
  genPrediction("m5", "Over/Under 2.5", "Under 2.5", 0.62, 0.58, 0.70, 0.65, "Simeone's side keeps things tight. Low-scoring affairs typical."),

  genPrediction("m6", "BTTS", "Yes", 0.77, 0.72, 0.80, 0.75, "Derby della Madonnina always delivers goals from both sides."),
  genPrediction("m6", "Over/Under 2.5", "Over 2.5", 0.73, 0.69, 0.78, 0.74, "Last 6 derbies averaged 3.2 goals."),

  genPrediction("m7", "1X2", "Home Win", 0.58, 0.55, 0.70, 0.62, "Juventus strong at Allianz Stadium. Leading 2-1 currently."),
  genPrediction("m7", "Over/Under 2.5", "Over 2.5", 0.88, 0.82, 0.85, 0.90, "Already 3 goals at 67 mins. Napoli pushing for equalizer."),

  genPrediction("m8", "1X2", "Home Win", 0.72, 0.68, 0.82, 0.75, "PSG dominant at Parc des Princes. Marseille poor away form."),
  genPrediction("m8", "Over/Under 2.5", "Over 2.5", 0.70, 0.65, 0.75, 0.72, "Le Classique typically high-intensity with goals."),

  genPrediction("m9", "Over/Under 2.5", "Over 2.5", 0.82, 0.76, 0.88, 0.84, "Both teams feature world-class forwards. High-scoring league."),
  genPrediction("m9", "BTTS", "Yes", 0.79, 0.73, 0.82, 0.80, "Al Hilal and Al Nassr both score freely. Defensively open."),

  genPrediction("m10", "BTTS", "Yes", 0.75, 0.70, 0.78, 0.73, "El Tráfico always delivers. Both sides attacking-minded."),
  genPrediction("m10", "Over/Under 2.5", "Over 2.5", 0.71, 0.66, 0.76, 0.70, "Average of 3.4 goals in El Tráfico history."),

  genPrediction("m11", "1X2", "Home Win", 0.60, 0.56, 0.72, 0.64, "Galatasaray strong at home in intercontinental derby."),
  genPrediction("m11", "Over/Under 2.5", "Over 2.5", 0.68, 0.63, 0.74, 0.70, "Turkish derbies are fiery with plenty of goals."),
  genPrediction("m11", "BTTS", "Yes", 0.72, 0.67, 0.75, 0.70, "Both teams rarely blank in this fixture."),

  genPrediction("m12", "1X2", "Draw", 0.35, 0.32, 0.50, 0.42, "0-0 at 22 mins. Both teams cautious in approach."),
  genPrediction("m12", "Over/Under 2.5", "Under 2.5", 0.65, 0.60, 0.68, 0.62, "Tight contest, low xG generated so far."),
];

export const teamStats: TeamStats[] = [
  { team: "Arsenal", league: "Premier League", form: ["W","W","D","W","W"], goalsScored: 52, goalsConceded: 18, cleanSheets: 12, xG: 54.2, xGA: 20.1, possession: 62, matchesPlayed: 28 },
  { team: "Chelsea", league: "Premier League", form: ["W","L","W","D","W"], goalsScored: 41, goalsConceded: 28, cleanSheets: 8, xG: 39.5, xGA: 29.3, possession: 56, matchesPlayed: 28 },
  { team: "Liverpool", league: "Premier League", form: ["W","W","W","D","W"], goalsScored: 58, goalsConceded: 22, cleanSheets: 11, xG: 55.8, xGA: 24.1, possession: 60, matchesPlayed: 28 },
  { team: "Man City", league: "Premier League", form: ["W","D","W","W","L"], goalsScored: 55, goalsConceded: 25, cleanSheets: 10, xG: 57.1, xGA: 23.8, possession: 65, matchesPlayed: 28 },
  { team: "Real Madrid", league: "La Liga", form: ["W","W","W","D","W"], goalsScored: 60, goalsConceded: 20, cleanSheets: 13, xG: 58.4, xGA: 22.0, possession: 61, matchesPlayed: 27 },
  { team: "Barcelona", league: "La Liga", form: ["W","W","L","W","W"], goalsScored: 62, goalsConceded: 24, cleanSheets: 10, xG: 63.1, xGA: 25.5, possession: 64, matchesPlayed: 27 },
  { team: "PSG", league: "Ligue 1", form: ["W","W","W","W","D"], goalsScored: 65, goalsConceded: 15, cleanSheets: 15, xG: 62.0, xGA: 17.2, possession: 63, matchesPlayed: 26 },
  { team: "Al Hilal", league: "Saudi Pro League", form: ["W","W","W","W","W"], goalsScored: 58, goalsConceded: 12, cleanSheets: 14, xG: 55.0, xGA: 14.8, possession: 58, matchesPlayed: 22 },
  { team: "Galatasaray", league: "Süper Lig", form: ["W","D","W","W","W"], goalsScored: 55, goalsConceded: 22, cleanSheets: 9, xG: 52.3, xGA: 24.1, possession: 57, matchesPlayed: 26 },
];

export const oddsData: OddsEntry[] = [
  { matchId: "m1", market: "1X2", outcome: "Home", bookmaker: "Bet365", odds: 1.72, impliedProbability: 0.58, timestamp: "2026-03-30T14:50:00Z" },
  { matchId: "m1", market: "1X2", outcome: "Draw", bookmaker: "Bet365", odds: 3.60, impliedProbability: 0.28, timestamp: "2026-03-30T14:50:00Z" },
  { matchId: "m1", market: "1X2", outcome: "Away", bookmaker: "Bet365", odds: 4.50, impliedProbability: 0.22, timestamp: "2026-03-30T14:50:00Z" },
  { matchId: "m1", market: "Over/Under 2.5", outcome: "Over", bookmaker: "Pinnacle", odds: 1.38, impliedProbability: 0.72, timestamp: "2026-03-30T14:50:00Z" },
  { matchId: "m1", market: "BTTS", outcome: "Yes", bookmaker: "Pinnacle", odds: 1.47, impliedProbability: 0.68, timestamp: "2026-03-30T14:50:00Z" },
  { matchId: "m2", market: "1X2", outcome: "Home", bookmaker: "Bet365", odds: 1.90, impliedProbability: 0.53, timestamp: "2026-03-30T14:50:00Z" },
  { matchId: "m2", market: "Over/Under 2.5", outcome: "Over", bookmaker: "Pinnacle", odds: 1.33, impliedProbability: 0.75, timestamp: "2026-03-30T14:50:00Z" },
  { matchId: "m4", market: "1X2", outcome: "Home", bookmaker: "Bet365", odds: 2.00, impliedProbability: 0.50, timestamp: "2026-03-30T14:50:00Z" },
  { matchId: "m4", market: "Over/Under 2.5", outcome: "Over", bookmaker: "Pinnacle", odds: 1.40, impliedProbability: 0.71, timestamp: "2026-03-30T14:50:00Z" },
];

export const oddsMovement: OddsMovement[] = [
  {
    matchId: "m1", market: "1X2", outcome: "Home",
    history: [
      { timestamp: "2026-03-28T10:00:00Z", odds: 1.85 },
      { timestamp: "2026-03-28T18:00:00Z", odds: 1.80 },
      { timestamp: "2026-03-29T10:00:00Z", odds: 1.78 },
      { timestamp: "2026-03-29T18:00:00Z", odds: 1.75 },
      { timestamp: "2026-03-30T08:00:00Z", odds: 1.73 },
      { timestamp: "2026-03-30T12:00:00Z", odds: 1.72 },
      { timestamp: "2026-03-30T14:30:00Z", odds: 1.68 },
    ]
  },
  {
    matchId: "m1", market: "Over/Under 2.5", outcome: "Over",
    history: [
      { timestamp: "2026-03-28T10:00:00Z", odds: 1.50 },
      { timestamp: "2026-03-28T18:00:00Z", odds: 1.45 },
      { timestamp: "2026-03-29T10:00:00Z", odds: 1.42 },
      { timestamp: "2026-03-29T18:00:00Z", odds: 1.40 },
      { timestamp: "2026-03-30T08:00:00Z", odds: 1.39 },
      { timestamp: "2026-03-30T14:30:00Z", odds: 1.38 },
    ]
  },
  {
    matchId: "m4", market: "1X2", outcome: "Home",
    history: [
      { timestamp: "2026-03-28T10:00:00Z", odds: 2.20 },
      { timestamp: "2026-03-28T18:00:00Z", odds: 2.15 },
      { timestamp: "2026-03-29T10:00:00Z", odds: 2.10 },
      { timestamp: "2026-03-29T18:00:00Z", odds: 2.05 },
      { timestamp: "2026-03-30T08:00:00Z", odds: 2.02 },
      { timestamp: "2026-03-30T14:00:00Z", odds: 2.00 },
    ]
  }
];

export const headToHead: HeadToHead[] = [
  {
    homeTeam: "Arsenal", awayTeam: "Chelsea",
    matches: [
      { date: "2025-10-20", homeGoals: 2, awayGoals: 1, competition: "Premier League" },
      { date: "2025-04-15", homeGoals: 1, awayGoals: 1, competition: "Premier League" },
      { date: "2024-10-28", homeGoals: 3, awayGoals: 0, competition: "Premier League" },
      { date: "2024-04-20", homeGoals: 2, awayGoals: 2, competition: "Premier League" },
      { date: "2023-11-05", homeGoals: 1, awayGoals: 0, competition: "Premier League" },
    ]
  },
  {
    homeTeam: "Liverpool", awayTeam: "Man City",
    matches: [
      { date: "2025-11-30", homeGoals: 3, awayGoals: 2, competition: "Premier League" },
      { date: "2025-03-10", homeGoals: 2, awayGoals: 1, competition: "Premier League" },
      { date: "2024-11-25", homeGoals: 1, awayGoals: 3, competition: "Premier League" },
      { date: "2024-03-15", homeGoals: 2, awayGoals: 2, competition: "Premier League" },
    ]
  },
  {
    homeTeam: "Real Madrid", awayTeam: "Barcelona",
    matches: [
      { date: "2025-10-26", homeGoals: 2, awayGoals: 1, competition: "La Liga" },
      { date: "2025-04-12", homeGoals: 3, awayGoals: 3, competition: "La Liga" },
      { date: "2024-10-28", homeGoals: 0, awayGoals: 4, competition: "La Liga" },
      { date: "2024-04-21", homeGoals: 3, awayGoals: 2, competition: "La Liga" },
    ]
  }
];

export const leagueFlags: Record<League, string> = {
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "La Liga": "🇪🇸",
  "Serie A": "🇮🇹",
  "Ligue 1": "🇫🇷",
  "Saudi Pro League": "🇸🇦",
  "MLS": "🇺🇸",
  "Süper Lig": "🇹🇷",
};

export function getMatchPredictions(matchId: string): Prediction[] {
  return predictions
    .filter(p => p.matchId === matchId)
    .sort((a, b) => b.finalScore - a.finalScore);
}

export function getMatchById(matchId: string): Match | undefined {
  return matches.find(m => m.id === matchId);
}

export function getTeamStats(teamName: string): TeamStats | undefined {
  return teamStats.find(t => t.team === teamName);
}

export function getHeadToHead(home: string, away: string): HeadToHead | undefined {
  return headToHead.find(h => h.homeTeam === home && h.awayTeam === away);
}

export function getOddsMovement(matchId: string): OddsMovement[] {
  return oddsMovement.filter(o => o.matchId === matchId);
}
