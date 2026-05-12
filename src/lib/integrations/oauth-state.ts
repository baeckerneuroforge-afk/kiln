/**
 * Sprint 19.7.5 — shared OAuth state encoder/decoder.
 *
 * Before 19.7.5 each provider rolled its own JSON-in-base64 encoding for
 * the OAuth `state` parameter. The shape now needs a `subOrgId` field
 * (set when the connect flow originates inside a sub-org), so every
 * provider's auth + callback route stops on this helper.
 *
 * The state param round-trips through the IdP, so we treat the encoding
 * as opaque base64url — *not* a signed token. The `state` value is
 * primarily a CSRF guard via the provider's same-tab redirect, plus a
 * carrier for the originating userId/subOrgId we need on the callback.
 */

export interface OAuthState {
  userId: string;
  /** OrgRelationship.id (CUID), set only when connect was initiated from a sub-org UI. */
  subOrgId?: string;
  /** Path to bounce back to after a successful callback (provider-specific). */
  redirectTo?: string;
  /** Agent id, when the OAuth flow was launched from a specific agent's "Connect" CTA. */
  agentId?: string;
}

export function encodeOAuthState(state: OAuthState): string {
  // Drop falsy optional fields to keep the encoded payload short.
  const payload: Record<string, string> = { userId: state.userId };
  if (state.subOrgId) payload.subOrgId = state.subOrgId;
  if (state.redirectTo) payload.redirectTo = state.redirectTo;
  if (state.agentId) payload.agentId = state.agentId;
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeOAuthState(raw: string | null | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString();
    const parsed = JSON.parse(decoded) as Partial<OAuthState>;
    if (!parsed.userId || typeof parsed.userId !== "string") return null;
    return {
      userId: parsed.userId,
      subOrgId: typeof parsed.subOrgId === "string" && parsed.subOrgId ? parsed.subOrgId : undefined,
      redirectTo: typeof parsed.redirectTo === "string" && parsed.redirectTo ? parsed.redirectTo : undefined,
      agentId: typeof parsed.agentId === "string" && parsed.agentId ? parsed.agentId : undefined,
    };
  } catch {
    return null;
  }
}
