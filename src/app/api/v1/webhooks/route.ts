import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, apiKeyJson } from "@/lib/api-auth";
import { validateUrl } from "@/lib/url-validation";
import crypto from "crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Resolve userId from either Clerk session or API key
 */
async function resolveUserId(request: NextRequest): Promise<{
  userId: string;
  isApiKey: boolean;
  authResult?: Awaited<ReturnType<typeof authenticateApiKey>> & { ok: true };
}> {
  // Versuche erst API Key
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer sk-kiln-")) {
    const authResult = await authenticateApiKey(authHeader);
    if (authResult.ok) {
      return { userId: authResult.userId, isApiKey: true, authResult };
    }
  }

  // Clerk Session
  const { userId } = await auth();
  if (userId) {
    return { userId, isApiKey: false };
  }

  throw new Error("Nicht authentifiziert");
}

// GET /api/v1/webhooks — Liste aller Webhooks
export async function GET(request: NextRequest) {
  try {
    const { userId, isApiKey, authResult } = await resolveUserId(request);

    const webhooks = await prisma.webhookEndpoint.findMany({
      where: { userId },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const response = {
      webhooks: webhooks.map((wh) => ({
        id: wh.id,
        url: wh.url,
        events: wh.events,
        active: wh.active,
        createdAt: wh.createdAt,
        deliveries: wh.deliveries.map((d) => ({
          id: d.id,
          event: d.event,
          statusCode: d.statusCode,
          responseTime: d.responseTime,
          success: d.success,
          error: d.error,
          createdAt: d.createdAt,
        })),
      })),
    };

    if (isApiKey && authResult) {
      return apiKeyJson(request, authResult, response, { headers: corsHeaders });
    }

    return Response.json(response, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: message === "Nicht authentifiziert" ? 401 : 500, headers: corsHeaders });
  }
}

// POST /api/v1/webhooks — Neuen Webhook erstellen
export async function POST(request: NextRequest) {
  try {
    const { userId, isApiKey, authResult } = await resolveUserId(request);

    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const events = Array.isArray(body.events) ? body.events : [];
    const secret = typeof body.secret === "string" && body.secret
      ? body.secret
      : crypto.randomBytes(32).toString("hex");

    if (!url) {
      const errResponse = { error: "URL ist erforderlich" };
      return Response.json(errResponse, { status: 400, headers: corsHeaders });
    }

    if (events.length === 0) {
      const errResponse = { error: "Mindestens ein Event muss ausgewählt werden" };
      return Response.json(errResponse, { status: 400, headers: corsHeaders });
    }

    // SSRF-Schutz
    const validation = await validateUrl(url);
    if (!validation.safe) {
      const errResponse = { error: validation.error || "URL nicht erlaubt" };
      return Response.json(errResponse, { status: 400, headers: corsHeaders });
    }

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        userId,
        url,
        events,
        secret,
        active: true,
      },
    });

    const response = {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret: webhook.secret,
      active: webhook.active,
      createdAt: webhook.createdAt,
    };

    if (isApiKey && authResult) {
      return apiKeyJson(request, authResult, response, { status: 201, headers: corsHeaders });
    }

    return Response.json(response, { status: 201, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: message === "Nicht authentifiziert" ? 401 : 500, headers: corsHeaders });
  }
}
