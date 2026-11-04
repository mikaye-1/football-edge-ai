import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildCandidates,
  goalProbs,
  rankCandidates,
  trainPoisson,
  type Fixture,
  type HistoryGame,
  type MatchOdds,
} from "../_shared/dailyModel.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HISTORY_CAP = 10000;
const PAGE_SIZE = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const date = typeof body?.date === "string" ? body.date : "";
    const tzOffset = typeof body?.tzOffset === "number" ? body.tzOffset : 0;
    const minProbability = typeof body?.minProbability === "number" ? body.minProbability : 50;
    const minConfidence = typeof body?.minConfidence === "number" ? body.minConfidence : 40;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: "date must be YYYY-MM-DD" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Local-day window expressed in UTC (tzOffset = minutes east of UTC).
    const startUtc = Date.parse(`${date}T00:00:00Z`) - tzOffset * 60000;
    const endUtc = startUtc + 86400000;
    const lo = new Date(startUtc - 86400000).toISOString();
    const hi = new Date(endUtc + 86400000).toISOString();

    // 1. Every fixture falling on the requested local day.
    const { data: matchRows, error: matchErr } = await supabase
      .from("matches")
      .select("id,league,home_team,away_team,kickoff_time,status")
      .gte("kickoff_time", lo)
      .lte("kickoff_time", hi)
      .order("kickoff_time", { ascending: true });
    if (matchErr) throw matchErr;
    const fixtures: Fixture[] = (matchRows ?? [])
      .filter((m) => new Date(new Date(m.kickoff_time).getTime() + tzOffset * 60000).toISOString().slice(0, 10) === date)
      .map((m) => ({
        id: m.id, league: m.league, home_team: m.home_team,
        away_team: m.away_team, kickoff_time: m.kickoff_time,
      }));

    const picksOut = [] as unknown[];
    let totalCandidates = 0;

    if (fixtures.length > 0) {
      // 2. Best available odds per market/outcome for those fixtures.
      const ids = fixtures.map((f) => f.id);
      const oddsByMatch: Record<string, MatchOdds> = {};
      const { data: oddsRows, error: oddsErr } = await supabase
        .from("odds").select("match_id,market,outcome,odds").in("match_id", ids);
      if (oddsErr) throw oddsErr;
      const best = new Map<string, number>();
      for (const r of oddsRows ?? []) {
        const key = `${r.match_id}|${r.market}|${r.outcome}`;
        const v = Number(r.odds);
        if (!best.has(key) || v > best.get(key)!) best.set(key, v);
      }
      const get = (id: string, m: string, ...outcomes: string[]) => {
        for (const o of outcomes) {
          const v = best.get(`${id}|${m}|${o}`);
          if (v) return v;
        }
        return undefined;
      };
      for (const f of fixtures) {
        oddsByMatch[f.id] = {
          home: get(f.id, "1X2", "Home Win"),
          draw: get(f.id, "1X2", "Draw"),
          away: get(f.id, "1X2", "Away Win"),
          bttsYes: get(f.id, "BTTS", "Both Teams Score", "Yes"),
          bttsNo: get(f.id, "BTTS", "No BTTS", "No"),
          over15: get(f.id, "Over/Under 1.5", "Over"),
          under15: get(f.id, "Over/Under 1.5", "Under"),
          over25: get(f.id, "Over/Under 2.5", "Over"),
          under25: get(f.id, "Over/Under 2.5", "Under"),
          over35: get(f.id, "Over/Under 3.5", "Over"),
          under35: get(f.id, "Over/Under 3.5", "Under"),
        };
      }

      // 3. Learned blend weights.
      const { data: w } = await supabase
        .from("model_weights").select("w_model,w_odds")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const weights = {
        wModel: Number(w?.w_model ?? 0.5),
        wOdds: Number(w?.w_odds ?? 0.5),
      };

      // 4. Scored finished matches for training (only games before the day's first kickoff).
      const cutoff = fixtures.reduce(
        (min, f) => Math.min(min, new Date(f.kickoff_time).getTime()), Infinity,
      );
      const games: HistoryGame[] = [];
      for (let from = 0; from < HISTORY_CAP; from += PAGE_SIZE) {
        const { data: page, error: hErr } = await supabase
          .from("matches")
          .select("home_team,away_team,home_score,away_score,kickoff_time,league")
          .eq("status", "finished")
          .not("home_score", "is", null)
          .not("away_score", "is", null)
          .order("kickoff_time", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (hErr) throw hErr;
        for (const g of page ?? []) {
          if (new Date(g.kickoff_time).getTime() >= cutoff) continue;
          games.push(g as unknown as HistoryGame);
        }
        if (!page || page.length < PAGE_SIZE) break;
      }

      // 5. One training pass, then every market on every fixture, ranked.
      const model = trainPoisson(games, startUtc);
      const candidates = buildCandidates(model, fixtures, oddsByMatch, weights);
      totalCandidates = candidates.length;
      const ranked = rankCandidates(candidates, { minProbability, minConfidence });

      // 6. Replace the stored sheet for this date.
      const { error: delErr } = await supabase.from("daily_top20").delete().eq("for_date", date);
      if (delErr) throw delErr;
      if (ranked.length > 0) {
        const rows = ranked.map((c, i) => ({
          for_date: date,
          rank: i + 1,
          match_id: c.matchId,
          league: c.league,
          home_team: c.homeTeam,
          away_team: c.awayTeam,
          kickoff_time: c.kickoffTime,
          market: c.market,
          selection: c.selection,
          probability: c.probability,
          confidence_score: c.confidence,
          data_quality: c.dataQuality,
          risk_level: c.risk,
          overall_score: c.overall,
          stats: c.stats,
        }));
        const { error: insErr } = await supabase.from("daily_top20").insert(rows);
        if (insErr) throw insErr;
      }
      ranked.forEach((c, i) => picksOut.push({ rank: i + 1, ...c }));
    }

    return new Response(JSON.stringify({
      date,
      fixturesAnalyzed: fixtures.length,
      totalCandidates,
      modelVersion: goalProbs(1, 1) && `poisson-shared-v1`,
      picks: picksOut,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("daily-top20 error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
