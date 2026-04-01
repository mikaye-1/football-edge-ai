import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import type { DbPrediction } from "@/hooks/useMatches";

interface ValueBetAlertProps {
  predictions: DbPrediction[];
}

export function ValueBetAlert({ predictions }: ValueBetAlertProps) {
  // Value bet = model_probability > odds_implied_probability (positive edge)
  const valueBets = predictions
    .filter(p => p.model_probability > p.odds_implied_probability)
    .sort((a, b) => (b.model_probability - b.odds_implied_probability) - (a.model_probability - a.odds_implied_probability))
    .slice(0, 3);

  if (valueBets.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-accent/30 bg-accent/5 p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-sm text-accent">Value Bet Alerts</h3>
        <span className="text-xs text-muted-foreground">Model probability exceeds market odds</span>
      </div>
      <div className="space-y-2">
        {valueBets.map((vb, i) => {
          const edge = ((vb.model_probability - vb.odds_implied_probability) * 100).toFixed(1);
          return (
            <motion.div
              key={vb.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center justify-between text-sm bg-secondary/30 rounded-md px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="font-medium">{vb.market}:</span>
                <span className="text-foreground font-semibold">{vb.outcome}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">
                  Model: <span className="font-mono-code text-foreground">{(vb.model_probability * 100).toFixed(0)}%</span>
                </span>
                <span className="text-muted-foreground">
                  Odds: <span className="font-mono-code text-foreground">{(vb.odds_implied_probability * 100).toFixed(0)}%</span>
                </span>
                <span className="font-mono-code font-bold text-accent">+{edge}% edge</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
