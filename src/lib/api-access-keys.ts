export const API_ACCESS_SCOPES = [
  {
    id: "agents:read",
    label: "Agents Read",
    description: "List and inspect agents.",
  },
  {
    id: "agents:write",
    label: "Agents Write",
    description: "Create and update agents.",
  },
  {
    id: "chat",
    label: "Chat",
    description: "Send messages to agents.",
  },
  {
    id: "knowledge:write",
    label: "Knowledge Write",
    description: "Add knowledge base entries.",
  },
  {
    id: "teams:read",
    label: "Teams Read",
    description: "List and inspect teams.",
  },
  {
    id: "teams:write",
    label: "Teams Write",
    description: "Create or execute teams.",
  },
  {
    id: "analytics:read",
    label: "Analytics Read",
    description: "Read logs, analytics, and eval data.",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Full API access across all scopes.",
  },
] as const;

export const API_ACCESS_EXPIRY_OPTIONS = [
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "1y", label: "1 year" },
  { id: "never", label: "Never" },
] as const;

export type ApiAccessScope = (typeof API_ACCESS_SCOPES)[number]["id"];
export type ApiAccessExpiryOption = (typeof API_ACCESS_EXPIRY_OPTIONS)[number]["id"];

export const DEFAULT_API_ACCESS_SCOPES: ApiAccessScope[] = ["admin"];

const VALID_SCOPE_IDS = new Set<ApiAccessScope>(API_ACCESS_SCOPES.map((scope) => scope.id));

export function normalizeApiAccessScopes(value: unknown): ApiAccessScope[] {
  if (!Array.isArray(value)) {
    return DEFAULT_API_ACCESS_SCOPES;
  }

  const filtered = Array.from(
    new Set(
      value.filter((scope): scope is ApiAccessScope => typeof scope === "string" && VALID_SCOPE_IDS.has(scope as ApiAccessScope))
    )
  );

  if (filtered.includes("admin")) {
    return ["admin"];
  }

  return filtered.length > 0 ? filtered : DEFAULT_API_ACCESS_SCOPES;
}

export function hasApiAccessScope(scopes: ApiAccessScope[], requiredScope: ApiAccessScope) {
  return scopes.includes("admin") || scopes.includes(requiredScope);
}

export function resolveApiAccessExpiry(option: unknown): Date | null {
  const now = new Date();

  switch (option) {
    case "30d": {
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 30);
      return expiresAt;
    }
    case "90d": {
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 90);
      return expiresAt;
    }
    case "1y": {
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      return expiresAt;
    }
    case "never":
    case undefined:
    case null:
      return null;
    default:
      throw new Error("Invalid expiry option");
  }
}

export function formatApiAccessExpiry(expiresAt: string | Date | null) {
  if (!expiresAt) return "Never";
  return new Date(expiresAt).toLocaleDateString();
}

export function isApiAccessKeyExpiringSoon(expiresAt: string | Date | null) {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
}
