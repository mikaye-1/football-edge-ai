import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DbStanding {
  league: string;
  season: string;
  team_name: string;
  team_external_id: string;
  position: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  form: string | null;
  source: string;
}

export function useStandings() {
  return useQuery({
    queryKey: ["standings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standings")
        .select("*")
        .order("league", { ascending: true })
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DbStanding[];
    },
    refetchInterval: 60000,
  });
}
