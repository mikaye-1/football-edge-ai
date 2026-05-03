// fetch-stats: scrapes finished-match statistics (corners, cards, possession, shots)
// from ESPN's public soccer API. No API key required, covers current seasons.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

// Map our league names to ESPN league slugs
const LEAGUE_SLUG_MAP: Record<string, string> = {
  "Premier League": "eng.1",
  "Championship": "eng.2",
  "La Liga": "esp.1",
  "Serie A": "ita.1",
  "Ligue 1": "fra.1",
  "Bundesliga": "ger.1",
  "Eredivisie": "ned.1",
  "Liga Portugal": "por.1",
  "MLS": "usa.1",
  "Süper Lig": "tur.1",
  "Saudi Pro League": "ksa.1",
  "Champions League": "uefa.champions",
};

function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|ac|club|de|the|united|utd)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const cleaned = String(v).replace("%", "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function pickStat(stats: Array<{ name?: string; displayValue?: string; value?: number }>, name: string): number | null {
  const item = stats.find(s => s.name === name);
  if (!item) return null;
  return parseNum(item.value ?? item.displayValue);
}

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ESPN ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: finishedMatches, error: matchErr } = await supabase
      .from("matches")
      .select("id, league, home_team, away_team, kickoff_time")
      .eq("status", "finished")
      .order("kickoff_time", { ascending: false })
      .limit(80);

    if (matchErr) throw matchErr;
    if (!finishedMatches || finishedMatches.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No finished matches" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchIds = finishedMatches.map(m => m.id);
    const { data: existingStats } = await supabase
      .from("match_stats")
      .select("match_id")
      .in("match_id", matchIds);
    const haveStats = new Set((existingStats ?? []).map(s => s.match_id));
    const targets = finishedMatches.filter(m => !haveStats.has(m.id));

    if (targets.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "All recent matches already have stats" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group (league, date) → matches
    const groups = new Map<string, typeof targets>();
    for (const m of targets) {
      const date = new Date(m.kickoff_time).toISOString().slice(0, 10).replace(/-/g, "");
      const key = `${m.league}|${date}`;
      const arr = groups.get(key) || [];
      arr.push(m);
      groups.set(key, arr);
    }

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [key, matches] of groups) {
      const [leagueName, date] = key.split("|");
      const slug = LEAGUE_SLUG_MAP[leagueName];
      if (!slug) {
        console.log(`No ESPN slug for ${leagueName}, skipping`);
        skipped += matches.length;
        continue;
      }

      try {
        const scoreboard = await fetchJson(`${ESPN_BASE}/${slug}/scoreboard?dates=${date}`);
        const events: any[] = scoreboard.events || [];

        for (const myMatch of matches) {
          const event = events.find(ev => {
            const comp = ev.competitions?.[0];
            const competitors = comp?.competitors || [];
            const home = competitors.find((c: any) => c.homeAway === "home")?.team?.displayName;
            const away = competitors.find((c: any) => c.homeAway === "away")?.team?.displayName;
            return home && away && teamsMatch(home, myMatch.home_team) && teamsMatch(away, myMatch.away_team);
          });

          if (!event) {
            console.log(`No ESPN event for ${myMatch.home_team} vs ${myMatch.away_team} on ${date}`);
            skipped++;
            continue;
          }

          const status = event.competitions?.[0]?.status?.type;
          if (!status?.completed) {
            console.log(`Event ${event.id} not completed, skipping`);
            skipped++;
            continue;
          }

          // Fetch summary for box-score statistics
          const summary = await fetchJson(`${ESPN_BASE}/${slug}/summary?event=${event.id}`);
          const teams: any[] = summary.boxscore?.teams || [];
          if (teams.length < 2) {
            console.log(`No boxscore for event ${event.id}`);
            skipped++;
            await new Promise(r => setTimeout(r, 400));
            continue;
          }

          // Determine which team object is home vs away
          const competitors = event.competitions[0].competitors;
          const homeId = competitors.find((c: any) => c.homeAway === "home")?.team?.id;
          const awayId = competitors.find((c: any) => c.homeAway === "away")?.team?.id;
          const homeTeam = teams.find(t => t.team?.id === homeId) || teams[0];
          const awayTeam = teams.find(t => t.team?.id === awayId) || teams[1];

          const homeStats = homeTeam.statistics || [];
          const awayStats = awayTeam.statistics || [];

          const home_corners = pickStat(homeStats, "wonCorners");
          const away_corners = pickStat(awayStats, "wonCorners");
          const home_yellow = pickStat(homeStats, "yellowCards");
          const away_yellow = pickStat(awayStats, "yellowCards");
          const home_red = pickStat(homeStats, "redCards");
          const away_red = pickStat(awayStats, "redCards");

          const hasCorners = home_corners !== null && away_corners !== null;
          const hasCards = home_yellow !== null && away_yellow !== null;
          if (!hasCorners && !hasCards) {
            console.log(`No useful stats for event ${event.id}`);
            skipped++;
            await new Promise(r => setTimeout(r, 400));
            continue;
          }

          const row = {
            match_id: myMatch.id,
            home_corners,
            away_corners,
            home_yellow_cards: home_yellow,
            away_yellow_cards: away_yellow,
            home_red_cards: home_red ?? (home_yellow !== null ? 0 : null),
            away_red_cards: away_red ?? (away_yellow !== null ? 0 : null),
            home_possession: pickStat(homeStats, "possessionPct"),
            away_possession: pickStat(awayStats, "possessionPct"),
            home_shots: pickStat(homeStats, "totalShots"),
            away_shots: pickStat(awayStats, "totalShots"),
            home_shots_on_target: pickStat(homeStats, "shotsOnTarget"),
            away_shots_on_target: pickStat(awayStats, "shotsOnTarget"),
            source: "espn",
          };

          const { error: insertErr } = await supabase
            .from("match_stats")
            .upsert(row, { onConflict: "match_id" });

          if (insertErr) {
            console.error(`Insert error for ${myMatch.id}:`, insertErr);
            skipped++;
          } else {
            processed++;
          }

          await new Promise(r => setTimeout(r, 400));
        }
      } catch (err: any) {
        console.error(`Error for ${leagueName} on ${date}:`, err.message);
        errors.push(`${leagueName} ${date}: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
      skipped,
      total_targets: targets.length,
      errors: errors.slice(0, 5),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("fetch-stats error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
