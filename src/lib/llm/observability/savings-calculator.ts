import { getDefaultModelForTier, getModelsByTier } from "../registry";
import type { LlmModel, LlmRequest } from "../types";

export interface CostTokens {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  modelUsed: LlmModel;
  byokActive?: boolean;
}

export function calculateNaiveCost(_request: LlmRequest, response: CostTokens): number {
  const smartModel = getModelsByTier("SMART")[0] ?? getDefaultModelForTier("BALANCED");
  const naiveInput = response.inputTokens + response.cachedInputTokens;
  return roundUsd(
    (naiveInput * smartModel.inputTokenPriceUsdPer1M) / 1_000_000
    + (response.outputTokens * smartModel.outputTokenPriceUsdPer1M) / 1_000_000,
  );
}

export function calculateActualCost(_request: LlmRequest, response: CostTokens): number {
  if (response.byokActive) return 0;
  const uncachedCost =
    (response.inputTokens * response.modelUsed.inputTokenPriceUsdPer1M) / 1_000_000
    + (response.outputTokens * response.modelUsed.outputTokenPriceUsdPer1M) / 1_000_000;
  const cacheReadSavings =
    (response.cachedInputTokens * response.modelUsed.inputTokenPriceUsdPer1M * 0.9) / 1_000_000;
  return roundUsd(Math.max(0, uncachedCost - cacheReadSavings));
}

export function calculateSavings(request: LlmRequest, response: CostTokens): {
  actualCostUsd: number;
  naiveCostUsd: number;
  costSavedUsd: number;
} {
  const actualCostUsd = calculateActualCost(request, response);
  const naiveCostUsd = calculateNaiveCost(request, response);
  return {
    actualCostUsd,
    naiveCostUsd,
    costSavedUsd: roundUsd(Math.max(0, naiveCostUsd - actualCostUsd)),
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
