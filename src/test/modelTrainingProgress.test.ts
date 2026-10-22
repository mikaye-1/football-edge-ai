import { describe, expect, it } from "vitest";
import { getModelTrainingProgress, TRAINING_STABILITY_BENCHMARK } from "@/lib/modelTrainingProgress";

describe("model training progress", () => {
  it("shows how many scored matches remain to reach the 500-match benchmark", () => {
    expect(getModelTrainingProgress("predictiq-poisson-v2:161:2026-05-30T16:00:00Z")).toEqual({
      matchCount: 161,
      remaining: 339,
      benchmark: 500,
      reached: false,
    });
  });

  it("marks the benchmark reached at 500 scored matches", () => {
    expect(getModelTrainingProgress(`predictiq-poisson-v2:${TRAINING_STABILITY_BENCHMARK}:2026-05-30`)).toEqual({
      matchCount: 500,
      remaining: 0,
      benchmark: 500,
      reached: true,
    });
  });

  it("does not report progress for legacy or malformed model labels", () => {
    expect(getModelTrainingProgress("predictiq-poisson-v1")).toBeNull();
    expect(getModelTrainingProgress("predictiq-poisson-v2:NaN:timestamp")).toBeNull();
  });
});