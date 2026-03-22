/**
 * POST /api/v1/sandbox — Neue Sandbox-Session erstellen
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
import { SandboxAPIService, type SandboxCapability } from "@/lib/sandbox-api/sandbox-api-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  let authResult: ApiKeyAuthSuccess | null = null;

  try {
    const auth = await authenticateApiKey(request.headers.get("authorization"));
    if (!auth.ok) {
      return apiKeyAuthErrorResponse(auth, corsHeaders);
    }
    authResult = auth;
    waitUntil(authResult.touchLastUsed);

    // Rate Limiting
    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return apiKeyJson(
        request,
        authResult,
        { error: "Rate limit exceeded. 100 requests per minute." },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(rateCheck.resetAt).toISOString(),
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const body = await request.json();

    // Capabilities validieren
    const capabilities = body.capabilities as SandboxCapability[] | undefined;
    if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0) {
      return apiKeyJson(
        request,
        authResult,
        { error: "capabilities is required and must be a non-empty array. Valid values: browser, code_python, code_javascript, screenshots" },
        { status: 400, headers: corsHeaders }
      );
    }

    const validCapabilities: SandboxCapability[] = ["browser", "code_python", "code_javascript", "screenshots"];
    const invalidCaps = capabilities.filter((c) => !validCapabilities.includes(c));
    if (invalidCaps.length > 0) {
      return apiKeyJson(
        request,
        authResult,
        { error: `Invalid capabilities: ${invalidCaps.join(", ")}. Valid: ${validCapabilities.join(", ")}` },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await SandboxAPIService.createSession(authResult.userId, {
      capabilities,
      timeout: typeof body.timeout === "number" ? body.timeout : undefined,
      maxSteps: typeof body.maxSteps === "number" ? body.maxSteps : undefined,
    });

    return apiKeyJson(
      request,
      authResult,
      result,
      {
        status: 201,
        headers: {
          ...corsHeaders,
          "X-RateLimit-Remaining": String(rateCheck.remaining),
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message.includes("nicht verfügbar") || message.includes("Limit erreicht") ? 403 : 500;

    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status, headers: corsHeaders });
    }
    return NextResponse.json({ error: message }, { status, headers: corsHeaders });
  }
}
