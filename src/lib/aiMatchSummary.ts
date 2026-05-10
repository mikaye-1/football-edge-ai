import { supabase } from "@/integrations/supabase/client";
import type { AIPrediction, AIMatchData } from "./aiPredictionEngine";

export async function generateMatchSummary(
  matchId: string,
  prediction: AIPrediction,
  matchData: AIMatchData,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-match-summary", {
    body: { matchId, prediction, matchData },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.summary as string) ?? "";
}
