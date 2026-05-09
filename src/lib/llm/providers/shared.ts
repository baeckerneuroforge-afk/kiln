import type { LlmMessage, LlmProvider, LlmRequest } from "../types";

export class LlmProviderError extends Error {
  readonly provider: LlmProvider;
  readonly status?: number;
  readonly providerDown: boolean;
  readonly authError: boolean;

  constructor(
    provider: LlmProvider,
    message: string,
    options?: { status?: number; providerDown?: boolean; authError?: boolean },
  ) {
    super(message);
    this.name = "LlmProviderError";
    this.provider = provider;
    this.status = options?.status;
    this.providerDown = options?.providerDown ?? false;
    this.authError = options?.authError ?? false;
  }
}

export interface ProviderCallOptions {
  apiKey: string;
  byokActive: boolean;
  routingReason: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function estimateTokensFromMessages(messages: LlmMessage[], systemPrompt?: string): number {
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, systemPrompt?.length ?? 0);
  return Math.max(1, Math.ceil(totalChars / 4));
}

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function splitSystemAndMessages(request: LlmRequest): {
  systemPrompt: string | undefined;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts = [
    request.systemPrompt,
    ...request.messages.filter((message) => message.role === "system").map((message) => message.content),
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  const messages = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: message.content,
    }));

  return {
    systemPrompt: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: messages.length > 0 ? messages : [{ role: "user", content: "" }],
  };
}

export function toOpenAiMessages(request: LlmRequest): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (request.systemPrompt?.trim()) {
    messages.push({ role: "system", content: request.systemPrompt });
  }
  for (const message of request.messages) {
    messages.push({ role: message.role, content: message.content });
  }
  return messages.length > 0 ? messages : [{ role: "user", content: "" }];
}

export function toGoogleContents(request: LlmRequest): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  const systemPrefix = request.systemPrompt?.trim() ? `${request.systemPrompt.trim()}\n\n` : "";
  const contents = request.messages
    .filter((message) => message.role !== "system")
    .map((message, index) => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: index === 0 && message.role === "user" ? `${systemPrefix}${message.content}` : message.content }],
    }));

  const systemMessages = request.messages.filter((message) => message.role === "system").map((message) => message.content);
  if (systemMessages.length > 0 && contents[0]?.role === "user") {
    contents[0].parts[0].text = `${systemMessages.join("\n\n")}\n\n${contents[0].parts[0].text}`;
  }

  return contents.length > 0 ? contents : [{ role: "user", parts: [{ text: systemPrefix || "" }] }];
}

export async function parseProviderError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as unknown;
    if (isRecord(payload)) {
      const error = payload.error;
      if (typeof error === "string") return error;
      if (isRecord(error)) {
        const message = getString(error.message);
        if (message) return message;
      }
      const message = getString(payload.message);
      if (message) return message;
    }
  } catch {
    // Fall through to status text.
  }
  return `${response.status} ${response.statusText}`.trim();
}

export function isProviderDownStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function makeAbortSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}
