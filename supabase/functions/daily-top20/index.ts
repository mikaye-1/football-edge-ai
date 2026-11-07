import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildCandidates,
  calibrationTable,
  DEFAULT_RANK,
  learnPerformance,
  rankCandidates,
  SCORE_WEIGHTS,
  settlePick,
  type MarketKey,
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
const MODEL_VERSION = "top20-v2.0 (poisson+odds blend, calibrated ranking)";

// deno-lint-ignore no-explicit-any
async function settleAndLearn(supabase: any) {
  // 1. Settle any pending picks whose match now has a final score.
  const { data: pending } = await supabase.from("daily_top20")
    .select("id,match_id,market,selection,home_team,away_team,market_key").eq("outcome", "pending").limit(2000);
  const ids = [...new Set((pending ?? []).map((r: { match_id: string }) => r.match_id))];
  if (ids.length) {
    const { data: finished } = await supabase.from("matches").select("id,home_score,away_score,status")
      .in("id", ids).eq("status", "finished").not("home_score", "is", null).not("away_score", "is", null);
    const score = new Map((finished ?? []).map((m: { id: string; home_score: number; away_score: number }) => [m.id, m]));
    for (const r of pending ?? []) {
      const m = score.get(r.match_id) as { home_score: number; away_score: number } | undefined;
      if (!m || !r.market_key) continue;
      const won = settlePick(r.market_key as MarketKey, r.selection, r.home_team, r.away_team, m.home_score, m.away_score);
      if (won == null) continue;
      await supabase.from("daily_top20").update({
        outcome: won ? "won" : "lost", actual_result: `${m.home_score}-${m.away_score}`, settled_at: new Date().toISOString(),
      }).eq("id", r.id);
    }
  }
  // 2. Learn per-market and per-band performance from every settled pick.
  const settled: { marketKey: MarketKey; probability: number; won: boolean }[] = [];
  for (let from = 0; from < HISTORY_CAP; from += PAGE_SIZE) {
    const { data } = await supabase.from("daily_top20").select("market_key,probability,outcome")
      .in("outcome", ["won", "lost"]).range(from, from + PAGE_SIZE - 1);
    for (const r of data ?? []) if (r.market_key) settled.push({ marketKey: r.market_key, probability: Number(r.probability), won: r.outcome === "won" });
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { perf: learnPerformance(settled), settledCount: settled.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const date = typeof body?.date === "string" ? body.date : "";
    const tzOffset = typeof body?.tzOffset === "number" ? body.tzOffset : 0;
    const num = (k: string, d: number, lo: number, hi: number) =>
      typeof body?.[k] === "number" && body[k] >= lo && body[k] <= hi ? body[k] as number : d;
    const minProbability = num("minProbability", DEFAULT_RANK.minProbability, 0, 100);
    const minConfidence = num("minConfidence", DEFAULT_RANK.minConfidence, 0, 100);
    const minOverall = num("minOverall", DEFAULT_RANK.minOverall, 0, 100);
    const maxPerMarket = num("maxPerMarket", DEFAULT_RANK.maxPerMarket, 1, 20);
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
    const { perf, settledCount } = await settleAndLearn(supabase);
    let trainingMatches = 0;
    let dataTimestamp: string | null = null;
    let rejected: Record<string, number> = {};

    if (fixtures.length > 0) {
      // 2. Best available odds per market/outcome for those fixtures.
      const ids = fixtures.map((f) => f.id);
      const oddsByMatch: Record<string, MatchOdds> = {};
      const { data: oddsRows, error: oddsErr } = await supabase
        .from("odds").select("match_id,market,outcome,odds").in("match_id", ids);
      if (oddsErr) throw oddsErr;
      const { data: latest } = await supabase.from("odds").select("fetched_at").in("match_id", ids)
        .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      dataTimestamp = latest?.fetched_at ?? null;
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
      trainingMatches = model.gameCount;
      const candidates = buildCandidates(model, fixtures, oddsByMatch, weights, perf);
      totalCandidates = candidates.length;
      const result = rankCandidates(candidates, { minProbability, minConfidence, minOverall, maxPerMarket });
      const ranked = result.picks;
      rejected = result.rejected;

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
          market_key: c.marketKey,
          reliability: c.reliability,
          reliability_score: c.reliabilityScore,
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

    const marketPerformance = Object.fromEntries(Object.entries(perf.markets).map(([k, h]) => [k, {
      settled: h!.n, hitRate: h!.n ? Math.round((h!.hits / h!.n) * 1000) / 10 : null, avgPredicted: Math.round(h!.avgPred * 10) / 10,
    }]));
    const meta = {
      modelVersion: MODEL_VERSION,
      generatedAt: new Date().toISOString(),
      dataTimestamp,
      fixturesAnalyzed: fixtures.length,
      candidatesAnalyzed: totalCandidates,
      selected: picksOut.length,
      rejected: totalCandidates - picksOut.length,
      rejectedBreakdown: rejected,
      trainingMatches,
      settledPicksUsed: settledCount,
      thresholds: { minProbability, minConfidence, minOverall, maxPerMatch: DEFAULT_RANK.maxPerMatch, maxPerMarket, limit: DEFAULT_RANK.limit },
      scoreWeights: SCORE_WEIGHTS,
      methodology: "Overall = 100 × weighted mean of available components (probability edge, confidence, data quality, sample size, model–market agreement, market-specific hit rate, band calibration); missing components' weights are redistributed. Picks are taken greedily by Overall with max per fixture, max per market and correlation exclusion; caps only skip, never pad. Fewer than 20 picks are returned when not enough pass the thresholds.",
      calibration: calibrationTable(perf),
      marketPerformance,
    };
    await supabase.from("daily_top20_runs").upsert({ for_date: date, meta, created_at: new Date().toISOString() });

    return new Response(JSON.stringify({
      date,
      fixturesAnalyzed: fixtures.length,
      totalCandidates,
      picks: picksOut,
      meta,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("daily-top20 error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
