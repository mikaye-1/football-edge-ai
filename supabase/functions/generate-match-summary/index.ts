import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { matchId, prediction, matchData } = await req.json();
    if (!matchId || !prediction) {
      return new Response(JSON.stringify({ error: "matchId and prediction required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await supabase
      .from("ai_predictions").select("preview_text").eq("match_id", matchId).maybeSingle();
    if (existing?.preview_text) {
      return new Response(JSON.stringify({ summary: existing.preview_text, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Template-based preview from the in-house model output (no external AI calls)
    const home = matchData?.homeTeam ?? "Home", away = matchData?.awayTeam ?? "Away";
    const pick = prediction.predicted_outcome === "home_win" ? home : prediction.predicted_outcome === "away_win" ? away : "a draw";
    const factor = Array.isArray(prediction.key_factors) && prediction.key_factors[0] ? prediction.key_factors[0] : "recent results";
    const bet = prediction.value_bet?.recommendation ?? (Array.isArray(prediction.recommended_markets) ? prediction.recommended_markets[0] : `1X2: ${pick}`);
    const summary = `${home} vs ${away}: our model leans towards ${pick}. Key factor — ${factor}. Recommended: ${bet} (${String(prediction.confidence_tier ?? "LOW").toLowerCase()} confidence).`;

    await supabase.from("ai_predictions").update({ preview_text: summary }).eq("match_id", matchId);

    return new Response(JSON.stringify({ summary, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-match-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
