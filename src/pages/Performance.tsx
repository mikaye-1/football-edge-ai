import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Shield, BarChart3, Target, TrendingUp, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";

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
}

function usePerformanceData() {
  return useQuery({
    queryKey: ["performance"],
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

export default function Performance() {
  const navigate = useNavigate();
  const { data: results = [], isLoading, refetch } = usePerformanceData();
  const [settling, setSettling] = useState(false);

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

  const stats = useMemo(() => {
    if (results.length === 0) return null;

    const total = results.length;
    const correct = results.filter(r => r.was_correct).length;
    const accuracy = total > 0 ? correct / total : 0;

    // By market
    const byMarket = new Map<string, { total: number; correct: number }>();
    for (const r of results) {
      const m = byMarket.get(r.market) || { total: 0, correct: 0 };
      m.total++;
      if (r.was_correct) m.correct++;
      byMarket.set(r.market, m);
    }

    // By confidence bracket
    const byConfidence = { high: { total: 0, correct: 0 }, medium: { total: 0, correct: 0 }, low: { total: 0, correct: 0 } };
    for (const r of results) {
      const prob = r.predicted_probability;
      const bracket = prob >= 0.7 ? "high" : prob >= 0.6 ? "medium" : "low";
      byConfidence[bracket].total++;
      if (r.was_correct) byConfidence[bracket].correct++;
    }

    // Calibration: group by probability buckets
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}%`,
      predicted: 0,
      actual: 0,
      count: 0,
    }));
    for (const r of results) {
      const idx = Math.min(Math.floor(r.predicted_probability * 10), 9);
      buckets[idx].count++;
      buckets[idx].predicted += r.predicted_probability;
      if (r.was_correct) buckets[idx].actual++;
    }

    // Recent form (last 20)
    const recent = results.slice(0, 20);
    const recentAcc = recent.length > 0 ? recent.filter(r => r.was_correct).length / recent.length : 0;

    return { total, correct, accuracy, byMarket, byConfidence, buckets, recentAcc };
  }, [results]);

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

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: Target, label: "Overall Accuracy", value: `${(stats.accuracy * 100).toFixed(1)}%`, color: "text-primary" },
                { icon: CheckCircle, label: "Correct", value: stats.correct, color: "text-confidence-high" },
                { icon: XCircle, label: "Incorrect", value: stats.total - stats.correct, color: "text-destructive" },
                { icon: TrendingUp, label: "Recent Form", value: `${(stats.recentAcc * 100).toFixed(0)}%`, color: "text-accent" },
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
                  <p className={`text-xl font-bold font-mono-code ${s.color}`}>{s.value}</p>
                </motion.div>
              ))}
            </div>

            {/* By Confidence */}
            <div>
              <h2 className="font-semibold text-sm mb-3">Accuracy by Confidence Level</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["high", "medium", "low"] as const).map(level => {
                  const d = stats.byConfidence[level];
                  const acc = d.total > 0 ? (d.correct / d.total * 100).toFixed(1) : "—";
                  const colorMap = { high: "text-confidence-high border-confidence-high/30", medium: "text-confidence-medium border-confidence-medium/30", low: "text-destructive border-destructive/30" };
                  return (
                    <div key={level} className={`gradient-card rounded-lg border p-4 ${colorMap[level]}`}>
                      <p className="text-xs text-muted-foreground capitalize mb-1">{level} Confidence</p>
                      <p className="text-2xl font-bold font-mono-code">{acc}%</p>
                      <p className="text-xs text-muted-foreground">{d.correct}/{d.total} correct</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Market */}
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
                          <div
                            className="h-2 rounded-full gradient-primary transition-all"
                            style={{ width: `${acc * 100}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{d.correct}/{d.total} predictions correct</p>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Recent Results */}
            <div>
              <h2 className="font-semibold text-sm mb-3">Recent Results</h2>
              <div className="space-y-1">
                {results.slice(0, 15).map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center justify-between gradient-card rounded border border-border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {r.was_correct ? (
                        <CheckCircle className="w-4 h-4 text-confidence-high" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                      <span className="text-muted-foreground text-xs">{r.market}</span>
                      <span className="font-medium">{r.predicted_outcome}</span>
                    </div>
                    <span className="font-mono-code text-xs">{(r.predicted_probability * 100).toFixed(0)}%</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
