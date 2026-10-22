export const TRAINING_STABILITY_BENCHMARK = 500;

export interface ModelTrainingProgress {
  matchCount: number;
  remaining: number;
  benchmark: number;
  reached: boolean;
}

export function getModelTrainingProgress(model?: string | null): ModelTrainingProgress | null {
  const match = model?.match(/^predictiq-poisson-v2:(\d+):/);
  if (!match) return null;

  const matchCount = Number(match[1]);
  if (!Number.isSafeInteger(matchCount) || matchCount < 0) return null;

  return {
    matchCount,
    remaining: Math.max(0, TRAINING_STABILITY_BENCHMARK - matchCount),
    benchmark: TRAINING_STABILITY_BENCHMARK,
    reached: matchCount >= TRAINING_STABILITY_BENCHMARK,
  };
}