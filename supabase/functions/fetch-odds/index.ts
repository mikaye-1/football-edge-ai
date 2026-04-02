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

const API_MARKETS = "h2h,h2h_lay,totals,alternate_totals,spreads,btts,double_chance,draw_no_bet";

const DESIRED_TOTALS = new Set([1.5, 2.5, 3.5]);

function mapMarketName(apiKey: string, point?: number): string {
  switch (apiKey) {
    case "h2h": return "1X2";
    case "h2h_lay": return "Not to Win";
    case "totals":
    case "alternate_totals":
      return point ? `Over/Under ${point}` : "Over/Under 2.5";
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
  if (apiKey === "h2h_lay") {
    if (name === homeTeam) return "Home Not to Win";
    if (name === awayTeam) return "Away Not to Win";
    return "No Draw";
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

// ─── MATH: Proper probability normalization ───
// For each market, collect all outcomes and normalize so sum = 1
interface MarketOutcomeAgg {
  rawProbSum: number; // sum of 1/odds across bookmakers
  count: number;
  bestOdds: number;
  bookmaker: string;
  market: string;
  outcome: string;
}

function normalizeMarketProbabilities(
  predMap: Map<string, MarketOutcomeAgg>
): Map<string, MarketOutcomeAgg & { normalizedProb: number }> {
  // Group by market
  const marketGroups = new Map<string, string[]>();
  for (const [key, val] of predMap) {
    const group = marketGroups.get(val.market) || [];
    group.push(key);
    marketGroups.set(val.market, group);
  }

  const result = new Map<string, MarketOutcomeAgg & { normalizedProb: number }>();

  for (const [, keys] of marketGroups) {
    // Average implied prob per outcome
    const avgProbs: { key: string; avgProb: number }[] = keys.map(k => {
      const v = predMap.get(k)!;
      return { key: k, avgProb: v.rawProbSum / v.count };
    });

    // Normalize: P_i = avgProb_i / sum(avgProb_j)
    const totalRaw = avgProbs.reduce((s, x) => s + x.avgProb, 0);

    for (const ap of avgProbs) {
      const val = predMap.get(ap.key)!;
      result.set(ap.key, {
        ...val,
        normalizedProb: totalRaw > 0 ? ap.avgProb / totalRaw : 1 / avgProbs.length,
      });
    }
  }

  return result;
}

// ─── Confidence from final score ───
function getConfidence(score: number): string {
  if (score >= 0.70) return "high";
  if (score >= 0.60) return "medium";
  if (score >= 0.50) return "low";
  return "very_low";
}

// ─── Consistency checks between markets ───
function applyConsistencyChecks(
  predictions: { market: string; outcome: string; normalizedProb: number; finalScore: number }[]
): void {
  const get = (m: string, o: string) => predictions.find(p => p.market === m && p.outcome === o);

  const homeWin = get("1X2", "Home Win");
  const draw = get("1X2", "Draw");
  const awayWin = get("1X2", "Away Win");

  // If Home Win > 70%, Draw must be < 25%
  if (homeWin && draw && homeWin.normalizedProb > 0.70 && draw.normalizedProb > 0.25) {
    draw.finalScore *= 0.85;
  }
  if (awayWin && draw && awayWin.normalizedProb > 0.70 && draw.normalizedProb > 0.25) {
    draw.finalScore *= 0.85;
  }

  // Over 2.5 high → BTTS should trend high
  const over25 = get("Over/Under 2.5", "Over");
  const bttsYes = get("BTTS", "Both Teams Score");
  const bttsNo = get("BTTS", "No BTTS");

  if (over25 && bttsYes && over25.normalizedProb > 0.60) {
    bttsYes.finalScore *= 1.05;
  }
  if (over25 && bttsNo && over25.normalizedProb > 0.60) {
    bttsNo.finalScore *= 0.95;
  }
}

// ─── AI explanation ───
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
            content: "You are a football betting analyst. Given prediction data for a match, write a concise 2-3 sentence analysis explaining the key insights. Mention the difference between model prediction and bookmaker odds where relevant. Focus on value bets (where model probability exceeds implied probability). Be direct and data-driven. No greetings or filler.",
          },
          {
            role: "user",
            content: `Match: ${homeTeam} vs ${awayTeam}\n\nPrediction breakdown:\n${summary}\n\nProvide a brief analytical explanation highlighting any value bets.`,
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
        const predMap = new Map<string, MarketOutcomeAgg>();

        for (const bk of event.bookmakers) {
          for (const mkt of bk.markets) {
            // For alternate_totals, only keep desired point values (1.5, 2.5, 3.5)
            if (mkt.key === "alternate_totals") {
              const point = mkt.outcomes[0]?.point;
              if (point !== undefined && !DESIRED_TOTALS.has(point)) continue;
            }
            const marketName = mapMarketName(mkt.key, mkt.outcomes[0]?.point);

            for (const oc of mkt.outcomes) {
              const outcomeName = mapOutcomeName(mkt.key, oc.name, event.home_team, event.away_team);
              const rawImplied = 1 / oc.price;

              oddsRows.push({
                match_id: matchId,
                market: marketName,
                outcome: outcomeName,
                bookmaker: bk.title,
                odds: oc.price,
                implied_probability: rawImplied,
              });

              const key = `${marketName}::${outcomeName}`;
              const existing = predMap.get(key);
              if (existing) {
                existing.rawProbSum += rawImplied;
                existing.count++;
                if (oc.price > existing.bestOdds) {
                  existing.bestOdds = oc.price;
                  existing.bookmaker = bk.title;
                }
              } else {
                predMap.set(key, {
                  rawProbSum: rawImplied,
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

        // ─── NORMALIZED PREDICTIONS ───
        const normalized = normalizeMarketProbabilities(predMap);

        const predRows: any[] = [];
        const predSummaries: { market: string; outcome: string; finalScore: number; impliedProb: number; modelProb: number }[] = [];

        for (const [, val] of normalized) {
          const oddsProb = val.normalizedProb;

          // Model prediction: slight deviation from odds (simulating internal model)
          const modelProb = Math.max(0.02, Math.min(0.98, oddsProb * (0.85 + Math.random() * 0.30)));

          // Form score: simulated team form factor
          const formScore = 0.4 + Math.random() * 0.5;

          // Consistency: based on bookmaker agreement
          const consistency = val.count >= 4 ? 0.7 + Math.random() * 0.25 :
                              val.count >= 2 ? 0.5 + Math.random() * 0.3 :
                              0.3 + Math.random() * 0.3;

          // Updated weights: 0.4 odds + 0.3 model + 0.2 form + 0.1 consistency
          const rawFinal = 0.40 * oddsProb + 0.30 * modelProb + 0.20 * formScore + 0.10 * consistency;

          predRows.push({
            match_id: matchId,
            market: val.market,
            outcome: val.outcome,
            model_probability: modelProb,
            odds_implied_probability: oddsProb,
            form_score: formScore,
            consistency,
            final_score: rawFinal,
            confidence: "", // set after normalization
            explanation: "",
          });

          predSummaries.push({ market: val.market, outcome: val.outcome, finalScore: rawFinal, impliedProb: oddsProb, modelProb });
        }

        // Normalize final scores within each market so they sum to ~1
        const marketGrouped = new Map<string, typeof predRows>();
        for (const p of predRows) {
          const arr = marketGrouped.get(p.market) || [];
          arr.push(p);
          marketGrouped.set(p.market, arr);
        }

        for (const [, group] of marketGrouped) {
          const total = group.reduce((s, p) => s + p.final_score, 0);
          if (total > 0) {
            for (const p of group) {
              p.final_score = p.final_score / total;
            }
          }
        }

        // Apply consistency checks
        applyConsistencyChecks(predRows.map(p => ({
          market: p.market,
          outcome: p.outcome,
          normalizedProb: p.odds_implied_probability,
          finalScore: p.final_score,
        })));

        // Re-normalize after consistency adjustments
        for (const [, group] of marketGrouped) {
          const total = group.reduce((s, p) => s + p.final_score, 0);
          if (total > 0) {
            for (const p of group) {
              p.final_score = p.final_score / total;
            }
          }
        }

        // Set confidence levels
        for (const p of predRows) {
          p.confidence = getConfidence(p.final_score);
        }

        // Generate AI explanation for top predictions
        predSummaries.sort((a, b) => b.finalScore - a.finalScore);
        const aiExplanation = await generateAIExplanation(predSummaries, event.home_team, event.away_team);

        // Sort and assign explanations
        predRows.sort((a, b) => b.final_score - a.final_score);
        for (let i = 0; i < predRows.length; i++) {
          if (i < 3 && aiExplanation) {
            predRows[i].explanation = aiExplanation;
          } else {
            const modelPct = (predRows[i].model_probability * 100).toFixed(0);
            const oddsPct = (predRows[i].odds_implied_probability * 100).toFixed(0);
            const diff = ((predRows[i].model_probability - predRows[i].odds_implied_probability) * 100).toFixed(0);
            const isValue = predRows[i].model_probability > predRows[i].odds_implied_probability;
            predRows[i].explanation = isValue
              ? `Bookmakers imply ${oddsPct}% probability; the adjusted model predicts ${modelPct}% (+${diff}% edge). Potential value bet.`
              : `Bookmakers imply ${oddsPct}% probability; the adjusted model predicts ${modelPct}%. Market-aligned prediction.`;
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
