/**
 * GET /api/v1/sandbox/[sessionId] — Session-Status und History
 * DELETE /api/v1/sandbox/[sessionId] — Session zerstören
 */

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  authenticateApiKey,
  apiKeyAuthErrorResponse,
  apiKeyJson,
  type ApiKeyAuthSuccess,
} from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { SandboxAPIService } from "@/lib/sandbox-api/sandbox-api-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let authResult: ApiKeyAuthSuccess | null = null;

  try {
    const { sessionId } = await params;

    const auth = await authenticateApiKey(request.headers.get("authorization"));
    if (!auth.ok) {
      return apiKeyAuthErrorResponse(auth, corsHeaders);
    }
    authResult = auth;
    waitUntil(authResult.touchLastUsed);

    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return apiKeyJson(
        request,
        authResult,
        { error: "Rate limit exceeded." },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const session = await SandboxAPIService.getSession(sessionId, authResult.userId);

    return apiKeyJson(request, authResult, session, {
      headers: {
        ...corsHeaders,
        "X-RateLimit-Remaining": String(rateCheck.remaining),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message.includes("nicht gefunden") ? 404 : message.includes("Kein Zugriff") ? 403 : 500;

    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status, headers: corsHeaders });
    }
    return NextResponse.json({ error: message }, { status, headers: corsHeaders });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let authResult: ApiKeyAuthSuccess | null = null;

  try {
    const { sessionId } = await params;

    const auth = await authenticateApiKey(request.headers.get("authorization"));
    if (!auth.ok) {
      return apiKeyAuthErrorResponse(auth, corsHeaders);
    }
    authResult = auth;
    waitUntil(authResult.touchLastUsed);

    await SandboxAPIService.destroySession(sessionId, authResult.userId);

    return apiKeyJson(
      request,
      authResult,
      { success: true, message: "Session destroyed." },
      { headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message.includes("nicht gefunden") ? 404 : message.includes("Kein Zugriff") ? 403 : 500;

    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status, headers: corsHeaders });
    }
    return NextResponse.json({ error: message }, { status, headers: corsHeaders });
  }
}
