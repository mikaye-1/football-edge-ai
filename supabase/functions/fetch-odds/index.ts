import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SPORT_KEYS: Record<string, string> = {
  "soccer_epl": "Premier League",
  "soccer_spain_la_liga": "La Liga",
  "soccer_italy_serie_a": "Serie A",
  "soccer_france_ligue_one": "Ligue 1",
  "soccer_saudi_professional_league": "Saudi Pro League",
  "soccer_usa_mls": "MLS",
  "soccer_turkey_super_league": "Süper Lig",
};

// Expanded markets to fetch from The Odds API
const API_MARKETS = "h2h,totals,spreads,btts,double_chance,draw_no_bet";

// Map API market keys to display names
function mapMarketName(apiKey: string, point?: number): string {
  switch (apiKey) {
    case "h2h": return "1X2";
    case "totals": return point ? `Over/Under ${point}` : "Over/Under 2.5";
    case "spreads": return "Handicap";
    case "btts": return "BTTS";
    case "double_chance": return "Double Chance";
    case "draw_no_bet": return "Draw No Bet";
    default: return apiKey;
  }
}

function mapOutcomeName(apiKey: string, name: string, homeTeam: string, awayTeam: string): string {
  if (apiKey === "h2h") {
    if (name === homeTeam) return "Home Win";
    if (name === awayTeam) return "Away Win";
    return "Draw";
  }
  if (apiKey === "double_chance") {
    if (name === `${homeTeam} or Draw`) return "Home or Draw";
    if (name === `${awayTeam} or Draw`) return "Away or Draw";
    if (name === `${homeTeam} or ${awayTeam}`) return "Home or Away";
    return name;
  }
  if (apiKey === "draw_no_bet") {
    if (name === homeTeam) return "Home Win";
    if (name === awayTeam) return "Away Win";
    return name;
  }
  if (apiKey === "btts") {
    return name === "Yes" ? "Both Teams Score" : "No BTTS";
  }
  return name;
}

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
        point?: number;
      }[];
    }[];
  }[];
}

function getConfidence(score: number): string {
  if (score >= 0.72) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

async function generateAIExplanation(
  predictions: { market: string; outcome: string; finalScore: number; impliedProb: number; modelProb: number }[],
  homeTeam: string,
  awayTeam: string,
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return "";

  const summary = predictions
    .slice(0, 5)
    .map(p => `${p.market} → ${p.outcome} (model: ${(p.modelProb * 100).toFixed(0)}%, odds: ${(p.impliedProb * 100).toFixed(0)}%, score: ${(p.finalScore * 100).toFixed(0)}%)`)
    .join("\n");

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: "You are a football betting analyst. Given prediction data for a match, write a concise 2-3 sentence analysis explaining the key insights. Focus on value bets, market trends, and actionable takeaways. Be direct and data-driven. No greetings or filler.",
          },
          {
            role: "user",
            content: `Match: ${homeTeam} vs ${awayTeam}\n\nPrediction breakdown:\n${summary}\n\nProvide a brief analytical explanation.`,
          },
        ],
      }),
    });

    if (!resp.ok) return "";
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
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

    let selectedKeys: string[] | undefined;
    try {
      const body = await req.json();
      if (body?.sport_keys) selectedKeys = body.sport_keys;
    } catch { /* no body */ }

    const sportKeys = selectedKeys || Object.keys(SPORT_KEYS);
    let totalMatches = 0;
    let totalOdds = 0;
    let totalPredictions = 0;

    const results = await Promise.allSettled(sportKeys.map(async (sportKey) => {
      const league = SPORT_KEYS[sportKey];
      if (!league) return { matches: 0, odds: 0, predictions: 0 };

      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=us,eu&markets=${API_MARKETS}&oddsFormat=decimal&dateFormat=iso`;

      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        console.log(`Skipping ${sportKey}: fetch failed`);
        return { matches: 0, odds: 0, predictions: 0 };
      }

      if (!response.ok) {
        const body = await response.text();
        console.log(`Skipping ${sportKey}: ${response.status} - ${body}`);
        return { matches: 0, odds: 0, predictions: 0 };
      }

      const events: OddsAPIEvent[] = await response.json();
      if (!events || events.length === 0) return { matches: 0, odds: 0, predictions: 0 };

      let lm = 0, lo = 0, lp = 0;

      for (const event of events) {
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
        lm++;

        await supabase.from("odds").delete().eq("match_id", matchId);
        await supabase.from("predictions").delete().eq("match_id", matchId);

        if (!event.bookmakers || event.bookmakers.length === 0) continue;

        const oddsRows: any[] = [];
        const predMap = new Map<string, { probSum: number; count: number; bestOdds: number; bookmaker: string; market: string; outcome: string }>();

        for (const bk of event.bookmakers) {
          for (const mkt of bk.markets) {
            const marketName = mapMarketName(mkt.key, mkt.outcomes[0]?.point);

            for (const oc of mkt.outcomes) {
              const outcomeName = mapOutcomeName(mkt.key, oc.name, event.home_team, event.away_team);
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

        if (oddsRows.length > 0) {
          const { error: oddsErr } = await supabase.from("odds").insert(oddsRows);
          if (oddsErr) console.error("Odds insert error:", oddsErr);
          else lo += oddsRows.length;
        }

        // Build predictions
        const predRows: any[] = [];
        const predSummaries: { market: string; outcome: string; finalScore: number; impliedProb: number; modelProb: number }[] = [];

        for (const [, val] of predMap) {
          const avgImplied = val.probSum / val.count;
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
            explanation: "", // will be filled by AI
          });

          predSummaries.push({ market: val.market, outcome: val.outcome, finalScore, impliedProb: avgImplied, modelProb });
        }

        // Generate AI explanation for top predictions
        predSummaries.sort((a, b) => b.finalScore - a.finalScore);
        const aiExplanation = await generateAIExplanation(predSummaries, event.home_team, event.away_team);

        // Assign AI explanation to top 3 predictions, basic to rest
        predRows.sort((a, b) => b.final_score - a.final_score);
        for (let i = 0; i < predRows.length; i++) {
          if (i < 3 && aiExplanation) {
            predRows[i].explanation = aiExplanation;
          } else {
            const pct = (predRows[i].odds_implied_probability * 100).toFixed(0);
            predRows[i].explanation = `${predRows[i].outcome} in ${predRows[i].market} at ${pct}% implied probability.`;
          }
        }

        if (predRows.length > 0) {
          const { error: predErr } = await supabase.from("predictions").insert(predRows);
          if (predErr) console.error("Predictions insert error:", predErr);
          else lp += predRows.length;
        }
      }

      return { matches: lm, odds: lo, predictions: lp };
    }));

    for (const r of results) {
      if (r.status === "fulfilled") {
        totalMatches += r.value.matches;
        totalOdds += r.value.odds;
        totalPredictions += r.value.predictions;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      matches: totalMatches,
      odds: totalOdds,
      predictions: totalPredictions,
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
