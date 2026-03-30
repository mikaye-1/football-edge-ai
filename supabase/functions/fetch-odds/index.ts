import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The Odds API sport keys mapped to our league names
const SPORT_KEYS: Record<string, string> = {
  "soccer_epl": "Premier League",
  "soccer_spain_la_liga": "La Liga",
  "soccer_italy_serie_a": "Serie A",
  "soccer_france_ligue_one": "Ligue 1",
  "soccer_saudi_professional_league": "Saudi Pro League",
  "soccer_usa_mls": "MLS",
  "soccer_turkey_super_league": "Süper Lig",
};

interface OddsAPIEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: {
    key: string;
    title: string;
    markets: {
      key: string;
      outcomes: {
        name: string;
        price: number;
      }[];
    }[];
  }[];
}

function getConfidence(score: number): string {
  if (score >= 0.72) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

function generateExplanation(market: string, outcome: string, impliedProb: number, homeTeam: string, awayTeam: string): string {
  const pct = (impliedProb * 100).toFixed(0);
  if (market === "h2h") {
    if (outcome === homeTeam) return `${homeTeam} favored at ${pct}% implied probability based on current market odds.`;
    if (outcome === awayTeam) return `${awayTeam} seen as likely winners with ${pct}% market expectation.`;
    return `Draw expected at ${pct}% probability based on bookmaker pricing.`;
  }
  if (market === "totals") {
    return `${outcome} goals market priced at ${pct}% implied probability across bookmakers.`;
  }
  return `${outcome} in ${market} market at ${pct}% implied probability.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get("THE_ODDS_API_KEY");
    if (!API_KEY) throw new Error("THE_ODDS_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const sportKeys = Object.keys(SPORT_KEYS);
    let totalMatches = 0;
    let totalOdds = 0;
    let totalPredictions = 0;

    for (const sportKey of sportKeys) {
      const league = SPORT_KEYS[sportKey];

      // Fetch odds from The Odds API
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=us,eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`;

      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        console.log(`Skipping ${sportKey}: fetch failed`);
        continue;
      }

      if (!response.ok) {
        console.log(`Skipping ${sportKey}: ${response.status}`);
        continue;
      }

      const events: OddsAPIEvent[] = await response.json();
      if (!events || events.length === 0) continue;

      for (const event of events) {
        // Upsert match
        const { data: matchData, error: matchErr } = await supabase
          .from("matches")
          .upsert({
            external_id: event.id,
            sport_key: sportKey,
            league,
            home_team: event.home_team,
            away_team: event.away_team,
            kickoff_time: event.commence_time,
            status: new Date(event.commence_time) <= new Date() ? "live" : "upcoming",
          }, { onConflict: "external_id" })
          .select("id")
          .single();

        if (matchErr || !matchData) {
          console.error(`Match upsert error for ${event.id}:`, matchErr);
          continue;
        }

        const matchId = matchData.id;
        totalMatches++;

        // Delete old odds for this match
        await supabase.from("odds").delete().eq("match_id", matchId);

        // Delete old predictions for this match
        await supabase.from("predictions").delete().eq("match_id", matchId);

        if (!event.bookmakers || event.bookmakers.length === 0) continue;

        const oddsRows: any[] = [];
        const predMap = new Map<string, { probSum: number; count: number; bestOdds: number; bookmaker: string; market: string; outcome: string }>();

        for (const bk of event.bookmakers) {
          for (const mkt of bk.markets) {
            const marketName = mkt.key === "h2h" ? "1X2" : mkt.key === "totals" ? "Over/Under 2.5" : mkt.key;

            for (const oc of mkt.outcomes) {
              const outcomeName = mkt.key === "h2h"
                ? (oc.name === event.home_team ? "Home Win" : oc.name === event.away_team ? "Away Win" : "Draw")
                : oc.name;

              const impliedProb = 1 / oc.price;

              oddsRows.push({
                match_id: matchId,
                market: marketName,
                outcome: outcomeName,
                bookmaker: bk.title,
                odds: oc.price,
                implied_probability: impliedProb,
              });

              const key = `${marketName}::${outcomeName}`;
              const existing = predMap.get(key);
              if (existing) {
                existing.probSum += impliedProb;
                existing.count++;
                if (oc.price > existing.bestOdds) {
                  existing.bestOdds = oc.price;
                  existing.bookmaker = bk.title;
                }
              } else {
                predMap.set(key, {
                  probSum: impliedProb,
                  count: 1,
                  bestOdds: oc.price,
                  bookmaker: bk.title,
                  market: marketName,
                  outcome: outcomeName,
                });
              }
            }
          }
        }

        // Insert odds
        if (oddsRows.length > 0) {
          const { error: oddsErr } = await supabase.from("odds").insert(oddsRows);
          if (oddsErr) console.error("Odds insert error:", oddsErr);
          else totalOdds += oddsRows.length;
        }

        // Generate predictions from aggregated odds
        const predRows: any[] = [];
        for (const [, val] of predMap) {
          const avgImplied = val.probSum / val.count;
          // Model probability: slightly adjusted from odds (simulating model divergence)
          const modelProb = Math.min(0.95, avgImplied * (0.9 + Math.random() * 0.2));
          const formScore = 0.5 + Math.random() * 0.4;
          const consistency = val.count >= 3 ? 0.6 + Math.random() * 0.3 : 0.4 + Math.random() * 0.3;

          const finalScore = 0.35 * modelProb + 0.30 * avgImplied + 0.20 * formScore + 0.15 * consistency;

          predRows.push({
            match_id: matchId,
            market: val.market,
            outcome: val.outcome,
            model_probability: modelProb,
            odds_implied_probability: avgImplied,
            form_score: formScore,
            consistency,
            final_score: finalScore,
            confidence: getConfidence(finalScore),
            explanation: generateExplanation(val.market === "1X2" ? "h2h" : "totals", val.outcome, avgImplied, event.home_team, event.away_team),
          });
        }

        if (predRows.length > 0) {
          const { error: predErr } = await supabase.from("predictions").insert(predRows);
          if (predErr) console.error("Predictions insert error:", predErr);
          else totalPredictions += predRows.length;
        }
      }
    }

    const remaining = response ? response.headers.get("x-requests-remaining") : "unknown";

    return new Response(JSON.stringify({
      success: true,
      matches: totalMatches,
      odds: totalOdds,
      predictions: totalPredictions,
      apiRequestsRemaining: remaining,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
