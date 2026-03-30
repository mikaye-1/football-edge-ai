import { motion } from "framer-motion";
import { useTopPredictions } from "@/hooks/useMatches";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2 } from "lucide-react";

export function TopPredictions() {
  const navigate = useNavigate();
  const { data: top = [], isLoading } = useTopPredictions();

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-accent" />
        <h2 className="font-semibold text-sm">Top Predictions</h2>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : top.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">No predictions yet. Fetch odds data first.</p>
      ) : (
        <div className="space-y-2">
          {top.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => navigate(`/match/${p.match_id}`)}
              className="gradient-card rounded-lg border border-border p-3 cursor-pointer hover:border-accent/40 hover:glow-accent transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  {p.matches.home_team} vs {p.matches.away_team}
                </span>
                <ConfidenceBadge level={p.confidence as "high" | "medium" | "low"} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {p.market}: <span className="text-foreground font-semibold">{p.outcome}</span>
                </span>
                <span className="font-mono-code text-sm font-bold text-primary">
                  {(p.final_score * 100).toFixed(0)}%
                </span>
              </div>
              {p.explanation && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.explanation}</p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
