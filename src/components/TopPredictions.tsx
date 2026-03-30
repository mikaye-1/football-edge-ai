import { motion } from "framer-motion";
import { predictions, getMatchById } from "@/data/mockData";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function TopPredictions() {
  const navigate = useNavigate();
  const top = [...predictions]
    .filter(p => p.confidence === "high")
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 6);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-accent" />
        <h2 className="font-semibold text-sm">Top Predictions</h2>
      </div>
      <div className="space-y-2">
        {top.map((p, i) => {
          const match = getMatchById(p.matchId);
          if (!match) return null;
          return (
            <motion.div
              key={`${p.matchId}-${p.market}-${p.outcome}`}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => navigate(`/match/${p.matchId}`)}
              className="gradient-card rounded-lg border border-border p-3 cursor-pointer hover:border-accent/40 hover:glow-accent transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  {match.homeTeam} vs {match.awayTeam}
                </span>
                <ConfidenceBadge level={p.confidence} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {p.market}: <span className="text-foreground font-semibold">{p.outcome}</span>
                </span>
                <span className="font-mono-code text-sm font-bold text-primary">
                  {(p.finalScore * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.explanation}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
