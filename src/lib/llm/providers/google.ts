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
  toGoogleContents,
  type ProviderCallOptions,
} from "./shared";

export async function callGoogle(
  model: LlmModel,
  request: LlmRequest,
  options: ProviderCallOptions,
): Promise<RawLlmResponse> {
  const timeout = makeAbortSignal(request.timeoutMs ?? 60_000);
  const jsonMode = Boolean(request.outputSchema && model.supportsJsonMode);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelId)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: toGoogleContents(request),
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 2048,
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const message = await parseProviderError(response);
      throw new LlmProviderError("google", `Google Gemini API error: ${message}`, {
        status: response.status,
        providerDown: isProviderDownStatus(response.status),
        authError: isAuthStatus(response.status),
      });
    }

    const payload = await response.json() as unknown;
    if (!isRecord(payload)) {
      throw new LlmProviderError("google", "Google Gemini API returned an invalid response.");
    }

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const firstCandidate = candidates.find(isRecord);
    const contentRecord = firstCandidate && isRecord(firstCandidate.content) ? firstCandidate.content : {};
    const parts = Array.isArray(contentRecord.parts) ? contentRecord.parts : [];
    const content = parts
      .map((part) => isRecord(part) ? getString(part.text) ?? "" : "")
      .join("");
    const usage = isRecord(payload.usageMetadata) ? payload.usageMetadata : {};

    return {
      content,
      modelUsed: model,
      routingReason: options.routingReason,
      inputTokens: getNumber(usage.promptTokenCount) ?? estimateTokensFromMessages(request.messages, request.systemPrompt),
      outputTokens: getNumber(usage.candidatesTokenCount) ?? estimateTokensFromText(content),
      cachedInputTokens: getNumber(usage.cachedContentTokenCount) ?? 0,
      byokActive: options.byokActive,
      providerResponseId: getString(payload.responseId),
    };
  } catch (error) {
    if (error instanceof LlmProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmProviderError("google", "Google Gemini API timed out after 60 seconds.", {
        providerDown: true,
      });
    }
    throw new LlmProviderError(
      "google",
      error instanceof Error ? error.message : "Google Gemini API request failed.",
      { providerDown: true },
    );
  } finally {
    timeout.clear();
  }
}
