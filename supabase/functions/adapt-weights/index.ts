// adapt-weights: recomputes model blending weights based on settled prediction
// performance and writes a new snapshot to public.model_weights.
//
// Heuristic (per resolved prediction we know: model_probability, odds_implied_probability,
// form_score, consistency, was_correct). For each factor f and direction d∈{high, low},
// accuracy(f,d) = correctness rate when factor f's value was in the top/bottom tercile.
// Lift(f) = accuracy(top) - accuracy(bottom). Higher lift → factor is more predictive →
// nudge its weight up; negative or near-zero lift → nudge down.
//
// Step size is bounded (±0.05 per run) and weights are renormalized to sum to 1.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STEP = 0.05;
const MIN_W = 0.05;
const MAX_W = 0.70;
const SAMPLE_BUCKET = 50; // require at least N new resolved preds since last snapshot

interface Row {
  model_probability: number;
  odds_implied_probability: number;
  form_score: number;
  consistency: number;
  was_correct: boolean;
}

function tercileLift(rows: Row[], pick: (r: Row) => number): number {
  if (rows.length < 9) return 0;
  const sorted = [...rows].sort((a, b) => pick(a) - pick(b));
  const t = Math.floor(sorted.length / 3);
  const bottom = sorted.slice(0, t);
  const top = sorted.slice(-t);
  const acc = (xs: Row[]) => xs.reduce((s, r) => s + (r.was_correct ? 1 : 0), 0) / Math.max(1, xs.length);
  return acc(top) - acc(bottom);
}

function normalize(w: Record<string, number>): Record<string, number> {
  for (const k of Object.keys(w)) w[k] = Math.min(MAX_W, Math.max(MIN_W, w[k]));
  const s = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w)) w[k] = w[k] / s;
  return w;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Latest snapshot
    const { data: latest } = await supabase
      .from("model_weights")
      .select("w_odds, w_model, w_form, w_consistency, sample_size, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const current = latest
      ? { odds: Number(latest.w_odds), model: Number(latest.w_model), form: Number(latest.w_form), consistency: Number(latest.w_consistency) }
      : { odds: 0.40, model: 0.30, form: 0.20, consistency: 0.10 };

    // Pull resolved predictions joined with prediction features
    const { data: results, error: rErr } = await supabase
      .from("prediction_results")
      .select("prediction_id, was_correct")
      .not("was_correct", "is", null)
      .limit(5000);
    if (rErr) throw rErr;

    const ids = (results ?? []).map(r => r.prediction_id);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No resolved predictions yet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const correctMap = new Map(results!.map(r => [r.prediction_id, !!r.was_correct]));

    const rows: Row[] = [];
    // Batch in chunks to stay under PostgREST IN limits
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      const { data, error } = await supabase
        .from("predictions")
        .select("id, model_probability, odds_implied_probability, form_score, consistency")
        .in("id", slice);
      if (error) throw error;
      for (const p of data ?? []) {
        const wc = correctMap.get(p.id);
        if (wc === undefined) continue;
        rows.push({
          model_probability: Number(p.model_probability),
          odds_implied_probability: Number(p.odds_implied_probability),
          form_score: Number(p.form_score),
          consistency: Number(p.consistency),
          was_correct: wc,
        });
      }
    }

    const sample = rows.length;
    const lastSample = latest?.sample_size ?? 0;

    if (sample - lastSample < SAMPLE_BUCKET) {
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        sample,
        lastSample,
        message: `Need ${SAMPLE_BUCKET - (sample - lastSample)} more resolved predictions before adapting`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lifts = {
      odds: tercileLift(rows, r => r.odds_implied_probability),
      model: tercileLift(rows, r => r.model_probability),
      form: tercileLift(rows, r => r.form_score),
      consistency: tercileLift(rows, r => r.consistency),
    };

    // Rank factors by lift; bump top, trim bottom
    const sorted = (Object.entries(lifts) as [keyof typeof current, number][])
      .sort((a, b) => b[1] - a[1]);
    const winner = sorted[0][0];
    const loser = sorted[sorted.length - 1][0];

    const next = { ...current };
    next[winner] = next[winner] + STEP;
    next[loser] = next[loser] - STEP;

    const normalized = normalize(next);

    const { error: insErr } = await supabase.from("model_weights").insert({
      w_odds: normalized.odds,
      w_model: normalized.model,
      w_form: normalized.form,
      w_consistency: normalized.consistency,
      sample_size: sample,
      notes: `auto: +${winner} -${loser}; lifts ${JSON.stringify(
        Object.fromEntries(Object.entries(lifts).map(([k, v]) => [k, Number(v.toFixed(3))]))
      )}`,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      success: true,
      previous: current,
      next: normalized,
      lifts,
      sample,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("adapt-weights error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
