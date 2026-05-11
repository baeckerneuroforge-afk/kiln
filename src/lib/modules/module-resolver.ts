import {
  decryptModuleCredentials,
  findModuleConfig,
} from "./store";
import {
  ModuleMissingCredentialsError,
  ModuleNotActiveError,
  type AiModuleCredentials,
  type ModuleName,
  type ResolvedAiCredentials,
} from "./types";

/**
 * Resolve AI credentials for a Sub-Account. Three outcomes:
 *
 *   `pool`           → returns platform defaults (anthropic/openai null,
 *                       caller falls back to env-var keys).
 *   `byok_agency`    → returns the agency-supplied keys.
 *   `byok_customer`  → returns the end-customer-supplied keys.
 *
 * Throws ModuleNotActiveError when the module is configured but isActive
 * is false (so the caller can show "configure module" UI).
 */
export async function resolveAiCredentials(args: {
  subAccountId: string;
  /** Set to false to allow inactive modules (e.g. settings preview). */
  requireActive?: boolean;
}): Promise<ResolvedAiCredentials> {
  const row = await findModuleConfig({ subAccountId: args.subAccountId, moduleName: "ai" });
  if (!row) {
    // No config row → treat as pool/inactive. Caller decides whether to error.
    if (args.requireActive !== false) {
      throw new ModuleNotActiveError(args.subAccountId, "ai");
    }
    return {
      anthropicKey: null,
      openaiKey: null,
      byokActive: false,
      mode: "pool",
      credentialsOwner: null,
    };
  }
  if (args.requireActive !== false && !row.isActive) {
    throw new ModuleNotActiveError(args.subAccountId, "ai");
  }
  if (row.mode === "pool") {
    return {
      anthropicKey: null,
      openaiKey: null,
      byokActive: false,
      mode: "pool",
      credentialsOwner: null,
    };
  }
  const creds = decryptModuleCredentials<AiModuleCredentials>(row);
  if (!creds || (!creds.anthropicKey && !creds.openaiKey)) {
    throw new ModuleMissingCredentialsError(args.subAccountId, "ai", row.mode as never);
  }
  return {
    anthropicKey: creds.anthropicKey ?? null,
    openaiKey: creds.openaiKey ?? null,
    byokActive: true,
    mode: row.mode as never,
    credentialsOwner: row.credentialsOwner,
  };
}

/**
 * Returns the BYOK API key for a given LLM provider, or null if the
 * sub-account is in pool mode (or has no config). Used by the LLM
 * fallback-chain to consult this layer before falling back to the
 * existing `ApiKey` table and platform env vars.
 */
export async function resolveAiKeyForProvider(args: {
  subAccountId: string;
  provider: "anthropic" | "openai";
}): Promise<{ key: string; mode: "byok_agency" | "byok_customer"; owner: string | null } | null> {
  const resolved = await resolveAiCredentials({
    subAccountId: args.subAccountId,
    requireActive: false,
  }).catch(() => null);
  if (!resolved) return null;
  if (!resolved.byokActive) return null;
  if (resolved.mode === "pool") return null;
  const key = args.provider === "anthropic" ? resolved.anthropicKey : resolved.openaiKey;
  if (!key) return null;
  return { key, mode: resolved.mode, owner: resolved.credentialsOwner };
}

/**
 * Returns the module name for a given provider so callers can route by
 * Sub-Org module config rather than per-provider rules.
 */
export function aiProviderToModule(provider: "anthropic" | "openai"): ModuleName {
  void provider;
  return "ai";
}
