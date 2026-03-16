import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { ActionType } from "@prisma/client";
import { authenticateApiKey } from "@/lib/api-auth";
import { getModelDef, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

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
  "agentMode",
  "whiteLabel",
  "status",
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
  try {
    const authResult = await authenticateApiKey(request.headers.get("authorization"));
    if (!authResult) {
      return Response.json(
        { error: "Invalid or missing API key. Use Authorization: Bearer sk-kiln-..." },
        { status: 401, headers: corsHeaders }
      );
    }
    waitUntil(authResult.touchLastUsed);

    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return Response.json(
        { error: "Rate limit exceeded. 100 requests per minute." },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId: authResult.userId },
      include: {
        actions: true,
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found or unauthorized" }, { status: 404, headers: corsHeaders });
    }

    return Response.json(
      {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        welcomeMessage: agent.welcomeMessage,
        llmModel: agent.llmModel,
        agentMode: agent.agentMode,
        status: agent.status,
        whiteLabel: agent.whiteLabel,
        actions: agent.actions.map((action) => action.type),
      },
      {
        headers: {
          ...corsHeaders,
          "X-RateLimit-Remaining": String(rateCheck.remaining),
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await authenticateApiKey(request.headers.get("authorization"));
    if (!authResult) {
      return Response.json(
        { error: "Invalid or missing API key. Use Authorization: Bearer sk-kiln-..." },
        { status: 401, headers: corsHeaders }
      );
    }
    waitUntil(authResult.touchLastUsed);

    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return Response.json(
        { error: "Rate limit exceeded. 100 requests per minute." },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const existing = await prisma.agent.findFirst({
      where: { id: params.id, userId: authResult.userId },
    });
    if (!existing) {
      return Response.json({ error: "Agent not found or unauthorized" }, { status: 404, headers: corsHeaders });
    }

    const body = await request.json();
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

    return Response.json(
      {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
        agentMode: updated.agentMode,
        updatedFields: [
          ...Object.keys(sanitizedData),
          ...(actions !== undefined ? ["actions"] : []),
        ],
        publicUrl: updated.agentMode === "CHAT" ? `/embed/${updated.slug}` : undefined,
      },
      {
        headers: {
          ...corsHeaders,
          "X-RateLimit-Remaining": String(rateCheck.remaining),
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
