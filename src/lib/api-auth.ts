import crypto from "crypto";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import {
  hasApiAccessScope,
  normalizeApiAccessScopes,
  type ApiAccessScope,
} from "@/lib/api-access-keys";

type ApiKeyRequestLike = {
  method: string;
  url: string;
};

export type ApiKeyAuthSuccess = {
  ok: true;
  userId: string;
  /**
   * The org id this API key belongs to. Falls back to the user's
   * personalOrgId when the key was issued before Phase 2.1 (orgId is
   * still null on the row). Routes that org-scope reads/writes should
   * use this directly.
   */
  orgId: string | null;
  keyId: string;
  scopes: ApiAccessScope[];
  expiresAt: Date | null;
  touchLastUsed: Promise<void>;
  logUsage: (request: ApiKeyRequestLike, responseStatus: number) => Promise<void>;
};

export type ApiKeyAuthFailure = {
  ok: false;
  status: 401;
  error: string;
};

// Key hashen für DB-Lookup
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// API Key generieren: sk-kiln-[32 random chars]
export function generateApiKey(): string {
  const random = crypto.randomBytes(24).toString("base64url"); // 32 Zeichen
  return `sk-kiln-${random}`;
}

/**
 * Verifiziert den CRON_SECRET Bearer-Token aus dem Authorization-Header.
 *
 * Nutzt einen timing-sicheren Vergleich (crypto.timingSafeEqual mit
 * vorgelagertem Längen-Check), um Timing-Angriffe auf das Secret zu
 * verhindern — anders als ein nackter `===`-Vergleich, der die Laufzeit
 * an der ersten abweichenden Stelle abbricht.
 *
 * Verhalten wenn CRON_SECRET NICHT gesetzt ist:
 *   - Development: erlaubt (true), damit Crons lokal triggerbar sind
 *   - Production:  verweigert (false), fail-closed gegen Fehlkonfiguration
 *
 * Akzeptiert sowohl `Request` als auch `NextRequest` (NextRequest erbt von Request).
 */
export function verifyCronSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";

  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;

  const token = header.slice(7);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  // Längen-Check zuerst: timingSafeEqual wirft bei ungleicher Länge.
  if (tokenBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

// API Key aus Authorization Header validieren → userId zurückgeben
export async function authenticateApiKey(
  authHeader: string | null
): Promise<ApiKeyAuthSuccess | ApiKeyAuthFailure> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Invalid or missing API key. Use Authorization: Bearer sk-kiln-..." };
  }

  const key = authHeader.slice(7).trim();
  if (!key.startsWith("sk-kiln-")) {
    return { ok: false, status: 401, error: "Invalid or missing API key. Use Authorization: Bearer sk-kiln-..." };
  }

  const hashed = hashApiKey(key);

  const apiKey = await prisma.apiAccessKey.findUnique({
    where: { hashedKey: hashed },
  });

  if (!apiKey) {
    return { ok: false, status: 401, error: "Invalid or missing API key. Use Authorization: Bearer sk-kiln-..." };
  }

  if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 401, error: "API key expired" };
  }

  const scopes = normalizeApiAccessScopes(apiKey.scopes);

  // Resolve org for this key. Pre-Phase-2.1 rows have orgId=null; fall back
  // to the user's personalOrgId so older keys keep working unchanged.
  let orgId = apiKey.orgId ?? null;
  if (!orgId) {
    const user = await prisma.user.findUnique({
      where: { id: apiKey.userId },
      select: { personalOrgId: true },
    });
    orgId = user?.personalOrgId ?? null;
  }

  const touchLastUsed = prisma.apiAccessKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  }).then(() => undefined).catch((err) => {
    console.error("API key lastUsed update failed:", err);
  });

  return {
    ok: true,
    userId: apiKey.userId,
    orgId,
    keyId: apiKey.id,
    scopes,
    expiresAt: apiKey.expiresAt,
    touchLastUsed,
    logUsage: (request, responseStatus) =>
      prisma.apiAccessKeyUsage.create({
        data: {
          keyId: apiKey.id,
          endpoint: new URL(request.url).pathname,
          method: request.method,
          responseStatus,
        },
      }).then(() => undefined).catch((err) => {
        console.error("API key usage log failed:", err);
      }),
  };
}

export function apiKeyAuthErrorResponse(
  result: ApiKeyAuthFailure,
  headers?: HeadersInit
) {
  return Response.json(
    { error: result.error },
    { status: result.status, ...(headers ? { headers } : {}) }
  );
}

export function apiKeyJson(
  request: ApiKeyRequestLike,
  authResult: ApiKeyAuthSuccess,
  body: unknown,
  init: ResponseInit = {}
) {
  waitUntil(authResult.logUsage(request, init.status ?? 200));
  return Response.json(body, init);
}

export function requireApiKeyScope(
  request: ApiKeyRequestLike,
  authResult: ApiKeyAuthSuccess,
  scope: ApiAccessScope,
  headers?: HeadersInit
) {
  if (hasApiAccessScope(authResult.scopes, scope)) {
    return null;
  }

  return apiKeyJson(
    request,
    authResult,
    { error: `Insufficient permissions. Required scope: ${scope}` },
    { status: 403, ...(headers ? { headers } : {}) }
  );
}
