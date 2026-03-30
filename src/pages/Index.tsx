import { useState } from "react";
import { useMatches, usePredictions } from "@/hooks/useMatches";
import { LeagueFilter } from "@/components/LeagueFilter";
import { MatchCard } from "@/components/MatchCard";
import { StatsBar } from "@/components/StatsBar";
import { TopPredictions } from "@/components/TopPredictions";
import { RefreshTimer } from "@/components/RefreshTimer";
import { Activity, Shield, Loader2 } from "lucide-react";

export default function Index() {
  const [league, setLeague] = useState<string>("all");
  const { data: matches = [], isLoading: matchesLoading } = useMatches(league);
  const { data: predictions = [] } = usePredictions();

  const live = matches.filter(m => m.status === "live");
  const upcoming = matches.filter(m => m.status === "upcoming");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="font-bold text-lg font-display">
              <span className="text-gradient-primary">Burna Predict</span>
              <span className="text-muted-foreground">IQ</span>
            </h1>
          </div>
          <RefreshTimer />
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
        <StatsBar matches={matches} predictions={predictions} />

        <LeagueFilter selected={league} onSelect={setLeague} />

        {matchesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground text-sm">Loading matches...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">No matches found. Click "Fetch Now" to load live odds data.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {live.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-destructive" />
                    <h2 className="font-semibold text-sm">Live Matches</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {live.map((m, i) => <MatchCard key={m.id} match={m} index={i} />)}
                  </div>
                </div>
              )}

              {upcoming.length > 0 && (
                <div>
                  <h2 className="font-semibold text-sm mb-3 text-muted-foreground">Upcoming</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {upcoming.map((m, i) => <MatchCard key={m.id} match={m} index={i} />)}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <TopPredictions />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
