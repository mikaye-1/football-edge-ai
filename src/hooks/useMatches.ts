import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface DbMatch {
  id: string;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
  external_id: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
}

export interface DbPrediction {
  id: string;
  match_id: string;
  market: string;
  outcome: string;
  model_probability: number;
  odds_implied_probability: number;
  form_score: number;
  consistency: number;
  final_score: number;
  confidence: string;
  explanation: string | null;
}

export interface DbOdds {
  id: string;
  match_id: string;
  market: string;
  outcome: string;
  bookmaker: string;
  odds: number;
  implied_probability: number;
  fetched_at: string;
}

export function useMatches(league?: string) {
  const query = useQuery({
    queryKey: ["matches", league],
    queryFn: async () => {
      let q = supabase.from("matches").select("*").order("kickoff_time", { ascending: true });
      if (league && league !== "all") q = q.eq("league", league);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DbMatch[];
    },
    refetchInterval: 30000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("matches-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        query.refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return query;
}

export function usePredictions(matchId?: string) {
  return useQuery({
    queryKey: ["predictions", matchId],
    queryFn: async () => {
      let q = supabase.from("predictions").select("*").order("final_score", { ascending: false });
      if (matchId) q = q.eq("match_id", matchId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DbPrediction[];
    },
    refetchInterval: 30000,
  });
}

export function useOdds(matchId?: string) {
  return useQuery({
    queryKey: ["odds", matchId],
    queryFn: async () => {
      let q = supabase.from("odds").select("*");
      if (matchId) q = q.eq("match_id", matchId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DbOdds[];
    },
    refetchInterval: 30000,
  });
}

export function useTopPredictions() {
  return useQuery({
    queryKey: ["top-predictions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("*, matches!inner(home_team, away_team, league, status, kickoff_time)")
        .eq("confidence", "high")
        .in("matches.status", ["upcoming", "live"])
        .order("final_score", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as (DbPrediction & { matches: { home_team: string; away_team: string; league: string; status: string; kickoff_time: string } })[];
    },
    refetchInterval: 30000,
  });
}

export function useFetchOdds() {
  return useQuery({
    queryKey: ["fetch-odds-trigger"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-odds");
      if (error) throw error;
      return data;
    },
    enabled: false,
  });
}

export function useSettlePredictions() {
  return useQuery({
    queryKey: ["settle-predictions-trigger"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("settle-predictions");
      if (error) throw error;
      return data;
    },
    enabled: false,
  });
}
