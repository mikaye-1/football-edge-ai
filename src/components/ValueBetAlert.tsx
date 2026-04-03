import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import type { DbPrediction } from "@/hooks/useMatches";

interface ValueBetAlertProps {
  predictions: DbPrediction[];
}

/** Clean up redundant outcome labels */
function cleanOutcome(market: string, outcome: string): string {
  if (market === "Not to Win") {
    return outcome.replace(" Not to Win", "");
  }
  return outcome;
}

export function ValueBetAlert({ predictions }: ValueBetAlertProps) {
  const rawValueBets = predictions
    .filter(p => p.model_probability > p.odds_implied_probability)
    .map(p => ({
      ...p,
      edge: p.model_probability - p.odds_implied_probability,
    }));

  // Group by base market name (strip line numbers like +1.5, -0.5 for grouping)
  const baseMarket = (market: string) => market.replace(/\s*[+-]?\d+\.?\d*$/, '');
  const bestByBaseMarket = new Map<string, typeof rawValueBets[0]>();
  for (const vb of rawValueBets) {
    const base = baseMarket(vb.market);
    const existing = bestByBaseMarket.get(base);
    if (!existing || vb.edge > existing.edge) {
      bestByBaseMarket.set(base, vb);
    }
  }

  const valueBets = [...bestByBaseMarket.values()]
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 3);

  if (valueBets.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-accent/30 bg-accent/5 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-sm text-accent">Value Bet Alerts</h3>
        <span className="text-[10px] sm:text-xs text-muted-foreground">Model probability exceeds market odds</span>
      </div>
      <div className="space-y-2">
        {valueBets.map((vb, i) => {
          const edgePct = (vb.edge * 100).toFixed(1);
          const displayOutcome = cleanOutcome(vb.market, vb.outcome);
          return (
            <motion.div
              key={vb.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-sm bg-secondary/30 rounded-md px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="font-medium truncate">{vb.market}:</span>
                <span className="text-foreground font-semibold truncate">{displayOutcome}</span>
              </div>
              <div className="flex items-center gap-3 text-xs pl-7 sm:pl-0">
                <span className="text-muted-foreground">
                  Model: <span className="font-mono-code text-foreground">{(vb.model_probability * 100).toFixed(0)}%</span>
                </span>
                <span className="text-muted-foreground">
                  Odds: <span className="font-mono-code text-foreground">{(vb.odds_implied_probability * 100).toFixed(0)}%</span>
                </span>
                <span className="font-mono-code font-bold text-accent">+{edgePct}%</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
