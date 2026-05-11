import { supabase } from "@/integrations/supabase/client";

export interface AIMatchData {
  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate: string;
  homeForm?: string[];
  awayForm?: string[];
  h2hHistory?: { date: string; homeGoals: number; awayGoals: number; winner: string }[];
  homeStanding?: { position: number; played: number; goalsFor: number; goalsAgainst: number; points: number };
  awayStanding?: { position: number; played: number; goalsFor: number; goalsAgainst: number; points: number };
  homeAvgGoalsScored?: number;
  homeAvgGoalsConceded?: number;
  awayAvgGoalsScored?: number;
  awayAvgGoalsConceded?: number;
  odds?: {
    home?: number; draw?: number; away?: number;
    over25?: number; under25?: number; btts_yes?: number; btts_no?: number;
  };
  currentModelWeights?: Record<string, unknown>;
  historicalAccuracy?: { byLeague?: Record<string, unknown> };
  injuryNews?: string[];
  venue?: string;
  isNeutralVenue?: boolean;
}

export interface AIPrediction {
  id: string;
  match_id: string;
  predicted_outcome: "home_win" | "draw" | "away_win";
  confidence_tier: "HIGH" | "MEDIUM" | "LOW";
  win_probability: { home: number; draw: number; away: number };
  edge_score: number;
  value_bet: { market: string; recommendation: string; reasoning: string } | null;
  key_factors: string[];
  risk_flags: string[];
  ai_summary: string | null;
  preview_text: string | null;
  btts_prediction: "YES" | "NO" | null;
  over_under_prediction: "OVER_2.5" | "UNDER_2.5" | null;
  recommended_markets: string[];
  is_value_bet: boolean;
  is_strong_pick: boolean;
}

import { enqueueAI } from "./aiQueue";

export async function generateAIPrediction(matchId: string, matchData: AIMatchData, force = false): Promise<AIPrediction> {
  return enqueueAI(async () => {
    const { data, error } = await supabase.functions.invoke("generate-ai-prediction", {
      body: { matchId, matchData, force },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.prediction as AIPrediction;
  });
}

export async function getCachedAIPrediction(matchId: string): Promise<AIPrediction | null> {
  const { data, error } = await supabase
    .from("ai_predictions" as any)
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as AIPrediction) ?? null;
}
