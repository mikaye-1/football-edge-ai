import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp } from "lucide-react";

interface OddsEntry {
  id: string;
  match_id: string;
  market: string;
  outcome: string;
  bookmaker: string;
  odds: number;
  implied_probability: number;
  fetched_at: string;
}

interface OddsMovementChartProps {
  odds: OddsEntry[];
  market?: string;
}

const OUTCOME_COLORS: Record<string, string> = {
  "Home Win": "hsl(var(--primary))",
  "Draw": "hsl(var(--muted-foreground))",
  "Away Win": "hsl(var(--destructive))",
  "Over": "hsl(var(--primary))",
  "Under": "hsl(var(--accent))",
};

export function OddsMovementChart({ odds, market = "1X2" }: OddsMovementChartProps) {
  const filtered = useMemo(() => odds.filter(o => o.market === market), [odds, market]);

  // Group by outcome, then by bookmaker, sort by fetched_at
  const chartData = useMemo(() => {
    if (filtered.length === 0) return [];

    const outcomes = [...new Set(filtered.map(o => o.outcome))];

    // Get best odds per outcome across bookmakers at each fetch time
    const timeMap = new Map<string, Record<string, number>>();
    for (const o of filtered) {
      const timeKey = new Date(o.fetched_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (!timeMap.has(timeKey)) timeMap.set(timeKey, {});
      const entry = timeMap.get(timeKey)!;
      if (!entry[o.outcome] || o.odds > entry[o.outcome]) {
        entry[o.outcome] = Number(o.odds);
      }
    }

    return Array.from(timeMap.entries())
      .map(([time, values]) => ({ time, ...values }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [filtered]);

  const outcomes = useMemo(() => [...new Set(filtered.map(o => o.outcome))], [filtered]);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="gradient-card rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">{market} Odds Movement</h3>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: number) => [value.toFixed(2), ""]}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px" }}
              iconSize={8}
            />
            {outcomes.map((outcome) => (
              <Line
                key={outcome}
                type="monotone"
                dataKey={outcome}
                name={outcome}
                stroke={OUTCOME_COLORS[outcome] || "hsl(var(--primary))"}
                strokeWidth={2}
                dot={{ r: 3, fill: OUTCOME_COLORS[outcome] || "hsl(var(--primary))" }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
