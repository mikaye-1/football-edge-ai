import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-secret",
};

// Payload contract for the external datafc backend. Only standings syncs are
// accepted today; the schema is validated manually (no user-provided SQL is
// ever executed and all writes go through the typed client).
interface StandingRow {
  league: string;
  season: string;
  team_name: string;
  team_external_id: string;
  position: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  form: string | null;
}

interface SyncPayload {
  source: string;
  sync_type: string;
  started_at: string;
  status: "success" | "error";
  error_message?: string;
  standings: StandingRow[];
}

const MAX_STRING = 200;

function str(v: unknown, name: string, errors: string[], max = MAX_STRING): string {
  if (typeof v !== "string" || !v.trim()) {
    errors.push(`${name} must be a non-empty string`);
    return "";
  }
  return v.slice(0, max);
}

function int(v: unknown, name: string, errors: string[]): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100000) {
    errors.push(`${name} must be a non-negative integer`);
    return 0;
  }
  return n;
}

function validateRow(raw: unknown, errors: string[]): StandingRow | null {
  if (typeof raw !== "object" || raw === null) {
    errors.push("standings row must be an object");
    return null;
  }
  const r = raw as Record<string, unknown>;
  const league = str(r.league, "league", errors);
  const season = str(r.season, "season", errors);
  const teamName = str(r.team_name, "team_name", errors);
  const teamExternalId = str(r.team_external_id, "team_external_id", errors);
  const form = r.form == null ? null : String(r.form).slice(0, 30);
  if (errors.length > 0) return null;
  return {
    league,
    season,
    team_name: teamName,
    team_external_id: teamExternalId,
    position: int(r.position, "position", errors),
    matches_played: int(r.matches_played, "matches_played", errors),
    wins: int(r.wins, "wins", errors),
    draws: int(r.draws, "draws", errors),
    losses: int(r.losses, "losses", errors),
    goals_for: int(r.goals_for, "goals_for", errors),
    goals_against: int(r.goals_against, "goals_against", errors),
    goal_diff: int(r.goal_diff, "goal_diff", errors) === 0 && r.goal_diff === 0 ? 0 : int(r.goal_diff, "goal_diff", errors),
    points: int(r.points, "points", errors),
    form,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!ingestSecret) {
    return new Response(JSON.stringify({ error: "Ingest not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.headers.get("x-ingest-secret") !== ingestSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const errors: string[] = [];
  if (typeof body !== "object" || body === null) errors.push("body must be an object");
  const payload = (body ?? {}) as Record<string, unknown>;
  const source = str(payload.source, "source", errors);
  const syncType = str(payload.sync_type, "sync_type", errors);
  const startedAt = str(payload.started_at, "started_at", errors);
  const status = payload.status === "success" || payload.status === "error" ? payload.status : "";
  if (!status) errors.push("status must be 'success' or 'error'");
  if (source !== "datafc") errors.push("source must be 'datafc'");
  if (syncType !== "standings") errors.push("sync_type must be 'standings'");
  const errorMessage = typeof payload.error_message === "string" ? payload.error_message.slice(0, 500) : null;
  if (Array.isArray(payload.standings) && payload.standings.length > 5000) {
    errors.push("standings exceeds 5000 rows");
  }
  if (errors.length > 0 || !status || !source || !syncType || !startedAt) {
    return new Response(JSON.stringify({ error: "Validation failed", details: errors }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate rows only for successful syncs; error logs carry zero rows.
  const rows: StandingRow[] = [];
  if (status === "success") {
    const rawRows = Array.isArray(payload.standings) ? payload.standings : [];
    const rowErrors: string[] = [];
    for (const raw of rawRows) {
      const before = rowErrors.length;
      const row = validateRow(raw, rowErrors);
      if (row && rowErrors.length === before) rows.push(row);
    }
    if (rowErrors.length > 0) {
      return new Response(JSON.stringify({ error: "Invalid standings rows", details: rowErrors.slice(0, 10) }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Replace each (league, season) group atomically enough for our use: delete
  // the old snapshot, then insert the fresh rows. The table has no unique
  // constraint, so replace beats upsert here.
  let inserted = 0;
  const groups = new Map<string, StandingRow[]>();
  for (const row of rows) {
    const key = `${row.league}||${row.season}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const [league, season] = key.split("||");
    const del = await supabase.from("standings").delete().eq("league", league).eq("season", season);
    if (del.error) {
      return new Response(JSON.stringify({ error: `Delete failed: ${del.error.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ins = await supabase.from("standings").insert(list);
    if (ins.error) {
      return new Response(JSON.stringify({ error: `Insert failed: ${ins.error.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted += list.length;
  }

  const log = await supabase.from("data_sync_logs").insert({
    sync_type: syncType,
    source,
    status,
    records_processed: inserted,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    error_message: errorMessage,
  });
  if (log.error) {
    return new Response(JSON.stringify({ error: `Log insert failed: ${log.error.message}`, inserted }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, inserted }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
