import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function resolveUserId(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer sk-kiln-")) {
    const authResult = await authenticateApiKey(authHeader);
    if (authResult.ok) return authResult.userId;
  }
  const { userId } = await auth();
  if (userId) return userId;
  throw new Error("Nicht authentifiziert");
}

// GET /api/v1/webhooks/[webhookId] — Details + Delivery Log
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const userId = await resolveUserId(request);
    const { webhookId } = await params;

    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!webhook) {
      return Response.json({ error: "Webhook nicht gefunden" }, { status: 404, headers: corsHeaders });
    }

    return Response.json({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      secret: webhook.secret,
      createdAt: webhook.createdAt,
      deliveries: webhook.deliveries.map((d) => ({
        id: d.id,
        event: d.event,
        statusCode: d.statusCode,
        responseTime: d.responseTime,
        success: d.success,
        error: d.error,
        createdAt: d.createdAt,
      })),
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

// PUT /api/v1/webhooks/[webhookId] — Update
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const userId = await resolveUserId(request);
    const { webhookId } = await params;

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!existing) {
      return Response.json({ error: "Webhook nicht gefunden" }, { status: 404, headers: corsHeaders });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (typeof body.url === "string") updateData.url = body.url;
    if (Array.isArray(body.events)) updateData.events = body.events;
    if (typeof body.isActive === "boolean") updateData.active = body.isActive;
    if (typeof body.secret === "string") updateData.secret = body.secret;

    const updated = await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: updateData,
    });

    return Response.json({
      id: updated.id,
      url: updated.url,
      events: updated.events,
      active: updated.active,
      createdAt: updated.createdAt,
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

// DELETE /api/v1/webhooks/[webhookId] — Löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const userId = await resolveUserId(request);
    const { webhookId } = await params;

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!existing) {
      return Response.json({ error: "Webhook nicht gefunden" }, { status: 404, headers: corsHeaders });
    }

    await prisma.webhookEndpoint.delete({ where: { id: webhookId } });

    return Response.json({ deleted: true }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
