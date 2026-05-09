import type { LlmModel, LlmProvider, LlmRequest, RawLlmResponse } from "../types";
import {
  estimateTokensFromMessages,
  estimateTokensFromText,
  getNumber,
  getString,
  isAuthStatus,
  isProviderDownStatus,
  isRecord,
  LlmProviderError,
  makeAbortSignal,
  parseProviderError,
  toOpenAiMessages,
  type ProviderCallOptions,
} from "./shared";

export async function callOpenAi(
  model: LlmModel,
  request: LlmRequest,
  options: ProviderCallOptions,
): Promise<RawLlmResponse> {
  return callOpenAiCompatible({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model,
    request,
    options,
  });
}

export async function callOpenAiCompatible(args: {
  provider: Extract<LlmProvider, "openai" | "mistral" | "groq">;
  baseUrl: string;
  model: LlmModel;
  request: LlmRequest;
  options: ProviderCallOptions;
}): Promise<RawLlmResponse> {
  const timeout = makeAbortSignal(args.request.timeoutMs ?? 60_000);
  const jsonMode = Boolean(args.request.outputSchema && args.model.supportsJsonMode);

  try {
    const response = await fetch(`${args.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.options.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model.modelId,
        messages: toOpenAiMessages(args.request),
        temperature: args.request.temperature ?? 0.7,
        max_tokens: args.request.maxTokens ?? 2048,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const message = await parseProviderError(response);
      throw new LlmProviderError(args.provider, `${labelFor(args.provider)} API error: ${message}`, {
        status: response.status,
        providerDown: isProviderDownStatus(response.status),
        authError: isAuthStatus(response.status),
      });
    }

    const payload = await response.json() as unknown;
    if (!isRecord(payload)) {
      throw new LlmProviderError(args.provider, `${labelFor(args.provider)} API returned an invalid response.`);
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = choices.find(isRecord);
    const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : {};
    const content = getString(message.content) ?? "";
    const usage = isRecord(payload.usage) ? payload.usage : {};
    const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};

    return {
      content,
      modelUsed: args.model,
      routingReason: args.options.routingReason,
      inputTokens: getNumber(usage.prompt_tokens) ?? estimateTokensFromMessages(args.request.messages, args.request.systemPrompt),
      outputTokens: getNumber(usage.completion_tokens) ?? estimateTokensFromText(content),
      cachedInputTokens: getNumber(promptDetails.cached_tokens) ?? 0,
      byokActive: args.options.byokActive,
      providerResponseId: getString(payload.id),
    };
  } catch (error) {
    if (error instanceof LlmProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmProviderError(args.provider, `${labelFor(args.provider)} API timed out after 60 seconds.`, {
        providerDown: true,
      });
    }
    throw new LlmProviderError(
      args.provider,
      error instanceof Error ? error.message : `${labelFor(args.provider)} API request failed.`,
      { providerDown: true },
    );
  } finally {
    timeout.clear();
  }
}

function labelFor(provider: LlmProvider): string {
  switch (provider) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
    case "mistral":
      return "Mistral";
    case "groq":
      return "Groq";
  }
}
