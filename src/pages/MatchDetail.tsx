import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MarketFilter } from "@/components/MarketFilter";
import { ValueBetAlert } from "@/components/ValueBetAlert";
import { PredictionCard } from "@/components/PredictionCard";
import { OddsMovementChart } from "@/components/OddsMovementChart";
import { ArrowLeft, BarChart3, Brain, Shield, Loader2, Trophy } from "lucide-react";

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
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);

  const { data: match, isLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("*").eq("id", matchId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  const { data: preds = [] } = useQuery({
    queryKey: ["match-predictions", matchId],
    queryFn: async () => {
      const { data, error } = await supabase.from("predictions").select("*").eq("match_id", matchId!).order("final_score", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  const { data: odds = [] } = useQuery({
    queryKey: ["match-odds", matchId],
    queryFn: async () => {
      const { data, error } = await supabase.from("odds").select("*").eq("match_id", matchId!);
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  // Available markets from predictions
  const allMarkets = useMemo(() => [...new Set(preds.map(p => p.market))], [preds]);

  // Initialize selected markets to all on first load
  const activeMarkets = selectedMarkets.length > 0 ? selectedMarkets : allMarkets;

  const toggleMarket = (market: string) => {
    setSelectedMarkets(prev => {
      if (prev.length === 0) {
        // First toggle: select only this one (deselect others)
        return [market];
      }
      return prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market];
    });
  };

  const filteredPreds = useMemo(
    () => preds.filter(p => activeMarkets.includes(p.market)),
    [preds, activeMarkets]
  );

  // Top 3 ranked predictions
  const topRanked = useMemo(
    () => [...preds].sort((a, b) => (b.final_score * b.consistency) - (a.final_score * a.consistency)).slice(0, 3),
    [preds]
  );

  // Group odds by market
  const oddsByMarket = useMemo(() => {
    const filtered = odds.filter(o => activeMarkets.includes(o.market));
    return filtered.reduce((acc, o) => {
      if (!acc[o.market]) acc[o.market] = [];
      acc[o.market].push(o);
      return acc;
    }, {} as Record<string, typeof odds>);
  }, [odds, activeMarkets]);

  // Odds chart markets
  const oddsMarkets = useMemo(() => [...new Set(odds.map(o => o.market))].filter(m => activeMarkets.includes(m)), [odds, activeMarkets]);

  if (isLoading) {
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

      <main className="container max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Match Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="gradient-card rounded-lg border border-border p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs sm:text-sm text-muted-foreground">{leagueFlags[match.league] || "⚽"} {match.league}</span>
            {match.status === "live" && <LiveIndicator minute={match.minute} />}
          </div>
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <div className="text-center flex-1">
              <p className="text-base sm:text-xl font-bold leading-tight">{match.home_team}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Home</p>
            </div>
            {match.home_score !== null && match.away_score !== null ? (
              <div className="text-center shrink-0">
                <p className="text-2xl sm:text-3xl font-bold font-mono-code">{match.home_score} - {match.away_score}</p>
                {match.minute && <p className="text-xs text-destructive mt-1">{match.minute}'</p>}
              </div>
            ) : (
              <div className="text-center shrink-0">
                <p className="text-lg sm:text-xl font-mono-code text-muted-foreground">vs</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  {new Date(match.kickoff_time).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  {" · "}
                  {new Date(match.kickoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            )}
            <div className="text-center flex-1">
              <p className="text-base sm:text-xl font-bold leading-tight">{match.away_team}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Away</p>
            </div>
          </div>
        </motion.div>

        {/* Value Bet Alerts */}
        <ValueBetAlert predictions={preds} />

        {/* Top 3 Ranked */}
        {topRanked.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-accent" />
              <h2 className="font-semibold text-sm">Top 3 Ranked Predictions</h2>
              <span className="text-xs text-muted-foreground">(confidence × consistency)</span>
            </div>
            <div className="space-y-2">
              {topRanked.map((p, i) => (
                <PredictionCard key={p.id} prediction={p} index={i} rank={i + 1} />
              ))}
            </div>
          </div>
        )}

        {/* Market Filter */}
        {allMarkets.length > 0 && (
          <MarketFilter markets={allMarkets} selected={selectedMarkets} onToggle={toggleMarket} />
        )}

        {/* All Predictions (filtered) */}
        {filteredPreds.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm">All Predictions</h2>
              <span className="text-xs text-muted-foreground">({filteredPreds.length} outcomes)</span>
            </div>
            <div className="space-y-2">
              {filteredPreds.map((p, i) => (
                <PredictionCard key={p.id} prediction={p} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Odds Movement Charts */}
        {oddsMarkets.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-accent" />
              <h2 className="font-semibold text-sm">Odds Movement</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {oddsMarkets.slice(0, 4).map(m => (
                <OddsMovementChart key={m} odds={odds} market={m} />
              ))}
            </div>
          </div>
        )}

        {/* Live Odds Table */}
        {Object.keys(oddsByMarket).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-accent" />
              <h2 className="font-semibold text-sm">Live Odds</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(oddsByMarket).map(([market, entries]) => {
                const bestByOutcome = new Map<string, (typeof entries)[0]>();
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
