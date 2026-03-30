import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { getMatchById, getMatchPredictions, getTeamStats, getHeadToHead, getOddsMovement, leagueFlags } from "@/data/mockData";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { LiveIndicator } from "@/components/LiveIndicator";
import { ArrowLeft, BarChart3, Brain, TrendingUp, History, Shield } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const match = getMatchById(matchId || "");

  if (!match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Match not found</p>
      </div>
    );
  }

  const preds = getMatchPredictions(match.id);
  const homeStats = getTeamStats(match.homeTeam);
  const awayStats = getTeamStats(match.awayTeam);
  const h2h = getHeadToHead(match.homeTeam, match.awayTeam);
  const oddsMove = getOddsMovement(match.id);

  const formColors = { W: "bg-confidence-high", D: "bg-confidence-medium", L: "bg-confidence-low" };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm font-display">
              <span className="text-gradient-primary">Predict</span>
              <span className="text-muted-foreground">IQ</span>
            </span>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Match Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="gradient-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">{leagueFlags[match.league]} {match.league}</span>
            {match.status === "live" && <LiveIndicator minute={match.minute} />}
          </div>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-xl font-bold">{match.homeTeam}</p>
              <p className="text-xs text-muted-foreground mt-1">Home</p>
            </div>
            {match.score ? (
              <div className="text-center">
                <p className="text-3xl font-bold font-mono-code">{match.score.home} - {match.score.away}</p>
                {match.minute && <p className="text-xs text-destructive mt-1">{match.minute}'</p>}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xl font-mono-code text-muted-foreground">vs</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(match.kickoffTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            )}
            <div className="text-center">
              <p className="text-xl font-bold">{match.awayTeam}</p>
              <p className="text-xs text-muted-foreground mt-1">Away</p>
            </div>
          </div>
        </motion.div>

        {/* Predictions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">All Predictions</h2>
          </div>
          <div className="space-y-2">
            {preds.map((p, i) => (
              <motion.div
                key={`${p.market}-${p.outcome}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="gradient-card rounded-lg border border-border p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{p.market}</span>
                    <span className="text-primary font-semibold text-sm">{p.outcome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-code text-lg font-bold text-primary">{(p.finalScore * 100).toFixed(0)}%</span>
                    <ConfidenceBadge level={p.confidence} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{p.explanation}</p>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="bg-secondary/50 rounded p-2 text-center">
                    <p className="text-muted-foreground">Model</p>
                    <p className="font-mono-code font-semibold">{(p.modelProbability * 100).toFixed(0)}%</p>
                  </div>
                  <div className="bg-secondary/50 rounded p-2 text-center">
                    <p className="text-muted-foreground">Odds</p>
                    <p className="font-mono-code font-semibold">{(p.oddsImpliedProbability * 100).toFixed(0)}%</p>
                  </div>
                  <div className="bg-secondary/50 rounded p-2 text-center">
                    <p className="text-muted-foreground">Form</p>
                    <p className="font-mono-code font-semibold">{(p.formScore * 100).toFixed(0)}%</p>
                  </div>
                  <div className="bg-secondary/50 rounded p-2 text-center">
                    <p className="text-muted-foreground">Consistency</p>
                    <p className="font-mono-code font-semibold">{(p.consistency * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Team Stats Comparison */}
        {homeStats && awayStats && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-accent" />
              <h2 className="font-semibold">Team Comparison</h2>
            </div>
            <div className="gradient-card rounded-lg border border-border p-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                {[
                  { label: "Goals Scored", home: homeStats.goalsScored, away: awayStats.goalsScored },
                  { label: "Goals Conceded", home: homeStats.goalsConceded, away: awayStats.goalsConceded },
                  { label: "Clean Sheets", home: homeStats.cleanSheets, away: awayStats.cleanSheets },
                  { label: "Possession %", home: homeStats.possession, away: awayStats.possession },
                  { label: "xG", home: homeStats.xG?.toFixed(1), away: awayStats.xG?.toFixed(1) },
                ].map(row => (
                  <div key={row.label} className="contents">
                    <div className="text-right font-mono-code font-semibold py-2">{row.home}</div>
                    <div className="text-center text-muted-foreground py-2 text-xs">{row.label}</div>
                    <div className="text-left font-mono-code font-semibold py-2">{row.away}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-3 text-xs text-muted-foreground">
                <span>{match.homeTeam}</span>
                <span>{match.awayTeam}</span>
              </div>
              {/* Form */}
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                {[homeStats, awayStats].map(stats => (
                  <div key={stats.team}>
                    <p className="text-xs text-muted-foreground mb-1.5">{stats.team} Form</p>
                    <div className="flex gap-1">
                      {stats.form.map((r, i) => (
                        <span key={i} className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center text-background ${formColors[r]}`}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Odds Movement */}
        {oddsMove.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Odds Movement</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {oddsMove.map(om => (
                <div key={`${om.market}-${om.outcome}`} className="gradient-card rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-2">{om.market} — {om.outcome}</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={om.history.map(h => ({
                      time: new Date(h.timestamp).toLocaleDateString([], { month: "short", day: "numeric" }),
                      odds: h.odds
                    }))}>
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215 15% 50%)" }} axisLine={false} tickLine={false} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "hsl(215 15% 50%)" }} axisLine={false} tickLine={false} width={35} />
                      <Tooltip
                        contentStyle={{ background: "hsl(220 18% 10%)", border: "1px solid hsl(220 14% 18%)", borderRadius: "6px", fontSize: "12px" }}
                        labelStyle={{ color: "hsl(215 15% 50%)" }}
                      />
                      <Line type="monotone" dataKey="odds" stroke="hsl(142 70% 45%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(142 70% 45%)" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Head to Head */}
        {h2h && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-accent" />
              <h2 className="font-semibold">Head to Head</h2>
            </div>
            <div className="gradient-card rounded-lg border border-border p-4">
              <div className="space-y-2">
                {h2h.matches.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                    <span className="text-xs text-muted-foreground w-24">{m.date}</span>
                    <span className="flex-1 text-center font-mono-code font-semibold">
                      {m.homeGoals} - {m.awayGoals}
                    </span>
                    <span className="text-xs text-muted-foreground w-28 text-right">{m.competition}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-3 text-xs text-muted-foreground">
                <span>{h2h.homeTeam}</span>
                <span>{h2h.awayTeam}</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
