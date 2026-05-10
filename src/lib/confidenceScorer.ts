import type { AIPrediction } from "./aiPredictionEngine";

export interface ScoredPrediction extends AIPrediction {
  is_value_bet: boolean;
  is_strong_pick: boolean;
}

/**
 * Client-side post-processor mirroring server-side enrichment.
 * Useful when consuming raw AI output before persistence.
 */
export function scoreAIPrediction(
  pred: AIPrediction,
  odds?: { home?: number; draw?: number; away?: number },
): ScoredPrediction {
  const impliedHome = odds?.home ? 1 / odds.home : 0;
  const aiHome = pred.win_probability?.home ?? 0;
  let edge = pred.edge_score ?? 0;
  let isValueBet = pred.is_value_bet ?? false;

  if (aiHome - impliedHome > 0.05) {
    isValueBet = true;
    edge = edge * 1.1;
  }

  let tier = pred.confidence_tier;
  if ((pred.risk_flags?.length ?? 0) > 2) {
    tier = tier === "HIGH" ? "MEDIUM" : "LOW";
  }

  const isStrongPick = tier === "HIGH" && edge > 8;

  return { ...pred, edge_score: edge, confidence_tier: tier, is_value_bet: isValueBet, is_strong_pick: isStrongPick };
}
