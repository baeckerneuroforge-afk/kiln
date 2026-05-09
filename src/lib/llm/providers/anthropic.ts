import type { LlmModel, LlmRequest, RawLlmResponse } from "../types";
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
  splitSystemAndMessages,
  type ProviderCallOptions,
} from "./shared";

type AnthropicSystemBlock = string | Array<{
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}>;

export async function callAnthropic(
  model: LlmModel,
  request: LlmRequest,
  options: ProviderCallOptions,
): Promise<RawLlmResponse> {
  const { systemPrompt, messages } = splitSystemAndMessages(request);
  const timeout = makeAbortSignal(request.timeoutMs ?? 60_000);

  const system: AnthropicSystemBlock | undefined = systemPrompt
    ? model.supportsCaching
      ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
      : systemPrompt
    : undefined;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": options.apiKey,
      },
      body: JSON.stringify({
        model: model.modelId,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.7,
        ...(system ? { system } : {}),
        messages,
      }),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const message = await parseProviderError(response);
      throw new LlmProviderError("anthropic", `Anthropic API error: ${message}`, {
        status: response.status,
        providerDown: isProviderDownStatus(response.status),
        authError: isAuthStatus(response.status),
      });
    }

    const payload = await response.json() as unknown;
    if (!isRecord(payload)) {
      throw new LlmProviderError("anthropic", "Anthropic API returned an invalid response.");
    }

    const content = Array.isArray(payload.content)
      ? payload.content
          .map((block) => isRecord(block) && block.type === "text" ? getString(block.text) ?? "" : "")
          .join("")
      : "";

    const usage = isRecord(payload.usage) ? payload.usage : {};
    const inputTokens = getNumber(usage.input_tokens) ?? estimateTokensFromMessages(request.messages, request.systemPrompt);
    const outputTokens = getNumber(usage.output_tokens) ?? estimateTokensFromText(content);
    const cachedInputTokens =
      (getNumber(usage.cache_read_input_tokens) ?? 0)
      + (getNumber(usage.cache_creation_input_tokens) ?? 0);

    return {
      content,
      modelUsed: model,
      routingReason: options.routingReason,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      byokActive: options.byokActive,
      providerResponseId: getString(payload.id),
    };
  } catch (error) {
    if (error instanceof LlmProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmProviderError("anthropic", "Anthropic API timed out after 60 seconds.", {
        providerDown: true,
      });
    }
    throw new LlmProviderError(
      "anthropic",
      error instanceof Error ? error.message : "Anthropic API request failed.",
      { providerDown: true },
    );
  } finally {
    timeout.clear();
  }
}
