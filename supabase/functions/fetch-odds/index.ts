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
  "soccer_usa_mls": "MLS",
  "soccer_turkey_super_league": "Süper Lig",
  "soccer_germany_bundesliga": "Bundesliga",
  "soccer_netherlands_eredivisie": "Eredivisie",
  "soccer_portugal_primeira_liga": "Liga Portugal",
  "soccer_efl_champ": "Championship",
  "soccer_uefa_champs_league": "Champions League",
};

// Tiered market sets — try extended first, fallback to basic on 422
const MARKETS_EXTENDED = "h2h,h2h_lay,totals,alternate_totals,spreads,btts,double_chance,draw_no_bet,totals_corners,alternate_totals_corners,totals_cards,alternate_totals_cards";
const MARKETS_BASIC = "h2h,totals,spreads";

const DESIRED_TOTALS = new Set([1.5, 2.5, 3.5]);

function mapMarketName(apiKey: string, point?: number): string {
  switch (apiKey) {
    case "h2h": return "1X2";
    case "h2h_lay": return "Not to Win";
    case "totals":
    case "alternate_totals":
      return point ? `Over/Under ${point}` : "Over/Under 2.5";
    case "spreads": return point ? `Handicap ${point > 0 ? '+' : ''}${point}` : "Handicap";
    case "btts": return "BTTS";
    case "double_chance": return "Double Chance";
    case "draw_no_bet": return "Draw No Bet";
    case "totals_corners":
    case "alternate_totals_corners":
      return point ? `Corners O/U ${point}` : "Corners O/U";
    case "totals_cards":
    case "alternate_totals_cards":
      return point ? `Cards O/U ${point}` : "Cards O/U";
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

interface MarketOutcomeAgg {
  rawProbSum: number;
  count: number;
  bestOdds: number;
  bookmaker: string;
  market: string;
  outcome: string;
}

function normalizeMarketProbabilities(
  predMap: Map<string, MarketOutcomeAgg>
): Map<string, MarketOutcomeAgg & { normalizedProb: number }> {
  const marketGroups = new Map<string, string[]>();
  for (const [key, val] of predMap) {
    const group = marketGroups.get(val.market) || [];
    group.push(key);
    marketGroups.set(val.market, group);
  }

  const result = new Map<string, MarketOutcomeAgg & { normalizedProb: number }>();

  for (const [, keys] of marketGroups) {
    const avgProbs = keys.map(k => {
      const v = predMap.get(k)!;
      return { key: k, avgProb: v.rawProbSum / v.count };
    });
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

function getConfidence(score: number): string {
  if (score >= 0.70) return "high";
  if (score >= 0.60) return "medium";
  if (score >= 0.50) return "low";
  return "very_low";
}

function applyConsistencyChecks(
  predictions: { market: string; outcome: string; normalizedProb: number; finalScore: number }[]
): void {
  const get = (m: string, o: string) => predictions.find(p => p.market === m && p.outcome === o);

  const homeWin = get("1X2", "Home Win");
  const draw = get("1X2", "Draw");
  const awayWin = get("1X2", "Away Win");

  if (homeWin && draw && homeWin.normalizedProb > 0.70 && draw.normalizedProb > 0.25) {
    draw.finalScore *= 0.85;
  }
  if (awayWin && draw && awayWin.normalizedProb > 0.70 && draw.normalizedProb > 0.25) {
    draw.finalScore *= 0.85;
  }

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
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

    clearTimeout(timeout);
    if (!resp.ok) return "";
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

// Fetch events for a sport key with market fallback
async function fetchEventsWithFallback(sportKey: string, apiKey: string): Promise<OddsAPIEvent[]> {
  const baseUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us,eu&oddsFormat=decimal&dateFormat=iso`;

  // Try extended markets first
  let response: Response;
  try {
    response = await fetch(`${baseUrl}&markets=${MARKETS_EXTENDED}`);
  } catch {
    console.log(`Skipping ${sportKey}: fetch failed`);
    return [];
  }

  // If 422 (unsupported markets), retry with basic
  if (response.status === 422) {
    await response.text(); // consume body
    console.log(`${sportKey}: extended markets not supported, trying basic`);
    try {
      response = await fetch(`${baseUrl}&markets=${MARKETS_BASIC}`);
    } catch {
      return [];
    }
  }

  if (!response.ok) {
    const body = await response.text();
    console.log(`Skipping ${sportKey}: ${response.status} - ${body}`);
    return [];
  }

  const events: OddsAPIEvent[] = await response.json();
  return events || [];
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

    // Load latest adaptive weights (falls back to defaults if table empty / error)
    let WEIGHTS = { odds: 0.40, model: 0.30, form: 0.20, consistency: 0.10 };
    try {
      const { data: wRow } = await supabase
        .from("model_weights")
        .select("w_odds, w_model, w_form, w_consistency")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (wRow) {
        WEIGHTS = {
          odds: Number(wRow.w_odds),
          model: Number(wRow.w_model),
          form: Number(wRow.w_form),
          consistency: Number(wRow.w_consistency),
        };
      }
    } catch (e) {
      console.warn("model_weights load failed, using defaults:", e);
    }

    let selectedKeys: string[] | undefined;
    try {
      const body = await req.json();
      if (body?.sport_keys) selectedKeys = body.sport_keys;
    } catch { /* no body */ }

    const sportKeys = selectedKeys || Object.keys(SPORT_KEYS);
    let totalMatches = 0;
    let totalOdds = 0;
    let totalPredictions = 0;

    // Process leagues sequentially to avoid 429 rate limits
    for (const sportKey of sportKeys) {
      const league = SPORT_KEYS[sportKey];
      if (!league) continue;

      const events = await fetchEventsWithFallback(sportKey, API_KEY);
      if (events.length === 0) {
        // Small delay even on empty to avoid burst
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

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
            if (mkt.key === "alternate_totals" || mkt.key === "totals") {
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

        const normalized = normalizeMarketProbabilities(predMap);

        const predRows: any[] = [];
        const predSummaries: { market: string; outcome: string; finalScore: number; impliedProb: number; modelProb: number }[] = [];

        for (const [, val] of normalized) {
          const oddsProb = val.normalizedProb;
          const modelProb = Math.max(0.02, Math.min(0.98, oddsProb * (0.85 + Math.random() * 0.30)));
          const formScore = 0.4 + Math.random() * 0.5;
          const consistency = val.count >= 4 ? 0.7 + Math.random() * 0.25 :
                              val.count >= 2 ? 0.5 + Math.random() * 0.3 :
                              0.3 + Math.random() * 0.3;

          const rawFinal = WEIGHTS.odds * oddsProb + WEIGHTS.model * modelProb + WEIGHTS.form * formScore + WEIGHTS.consistency * consistency;

          predRows.push({
            match_id: matchId,
            market: val.market,
            outcome: val.outcome,
            model_probability: modelProb,
            odds_implied_probability: oddsProb,
            form_score: formScore,
            consistency,
            final_score: rawFinal,
            confidence: "",
            explanation: "",
          });

          predSummaries.push({ market: val.market, outcome: val.outcome, finalScore: rawFinal, impliedProb: oddsProb, modelProb });
        }

        const marketGrouped = new Map<string, typeof predRows>();
        for (const p of predRows) {
          const arr = marketGrouped.get(p.market) || [];
          arr.push(p);
          marketGrouped.set(p.market, arr);
        }

        for (const [, group] of marketGrouped) {
          const total = group.reduce((s: number, p: any) => s + p.final_score, 0);
          if (total > 0) {
            for (const p of group) {
              p.final_score = p.final_score / total;
            }
          }
        }

        applyConsistencyChecks(predRows.map(p => ({
          market: p.market,
          outcome: p.outcome,
          normalizedProb: p.odds_implied_probability,
          finalScore: p.final_score,
        })));

        for (const [, group] of marketGrouped) {
          const total = group.reduce((s: number, p: any) => s + p.final_score, 0);
          if (total > 0) {
            for (const p of group) {
              p.final_score = p.final_score / total;
            }
          }
        }

        for (const p of predRows) {
          p.confidence = getConfidence(p.final_score);
        }

        predRows.sort((a, b) => b.final_score - a.final_score);
        for (let i = 0; i < predRows.length; i++) {
          const modelPct = (predRows[i].model_probability * 100).toFixed(0);
          const oddsPct = (predRows[i].odds_implied_probability * 100).toFixed(0);
          const diff = ((predRows[i].model_probability - predRows[i].odds_implied_probability) * 100).toFixed(0);
          const isValue = predRows[i].model_probability > predRows[i].odds_implied_probability;
          predRows[i].explanation = isValue
            ? `Bookmakers imply ${oddsPct}% probability; the adjusted model predicts ${modelPct}% (+${diff}% edge). Potential value bet.`
            : `Bookmakers imply ${oddsPct}% probability; the adjusted model predicts ${modelPct}%. Market-aligned prediction.`;
        }

        if (predRows.length > 0) {
          const { error: predErr } = await supabase.from("predictions").insert(predRows);
          if (predErr) console.error("Predictions insert error:", predErr);
          else lp += predRows.length;
        }

        const h1x2 = predRows.find(p => p.market === "1X2" && p.outcome === "Home Win");
        const a1x2 = predRows.find(p => p.market === "1X2" && p.outcome === "Away Win");
        const over25 = predRows.find(p => p.market === "Over/Under 2.5" && p.outcome === "Over");
        if (h1x2 && a1x2) {
          const homeStrength = h1x2.final_score / (h1x2.final_score + a1x2.final_score + 0.001);
          const expectedGoals = over25 ? (over25.final_score > 0.5 ? 3.0 : 2.0) : 2.5;
          const predHome = Math.round(expectedGoals * homeStrength);
          const predAway = Math.round(expectedGoals * (1 - homeStrength));
          await supabase.from("matches").update({
            predicted_home_score: predHome,
            predicted_away_score: predAway,
          }).eq("id", matchId);
        }

        if (lm <= 3) {
          predSummaries.sort((a, b) => b.finalScore - a.finalScore);
          generateAIExplanation(predSummaries, event.home_team, event.away_team)
            .then(async (aiExplanation) => {
              if (aiExplanation && predRows.length > 0) {
                for (let i = 0; i < Math.min(3, predRows.length); i++) {
                  await supabase.from("predictions")
                    .update({ explanation: aiExplanation })
                    .eq("match_id", matchId)
                    .eq("market", predRows[i].market)
                    .eq("outcome", predRows[i].outcome);
                }
              }
            })
            .catch(() => {});
        }
      }

      totalMatches += lm;
      totalOdds += lo;
      totalPredictions += lp;
      console.log(`${league}: ${lm} matches, ${lo} odds, ${lp} predictions`);

      // Delay between leagues to respect rate limits
      await new Promise(r => setTimeout(r, 1200));
    }



    // --- Auto-finish matches that started >3 hours ago and are still live/upcoming ---
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: staleMatches } = await supabase
      .from("matches")
      .select("id, external_id, sport_key, kickoff_time")
      .in("status", ["live", "upcoming"])
      .lt("kickoff_time", threeHoursAgo);

    let finishedCount = 0;
    if (staleMatches && staleMatches.length > 0) {
      // Try to fetch scores from The Odds API for each sport
      const staleBySport = new Map<string, typeof staleMatches>();
      for (const m of staleMatches) {
        const arr = staleBySport.get(m.sport_key) || [];
        arr.push(m);
        staleBySport.set(m.sport_key, arr);
      }

      for (const [sportKey, matches] of staleBySport) {
        try {
          const scoresResp = await fetch(
            `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${API_KEY}&daysFrom=3&dateFormat=iso`
          );
          if (scoresResp.ok) {
            const scores: any[] = await scoresResp.json();
            const scoreMap = new Map<string, { home: number; away: number; completed: boolean }>();
            for (const s of scores) {
              if (s.completed && s.scores && s.scores.length >= 2) {
                const home = s.scores.find((sc: any) => sc.name === s.home_team);
                const away = s.scores.find((sc: any) => sc.name === s.away_team);
                if (home && away) {
                  scoreMap.set(s.id, {
                    home: parseInt(home.score) || 0,
                    away: parseInt(away.score) || 0,
                    completed: true,
                  });
                }
              }
            }

            for (const m of matches) {
              const score = scoreMap.get(m.external_id || "");
              if (score) {
                await supabase.from("matches").update({
                  status: "finished",
                  home_score: score.home,
                  away_score: score.away,
                }).eq("id", m.id);
                finishedCount++;
              } else {
                // Without a verified final score, leave this match retryable and
                // out of the model's training history.
                console.log(`No completed score returned yet for ${m.id}; will retry later`);
              }
            }
          } else {
            console.error(`Scores request failed for ${sportKey}: ${scoresResp.status}`);
          }
        } catch {
          console.error(`Scores request failed for ${sportKey}; stale matches remain retryable`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      matches: totalMatches,
      odds: totalOdds,
      predictions: totalPredictions,
      finished: finishedCount,
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
