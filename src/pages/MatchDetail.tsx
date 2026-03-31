import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { LiveIndicator } from "@/components/LiveIndicator";
import { ArrowLeft, BarChart3, Brain, Shield, Loader2 } from "lucide-react";
import { OddsMovementChart } from "@/components/OddsMovementChart";

const leagueFlags: Record<string, string> = {
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "La Liga": "🇪🇸",
  "Serie A": "🇮🇹",
  "Ligue 1": "🇫🇷",
  "Saudi Pro League": "🇸🇦",
  "MLS": "🇺🇸",
  "Süper Lig": "🇹🇷",
};

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .eq("id", matchId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  const { data: preds = [] } = useQuery({
    queryKey: ["match-predictions", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("*")
        .eq("match_id", matchId!)
        .order("final_score", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  const { data: odds = [] } = useQuery({
    queryKey: ["match-odds", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("odds")
        .select("*")
        .eq("match_id", matchId!);
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  if (matchLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Match not found</p>
      </div>
    );
  }

  // Group odds by market for display
  const oddsByMarket = odds.reduce((acc, o) => {
    if (!acc[o.market]) acc[o.market] = [];
    acc[o.market].push(o);
    return acc;
  }, {} as Record<string, typeof odds>);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm font-display">
              <span className="text-gradient-primary">Predict</span>
              <span className="text-muted-foreground">IQ</span>
            </span>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Match Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="gradient-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">{leagueFlags[match.league] || "⚽"} {match.league}</span>
            {match.status === "live" && <LiveIndicator minute={match.minute} />}
          </div>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-xl font-bold">{match.home_team}</p>
              <p className="text-xs text-muted-foreground mt-1">Home</p>
            </div>
            {match.home_score !== null && match.away_score !== null ? (
              <div className="text-center">
                <p className="text-3xl font-bold font-mono-code">{match.home_score} - {match.away_score}</p>
                {match.minute && <p className="text-xs text-destructive mt-1">{match.minute}'</p>}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xl font-mono-code text-muted-foreground">vs</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(match.kickoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            )}
            <div className="text-center">
              <p className="text-xl font-bold">{match.away_team}</p>
              <p className="text-xs text-muted-foreground mt-1">Away</p>
            </div>
          </div>
        </motion.div>

        {/* Predictions */}
        {preds.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">All Predictions</h2>
            </div>
            <div className="space-y-2">
              {preds.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="gradient-card rounded-lg border border-border p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{p.market}</span>
                      <span className="text-primary font-semibold text-sm">{p.outcome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-code text-lg font-bold text-primary">{(p.final_score * 100).toFixed(0)}%</span>
                      <ConfidenceBadge level={p.confidence as "high" | "medium" | "low"} />
                    </div>
                  </div>
                  {p.explanation && <p className="text-xs text-muted-foreground mb-3">{p.explanation}</p>}
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="bg-secondary/50 rounded p-2 text-center">
                      <p className="text-muted-foreground">Model</p>
                      <p className="font-mono-code font-semibold">{(p.model_probability * 100).toFixed(0)}%</p>
                    </div>
                    <div className="bg-secondary/50 rounded p-2 text-center">
                      <p className="text-muted-foreground">Odds</p>
                      <p className="font-mono-code font-semibold">{(p.odds_implied_probability * 100).toFixed(0)}%</p>
                    </div>
                    <div className="bg-secondary/50 rounded p-2 text-center">
                      <p className="text-muted-foreground">Form</p>
                      <p className="font-mono-code font-semibold">{(p.form_score * 100).toFixed(0)}%</p>
                    </div>
                    <div className="bg-secondary/50 rounded p-2 text-center">
                      <p className="text-muted-foreground">Consistency</p>
                      <p className="font-mono-code font-semibold">{(p.consistency * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Odds Movement Charts */}
        {odds.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-accent" />
              <h2 className="font-semibold">Odds Movement</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <OddsMovementChart odds={odds} market="1X2" />
              <OddsMovementChart odds={odds} market="Over/Under 2.5" />
            </div>
          </div>
        )}

        {/* Odds Breakdown */}
        {Object.keys(oddsByMarket).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-accent" />
              <h2 className="font-semibold">Live Odds</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(oddsByMarket).map(([market, entries]) => {
                const bestByOutcome = new Map<string, typeof entries[0]>();
                for (const e of entries) {
                  const existing = bestByOutcome.get(e.outcome);
                  if (!existing || e.odds > existing.odds) bestByOutcome.set(e.outcome, e);
                }
                return (
                  <div key={market} className="gradient-card rounded-lg border border-border p-4">
                    <p className="text-xs text-muted-foreground mb-3 font-semibold">{market}</p>
                    <div className="space-y-2">
                      {Array.from(bestByOutcome.values()).map(o => (
                        <div key={o.outcome} className="flex items-center justify-between text-sm">
                          <span className="text-foreground">{o.outcome}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono-code font-bold text-primary">{Number(o.odds).toFixed(2)}</span>
                            <span className="text-xs text-muted-foreground">{o.bookmaker}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
