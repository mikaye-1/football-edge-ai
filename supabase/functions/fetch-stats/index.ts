import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

// Map our league names to API-Football league IDs (current season)
const LEAGUE_ID_MAP: Record<string, number> = {
  "Premier League": 39,
  "La Liga": 140,
  "Serie A": 135,
  "Ligue 1": 61,
  "Bundesliga": 78,
  "Eredivisie": 88,
  "Liga Portugal": 94,
  "Championship": 40,
  "Champions League": 2,
  "MLS": 253,
  "Süper Lig": 203,
  "Saudi Pro League": 307,
};

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  league: { id: number; season: number };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
}

interface StatItem {
  type: string;
  value: number | string | null;
}

interface FixtureStatistics {
  team: { id: number; name: string };
  statistics: StatItem[];
}

// Normalize team names for fuzzy matching across providers
function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|ac|club|de|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function parseStatNumber(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace("%", "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function extractStat(stats: StatItem[], typeName: string): number | null {
  const item = stats.find(s => s.type.toLowerCase() === typeName.toLowerCase());
  return item ? parseStatNumber(item.value) : null;
}

async function fetchApiFootball(path: string, apiKey: string): Promise<any> {
  const resp = await fetch(`${API_FOOTBALL_BASE}${path}`, {
    headers: { "x-apisports-key": apiKey },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API-Football ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!API_KEY) throw new Error("API_FOOTBALL_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get finished matches without stats yet (limit to recent to conserve API quota)
    const { data: finishedMatches, error: matchErr } = await supabase
      .from("matches")
      .select("id, league, home_team, away_team, kickoff_time")
      .eq("status", "finished")
      .order("kickoff_time", { ascending: false })
      .limit(50);

    if (matchErr) throw matchErr;
    if (!finishedMatches || finishedMatches.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No finished matches" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out matches that already have stats
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

    // Group by league to fetch fixture lists efficiently
    const byLeague = new Map<string, typeof targets>();
    for (const m of targets) {
      const arr = byLeague.get(m.league) || [];
      arr.push(m);
      byLeague.set(m.league, arr);
    }

    let processed = 0;
    let skipped = 0;
    const currentSeason = new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0);

    for (const [leagueName, matches] of byLeague) {
      const leagueId = LEAGUE_ID_MAP[leagueName];
      if (!leagueId) {
        console.log(`No API-Football league ID for ${leagueName}, skipping`);
        skipped += matches.length;
        continue;
      }

      // Determine date range for fixture lookup
      const dates = matches.map(m => new Date(m.kickoff_time).toISOString().slice(0, 10));
      const uniqueDates = Array.from(new Set(dates));

      for (const date of uniqueDates) {
        try {
          const fixturesResp = await fetchApiFootball(
            `/fixtures?league=${leagueId}&season=${currentSeason}&date=${date}`,
            API_KEY
          );
          const fixtures: ApiFootballFixture[] = fixturesResp.response || [];

          // Match our matches to API-Football fixtures
          const dateMatches = matches.filter(m => new Date(m.kickoff_time).toISOString().slice(0, 10) === date);

          for (const myMatch of dateMatches) {
            const fixture = fixtures.find(f =>
              teamsMatch(f.teams.home.name, myMatch.home_team) &&
              teamsMatch(f.teams.away.name, myMatch.away_team)
            );

            if (!fixture) {
              console.log(`No fixture match for ${myMatch.home_team} vs ${myMatch.away_team} on ${date}`);
              skipped++;
              continue;
            }

            // Fetch statistics for this fixture
            const statsResp = await fetchApiFootball(
              `/fixtures/statistics?fixture=${fixture.fixture.id}`,
              API_KEY
            );
            const teamStats: FixtureStatistics[] = statsResp.response || [];

            const homeStats = teamStats.find(t => t.team.id === fixture.teams.home.id);
            const awayStats = teamStats.find(t => t.team.id === fixture.teams.away.id);

            if (!homeStats || !awayStats) {
              console.log(`Stats unavailable for fixture ${fixture.fixture.id}`);
              skipped++;
              continue;
            }

            const row = {
              match_id: myMatch.id,
              home_corners: extractStat(homeStats.statistics, "Corner Kicks"),
              away_corners: extractStat(awayStats.statistics, "Corner Kicks"),
              home_yellow_cards: extractStat(homeStats.statistics, "Yellow Cards"),
              away_yellow_cards: extractStat(awayStats.statistics, "Yellow Cards"),
              home_red_cards: extractStat(homeStats.statistics, "Red Cards"),
              away_red_cards: extractStat(awayStats.statistics, "Red Cards"),
              home_possession: extractStat(homeStats.statistics, "Ball Possession"),
              away_possession: extractStat(awayStats.statistics, "Ball Possession"),
              home_shots: extractStat(homeStats.statistics, "Total Shots"),
              away_shots: extractStat(awayStats.statistics, "Total Shots"),
              home_shots_on_target: extractStat(homeStats.statistics, "Shots on Goal"),
              away_shots_on_target: extractStat(awayStats.statistics, "Shots on Goal"),
              source: "api-football",
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

            // Rate-limit politeness (API-Football free tier: ~10 req/min)
            await new Promise(r => setTimeout(r, 700));
          }
        } catch (err) {
          console.error(`Error for ${leagueName} on ${date}:`, err);
        }

        await new Promise(r => setTimeout(r, 500));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
      skipped,
      total_targets: targets.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-stats error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
