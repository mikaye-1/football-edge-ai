import { supabase } from "@/integrations/supabase/client";
import type { AIPrediction, AIMatchData } from "./aiPredictionEngine";
import { enqueueAI } from "./aiQueue";

export async function generateMatchSummary(
  matchId: string,
  prediction: AIPrediction,
  matchData: AIMatchData,
): Promise<string> {
  return enqueueAI(async () => {
    const { data, error } = await supabase.functions.invoke("generate-match-summary", {
      body: { matchId, prediction, matchData },
    });
    if (error) throw error;
    return (data?.summary as string) ?? "";
  });
}
