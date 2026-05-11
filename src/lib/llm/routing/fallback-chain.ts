import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { getProviderEnvVars, findEquivalentModel } from "../registry";
import { callProvider } from "../providers";
import { LlmProviderError } from "../providers/shared";
import type { LlmModel, LlmProvider, LlmRequest, RawLlmResponse, ProviderApiKey } from "../types";

export const PROVIDER_FALLBACK: Record<LlmProvider, LlmProvider[]> = {
  anthropic: ["openai", "google", "mistral"],
  openai: ["anthropic", "google", "mistral"],
  google: ["anthropic", "openai", "mistral"],
  mistral: ["anthropic", "openai", "groq"],
  groq: ["mistral", "openai"],
};

export async function callProviderWithFallback(
  model: LlmModel,
  request: LlmRequest,
  routingReason: string,
): Promise<RawLlmResponse> {
  const providers = [model.provider, ...PROVIDER_FALLBACK[model.provider]];
  const providerErrors: string[] = [];
  let sawConfiguredProvider = false;

  for (const provider of providers) {
    const fallbackModel = provider === model.provider ? model : findEquivalentModel(model, provider);
    if (!fallbackModel) continue;

    const apiKey = await resolveProviderApiKey(provider, request);
    if (!apiKey) {
      providerErrors.push(`${provider}: no API key configured`);
      continue;
    }
    sawConfiguredProvider = true;

    try {
      const response = await callProvider(fallbackModel, request, {
        apiKey: apiKey.key,
        byokActive: apiKey.byokActive,
        routingReason: provider === model.provider ? routingReason : `fallback-from-${model.provider}`,
      });
      return {
        ...response,
        routingReason: provider === model.provider ? response.routingReason : `fallback-from-${model.provider}`,
      };
    } catch (error) {
      if (error instanceof LlmProviderError) {
        if (apiKey.byokActive && error.authError) {
          throw new Error(`BYOK key for ${provider} is invalid or lacks quota: ${error.message}`);
        }
        providerErrors.push(`${provider}: ${error.message}`);
        if (error.providerDown) continue;
        throw error;
      }
      throw error;
    }
  }

  if (!sawConfiguredProvider) {
    throw new Error("No LLM provider API key is configured. Add BYOK or configure a platform provider key.");
  }
  throw new Error(`All LLM providers failed. Retry later or switch provider. Details: ${providerErrors.join(" | ")}`);
}

export async function resolveProviderApiKey(
  provider: LlmProvider,
  request: LlmRequest,
): Promise<ProviderApiKey | null> {
  if (request.byokKey?.provider === provider) {
    return { key: request.byokKey.key, byokActive: true, source: "request-byok" };
  }

  // Sprint 19: Sub-Account module config layer. Wins over the generic
  // ApiKey table so per-Sub-Account module mode overrides agency defaults.
  const moduleKey = await loadSubAccountModuleKey(provider, request);
  if (moduleKey) {
    return { key: moduleKey, byokActive: true, source: "stored-byok" };
  }

  const stored = await loadStoredByok(provider, request);
  if (stored) {
    return { key: stored, byokActive: true, source: "stored-byok" };
  }

  for (const envVar of getProviderEnvVars(provider)) {
    const key = process.env[envVar];
    if (key?.trim()) return { key: key.trim(), byokActive: false, source: "platform" };
  }

  return null;
}

async function loadSubAccountModuleKey(
  provider: LlmProvider,
  request: LlmRequest,
): Promise<string | null> {
  if (!request.orgId) return null;
  if (provider !== "anthropic" && provider !== "openai") return null;
  try {
    const { resolveAiKeyForProvider } = await import("@/lib/modules/module-resolver");
    const resolved = await resolveAiKeyForProvider({
      subAccountId: request.orgId,
      provider,
    });
    return resolved?.key ?? null;
  } catch {
    return null;
  }
}

async function loadStoredByok(provider: LlmProvider, request: LlmRequest): Promise<string | null> {
  if (!request.userId && !request.orgId) return null;
  try {
    const record = await prisma.apiKey.findFirst({
      where: {
        provider,
        OR: [
          { orgId: request.orgId },
          ...(request.userId ? [{ userId: request.userId, orgId: null }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { encryptedKey: true },
    });
    return record ? decrypt(record.encryptedKey) : null;
  } catch {
    return null;
  }
}
