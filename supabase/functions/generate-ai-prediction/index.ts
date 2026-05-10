import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an elite football prediction analyst with deep expertise in:
- Statistical modeling of football outcomes
- Betting market inefficiency detection
- Team psychology and motivation analysis
- Tactical matchup analysis
- Expected Goals (xG) theory
- Value betting and closing line value (CLV)

Your role is to analyze match data provided and output a structured prediction.

You must:
1. Identify the most statistically significant factors for THIS specific match
2. Detect any market inefficiencies between our model probability and bookmaker odds
3. Weigh recent form more heavily than season-long averages if there is a clear momentum shift in the last 3 games
4. Factor in H2H psychology — some teams consistently underperform vs specific opponents
5. Identify if this is a HIGH CONFIDENCE, MEDIUM CONFIDENCE, or LOW CONFIDENCE pick
6. Flag any "traps" — matches that look obvious but have hidden risk factors

Respond ONLY by calling the submit_prediction function with the structured prediction.`;

const PREDICTION_TOOL = {
  type: "function",
  function: {
    name: "submit_prediction",
    description: "Submit a structured football match prediction.",
    parameters: {
      type: "object",
      properties: {
        predicted_outcome: { type: "string", enum: ["home_win", "draw", "away_win"] },
        confidence_tier: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
        win_probability: {
          type: "object",
          properties: {
            home: { type: "number" },
            draw: { type: "number" },
            away: { type: "number" },
          },
          required: ["home", "draw", "away"],
          additionalProperties: false,
        },
        edge_score: { type: "number", description: "Edge percentage 0-100" },
        value_bet: {
          type: "object",
          properties: {
            market: { type: "string" },
            recommendation: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["market", "recommendation", "reasoning"],
          additionalProperties: false,
        },
        key_factors: { type: "array", items: { type: "string" } },
        risk_flags: { type: "array", items: { type: "string" } },
        ai_summary: { type: "string" },
        btts_prediction: { type: "string", enum: ["YES", "NO"] },
        over_under_prediction: { type: "string", enum: ["OVER_2.5", "UNDER_2.5"] },
        recommended_markets: { type: "array", items: { type: "string" } },
      },
      required: [
        "predicted_outcome", "confidence_tier", "win_probability", "edge_score",
        "value_bet", "key_factors", "risk_flags", "ai_summary",
        "btts_prediction", "over_under_prediction", "recommended_markets",
      ],
      additionalProperties: false,
    },
  },
};

function buildUserPrompt(d: any): string {
  const h2h = (d.h2hHistory ?? []).map((m: any) =>
    `${m.date}: ${m.homeGoals}-${m.awayGoals} (${m.winner})`).join("\n") || "No recent meetings";
  return `Analyze this upcoming match and provide your prediction:

MATCH: ${d.homeTeam} vs ${d.awayTeam}
LEAGUE: ${d.league}
DATE: ${d.matchDate}
VENUE: ${d.venue ?? "Home stadium"} ${d.isNeutralVenue ? "(Neutral Venue)" : ""}

RECENT FORM (last 5):
- ${d.homeTeam}: ${(d.homeForm ?? []).join(", ") || "n/a"}
- ${d.awayTeam}: ${(d.awayForm ?? []).join(", ") || "n/a"}

HEAD TO HEAD (last 5 meetings):
${h2h}

LEAGUE STANDINGS:
- ${d.homeTeam}: Pos ${d.homeStanding?.position ?? "?"}, Pts ${d.homeStanding?.points ?? "?"}, GF ${d.homeStanding?.goalsFor ?? "?"}, GA ${d.homeStanding?.goalsAgainst ?? "?"}
- ${d.awayTeam}: Pos ${d.awayStanding?.position ?? "?"}, Pts ${d.awayStanding?.points ?? "?"}, GF ${d.awayStanding?.goalsFor ?? "?"}, GA ${d.awayStanding?.goalsAgainst ?? "?"}

SCORING AVERAGES:
- ${d.homeTeam}: Scores ${d.homeAvgGoalsScored}/game, Concedes ${d.homeAvgGoalsConceded}/game
- ${d.awayTeam}: Scores ${d.awayAvgGoalsScored}/game, Concedes ${d.awayAvgGoalsConceded}/game

CURRENT BOOKMAKER ODDS:
- 1X2: Home ${d.odds?.home} | Draw ${d.odds?.draw} | Away ${d.odds?.away}
- Over 2.5: ${d.odds?.over25} | Under 2.5: ${d.odds?.under25}
- BTTS Yes: ${d.odds?.btts_yes} | No: ${d.odds?.btts_no}

INJURY NEWS: ${(d.injuryNews ?? []).join(", ") || "None reported"}

OUR MODEL PERFORMANCE CONTEXT:
- Current model weights: ${JSON.stringify(d.currentModelWeights ?? {})}
- Historical accuracy in this league: ${d.historicalAccuracy?.byLeague?.[d.league] ?? "Insufficient data"}

Based on ALL of the above, call submit_prediction with your structured prediction.`;
}

function enrichConfidence(pred: any, odds: any) {
  const impliedHome = odds?.home ? 1 / odds.home : 0;
  const aiHome = pred.win_probability?.home ?? 0;
  let edge = pred.edge_score ?? 0;
  let isValueBet = false;
  if (aiHome - impliedHome > 0.05) {
    isValueBet = true;
    edge = edge * 1.1;
  }
  // Risk downgrade
  let tier = pred.confidence_tier;
  if ((pred.risk_flags?.length ?? 0) > 2) {
    tier = tier === "HIGH" ? "MEDIUM" : tier === "MEDIUM" ? "LOW" : "LOW";
  }
  const isStrongPick = tier === "HIGH" && edge > 8;
  return { ...pred, edge_score: edge, confidence_tier: tier, is_value_bet: isValueBet, is_strong_pick: isStrongPick };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { matchId, matchData, force } = await req.json();
    if (!matchId || !matchData) {
      return new Response(JSON.stringify({ error: "matchId and matchData required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Cache check
    if (!force) {
      const { data: cached } = await supabase
        .from("ai_predictions").select("*").eq("match_id", matchId).maybeSingle();
      if (cached) {
        return new Response(JSON.stringify({ prediction: cached, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(matchData) },
        ],
        tools: [PREDICTION_TOOL],
        tool_choice: { type: "function", function: { name: "submit_prediction" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway failed", details: txt }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned by AI");
    const raw = JSON.parse(toolCall.function.arguments);
    const enriched = enrichConfidence(raw, matchData.odds);

    // Upsert into cache
    const { data: saved, error: upErr } = await supabase
      .from("ai_predictions")
      .upsert({
        match_id: matchId,
        predicted_outcome: enriched.predicted_outcome,
        confidence_tier: enriched.confidence_tier,
        win_probability: enriched.win_probability,
        edge_score: enriched.edge_score,
        value_bet: enriched.value_bet,
        key_factors: enriched.key_factors,
        risk_flags: enriched.risk_flags,
        ai_summary: enriched.ai_summary,
        btts_prediction: enriched.btts_prediction,
        over_under_prediction: enriched.over_under_prediction,
        recommended_markets: enriched.recommended_markets,
        is_value_bet: enriched.is_value_bet,
        is_strong_pick: enriched.is_strong_pick,
      }, { onConflict: "match_id" })
      .select()
      .single();

    if (upErr) throw upErr;

    return new Response(JSON.stringify({ prediction: saved, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-ai-prediction error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
