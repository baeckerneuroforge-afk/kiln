import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import crypto from "crypto";
import { ActionType } from "@prisma/client";
import {
  apiKeyAuthErrorResponse,
  apiKeyJson,
  authenticateApiKey,
  requireApiKeyScope,
  type ApiKeyAuthSuccess,
} from "@/lib/api-auth";
import { getModelDef, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";
import { canCreateAgent } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ALLOWED_ACTIONS = new Set<ActionType>([
  "BOOK_APPOINTMENT",
  "COLLECT_EMAIL",
  "SEND_EMAIL",
  "SCORE_LEAD",
  "NOTIFY_OWNER",
  "FIRE_WEBHOOK",
  "HANDOFF_HUMAN",
  "CUSTOM_CODE",
  "HTTP_REQUEST",
]);

function generateSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function parseActions(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error('"actions" must be an array of action type strings.');
  }

  return Array.from(
    new Set(
      value.map((action) => {
        if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action as ActionType)) {
          throw new Error(`Unsupported action type: ${String(action)}`);
        }
        return action as ActionType;
      })
    )
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// GET /api/v1/agents — Liste aller Agents des Users
export async function GET(request: NextRequest) {
  let authResult: ApiKeyAuthSuccess | null = null;

  try {
    const auth = await authenticateApiKey(request.headers.get("authorization"));
    if (!auth.ok) {
      return apiKeyAuthErrorResponse(auth, corsHeaders);
    }
    authResult = auth;
    waitUntil(authResult.touchLastUsed);

    const scopeError = requireApiKeyScope(request, authResult, "agents:read", corsHeaders);
    if (scopeError) {
      return scopeError;
    }

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
        },
      );
    }

    const agents = await prisma.agent.findMany({
      where: { userId: authResult.userId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        llmModel: true,
        status: true,
        createdAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiKeyJson(
      request,
      authResult,
      {
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          description: a.description,
          model: a.llmModel,
          status: a.status,
          conversationCount: a._count.conversations,
          createdAt: a.createdAt,
        })),
      },
      {
        headers: {
          ...corsHeaders,
          "X-RateLimit-Remaining": String(rateCheck.remaining),
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status: 500, headers: corsHeaders });
    }
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
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

    const scopeError = requireApiKeyScope(request, authResult, "agents:write", corsHeaders);
    if (scopeError) {
      return scopeError;
    }

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
        },
      );
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
    // Backward-compat: accept legacy field name agentMode from older API consumers.
    const rawMode = body.mode ?? body.agentMode;
    const mode = rawMode === "TASK" ? "TASK" : "CHAT";
    const llmModel = typeof body.llmModel === "string" ? body.llmModel : "claude-sonnet-4-6";
    const welcomeMessage = typeof body.welcomeMessage === "string"
      ? body.welcomeMessage
      : mode === "CHAT"
        ? `Hi! I'm ${name}. How can I help you today?`
        : "";
    const status = body.status === "PAUSED" ? "PAUSED" : body.status === "DRAFT" ? "DRAFT" : "LIVE";
    const actions = parseActions(body.actions);

    if (!name || !systemPrompt) {
      return apiKeyJson(
        request,
        authResult,
        { error: "name and systemPrompt are required." },
        { status: 400, headers: corsHeaders },
      );
    }

    const agentCheck = await canCreateAgent(authResult.userId);
    if (!agentCheck.allowed) {
      return apiKeyJson(
        request,
        authResult,
        { error: `Agent limit reached (${agentCheck.current}/${agentCheck.limit}). Please upgrade your plan.` },
        { status: 403, headers: corsHeaders },
      );
    }

    const userEmail = await getUserEmailOrPlaceholder(authResult.userId);
    await prisma.user.upsert({
      where: { id: authResult.userId },
      update: {},
      create: { id: authResult.userId, email: userEmail },
    });

    const modelDef = getModelDef(llmModel);
    const agent = await prisma.agent.create({
      data: {
        userId: authResult.userId,
        name,
        slug: generateSlug(name),
        description: typeof body.description === "string" ? body.description : null,
        systemPrompt,
        welcomeMessage,
        suggestedQuestions: [],
        llmModel,
        modelProvider: modelDef?.provider || MODEL_PROVIDER_MAP[llmModel] || "ANTHROPIC",
        status,
        mode,
        whiteLabel: body.whiteLabel && typeof body.whiteLabel === "object"
          ? body.whiteLabel
          : { primaryColor: "#F97316", position: "bottom-right" },
        actions: actions.length
          ? {
              create: actions.map((action) => ({
                type: action,
                enabled: true,
                config: {},
              })),
            }
          : undefined,
      },
    });

    return apiKeyJson(
      request,
      authResult,
      {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        status: agent.status,
        mode: agent.mode,
        // Backward-compat: also expose legacy field name in response so existing
        // SDK consumers keep working without code changes.
        agentMode: agent.mode,
        created: true,
        publicUrl: agent.mode === "CHAT" ? `/embed/${agent.slug}` : undefined,
      },
      {
        status: 201,
        headers: {
          ...corsHeaders,
          "X-RateLimit-Remaining": String(rateCheck.remaining),
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status: 500, headers: corsHeaders });
    }
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
