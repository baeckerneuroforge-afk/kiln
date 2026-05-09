import type { LlmModel, LlmRequest, RawLlmResponse } from "../types";
import { callAnthropic } from "./anthropic";
import { callGoogle } from "./google";
import { callGroq } from "./groq";
import { callMistral } from "./mistral";
import { callOpenAi } from "./openai";
import type { ProviderCallOptions } from "./shared";

export async function callProvider(
  model: LlmModel,
  request: LlmRequest,
  options: ProviderCallOptions,
): Promise<RawLlmResponse> {
  switch (model.provider) {
    case "anthropic":
      return callAnthropic(model, request, options);
    case "openai":
      return callOpenAi(model, request, options);
    case "google":
      return callGoogle(model, request, options);
    case "mistral":
      return callMistral(model, request, options);
    case "groq":
      return callGroq(model, request, options);
  }
}
