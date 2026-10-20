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
    const { matchId, matchData: clientData, force } = await req.json();
    if (!matchId) {
      return new Response(JSON.stringify({ error: "matchId required" }), {
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

    // Enrich matchData server-side from DB (form, h2h, avg goals, odds)
    const { data: match } = await supabase
      .from("matches").select("*").eq("id", matchId).maybeSingle();
    if (!match) throw new Error("Match not found");

    const homeTeam = match.home_team;
    const awayTeam = match.away_team;
    const league = match.league;

    // Best (max) odds per outcome
    const { data: oddsRows } = await supabase
      .from("odds").select("market,outcome,odds").eq("match_id", matchId);
    const bestOf = (m: string, o: string) => {
      const rows = (oddsRows ?? []).filter(r => r.market === m && r.outcome === o);
      return rows.length ? Math.max(...rows.map(r => Number(r.odds))) : undefined;
    };
    const odds = {
      home: bestOf("1X2", "Home Win"),
      draw: bestOf("1X2", "Draw"),
      away: bestOf("1X2", "Away Win"),
      over25: bestOf("Over/Under 2.5", "Over"),
      under25: bestOf("Over/Under 2.5", "Under"),
    };

    // Recent finished matches for form & avg goals (last 8 each)
    const fetchRecent = async (team: string) => {
      const { data } = await supabase
        .from("matches")
        .select("home_team,away_team,home_score,away_score,kickoff_time,league")
        .eq("status", "finished")
        .or(`home_team.eq.${team},away_team.eq.${team}`)
        .not("home_score", "is", null)
        .lt("kickoff_time", match.kickoff_time)
        .order("kickoff_time", { ascending: false })
        .limit(8);
      return data ?? [];
    };
    const [homeRecent, awayRecent] = await Promise.all([fetchRecent(homeTeam), fetchRecent(awayTeam)]);

    const teamForm = (team: string, games: any[]) => games.slice(0, 5).map(g => {
      const isHome = g.home_team === team;
      const tg = isHome ? g.home_score : g.away_score;
      const og = isHome ? g.away_score : g.home_score;
      return tg > og ? "W" : tg < og ? "L" : "D";
    });
    const avgGoals = (team: string, games: any[]) => {
      if (!games.length) return { scored: 0, conceded: 0 };
      let s = 0, c = 0;
      for (const g of games) {
        const isHome = g.home_team === team;
        s += isHome ? (g.home_score ?? 0) : (g.away_score ?? 0);
        c += isHome ? (g.away_score ?? 0) : (g.home_score ?? 0);
      }
      return { scored: +(s / games.length).toFixed(2), conceded: +(c / games.length).toFixed(2) };
    };

    const homeAvg = avgGoals(homeTeam, homeRecent);
    const awayAvg = avgGoals(awayTeam, awayRecent);

    // Head-to-head
    const { data: h2hRows } = await supabase
      .from("matches")
      .select("home_team,away_team,home_score,away_score,kickoff_time")
      .eq("status", "finished")
      .or(`and(home_team.eq.${homeTeam},away_team.eq.${awayTeam}),and(home_team.eq.${awayTeam},away_team.eq.${homeTeam})`)
      .not("home_score", "is", null)
      .lt("kickoff_time", match.kickoff_time)
      .order("kickoff_time", { ascending: false })
      .limit(5);
    const h2hHistory = (h2hRows ?? []).map(g => ({
      date: g.kickoff_time?.slice(0, 10),
      homeGoals: g.home_score,
      awayGoals: g.away_score,
      winner: g.home_score! > g.away_score! ? g.home_team : g.away_score! > g.home_score! ? g.away_team : "Draw",
    }));

    // Approximate league standings from finished matches this season
    const { data: leagueGames } = await supabase
      .from("matches")
      .select("home_team,away_team,home_score,away_score")
      .eq("league", league).eq("status", "finished")
      .not("home_score", "is", null);
    const computeStanding = (team: string) => {
      let played = 0, points = 0, gf = 0, ga = 0;
      for (const g of leagueGames ?? []) {
        const isHome = g.home_team === team;
        const isAway = g.away_team === team;
        if (!isHome && !isAway) continue;
        played++;
        const tg = isHome ? g.home_score! : g.away_score!;
        const og = isHome ? g.away_score! : g.home_score!;
        gf += tg; ga += og;
        points += tg > og ? 3 : tg === og ? 1 : 0;
      }
      return { played, points, goalsFor: gf, goalsAgainst: ga, position: 0 };
    };

    // Current model weights
    const { data: weights } = await supabase
      .from("model_weights").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();

    const matchData = {
      homeTeam, awayTeam, league,
      matchDate: match.kickoff_time,
      venue: clientData?.venue ?? `${homeTeam} home stadium`,
      isNeutralVenue: !!clientData?.isNeutralVenue,
      homeForm: teamForm(homeTeam, homeRecent),
      awayForm: teamForm(awayTeam, awayRecent),
      h2hHistory,
      homeStanding: computeStanding(homeTeam),
      awayStanding: computeStanding(awayTeam),
      homeAvgGoalsScored: homeAvg.scored,
      homeAvgGoalsConceded: homeAvg.conceded,
      awayAvgGoalsScored: awayAvg.scored,
      awayAvgGoalsConceded: awayAvg.conceded,
      odds,
      currentModelWeights: weights ?? {},
      injuryNews: clientData?.injuryNews ?? [],
    };

    // ===== In-house model: time-decayed Poisson (attack/defence) trained on historical results =====
    const { data: hist } = await supabase
      .from("matches")
      .select("home_team,away_team,home_score,away_score,kickoff_time")
      .eq("status", "finished")
      .not("home_score", "is", null)
      .lt("kickoff_time", match.kickoff_time)
      .order("kickoff_time", { ascending: false })
      .limit(5000);
    const games = (hist ?? []).filter(g => g.home_score != null && g.away_score != null);
    const now = new Date(match.kickoff_time).getTime();
    const decay = (t: string) => Math.exp(-((now - new Date(t).getTime()) / 86400000) / 180); // ~6 month half-life-ish
    let sw = 0, sh = 0, sa = 0;
    for (const g of games) { const w = decay(g.kickoff_time); sw += w; sh += w * g.home_score!; sa += w * g.away_score!; }
    const baseH = sw > 0 ? sh / sw : 1.5;
    const baseA = sw > 0 ? sa / sw : 1.15;
    const att: Record<string, number> = {}, def: Record<string, number> = {};
    for (const g of games) { att[g.home_team] ??= 1; att[g.away_team] ??= 1; def[g.home_team] ??= 1; def[g.away_team] ??= 1; }
    const PRIOR = 3; // pseudo-games shrinking toward average
    for (let it = 0; it < 15; it++) {
      const aN: Record<string, number> = {}, aD: Record<string, number> = {}, dN: Record<string, number> = {}, dD: Record<string, number> = {};
      for (const g of games) {
        const w = decay(g.kickoff_time), h = g.home_team, a = g.away_team;
        aN[h] = (aN[h] ?? 0) + w * g.home_score!; aD[h] = (aD[h] ?? 0) + w * baseH * def[a];
        aN[a] = (aN[a] ?? 0) + w * g.away_score!; aD[a] = (aD[a] ?? 0) + w * baseA * def[h];
        dN[h] = (dN[h] ?? 0) + w * g.away_score!; dD[h] = (dD[h] ?? 0) + w * baseA * att[a];
        dN[a] = (dN[a] ?? 0) + w * g.home_score!; dD[a] = (dD[a] ?? 0) + w * baseH * att[h];
      }
      for (const t of Object.keys(att)) {
        att[t] = ((aN[t] ?? 0) + PRIOR) / ((aD[t] ?? 0) + PRIOR);
        def[t] = ((dN[t] ?? 0) + PRIOR) / ((dD[t] ?? 0) + PRIOR);
      }
    }
    const lamH = baseH * (att[homeTeam] ?? 1) * (def[awayTeam] ?? 1) * (matchData.isNeutralVenue ? baseA / baseH : 1);
    const lamA = baseA * (att[awayTeam] ?? 1) * (def[homeTeam] ?? 1);
    const pois = (l: number, k: number) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * l ** k / f; };
    let pH = 0, pD = 0, pA = 0, pOver = 0, pBtts = 0;
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const p = pois(lamH, i) * pois(lamA, j);
      if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
      if (i + j > 2) pOver += p;
      if (i > 0 && j > 0) pBtts += p;
    }
    const tot = pH + pD + pA; pH /= tot; pD /= tot; pA /= tot;

    // Blend with de-vigged market using learned weights (more history => more trust in model)
    const imp = odds.home && odds.draw && odds.away ? [1 / odds.home, 1 / odds.draw, 1 / odds.away] : null;
    const impSum = imp ? imp.reduce((s, x) => s + x, 0) : 1;
    const mkt = imp ? imp.map(x => x / impSum) : null;
    const teamGames = homeRecent.length + awayRecent.length;
    const wm = Number(weights?.w_model ?? 0.5), wo = Number(weights?.w_odds ?? 0.5);
    const dataTrust = teamGames / (teamGames + 8);
    const modelShare = mkt ? Math.min(0.8, (wm / (wm + wo || 1)) * dataTrust * 1.4) : 1;
    const fH = mkt ? modelShare * pH + (1 - modelShare) * mkt[0] : pH;
    const fD = mkt ? modelShare * pD + (1 - modelShare) * mkt[1] : pD;
    const fA = mkt ? modelShare * pA + (1 - modelShare) * mkt[2] : pA;
    const probs = { home: +(fH * 100).toFixed(1), draw: +(fD * 100).toFixed(1), away: +(fA * 100).toFixed(1) };
    const outcomes: [string, number, number | undefined, number | undefined][] = [
      ["home_win", fH, mkt?.[0], odds.home], ["draw", fD, mkt?.[1], odds.draw], ["away_win", fA, mkt?.[2], odds.away],
    ];
    const best = [...outcomes].sort((a, b) => b[1] - a[1])[0];
    const edges = outcomes.map(([o, p, m, od]) => ({ o, edge: m != null ? (p - m) * 100 : 0, od }));
    const bestEdge = [...edges].sort((a, b) => b.edge - a.edge)[0];
    const label = (o: string) => o === "home_win" ? homeTeam : o === "away_win" ? awayTeam : "Draw";
    const tier = best[1] >= 0.55 && teamGames >= 6 ? "HIGH" : best[1] >= 0.42 ? "MEDIUM" : "LOW";

    const keyFactors = [
      `Expected goals (model): ${homeTeam} ${lamH.toFixed(2)} – ${lamA.toFixed(2)} ${awayTeam}`,
      `Attack/defence rating: ${homeTeam} ${(att[homeTeam] ?? 1).toFixed(2)}/${(def[homeTeam] ?? 1).toFixed(2)}, ${awayTeam} ${(att[awayTeam] ?? 1).toFixed(2)}/${(def[awayTeam] ?? 1).toFixed(2)}`,
      matchData.homeForm.length ? `Form: ${homeTeam} ${matchData.homeForm.join("")} vs ${awayTeam} ${matchData.awayForm.join("") || "n/a"}` : "Limited recent form data",
      h2hHistory.length ? `H2H last ${h2hHistory.length}: ${h2hHistory.map(h => `${h.homeGoals}-${h.awayGoals}`).join(", ")}` : "No recent head-to-head",
    ];
    const riskFlags: string[] = [];
    if (teamGames < 6) riskFlags.push(`Small sample: only ${teamGames} historical games for these teams`);
    if (!mkt) riskFlags.push("No bookmaker 1X2 odds available");
    if (fD > 0.3) riskFlags.push("High draw likelihood");
    if (mkt && Math.abs(pH - mkt[0]) > 0.15) riskFlags.push("Model strongly disagrees with market — check team news");

    const raw = {
      predicted_outcome: best[0],
      confidence_tier: tier,
      win_probability: probs,
      edge_score: +Math.max(0, bestEdge.edge).toFixed(1),
      value_bet: bestEdge.edge > 3 && bestEdge.od
        ? { market: "1X2", recommendation: `${label(bestEdge.o)} @ ${bestEdge.od}`, reasoning: `Model ${(outcomes.find(x => x[0] === bestEdge.o)![1] * 100).toFixed(1)}% vs market ${((outcomes.find(x => x[0] === bestEdge.o)![2] ?? 0) * 100).toFixed(1)}%` }
        : null,
      key_factors: keyFactors,
      risk_flags: riskFlags,
      ai_summary: `Trained Poisson model (${games.length} historical matches) projects ${homeTeam} ${lamH.toFixed(1)}–${lamA.toFixed(1)} ${awayTeam}, favouring ${label(best[0])} at ${(best[1] * 100).toFixed(0)}%.`,
      btts_prediction: pBtts >= 0.5 ? "YES" : "NO",
      over_under_prediction: pOver >= 0.5 ? "OVER_2.5" : "UNDER_2.5",
      recommended_markets: [
        `1X2: ${label(best[0])}`,
        `${pOver >= 0.5 ? "Over" : "Under"} 2.5 (${((pOver >= 0.5 ? pOver : 1 - pOver) * 100).toFixed(0)}%)`,
        `BTTS ${pBtts >= 0.5 ? "Yes" : "No"} (${((pBtts >= 0.5 ? pBtts : 1 - pBtts) * 100).toFixed(0)}%)`,
      ],
    };
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
        model: "predictiq-poisson-v1",
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
