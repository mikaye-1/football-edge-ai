import { motion } from "framer-motion";
import type { DbMatch, DbPrediction } from "@/hooks/useMatches";
import { Activity, Target, TrendingUp, Zap } from "lucide-react";

interface StatsBarProps {
  matches: DbMatch[];
  predictions: DbPrediction[];
}

export function StatsBar({ matches, predictions }: StatsBarProps) {
  const liveCount = matches.filter(m => m.status === "live").length;
  const highConf = predictions.filter(p => p.confidence === "high").length;
  const totalMatches = matches.length;
  const avgConfidence = predictions.length > 0
    ? predictions.reduce((s, p) => s + p.final_score, 0) / predictions.length
    : 0;

  const stats = [
    { icon: Activity, label: "Live Matches", value: liveCount, color: "text-destructive" },
    { icon: Target, label: "Total Fixtures", value: totalMatches, color: "text-foreground" },
    { icon: TrendingUp, label: "High Confidence", value: highConf, color: "text-confidence-high" },
    { icon: Zap, label: "Avg Confidence", value: `${(avgConfidence * 100).toFixed(0)}%`, color: "text-accent" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s, i) => (
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
  );
}
