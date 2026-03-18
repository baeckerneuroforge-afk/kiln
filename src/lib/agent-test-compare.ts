import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import {
  getClaudeClient,
  getClaudeClientWithKey,
  MODEL_PROVIDER_MAP,
  type ProviderKey,
} from "@/lib/ai";

export interface TestCompareConfig {
  systemPrompt: string;
  llmModel: string;
  temperature: number;
  modelProvider: ProviderKey;
}

export interface TestCompareResult {
  text: string;
  responseTimeMs: number;
  tokenCount: number | null;
  model: string;
  provider: ProviderKey;
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export function clampTemperature(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.7;
  return Math.min(1, Math.max(0, numeric));
}

export function sanitizeTestCompareConfig(
  raw: unknown,
  fallback: {
    systemPrompt: string;
    llmModel: string;
    temperature?: number | null;
    modelProvider?: ProviderKey | null;
  }
): TestCompareConfig {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const llmModel =
    typeof input.llmModel === "string" && input.llmModel.trim()
      ? input.llmModel.trim()
      : fallback.llmModel || DEFAULT_MODEL;
  const modelProvider =
    MODEL_PROVIDER_MAP[llmModel] ||
    fallback.modelProvider ||
    MODEL_PROVIDER_MAP[fallback.llmModel] ||
    "ANTHROPIC";

  return {
    systemPrompt:
      typeof input.systemPrompt === "string" && input.systemPrompt.trim()
        ? input.systemPrompt.trim()
        : fallback.systemPrompt,
    llmModel,
    modelProvider,
    temperature: clampTemperature(input.temperature ?? fallback.temperature ?? 0.7),
  };
}

async function getProviderApiKey(userId: string, provider: ProviderKey): Promise<string | null> {
  try {
    const record = await prisma.apiKey.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: provider.toLowerCase(),
        },
      },
    });

    return record ? decrypt(record.encryptedKey) : null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(basePrompt: string, knowledgeContext: string) {
  if (!knowledgeContext) return basePrompt;
  return `${basePrompt}\n\n---\nRELEVANT KNOWLEDGE BASE CONTEXT:\n${knowledgeContext}\n---`;
}

function getOpenAiTemperature(model: string, temperature: number) {
  if (model.startsWith("o3") || model.startsWith("o4")) {
    return undefined;
  }
  return temperature;
}

export async function runAgentComparisonVariant({
  userId,
  message,
  config,
  knowledgeContext = "",
}: {
  userId: string;
  message: string;
  config: TestCompareConfig;
  knowledgeContext?: string;
}): Promise<TestCompareResult> {
  const provider = config.modelProvider;
  const selectedModel = config.llmModel || DEFAULT_MODEL;
  const userApiKey = await getProviderApiKey(userId, provider);
  const systemPrompt = buildSystemPrompt(config.systemPrompt, knowledgeContext);
  const startedAt = Date.now();

  if (provider === "GOOGLE") {
    if (!userApiKey) {
      throw new Error("Google models require your own API key in Settings.");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: config.temperature,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Google API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      text,
      responseTimeMs: Date.now() - startedAt,
      tokenCount:
        typeof data?.usageMetadata?.promptTokenCount === "number" &&
        typeof data?.usageMetadata?.candidatesTokenCount === "number"
          ? data.usageMetadata.promptTokenCount + data.usageMetadata.candidatesTokenCount
          : null,
      model: selectedModel,
      provider,
    };
  }

  if (provider === "OPENAI" || provider === "PERPLEXITY" || provider === "GROQ") {
    let client: OpenAI;

    if (provider === "OPENAI") {
      client = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
    } else if (provider === "PERPLEXITY") {
      if (!userApiKey) {
        throw new Error("Perplexity models require your own API key in Settings.");
      }
      client = new OpenAI({ apiKey: userApiKey, baseURL: "https://api.perplexity.ai" });
    } else {
      if (!userApiKey) {
        throw new Error("Groq models require your own API key in Settings.");
      }
      client = new OpenAI({ apiKey: userApiKey, baseURL: "https://api.groq.com/openai/v1" });
    }

    const response = await client.chat.completions.create({
      model: selectedModel,
      max_tokens: 2048,
      ...(getOpenAiTemperature(selectedModel, config.temperature) !== undefined
        ? { temperature: getOpenAiTemperature(selectedModel, config.temperature) }
        : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    });

    return {
      text: response.choices[0]?.message?.content || "",
      responseTimeMs: Date.now() - startedAt,
      tokenCount: response.usage ? response.usage.total_tokens : null,
      model: selectedModel,
      provider,
    };
  }

  const client =
    userApiKey && provider === "ANTHROPIC"
      ? getClaudeClientWithKey(userApiKey)
      : getClaudeClient();

  const response = await client.messages.create({
    model: selectedModel,
    max_tokens: 2048,
    system: systemPrompt,
    temperature: config.temperature,
    messages: [{ role: "user", content: message }],
  });

  return {
    text: response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n"),
    responseTimeMs: Date.now() - startedAt,
    tokenCount: response.usage ? response.usage.input_tokens + response.usage.output_tokens : null,
    model: selectedModel,
    provider,
  };
}

export function serializeComparisonConfig(config: TestCompareConfig) {
  return {
    systemPrompt: config.systemPrompt,
    llmModel: config.llmModel,
    modelProvider: config.modelProvider,
    temperature: config.temperature,
  };
}
