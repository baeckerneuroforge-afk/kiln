import type { QuickUseSource } from "@/lib/quick-use/types";

export type EvidenceSourceType =
  | "url"
  | "search_result"
  | "extracted"
  | "computed"
  | "llm_knowledge"
  | "screenshot";

export interface EvidenceSourceMeta {
  source: EvidenceSourceType;
  url?: string;
  title?: string;
  snippet?: string;
  screenshot?: string;
  tool?: string;
  verified?: boolean;
}

export interface GuardWorkspaceEntryLike {
  agentId: string;
  key: string;
  value: unknown;
  tags?: string[];
  source?: EvidenceSourceMeta;
}

export interface VerifiedFact {
  agentId: string;
  key: string;
  value: string;
  source: EvidenceSourceMeta;
  verified: boolean;
}

export interface VerificationSummary {
  verifiedFacts: VerifiedFact[];
  unverifiedClaims: string[];
  sources: QuickUseSource[];
  completeness: string;
}

export function isVerifiedSource(source?: EvidenceSourceMeta): boolean {
  if (!source) return false;
  if (typeof source.verified === "boolean") return source.verified;
  if (source.source === "llm_knowledge") return false;
  return Boolean(source.url || source.snippet || source.screenshot);
}

export function normalizePriceValue(value: string): { amount: number; currency: string } | null {
  const match = value.replace(/\s/g, "").match(/(€|eur|\$|usd|£|gbp)?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i);
  if (!match) return null;
  const amount = Number(match[2].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  const symbol = (match[1] || "").toLowerCase();
  const currency = symbol.includes("$") || symbol === "usd"
    ? "USD"
    : symbol.includes("£") || symbol === "gbp"
      ? "GBP"
      : "EUR";
  return { amount, currency };
}

export function normalizeDateValue(value: string): string | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function uniqueSources(sources: QuickUseSource[]): QuickUseSource[] {
  const seen = new Set<string>();
  const normalized: QuickUseSource[] = [];

  for (const source of sources) {
    if (!source.url || seen.has(source.url)) continue;
    seen.add(source.url);
    normalized.push({
      ...source,
      title: source.title || source.url,
      domain: source.domain || safeDomain(source.url),
    });
  }

  return normalized;
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sourceToQuickUseSource(source: EvidenceSourceMeta, fallbackIndex: number): QuickUseSource | null {
  if (!source.url) return null;
  return {
    id: fallbackIndex,
    title: source.title || safeDomain(source.url) || `Source ${fallbackIndex}`,
    url: source.url,
    domain: safeDomain(source.url),
    snippet: source.snippet,
  };
}

export function summarizeVerification(
  entries: GuardWorkspaceEntryLike[],
  requestedEntities?: number,
  completedAgents?: number
): VerificationSummary {
  const verifiedFacts: VerifiedFact[] = [];
  const unverifiedClaims: string[] = [];
  const sources: QuickUseSource[] = [];

  for (const entry of entries) {
    const value = stringifyValue(entry.value);
    const verified = isVerifiedSource(entry.source);
    const fact: VerifiedFact = {
      agentId: entry.agentId,
      key: entry.key,
      value,
      source: entry.source || { source: "llm_knowledge" },
      verified,
    };

    if (verified) {
      verifiedFacts.push(fact);
      const source = sourceToQuickUseSource(fact.source, sources.length + 1);
      if (source) sources.push(source);
    } else if (value.trim()) {
      unverifiedClaims.push(`${entry.key}: ${value}`);
    }
  }

  const unique = uniqueSources(sources);
  const collected = unique.length > 0 ? unique.length : verifiedFacts.length;
  const completeness = requestedEntities && requestedEntities > 0
    ? `Data collected for ${Math.min(collected, requestedEntities)} of ${requestedEntities} requested targets.`
    : completedAgents && completedAgents > 0
      ? `Verified evidence collected from ${collected} source${collected === 1 ? "" : "s"} across ${completedAgents} completed agent${completedAgents === 1 ? "" : "s"}.`
      : `Verified evidence collected from ${collected} source${collected === 1 ? "" : "s"}.`;

  return {
    verifiedFacts,
    unverifiedClaims: Array.from(new Set(unverifiedClaims)).slice(0, 8),
    sources: unique,
    completeness,
  };
}

export function formatUnverifiedClaims(claims: string[]): string {
  if (claims.length === 0) return "";
  return claims.map((claim) => `- _Unverified:_ ${claim}`).join("\n");
}
