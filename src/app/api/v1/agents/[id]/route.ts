import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { ActionType } from "@prisma/client";
import {
  apiKeyAuthErrorResponse,
  apiKeyJson,
  authenticateApiKey,
  requireApiKeyScope,
  type ApiKeyAuthSuccess,
} from "@/lib/api-auth";
import { getModelDef, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateSchema } from "@/lib/agents/io-schema-validator";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ALLOWED_FIELDS = [
  "name",
  "description",
  "systemPrompt",
  "welcomeMessage",
  "llmModel",
  "mode",
  "whiteLabel",
  "status",
  "inputSchema",
  "outputSchema",
  "strictOutputValidation",
] as const;

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

function parseActions(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error('"actions" must be an array of action type strings.');
  }

  const deduped = Array.from(
    new Set(
      value.map((action) => {
        if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action as ActionType)) {
          throw new Error(`Unsupported action type: ${String(action)}`);
        }
        return action as ActionType;
      })
    )
  );

  return deduped;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId: authResult.userId },
      include: {
        actions: true,
      },
    });

    if (!agent) {
      return apiKeyJson(request, authResult, { error: "Agent not found or unauthorized" }, { status: 404, headers: corsHeaders });
    }

    return apiKeyJson(
      request,
      authResult,
      {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        welcomeMessage: agent.welcomeMessage,
        llmModel: agent.llmModel,
        mode: agent.mode,
        // Backward-compat: legacy field name in response.
        agentMode: agent.mode,
        status: agent.status,
        whiteLabel: agent.whiteLabel,
        actions: agent.actions.map((action) => action.type),
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const existing = await prisma.agent.findFirst({
      where: { id: params.id, userId: authResult.userId },
    });
    if (!existing) {
      return apiKeyJson(request, authResult, { error: "Agent not found or unauthorized" }, { status: 404, headers: corsHeaders });
    }

    const body = await request.json();
    // Backward-compat: translate legacy field name agentMode → mode before filtering.
    if (body.agentMode !== undefined && body.mode === undefined) {
      body.mode = body.agentMode;
    }
    // Validate I/O schemas if the client is updating them.
    if (body.inputSchema !== undefined && body.inputSchema !== null) {
      const r = validateSchema(body.inputSchema);
      if (!r.valid) {
        return apiKeyJson(
          request,
          authResult,
          { error: "Invalid inputSchema", details: r.errors },
          { status: 400, headers: corsHeaders },
        );
      }
    }
    if (body.outputSchema !== undefined && body.outputSchema !== null) {
      const r = validateSchema(body.outputSchema);
      if (!r.valid) {
        return apiKeyJson(
          request,
          authResult,
          { error: "Invalid outputSchema", details: r.errors },
          { status: 400, headers: corsHeaders },
        );
      }
    }
    const actions = parseActions(body.actions);
    const sanitizedData = Object.fromEntries(
      Object.entries(body).filter(([key]) => ALLOWED_FIELDS.includes(key as (typeof ALLOWED_FIELDS)[number]))
    );

    if (typeof sanitizedData.llmModel === "string") {
      const modelDef = getModelDef(sanitizedData.llmModel);
      sanitizedData.modelProvider = modelDef?.provider || MODEL_PROVIDER_MAP[sanitizedData.llmModel] || "ANTHROPIC";
    }

    const updated = await prisma.$transaction(async (tx) => {
      const agent = await tx.agent.update({
        where: { id: params.id },
        data: sanitizedData,
      });

      if (actions) {
        await tx.agentAction.deleteMany({ where: { agentId: agent.id } });
        if (actions.length) {
          await tx.agentAction.createMany({
            data: actions.map((action) => ({
              agentId: agent.id,
              type: action,
              enabled: true,
              config: {},
            })),
          });
        }
      }

      return agent;
    });

    return apiKeyJson(
      request,
      authResult,
      {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
        mode: updated.mode,
        // Backward-compat: legacy field name in response.
        agentMode: updated.mode,
        updatedFields: [
          ...Object.keys(sanitizedData),
          ...(actions !== undefined ? ["actions"] : []),
        ],
        publicUrl: updated.mode === "CHAT" ? `/embed/${updated.slug}` : undefined,
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
