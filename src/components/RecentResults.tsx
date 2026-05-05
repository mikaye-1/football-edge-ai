import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Loader2 } from "lucide-react";

interface ResultRow {
  id: string;
  home_team: string;
  away_team: string;
  league: string;
  home_score: number;
  away_score: number;
  kickoff_time: string;
  home_corners: number | null;
  away_corners: number | null;
  home_yellow_cards: number | null;
  away_yellow_cards: number | null;
  home_red_cards: number | null;
  away_red_cards: number | null;
  home_possession: number | null;
  away_possession: number | null;
  home_shots: number | null;
  away_shots: number | null;
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
}

function useRecentResults() {
  return useQuery({
    queryKey: ["recent-results"],
    queryFn: async (): Promise<ResultRow[]> => {
      const { data: matches, error } = await supabase
        .from("matches")
        .select("id, home_team, away_team, league, home_score, away_score, kickoff_time")
        .eq("status", "finished")
        .not("home_score", "is", null)
        .order("kickoff_time", { ascending: false })
        .limit(40);
      if (error) throw error;
      const ids = (matches ?? []).map(m => m.id);
      if (ids.length === 0) return [];
      const { data: stats } = await supabase
        .from("match_stats")
        .select("*")
        .in("match_id", ids);
      const byId = new Map((stats ?? []).map((s: any) => [s.match_id, s]));
      return (matches ?? [])
        .filter(m => byId.has(m.id))
        .slice(0, 8)
        .map(m => ({ ...m, ...byId.get(m.id) } as ResultRow));
    },
    refetchInterval: 60_000,
  });
}

function StatRow({ label, h, a, suffix = "" }: { label: string; h: number | null; a: number | null; suffix?: string }) {
  if (h === null || a === null) return null;
  return (
    <div className="flex items-center justify-between text-xs font-mono">
      <span className="w-10 text-right tabular-nums text-foreground">{h}{suffix}</span>
      <span className="text-muted-foreground uppercase tracking-wide text-[10px]">{label}</span>
      <span className="w-10 text-left tabular-nums text-foreground">{a}{suffix}</span>
    </div>
  );
}

export function RecentResults() {
  const { data = [], isLoading } = useRecentResults();

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">Recent Results</h2>
        <span className="text-[10px] text-muted-foreground ml-1">stats from ESPN</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4">No finished matches with stats yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map(m => (
            <div key={m.id} className="rounded-md border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wide">
                <span>{m.league}</span>
                <span>{new Date(m.kickoff_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate flex-1 text-right">{m.home_team}</span>
                <span className="font-mono text-base font-bold tabular-nums px-2 text-primary">
                  {m.home_score} – {m.away_score}
                </span>
                <span className="text-sm font-medium truncate flex-1 text-left">{m.away_team}</span>
              </div>
              <div className="border-t border-border pt-2 space-y-1">
                <StatRow label="Possession" h={m.home_possession} a={m.away_possession} suffix="%" />
                <StatRow label="Shots" h={m.home_shots} a={m.away_shots} />
                <StatRow label="On Target" h={m.home_shots_on_target} a={m.away_shots_on_target} />
                <StatRow label="Corners" h={m.home_corners} a={m.away_corners} />
                <StatRow label="Yellow" h={m.home_yellow_cards} a={m.away_yellow_cards} />
                {((m.home_red_cards ?? 0) + (m.away_red_cards ?? 0) > 0) && (
                  <StatRow label="Red" h={m.home_red_cards} a={m.away_red_cards} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
