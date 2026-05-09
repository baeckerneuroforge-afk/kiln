import type { LlmModel, LlmRequest, RawLlmResponse } from "../types";
import { callOpenAiCompatible } from "./openai";
import type { ProviderCallOptions } from "./shared";

export async function callGroq(
  model: LlmModel,
  request: LlmRequest,
  options: ProviderCallOptions,
): Promise<RawLlmResponse> {
  return callOpenAiCompatible({
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model,
    request,
    options,
  });
}
