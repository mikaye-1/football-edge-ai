export type League =
  | "Premier League"
  | "La Liga"
  | "Serie A"
  | "Ligue 1"
  | "Saudi Pro League"
  | "MLS"
  | "Süper Lig";

export type ConfidenceLevel = "high" | "medium" | "low" | "very_low";

export type MarketType =
  | "1X2"
  | "Not to Win"
  | "Double Chance"
  | "Draw No Bet"
  | "Over/Under 2.5"
  | "Over/Under 1.5"
  | "Over/Under 3.5"
  | "BTTS"
  | "Correct Score"
  | "Handicap"
  | "HT/FT"
  | "Clean Sheet"
  | "Winning Margin"
  | "Corners O/U"
  | "Cards O/U"
  | string;

export interface Match {
  id: string;
  league: League;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  status: "upcoming" | "live" | "finished";
  score?: { home: number; away: number };
  minute?: number;
}

export interface OddsEntry {
  matchId: string;
  market: MarketType;
  outcome: string;
  bookmaker: string;
  odds: number;
  impliedProbability: number;
  timestamp: string;
}

export interface Prediction {
  matchId: string;
  market: MarketType;
  outcome: string;
  modelProbability: number;
  oddsImpliedProbability: number;
  formScore: number;
  consistency: number;
  finalScore: number;
  confidence: ConfidenceLevel;
  explanation: string;
}

export interface TeamStats {
  team: string;
  league: League;
  form: ("W" | "D" | "L")[];
  goalsScored: number;
  goalsConceded: number;
  cleanSheets: number;
  xG?: number;
  xGA?: number;
  possession: number;
  matchesPlayed: number;
}

export interface HeadToHead {
  homeTeam: string;
  awayTeam: string;
  matches: {
    date: string;
    homeGoals: number;
    awayGoals: number;
    competition: string;
  }[];
}

export interface OddsMovement {
  matchId: string;
  market: MarketType;
  outcome: string;
  history: { timestamp: string; odds: number }[];
}
