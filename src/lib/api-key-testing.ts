export type ApiKeyProvider = "anthropic" | "openai" | "perplexity" | "google" | "groq";

export const API_KEY_PROVIDER_META: Record<
  ApiKeyProvider,
  {
    label: string;
    prefix: string;
    placeholder: string;
    help: string;
    docsUrl: string;
  }
> = {
  anthropic: {
    label: "Anthropic",
    prefix: "sk-ant-",
    placeholder: "sk-ant-...",
    help: "Get your key at console.anthropic.com -> Settings -> API Keys.",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    label: "OpenAI",
    prefix: "sk-",
    placeholder: "sk-...",
    help: "Get your key at platform.openai.com -> API Keys.",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  perplexity: {
    label: "Perplexity",
    prefix: "pplx-",
    placeholder: "pplx-...",
    help: "Get your key in the Perplexity settings under API.",
    docsUrl: "https://docs.perplexity.ai/",
  },
  google: {
    label: "Google AI",
    prefix: "AI",
    placeholder: "AIza...",
    help: "Get your key in Google AI Studio under API keys.",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  groq: {
    label: "Groq",
    prefix: "gsk_",
    placeholder: "gsk_...",
    help: "Get your key in the Groq Console under API Keys.",
    docsUrl: "https://console.groq.com/keys",
  },
};

export function isApiKeyProvider(provider: string): provider is ApiKeyProvider {
  return provider in API_KEY_PROVIDER_META;
}

export function formatMaskedApiKey(provider: string, apiKey: string): string {
  const meta = isApiKeyProvider(provider) ? API_KEY_PROVIDER_META[provider] : null;
  const visiblePrefix = meta?.prefix || "";
  const lastFour = apiKey.slice(-4) || "****";
  return `${visiblePrefix}***${lastFour}`;
}

async function parseProviderError(response: Response) {
  try {
    const body = await response.json();
    const message =
      body?.error?.message ||
      body?.error ||
      body?.message ||
      `${response.status} ${response.statusText}`.trim();
    return typeof message === "string" ? message : `${response.status} ${response.statusText}`.trim();
  } catch {
    return `${response.status} ${response.statusText}`.trim();
  }
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

export async function testProviderApiKey(
  provider: ApiKeyProvider,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey.trim()) return { success: false, error: "API key is required." };

  const requestTimeout = timeoutSignal(5000);

  try {
    let response: Response;

    if (provider === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: requestTimeout.signal,
      });
    } else if (provider === "openai") {
      response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: requestTimeout.signal,
      });
    } else if (provider === "perplexity") {
      response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "sonar",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: requestTimeout.signal,
      });
    } else if (provider === "google") {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal: requestTimeout.signal },
      );
    } else {
      response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: requestTimeout.signal,
      });
    }

    if (response.ok) return { success: true };
    return { success: false, error: await parseProviderError(response) };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Connection timed out after 5 seconds." };
    }
    return { success: false, error: err instanceof Error ? err.message : "Connection test failed." };
  } finally {
    requestTimeout.clear();
  }
}
