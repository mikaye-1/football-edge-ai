import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import type { DbMatch } from "@/hooks/useMatches";
import { usePredictions } from "@/hooks/useMatches";
import { LiveClock } from "./LiveIndicator";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ChevronRight, TrendingUp } from "lucide-react";

const leagueFlags: Record<string, string> = {
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "La Liga": "🇪🇸",
  "Serie A": "🇮🇹",
  "Ligue 1": "🇫🇷",
  "Saudi Pro League": "🇸🇦",
  "MLS": "🇺🇸",
  "Süper Lig": "🇹🇷",
  "Bundesliga": "🇩🇪",
  "Eredivisie": "🇳🇱",
  "Liga Portugal": "🇵🇹",
  "Championship": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Champions League": "🏆",
};

export function MatchCard({ match, index }: { match: DbMatch; index: number }) {
  const navigate = useNavigate();
  const { data: allPreds = [] } = usePredictions(match.id);
  const preds = allPreds.slice(0, 3);
  const topPred = preds[0];

  const isLive = match.status === "live";
  const hasScore = match.home_score !== null && match.away_score !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => navigate(`/match/${match.id}`)}
      className={`gradient-card rounded-lg border p-4 cursor-pointer hover:border-primary/40 hover:glow-primary transition-all group ${isLive ? "border-green-500/40" : "border-border"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium">
          {leagueFlags[match.league] || "⚽"} {match.league}
        </span>
        {isLive ? (
          <LiveClock kickoffTime={match.kickoff_time} minute={match.minute} />
        ) : (
          <div className="text-right">
            <span className="text-xs text-muted-foreground font-mono-code block">
              {new Date(match.kickoff_time).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
            <span className="text-xs text-muted-foreground font-mono-code">
              {new Date(match.kickoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex-1">
          <p className="font-semibold text-sm">{match.home_team}</p>
          <p className="font-semibold text-sm text-muted-foreground">{match.away_team}</p>
        </div>
        {hasScore && (
          <div className="text-right font-mono-code">
            <p className={`font-bold text-lg ${isLive ? "text-green-500" : ""}`}>{match.home_score}</p>
            <p className={`font-bold text-lg ${isLive ? "text-green-500" : "text-muted-foreground"}`}>{match.away_score}</p>
          </div>
        )}
      </div>

      {/* Predicted Scoreline */}
      {match.predicted_home_score != null && match.predicted_away_score != null && (
        <div className={`flex items-center gap-2 mb-3 text-xs ${hasScore ? "" : "mt-1"}`}>
          <span className="text-muted-foreground">Predicted:</span>
          <span className="font-mono-code font-semibold text-primary">
            {match.predicted_home_score} - {match.predicted_away_score}
          </span>
          {hasScore && (
            <>
              <span className="text-muted-foreground">vs Actual:</span>
              <span className="font-mono-code font-semibold text-foreground">
                {match.home_score} - {match.away_score}
              </span>
            </>
          )}
        </div>
      )}

      {topPred && (
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-primary">Top Prediction</span>
            </div>
            <ConfidenceBadge level={topPred.confidence as "high" | "medium" | "low"} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground">
              {topPred.market}: <span className="font-semibold">{topPred.outcome}</span>
            </span>
            <span className="font-mono-code text-xs font-bold text-primary">
              {(topPred.final_score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {preds.length > 1 && (
        <div className="mt-2 space-y-1">
          {preds.slice(1).map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{p.market}: {p.outcome}</span>
              <span className="font-mono-code">{(p.final_score * 100).toFixed(0)}%</span>
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
