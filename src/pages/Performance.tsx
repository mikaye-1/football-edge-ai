import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Shield, BarChart3, Target, TrendingUp, CheckCircle, XCircle, Loader2, RefreshCw, Filter, Trophy, PoundSterling, Activity, Sliders } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from "recharts";

interface PredictionResult {
  id: string;
  match_id: string;
  prediction_id: string;
  market: string;
  predicted_outcome: string;
  actual_outcome: string | null;
  predicted_probability: number;
  was_correct: boolean | null;
  settled_at: string | null;
  edge_percentage: number;
  confidence: string;
}

interface MatchInfo {
  id: string;
  home_team: string;
  away_team: string;
  league: string;
  home_score: number | null;
  away_score: number | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
}

function usePerformanceData() {
  return useQuery({
    queryKey: ["performance-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_results")
        .select("*")
        .not("was_correct", "is", null)
        .order("settled_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PredictionResult[];
    },
    refetchInterval: 60000,
  });
}

function useFinishedMatches() {
  return useQuery({
    queryKey: ["finished-matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id, home_team, away_team, league, home_score, away_score, predicted_home_score, predicted_away_score")
        .eq("status", "finished")
        .order("kickoff_time", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MatchInfo[];
    },
    refetchInterval: 60000,
  });
}

