import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { validateUrl } from "@/lib/url-validation";
import { ALL_EVENT_TYPES, type EventType } from "@/lib/event-types";
import crypto from "crypto";

// GET /api/agents/[id]/event-subscriptions — Liste aller Event-Subscriptions für diesen Agent
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Agent-Ownership prüfen
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const subscriptions = await prisma.webhookEndpoint.findMany({
      where: { userId, agentId: params.id },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(subscriptions);
  } catch (err) {
    console.error("GET /api/agents/[id]/event-subscriptions error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/agents/[id]/event-subscriptions — Neue Event-Subscription erstellen
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await request.json();
    const { url, events } = body as { url?: string; events?: string[] };

    if (!url || typeof url !== "string") {
      return Response.json({ error: "URL is required" }, { status: 400 });
    }

    // SSRF-Schutz
    const validation = await validateUrl(url);
    if (!validation.safe) {
      return Response.json({ error: validation.error || "Invalid URL" }, { status: 400 });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return Response.json({ error: "At least one event type is required" }, { status: 400 });
    }

    // Validate event types
    const validEvents = events.filter((e): e is EventType =>
      ALL_EVENT_TYPES.includes(e as EventType)
    );
    if (validEvents.length === 0) {
      return Response.json(
        { error: `Invalid event types. Valid types: ${ALL_EVENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Max 10 Subscriptions pro Agent
    const count = await prisma.webhookEndpoint.count({
      where: { userId, agentId: params.id },
    });
    if (count >= 10) {
      return Response.json(
        { error: "Maximum 10 event subscriptions per agent" },
        { status: 400 }
      );
    }

    const secret = crypto.randomBytes(32).toString("hex");

    const subscription = await prisma.webhookEndpoint.create({
      data: {
        userId,
        agentId: params.id,
        url,
        events: validEvents,
        secret,
      },
    });

    return Response.json(subscription, { status: 201 });
  } catch (err) {
    console.error("POST /api/agents/[id]/event-subscriptions error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/event-subscriptions — Subscription löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get("id");

    if (!subscriptionId) {
      return Response.json({ error: "Subscription ID is required" }, { status: 400 });
    }

    const subscription = await prisma.webhookEndpoint.findFirst({
      where: { id: subscriptionId, userId, agentId: params.id },
    });
    if (!subscription) {
      return Response.json({ error: "Subscription not found" }, { status: 404 });
    }

    await prisma.webhookEndpoint.delete({ where: { id: subscriptionId } });

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/agents/[id]/event-subscriptions error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
