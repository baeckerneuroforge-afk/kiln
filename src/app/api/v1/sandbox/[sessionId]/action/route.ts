/**
 * POST /api/v1/sandbox/[sessionId]/action — Action in der Sandbox ausführen
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
import { SandboxAPIService, type SandboxAction } from "@/lib/sandbox-api/sandbox-api-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Erlaubte Action-Typen
const VALID_ACTION_TYPES = new Set([
  "navigate",
  "screenshot",
  "click",
  "type",
  "scroll",
  "execute_code",
  "read_page",
]);

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(
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

    // Rate Limiting
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

    const body = await request.json();

    // Action-Typ validieren
    if (!body.type || !VALID_ACTION_TYPES.has(body.type)) {
      return apiKeyJson(
        request,
        authResult,
        {
          error: `Invalid action type: "${body.type}". Valid types: ${[...VALID_ACTION_TYPES].join(", ")}`,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Action-spezifische Validierung
    let action: SandboxAction;

    switch (body.type) {
      case "navigate":
        if (!body.url || typeof body.url !== "string") {
          return apiKeyJson(
            request,
            authResult,
            { error: '"url" (string) is required for navigate action.' },
            { status: 400, headers: corsHeaders }
          );
        }
        action = { type: "navigate", url: body.url };
        break;

      case "screenshot":
        action = { type: "screenshot" };
        break;

      case "click":
        if (typeof body.x !== "number" || typeof body.y !== "number") {
          return apiKeyJson(
            request,
            authResult,
            { error: '"x" (number) and "y" (number) are required for click action.' },
            { status: 400, headers: corsHeaders }
          );
        }
        action = { type: "click", x: body.x, y: body.y };
        break;

      case "type":
        if (!body.text || typeof body.text !== "string") {
          return apiKeyJson(
            request,
            authResult,
            { error: '"text" (string) is required for type action.' },
            { status: 400, headers: corsHeaders }
          );
        }
        action = { type: "type", text: body.text };
        break;

      case "scroll":
        if (!body.direction || !["up", "down"].includes(body.direction)) {
          return apiKeyJson(
            request,
            authResult,
            { error: '"direction" ("up" or "down") is required for scroll action.' },
            { status: 400, headers: corsHeaders }
          );
        }
        action = {
          type: "scroll",
          direction: body.direction,
          amount: typeof body.amount === "number" ? body.amount : undefined,
        };
        break;

      case "execute_code":
        if (!body.code || typeof body.code !== "string") {
          return apiKeyJson(
            request,
            authResult,
            { error: '"code" (string) is required for execute_code action.' },
            { status: 400, headers: corsHeaders }
          );
        }
        if (!body.language || !["python", "javascript"].includes(body.language)) {
          return apiKeyJson(
            request,
            authResult,
            { error: '"language" ("python" or "javascript") is required for execute_code action.' },
            { status: 400, headers: corsHeaders }
          );
        }
        action = { type: "execute_code", language: body.language, code: body.code };
        break;

      case "read_page":
        action = { type: "read_page" };
        break;

      default:
        return apiKeyJson(
          request,
          authResult,
          { error: `Unknown action type: ${body.type}` },
          { status: 400, headers: corsHeaders }
        );
    }

    const result = await SandboxAPIService.executeAction(
      sessionId,
      authResult.userId,
      action
    );

    return apiKeyJson(request, authResult, result, {
      headers: {
        ...corsHeaders,
        "X-RateLimit-Remaining": String(rateCheck.remaining),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message.includes("nicht gefunden") ? 404
      : message.includes("Kein Zugriff") ? 403
      : message.includes("abgelaufen") || message.includes("bereits") ? 409
      : message.includes("erfordert") ? 400
      : 500;

    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status, headers: corsHeaders });
    }
    return NextResponse.json({ error: message }, { status, headers: corsHeaders });
  }
}
