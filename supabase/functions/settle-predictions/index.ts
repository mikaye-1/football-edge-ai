import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function determine1X2Outcome(homeScore: number, awayScore: number): string {
  if (homeScore > awayScore) return "Home Win";
  if (awayScore > homeScore) return "Away Win";
  return "Draw";
}

function determineNotToWinOutcome(homeScore: number, awayScore: number): string[] {
  const results: string[] = [];
  if (homeScore <= awayScore) results.push("Home Not to Win");
  if (awayScore <= homeScore) results.push("Away Not to Win");
  if (homeScore !== awayScore) results.push("No Draw");
  return results;
}

function determineBTTS(homeScore: number, awayScore: number): string {
  return homeScore > 0 && awayScore > 0 ? "Both Teams Score" : "No BTTS";
}

function determineOverUnder(totalGoals: number, line: number): string {
  return totalGoals > line ? "Over" : "Under";
}

function determineDoubleChance(homeScore: number, awayScore: number): string[] {
  const results: string[] = [];
  if (homeScore >= awayScore) results.push("Home or Draw");
  if (awayScore >= homeScore) results.push("Away or Draw");
  if (homeScore !== awayScore) results.push("Home or Away");
  return results;
}

function determineDrawNoBet(homeScore: number, awayScore: number): string | null {
  if (homeScore > awayScore) return "Home Win";
  if (awayScore > homeScore) return "Away Win";
  return null;
}

interface SettlementResult {
  market: string;
  outcome: string;
  isCorrect: boolean;
}

interface MatchStatsLite {
  home_corners: number | null;
  away_corners: number | null;
  home_yellow_cards: number | null;
  away_yellow_cards: number | null;
  home_red_cards: number | null;
  away_red_cards: number | null;
}

function settleMarket(
  market: string,
  predictedOutcome: string,
  homeScore: number,
  awayScore: number,
  homeTeam?: string,
  awayTeam?: string,
  stats?: MatchStatsLite | null
): SettlementResult | null {
  const totalGoals = homeScore + awayScore;

  if (market === "1X2") {
    const actual = determine1X2Outcome(homeScore, awayScore);
    return { market, outcome: actual, isCorrect: predictedOutcome === actual };
  }

  if (market === "Not to Win") {
    const correctOutcomes = determineNotToWinOutcome(homeScore, awayScore);
    return { market, outcome: correctOutcomes.join(", "), isCorrect: correctOutcomes.includes(predictedOutcome) };
  }

  if (market === "BTTS") {
    const actual = determineBTTS(homeScore, awayScore);
    return { market, outcome: actual, isCorrect: predictedOutcome === actual };
  }

  if (market.startsWith("Over/Under")) {
    const line = parseFloat(market.split(" ")[1]);
    if (isNaN(line)) return null;
    const actual = determineOverUnder(totalGoals, line);
    return { market, outcome: actual, isCorrect: predictedOutcome === actual };
  }

  if (market === "Double Chance") {
    const correctOutcomes = determineDoubleChance(homeScore, awayScore);
    return { market, outcome: correctOutcomes.join(", "), isCorrect: correctOutcomes.includes(predictedOutcome) };
  }

  if (market === "Draw No Bet") {
    const actual = determineDrawNoBet(homeScore, awayScore);
    if (actual === null) return null;
    return { market, outcome: actual, isCorrect: predictedOutcome === actual };
  }

  if (market.startsWith("Handicap")) {
    const parts = market.split(" ");
    const line = parseFloat(parts[parts.length - 1]);
    if (isNaN(line)) return null;
    const adjustedHome = homeScore + line;
    let actual: string;
    if (adjustedHome > awayScore) actual = "Home";
    else if (adjustedHome < awayScore) actual = "Away";
    else actual = "Draw";
    let normalizedPrediction = predictedOutcome;
    if (homeTeam && predictedOutcome.includes(homeTeam)) normalizedPrediction = "Home";
    else if (awayTeam && predictedOutcome.includes(awayTeam)) normalizedPrediction = "Away";
    return { market, outcome: actual, isCorrect: normalizedPrediction === actual };
  }

  if (market.startsWith("Corners") || market.startsWith("Cards")) {
    // These are Over/Under markets for corners/cards - we can't verify actual stats
    // from score data alone, so we skip them unless we have the data
    // For now, return null to skip settlement of these markets
    return null;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get finished matches
    const { data: finishedMatches, error: matchErr } = await supabase
      .from("matches")
      .select("id, home_team, away_team, home_score, away_score")
      .eq("status", "finished")
      .not("home_score", "is", null)
      .not("away_score", "is", null);

    if (matchErr) throw matchErr;
    if (!finishedMatches || finishedMatches.length === 0) {
      return new Response(JSON.stringify({ success: true, settled: 0, message: "No finished matches to settle" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchIds = finishedMatches.map(m => m.id);

    const { data: existingResults } = await supabase
      .from("prediction_results")
      .select("prediction_id")
      .in("match_id", matchIds);

    const settledPredictionIds = new Set((existingResults ?? []).map(r => r.prediction_id));

    // Get unsettled predictions with full data
    const { data: predictions, error: predErr } = await supabase
      .from("predictions")
      .select("id, match_id, market, outcome, final_score, model_probability, odds_implied_probability, confidence")
      .in("match_id", matchIds);

    if (predErr) throw predErr;

    const unsettled = (predictions ?? []).filter(p => !settledPredictionIds.has(p.id));

    if (unsettled.length === 0) {
      return new Response(JSON.stringify({ success: true, settled: 0, message: "All predictions already settled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchLookup = new Map(finishedMatches.map(m => [m.id, m]));
    const resultRows: any[] = [];

    for (const pred of unsettled) {
      const match = matchLookup.get(pred.match_id);
      if (!match || match.home_score === null || match.away_score === null) continue;

      const result = settleMarket(pred.market, pred.outcome, match.home_score, match.away_score, match.home_team, match.away_team);
      if (!result) continue;

      const edge = ((pred.model_probability - pred.odds_implied_probability) * 100);

      resultRows.push({
        prediction_id: pred.id,
        match_id: pred.match_id,
        market: pred.market,
        predicted_outcome: pred.outcome,
        predicted_probability: pred.final_score,
        actual_outcome: result.outcome,
        was_correct: result.isCorrect,
        settled_at: new Date().toISOString(),
        edge_percentage: Math.round(edge * 10) / 10,
        confidence: pred.confidence || "low",
      });
    }

    let inserted = 0;
    if (resultRows.length > 0) {
      for (let i = 0; i < resultRows.length; i += 500) {
        const batch = resultRows.slice(i, i + 500);
        const { error: insertErr } = await supabase.from("prediction_results").insert(batch);
        if (insertErr) {
          console.error("Insert error:", insertErr);
        } else {
          inserted += batch.length;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      finished_matches: finishedMatches.length,
      settled: inserted,
      skipped: unsettled.length - resultRows.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Settlement error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
