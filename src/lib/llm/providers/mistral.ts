import type { LlmModel, LlmRequest, RawLlmResponse } from "../types";
import { callOpenAiCompatible } from "./openai";
import type { ProviderCallOptions } from "./shared";

export async function callMistral(
  model: LlmModel,
  request: LlmRequest,
  options: ProviderCallOptions,
): Promise<RawLlmResponse> {
  return callOpenAiCompatible({
    provider: "mistral",
    baseUrl: "https://api.mistral.ai/v1",
    model,
    request,
    options,
  });
}
