import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CalendarRange, ChevronLeft, Download, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import type { ConfidenceLevel } from "@/data/types";

interface PickStats {
  expectedGoals: string;
  homeForm: string;
  awayForm: string;
  h2h: string;
  sampleGames: number;
  h2hCount: number;
  trainingMatches: number;
  leagueAvgGoals: number;
  odds: number | null;
}

interface TopPick {
  rank: number;
  match_id: string;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  market: string;
  selection: string;
  probability: number;
  confidence_score: number;
  data_quality: number;
  risk_level: "Low" | "Medium" | "High";
  overall_score: number;
  stats: PickStats;
}

function todayLocal(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function tzOffsetFor(date: string): number {
  // Noon avoids DST edge cases on the day boundary.
  return -new Date(`${date}T12:00:00`).getTimezoneOffset();
}

function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 60) return "high";
  if (score >= 50) return "medium";
  if (score >= 40) return "low";
  return "very_low";
}

const riskStyles: Record<TopPick["risk_level"], string> = {
  Low: "bg-confidence-high/15 text-confidence-high border-confidence-high/30",
  Medium: "bg-confidence-medium/15 text-confidence-medium border-confidence-medium/30",
  High: "bg-destructive/15 text-destructive border-destructive/30",
};

function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function DailyTop20() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayLocal());

  const picksQuery = useQuery({
    queryKey: ["daily-top20", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_top20")
        .select("*")
        .eq("for_date", date)
        .order("rank", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TopPick[];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("daily-top20", {
        body: { date, tzOffset: tzOffsetFor(date) },
      });
      if (error) throw error;
      return data as { fixturesAnalyzed: number; totalCandidates: number; picks: unknown[] };
    },
    onSuccess: (d) => {
      toast.success(`Analyzed ${d.fixturesAnalyzed} fixtures — ${d.picks.length} top picks saved`);
      queryClient.invalidateQueries({ queryKey: ["daily-top20", date] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generation failed"),
  });

  const picks = picksQuery.data ?? [];

  const exportToExcel = () => {
    const rows = picks.map((p) => ({
      Rank: p.rank,
      Date: date,
      League: p.league,
      Fixture: `${p.home_team} vs ${p.away_team}`,
      "Kickoff (local)": kickoffLabel(p.kickoff_time),
      Market: p.market,
      Selection: p.selection,
      "Probability (%)": p.probability,
      "Confidence Score": p.confidence_score,
      "Data Quality Score": p.data_quality,
      "Risk Level": p.risk_level,
      "Overall Score": p.overall_score,
      "Expected Goals (model)": p.stats.expectedGoals,
      "Home Form": p.stats.homeForm,
      "Away Form": p.stats.awayForm,
      "Head-to-Head": p.stats.h2h,
      "Team Sample Games": p.stats.sampleGames,
      "H2H Meetings": p.stats.h2hCount,
      "Training Matches": p.stats.trainingMatches,
      "League Avg Goals": p.stats.leagueAvgGoals,
      "Bookmaker Odds": p.stats.odds ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 5 }, { wch: 11 }, { wch: 18 }, { wch: 32 }, { wch: 22 }, { wch: 15 },
      { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 17 }, { wch: 10 }, { wch: 13 },
      { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 12 },
      { wch: 16 }, { wch: 15 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Top 20 ${date}`);
    XLSX.writeFile(wb, `predictiq-top20-${date}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
              title="Back to dashboard"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <CalendarRange className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <h1 className="font-bold text-base sm:text-lg font-display">
              <span className="text-gradient-primary">Daily Top 20</span>
              <span className="text-muted-foreground"> Predictions</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="bg-secondary/60 border border-border rounded-md px-2.5 py-1.5 text-xs sm:text-sm text-foreground [color-scheme:dark]"
            />
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {generate.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {generate.isPending ? "Analyzing..." : "Generate"}
            </button>
            <button
              onClick={exportToExcel}
              disabled={picks.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent/40 bg-accent/10 text-accent text-xs sm:text-sm font-semibold hover:bg-accent/20 transition-colors disabled:opacity-40"
              title="Export the current Top 20 to Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export to Excel</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            Every fixture on the selected local date is scored across BTTS, Over/Under 1.5/2.5/3.5,
            match result and Not To Win, then ranked by{" "}
            <span className="font-mono-code text-foreground">probability × confidence × data quality</span>.
          </p>
          {picks.length > 0 && (
            <p className="font-mono-code">
              Trained on {picks[0].stats.trainingMatches.toLocaleString()} matches · min prob 50% · min confidence 40
            </p>
          )}
        </div>

        {picksQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground text-sm">Loading saved picks...</span>
          </div>
        ) : picks.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">
              No Top 20 saved for {date} yet. Click <span className="text-primary font-semibold">Generate</span> to analyze every fixture.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[860px]">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-muted-foreground text-left">
                  <th className="px-3 py-2 font-semibold w-10">#</th>
                  <th className="px-3 py-2 font-semibold">Fixture</th>
                  <th className="px-3 py-2 font-semibold">Market / Selection</th>
                  <th className="px-3 py-2 font-semibold text-right">Probability</th>
                  <th className="px-3 py-2 font-semibold">Confidence</th>
                  <th className="px-3 py-2 font-semibold text-right">Data Quality</th>
                  <th className="px-3 py-2 font-semibold">Risk</th>
                  <th className="px-3 py-2 font-semibold text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p, i) => (
                  <tr
                    key={p.match_id + p.market + p.selection}
                    className={`border-b border-border/60 last:border-0 ${i % 2 === 1 ? "bg-secondary/20" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
                        {p.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">
                        {p.home_team} <span className="text-muted-foreground font-normal">vs</span> {p.away_team}
                      </p>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground">
                        {p.league} · {kickoffLabel(p.kickoff_time)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 font-mono-code">
                        xG {p.stats.expectedGoals}
                        {p.stats.homeForm && ` · Form ${p.stats.homeForm}/${p.stats.awayForm}`}
                        {p.stats.h2h && ` · H2H ${p.stats.h2h}`}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-muted-foreground">{p.market}</p>
                      <p className="text-primary font-semibold">{p.selection}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-mono-code font-bold text-primary">{p.probability.toFixed(0)}%</span>
                      {p.stats.odds != null && (
                        <p className="text-[10px] text-muted-foreground font-mono-code">@ {p.stats.odds}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ConfidenceBadge level={confidenceLevel(p.confidence_score)} />
                      <p className="text-[10px] text-muted-foreground font-mono-code mt-0.5">{p.confidence_score.toFixed(0)}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-code">{p.data_quality.toFixed(0)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border ${riskStyles[p.risk_level] ?? riskStyles.High}`}>
                        {p.risk_level}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-mono-code text-base font-bold text-gradient-primary">{p.overall_score.toFixed(1)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