function useModelWeights() {
  return useQuery({
    queryKey: ["model-weights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_weights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });
}

function usePredictionFeatures(predictionIds: string[]) {
  return useQuery({
    queryKey: ["prediction-features", predictionIds.length],
    enabled: predictionIds.length > 0,
    queryFn: async () => {
      const all: { id: string; odds_implied_probability: number }[] = [];
      for (let i = 0; i < predictionIds.length; i += 500) {
        const slice = predictionIds.slice(i, i + 500);
        const { data, error } = await supabase
          .from("predictions")
          .select("id, odds_implied_probability")
          .in("id", slice);
        if (error) throw error;
        all.push(...(data ?? []) as any);
      }
      return all;
    },
  });
}

export default function Performance() {
  const navigate = useNavigate();
  const { data: results = [], isLoading, refetch } = usePerformanceData();
  const { data: finishedMatches = [] } = useFinishedMatches();
  const { data: weights } = useModelWeights();
  const predictionIds = useMemo(() => results.map(r => r.prediction_id), [results]);
  const { data: features = [] } = usePredictionFeatures(predictionIds);
  const [settling, setSettling] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [confFilter, setConfFilter] = useState<string>("all");

  const handleAdapt = async () => {
    setAdapting(true);
    try {
      await supabase.functions.invoke("adapt-weights");
    } catch (e) { console.error("Adapt error:", e); }
    finally { setAdapting(false); }
  };

  const handleSettle = async () => {
    setSettling(true);
    try {
      await supabase.functions.invoke("settle-predictions");
      await refetch();
    } catch (e) {
      console.error("Settlement error:", e);
    } finally {
      setSettling(false);
    }
  };

  const matchLookup = useMemo(() => {
    const map = new Map<string, MatchInfo>();
    for (const m of finishedMatches) map.set(m.id, m);
    return map;
  }, [finishedMatches]);

  const allMarkets = useMemo(() => [...new Set(results.map(r => r.market))].sort(), [results]);

  const filtered = useMemo(() => {
    let f = results;
    if (marketFilter !== "all") f = f.filter(r => r.market === marketFilter);
    if (confFilter !== "all") f = f.filter(r => r.confidence === confFilter);
    return f;
  }, [results, marketFilter, confFilter]);

  const stats = useMemo(() => {
    if (results.length === 0) return null;

    const total = results.length;
    const correct = results.filter(r => r.was_correct).length;
    const accuracy = total > 0 ? correct / total : 0;

    // Average edge on winning bets
    const winningEdges = results.filter(r => r.was_correct && r.edge_percentage > 0).map(r => r.edge_percentage);
    const avgWinEdge = winningEdges.length > 0 ? winningEdges.reduce((s, e) => s + e, 0) / winningEdges.length : 0;

    // By market
    const byMarket = new Map<string, { total: number; correct: number }>();
    for (const r of results) {
      const m = byMarket.get(r.market) || { total: 0, correct: 0 };
      m.total++;
      if (r.was_correct) m.correct++;
      byMarket.set(r.market, m);
    }

    // Best market
    let bestMarket = "";
    let bestRate = 0;
    for (const [market, d] of byMarket) {
      if (d.total >= 3) {
        const rate = d.correct / d.total;
        if (rate > bestRate) { bestRate = rate; bestMarket = market; }
      }
    }

    // By confidence
    const byConfidence = new Map<string, { total: number; correct: number }>();
    for (const r of results) {
      const c = r.confidence || "low";
      const d = byConfidence.get(c) || { total: 0, correct: 0 };
      d.total++;
      if (r.was_correct) d.correct++;
      byConfidence.set(c, d);
    }

    // Recent form (last 20)
    const recent = results.slice(0, 20);
    const recentAcc = recent.length > 0 ? recent.filter(r => r.was_correct).length / recent.length : 0;

    return { total, correct, accuracy, avgWinEdge, byMarket, bestMarket, bestRate, byConfidence, recentAcc };
  }, [results]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-3">
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
          <span className="text-xs text-muted-foreground ml-2">Performance Tracker</span>
          <div className="ml-auto">
            <button
              onClick={handleSettle}
              disabled={settling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${settling ? "animate-spin" : ""}`} />
              {settling ? "Settling..." : "Settle Predictions"}
            </button>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-bold font-display mb-1">Historical Performance</h1>
          <p className="text-sm text-muted-foreground">Track prediction accuracy over time across all markets.</p>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !stats ? (
          <div className="text-center py-20">
            <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">No settled predictions yet.</p>
            <p className="text-muted-foreground text-xs mt-1">Performance data will appear once matches are completed and results are recorded.</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { icon: Target, label: "Win Rate", value: `${(stats.accuracy * 100).toFixed(1)}%`, color: "text-primary" },
                { icon: CheckCircle, label: "Correct", value: `${stats.correct}`, color: "text-confidence-high" },
                { icon: XCircle, label: "Incorrect", value: `${stats.total - stats.correct}`, color: "text-destructive" },
                { icon: TrendingUp, label: "Avg Edge (Wins)", value: `${stats.avgWinEdge.toFixed(1)}%`, color: "text-accent" },
                { icon: Trophy, label: "Best Market", value: stats.bestMarket || "—", color: "text-primary", sub: stats.bestMarket ? `${(stats.bestRate * 100).toFixed(0)}%` : "" },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="gradient-card rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                  <p className={`text-lg font-bold font-mono-code ${s.color} truncate`}>{s.value}</p>
                  {"sub" in s && s.sub && <p className="text-xs text-muted-foreground">{s.sub} win rate</p>}
                </motion.div>
              ))}
            </div>

            {/* Accuracy by Confidence */}
            <div>
              <h2 className="font-semibold text-sm mb-3">Accuracy by Confidence Level</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["high", "medium", "low", "very_low"] as const).map(level => {
                  const d = stats.byConfidence.get(level) || { total: 0, correct: 0 };
                  const acc = d.total > 0 ? (d.correct / d.total * 100).toFixed(1) : "—";
                  const colorMap: Record<string, string> = {
                    high: "text-confidence-high border-confidence-high/30",
                    medium: "text-confidence-medium border-confidence-medium/30",
                    low: "text-destructive border-destructive/30",
                    very_low: "text-muted-foreground border-border",
                  };
                  return (
                    <div key={level} className={`gradient-card rounded-lg border p-3 ${colorMap[level]}`}>
                      <p className="text-xs text-muted-foreground capitalize mb-1">{level.replace("_", " ")}</p>
                      <p className="text-xl font-bold font-mono-code">{acc}%</p>
                      <p className="text-xs text-muted-foreground">{d.correct}/{d.total}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Accuracy by Market */}
            <div>
              <h2 className="font-semibold text-sm mb-3">Accuracy by Market</h2>
              <div className="space-y-2">
                {Array.from(stats.byMarket.entries())
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([market, d]) => {
                    const acc = d.total > 0 ? d.correct / d.total : 0;
                    return (
                      <div key={market} className="gradient-card rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{market}</span>
                          <span className="font-mono-code text-sm font-bold text-primary">{(acc * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div className="h-2 rounded-full gradient-primary transition-all" style={{ width: `${acc * 100}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{d.correct}/{d.total} predictions correct</p>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Filterable History Table */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  Prediction History
                  <span className="text-xs text-muted-foreground font-normal">({filtered.length} results)</span>
                </h2>
                <div className="flex gap-2">
                  <select
                    value={marketFilter}
                    onChange={e => setMarketFilter(e.target.value)}
                    className="text-xs rounded-md border border-border bg-background px-2 py-1 text-foreground"
                  >
                    <option value="all">All Markets</option>
                    {allMarkets.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select
                    value={confFilter}
                    onChange={e => setConfFilter(e.target.value)}
                    className="text-xs rounded-md border border-border bg-background px-2 py-1 text-foreground"
                  >
                    <option value="all">All Confidence</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="very_low">Very Low</option>
                  </select>
                </div>
              </div>

              <div className="gradient-card rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Match</TableHead>
                      <TableHead className="text-xs">Score</TableHead>
                      <TableHead className="text-xs">Market</TableHead>
                      <TableHead className="text-xs">Prediction</TableHead>
                      <TableHead className="text-xs text-center">Result</TableHead>
                      <TableHead className="text-xs text-right">Edge</TableHead>
                      <TableHead className="text-xs text-right">Conf.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 50).map(r => {
                      const match = matchLookup.get(r.match_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-medium max-w-[140px] truncate">
                            {match ? `${match.home_team} vs ${match.away_team}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono-code">
                            {match && match.home_score != null ? (
                              <span>
                                {match.home_score}-{match.away_score}
                                {match.predicted_home_score != null && (
                                  <span className="text-muted-foreground ml-1">
                                    (P: {match.predicted_home_score}-{match.predicted_away_score})
                                  </span>
                                )}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.market}</TableCell>
                          <TableCell className="text-xs">{r.predicted_outcome}</TableCell>
                          <TableCell className="text-center">
                            {r.was_correct ? (
                              <CheckCircle className="w-4 h-4 text-confidence-high inline-block" />
                            ) : (
                              <XCircle className="w-4 h-4 text-destructive inline-block" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono-code">
                            {r.edge_percentage > 0 ? `+${Number(r.edge_percentage).toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right capitalize">{(r.confidence || "").replace("_", " ")}</TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                          No results match your filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
