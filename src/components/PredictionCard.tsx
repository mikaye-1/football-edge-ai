import { motion } from "framer-motion";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Zap } from "lucide-react";
import type { DbPrediction } from "@/hooks/useMatches";

interface PredictionCardProps {
  prediction: DbPrediction;
  index: number;
  rank?: number;
}

export function PredictionCard({ prediction: p, index, rank }: PredictionCardProps) {
  const isValueBet = p.model_probability > p.odds_implied_probability;
  const edge = ((p.model_probability - p.odds_implied_probability) * 100).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`gradient-card rounded-lg border p-4 ${
        isValueBet ? "border-accent/30" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {rank && (
            <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
              {rank}
            </span>
          )}
          <span className="font-semibold text-sm">{p.market}</span>
          <span className="text-primary font-semibold text-sm">{p.outcome}</span>
          {isValueBet && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-accent/15 text-accent border border-accent/30">
              <Zap className="w-3 h-3" />
              +{edge}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono-code text-lg font-bold text-primary">
            {(p.final_score * 100).toFixed(0)}%
          </span>
          <ConfidenceBadge level={p.confidence as "high" | "medium" | "low"} />
        </div>
      </div>

      {p.explanation && (
        <p className="text-xs text-muted-foreground mb-3">{p.explanation}</p>
      )}

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-secondary/50 rounded p-2 text-center">
          <p className="text-muted-foreground">Odds Prob</p>
          <p className="font-mono-code font-semibold">{(p.odds_implied_probability * 100).toFixed(0)}%</p>
        </div>
        <div className="bg-secondary/50 rounded p-2 text-center">
          <p className="text-muted-foreground">Model</p>
          <p className="font-mono-code font-semibold">{(p.model_probability * 100).toFixed(0)}%</p>
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
  );
}
