import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Brain, Sparkles, AlertTriangle, ChevronDown, ChevronUp, Loader2, Target, TrendingUp } from "lucide-react";
import {
  generateAIPrediction,
  getCachedAIPrediction,
  type AIMatchData,
  type AIPrediction,
} from "@/lib/aiPredictionEngine";
import { generateMatchSummary } from "@/lib/aiMatchSummary";
import { type DbMatch } from "@/hooks/useMatches";

const tierStyles: Record<string, string> = {
  HIGH: "bg-confidence-high/15 text-confidence-high border-confidence-high/30",
  MEDIUM: "bg-confidence-medium/15 text-confidence-medium border-confidence-medium/30",
  LOW: "bg-muted/30 text-muted-foreground border-border",
};

const outcomeLabel = (o: string, home: string, away: string) =>
  o === "home_win" ? `${home} Win` : o === "away_win" ? `${away} Win` : "Draw";

function buildMatchData(match: DbMatch): AIMatchData {
  return {
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    league: match.league,
    matchDate: match.kickoff_time,
    venue: `${match.home_team} home stadium`,
    isNeutralVenue: false,
  };
}

export function AIPredictionCard({ match }: { match: DbMatch }) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const { data: cached, refetch } = useQuery({
    queryKey: ["ai-prediction", match.id],
    queryFn: () => getCachedAIPrediction(match.id),
  });

  // Auto-trigger generation if no cache
  useEffect(() => {
    let cancelled = false;
    if (cached || generating) return;
    (async () => {
      setGenerating(true);
      setError(null);
      try {
        const matchData = buildMatchData(match);
        const pred = await generateAIPrediction(match.id, matchData);
        if (cancelled) return;
        await refetch();
        // Fire-and-forget summary
        generateMatchSummary(match.id, pred, matchData).then(s => {
          if (!cancelled) setSummary(s);
        }).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "AI failed");
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, !!cached]);

  useEffect(() => {
    if (cached?.preview_text) setSummary(cached.preview_text);
  }, [cached?.preview_text]);

  if (generating && !cached) {
    return (
      <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin text-primary" />
        AI analyzing match...
      </div>
    );
  }

  if (error && !cached) {
    return (
      <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
        AI unavailable — falling back to statistical model.
      </div>
    );
  }

  if (!cached) return null;

  const p = cached as AIPrediction;
  const tier = tierStyles[p.confidence_tier] ?? tierStyles.LOW;
  const probData = [
    { name: "Home", value: Math.round((p.win_probability?.home ?? 0) * 100) },
    { name: "Draw", value: Math.round((p.win_probability?.draw ?? 0) * 100) },
    { name: "Away", value: Math.round((p.win_probability?.away ?? 0) * 100) },
  ];
  const colors = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--accent))"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={(e) => e.stopPropagation()}
      className="mt-3 rounded-md border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-3 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">AI Prediction</span>
          {p.is_strong_pick && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-confidence-high/20 text-confidence-high border border-confidence-high/30">
              <Sparkles className="w-2.5 h-2.5" /> STRONG
            </span>
          )}
        </div>
        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${tier}`}>
          {p.confidence_tier}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground">
          {outcomeLabel(p.predicted_outcome, match.home_team, match.away_team)}
        </span>
        {p.is_value_bet && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-accent/20 text-accent border border-accent/30">
            <Target className="w-2.5 h-2.5" /> VALUE BET
          </span>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Edge Score</span>
          <span className="font-mono-code font-semibold text-primary">{Number(p.edge_score).toFixed(1)}%</span>
        </div>
        <div className="h-1.5 rounded bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent"
            style={{ width: `${Math.min(100, Math.max(0, Number(p.edge_score)))}%` }}
          />
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        className="w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-primary pt-1"
      >
        {expanded ? <>Hide details <ChevronUp className="w-3 h-3" /></> : <>Show AI analysis <ChevronDown className="w-3 h-3" /></>}
      </button>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-border">
          {summary && (
            <p className="text-xs text-foreground leading-relaxed italic">{summary}</p>
          )}
          {p.ai_summary && !summary && (
            <p className="text-xs text-foreground leading-relaxed">{p.ai_summary}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={probData} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={45} paddingAngle={2}>
                    {probData.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 text-[11px]">
              {probData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: colors[i] }} />
                    {d.name}
                  </span>
                  <span className="font-mono-code">{d.value}%</span>
                </div>
              ))}
              {p.btts_prediction && (
                <div className="pt-1 text-muted-foreground">BTTS: <span className="text-foreground font-semibold">{p.btts_prediction}</span></div>
              )}
              {p.over_under_prediction && (
                <div className="text-muted-foreground">O/U 2.5: <span className="text-foreground font-semibold">{p.over_under_prediction.replace("_", " ")}</span></div>
              )}
            </div>
          </div>

          {p.value_bet && (
            <div className="rounded border border-accent/30 bg-accent/5 p-2">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-accent mb-1">
                <TrendingUp className="w-3 h-3" /> AI Value Bet — {p.value_bet.market}
              </div>
              <div className="text-xs text-foreground">{p.value_bet.recommendation}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{p.value_bet.reasoning}</div>
            </div>
          )}

          {p.key_factors?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">Key Factors</p>
              <ul className="space-y-0.5">
                {p.key_factors.map((f, i) => (
                  <li key={i} className="text-[11px] text-foreground flex gap-1.5"><span className="text-primary">•</span>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {p.risk_flags?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-destructive mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Risk Flags
              </p>
              <ul className="space-y-0.5">
                {p.risk_flags.map((f, i) => (
                  <li key={i} className="text-[11px] text-destructive/90 flex gap-1.5"><span>•</span>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {p.recommended_markets?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {p.recommended_markets.map((m, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-secondary text-secondary-foreground border border-border">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
