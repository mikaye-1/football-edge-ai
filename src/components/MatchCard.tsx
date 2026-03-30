import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import type { Match, Prediction } from "@/data/types";
import { leagueFlags, getMatchPredictions } from "@/data/mockData";
import { LiveIndicator } from "./LiveIndicator";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ChevronRight, TrendingUp } from "lucide-react";

export function MatchCard({ match, index }: { match: Match; index: number }) {
  const navigate = useNavigate();
  const preds = getMatchPredictions(match.id).slice(0, 3);
  const topPred = preds[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => navigate(`/match/${match.id}`)}
      className="gradient-card rounded-lg border border-border p-4 cursor-pointer hover:border-primary/40 hover:glow-primary transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium">
          {leagueFlags[match.league]} {match.league}
        </span>
        {match.status === "live" ? (
          <LiveIndicator minute={match.minute} />
        ) : (
          <span className="text-xs text-muted-foreground font-mono-code">
            {new Date(match.kickoffTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <p className="font-semibold text-sm">{match.homeTeam}</p>
          <p className="font-semibold text-sm text-muted-foreground">{match.awayTeam}</p>
        </div>
        {match.score && (
          <div className="text-right font-mono-code">
            <p className="font-bold text-lg">{match.score.home}</p>
            <p className="font-bold text-lg text-muted-foreground">{match.score.away}</p>
          </div>
        )}
      </div>

      {topPred && (
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-primary">Top Prediction</span>
            </div>
            <ConfidenceBadge level={topPred.confidence} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground">
              {topPred.market}: <span className="font-semibold">{topPred.outcome}</span>
            </span>
            <span className="font-mono-code text-xs font-bold text-primary">
              {(topPred.finalScore * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {preds.length > 1 && (
        <div className="mt-2 space-y-1">
          {preds.slice(1).map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{p.market}: {p.outcome}</span>
              <span className="font-mono-code">{(p.finalScore * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end mt-2 text-xs text-muted-foreground group-hover:text-primary transition-colors">
        <span>Full Analysis</span>
        <ChevronRight className="w-3 h-3 ml-0.5" />
      </div>
    </motion.div>
  );
}
