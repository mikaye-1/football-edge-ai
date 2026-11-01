import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStandings } from "@/hooks/useStandings";
import { Loader2, Table2, ArrowLeft } from "lucide-react";

function FormBadges({ form }: { form: string | null }) {
  if (!form) return <span className="text-muted-foreground text-xs">—</span>;
  const chars = form.replace(/[^WDLwdl]/g, "").slice(-5).toUpperCase().split("");
  return (
    <div className="flex gap-1">
      {chars.map((c, i) => (
        <span
          key={i}
          className={
            "w-4 h-4 rounded-sm text-[9px] font-mono flex items-center justify-center " +
            (c === "W"
              ? "bg-primary/20 text-primary"
              : c === "D"
              ? "bg-muted text-muted-foreground"
              : "bg-destructive/15 text-destructive")
          }
        >
          {c}
        </span>
      ))}
    </div>
  );
}

export default function Standings() {
  const navigate = useNavigate();
  const { data: standings = [], isLoading, error } = useStandings();
  const [league, setLeague] = useState<string>("all");

  const leagues = useMemo(
    () => Array.from(new Set(standings.map(s => s.league))).sort(),
    [standings]
  );

  const rows = useMemo(
    () => (league === "all" ? [] : standings.filter(s => s.league === league)),
    [standings, league]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
              title="Back to dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Table2 className="w-5 h-5 text-primary" />
            <h1 className="font-bold text-base sm:text-lg font-display">League Standings</h1>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground text-sm">Loading standings...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-muted-foreground text-sm">
            Standings are not available yet. They fill in once the datafc sync runs.
          </div>
        ) : leagues.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">
              No standings yet. They appear here after the first datafc sync completes.
            </p>
          </div>
        ) : (
          <>
            {league === "all" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {leagues.map(l => {
                  const count = standings.filter(s => s.league === l).length;
                  return (
                    <button
                      key={l}
                      onClick={() => setLeague(l)}
                      className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-secondary/40 transition-colors text-left"
                    >
                      <p className="font-medium text-sm">{l}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">{count} teams</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => setLeague("all")}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  ← All leagues
                </button>
                <p className="text-xs text-muted-foreground font-mono">
                  {rows[0]?.season} · source: {rows[0]?.source}
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Team</th>
                        <th className="px-2 py-2 text-center font-mono">MP</th>
                        <th className="px-2 py-2 text-center font-mono">W</th>
                        <th className="px-2 py-2 text-center font-mono">D</th>
                        <th className="px-2 py-2 text-center font-mono">L</th>
                        <th className="px-2 py-2 text-center font-mono hidden sm:table-cell">GF</th>
                        <th className="px-2 py-2 text-center font-mono hidden sm:table-cell">GA</th>
                        <th className="px-2 py-2 text-center font-mono">GD</th>
                        <th className="px-2 py-2 text-center font-mono">Pts</th>
                        <th className="px-3 py-2 text-left hidden md:table-cell">Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(s => (
                        <tr key={`${s.team_external_id}-${s.team_name}`} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                          <td className="px-3 py-2 font-mono text-muted-foreground">{s.position}</td>
                          <td className="px-3 py-2 font-medium">{s.team_name}</td>
                          <td className="px-2 py-2 text-center font-mono">{s.matches_played}</td>
                          <td className="px-2 py-2 text-center font-mono">{s.wins}</td>
                          <td className="px-2 py-2 text-center font-mono">{s.draws}</td>
                          <td className="px-2 py-2 text-center font-mono">{s.losses}</td>
                          <td className="px-2 py-2 text-center font-mono hidden sm:table-cell">{s.goals_for}</td>
                          <td className="px-2 py-2 text-center font-mono hidden sm:table-cell">{s.goals_against}</td>
                          <td className={"px-2 py-2 text-center font-mono " + (s.goal_diff > 0 ? "text-primary" : s.goal_diff < 0 ? "text-destructive" : "")}>
                            {s.goal_diff > 0 ? "+" : ""}{s.goal_diff}
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-bold">{s.points}</td>
                          <td className="px-3 py-2 hidden md:table-cell">
                            <FormBadges form={s.form} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
