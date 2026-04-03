import { motion } from "framer-motion";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Zap, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import type { DbPrediction } from "@/hooks/useMatches";
import type { ConfidenceLevel } from "@/data/types";

function computeConfidence(modelProb: number): ConfidenceLevel {
  const pct = modelProb * 100;
  if (pct >= 60) return "high";
  if (pct >= 50) return "medium";
  if (pct >= 40) return "low";
  return "very_low";
}

interface PredictionCardProps {
  prediction: DbPrediction;
  index: number;
  rank?: number;
}

export function PredictionCard({ prediction: p, index, rank }: PredictionCardProps) {
  const isValueBet = p.model_probability > p.odds_implied_probability;
  const edge = ((p.model_probability - p.odds_implied_probability) * 100).toFixed(1);
  const confidence = computeConfidence(p.model_probability);

  const modelPct = p.model_probability * 100;
  const oddsPct = p.odds_implied_probability * 100;
  const gap = Math.abs(modelPct - oddsPct);
  const marketLabel = gap <= 3 ? "Market-aligned prediction" : "Model diverges from market";

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`gradient-card rounded-lg border p-3 sm:p-4 ${
        isValueBet ? "border-accent/30" : "border-border"
      }`}
    >
      {/* Prediction name */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {rank && (
            <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
              {rank}
            </span>
          )}
          <span className="font-semibold text-xs sm:text-sm">{p.market}:</span>
          <span className="text-primary font-semibold text-xs sm:text-sm truncate">{p.outcome}</span>
          {isValueBet && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-accent/15 text-accent border border-accent/30 shrink-0">
              <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              +{edge}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono-code text-base sm:text-lg font-bold text-primary">
            {(p.final_score * 100).toFixed(0)}%
          </span>
          <ConfidenceBadge level={confidence} />
        </div>
      </div>

      {/* Market alignment label */}
      <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
        {marketLabel} · Edge: {isValueBet ? '+' : ''}{edge}%
      </p>

      {p.explanation && (
        <p className="text-[11px] sm:text-xs text-muted-foreground mb-3 leading-relaxed">{p.explanation}</p>
      )}

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
        <div className="bg-secondary/50 rounded p-1.5 sm:p-2 text-center">
          <p className="text-muted-foreground">Odds</p>
          <p className="font-mono-code font-semibold">{oddsPct.toFixed(0)}%</p>
        </div>
        <div className="bg-secondary/50 rounded p-1.5 sm:p-2 text-center">
          <p className="text-muted-foreground">Model</p>
          <p className="font-mono-code font-semibold">{modelPct.toFixed(0)}%</p>
        </div>
        <div className="bg-secondary/50 rounded p-1.5 sm:p-2 text-center">
          <p className="text-muted-foreground">Form</p>
          <p className="font-mono-code font-semibold">{(p.form_score * 100).toFixed(0)}%</p>
        </div>
        <TooltipProvider>
          <div className="bg-secondary/50 rounded p-1.5 sm:p-2 text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-muted-foreground flex items-center justify-center gap-0.5 cursor-help">
                  Consist.
                  <Info className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                </p>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs">
                Consistency: how often the model's prediction has matched outcomes in recent similar matches.
              </TooltipContent>
            </Tooltip>
            <p className="font-mono-code font-semibold">{(p.consistency * 100).toFixed(0)}%</p>
          </div>
        </TooltipProvider>
      </div>
    </motion.div>
  );
}
