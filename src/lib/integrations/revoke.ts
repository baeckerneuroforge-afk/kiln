import { readConfigJson } from "./config-storage";

/**
 * Per-provider token revocation. Best-effort — providers may return errors
 * for already-expired tokens, deauthorized apps, etc. We treat any 200/204
 * as success and surface the error string otherwise. Callers should not
 * gate user-visible flows on success.
 */

export interface RevokeArgs {
  provider: string;
  /** Raw stored config column (encrypted or legacy plaintext). */
  config: string;
}

export interface RevokeResult {
  ok: boolean;
  error?: string;
  /** True when this provider has no revoke endpoint (Slack, Notion). */
  unsupported?: boolean;
}

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const HUBSPOT_REVOKE_BASE = "https://api.hubapi.com/oauth/v1/refresh-tokens";

export async function revokeIntegrationToken(args: RevokeArgs): Promise<RevokeResult> {
  let parsed: Record<string, unknown>;
  try {
    parsed = readConfigJson<Record<string, unknown>>(args.config).data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "config-unreadable" };
  }
  const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken : null;
  const refreshToken = typeof parsed.refreshToken === "string" ? parsed.refreshToken : null;

  switch (args.provider) {
    case "gmail":
    case "google_calendar":
    case "google-calendar":
    case "google-sheets":
      return revokeGoogle(refreshToken ?? accessToken);
    case "hubspot":
      return revokeHubSpot(refreshToken);
    case "slack":
    case "notion":
      // Slack and Notion expose token-revocation only via UI / app management.
      // We treat as no-op success — the local row is still deleted.
      return { ok: true, unsupported: true };
    default:
      return { ok: true, unsupported: true };
  }
}

async function revokeGoogle(token: string | null): Promise<RevokeResult> {
  if (!token) return { ok: false, error: "missing-token" };
  try {
    const response = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (response.ok) return { ok: true };
    let errorMessage = `status ${response.status}`;
    try {
      const body = await response.json();
      errorMessage = body?.error_description ?? body?.error ?? errorMessage;
    } catch {
      // ignore body parse errors
    }
    return { ok: false, error: errorMessage };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network-error" };
  }
}

async function revokeHubSpot(refreshToken: string | null): Promise<RevokeResult> {
  if (!refreshToken) return { ok: false, error: "missing-refresh-token" };
  try {
    const response = await fetch(`${HUBSPOT_REVOKE_BASE}/${encodeURIComponent(refreshToken)}`, {
      method: "DELETE",
    });
    if (response.ok || response.status === 204) return { ok: true };
    return { ok: false, error: `status ${response.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network-error" };
  }
}
