import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendTestWebhook } from "@/lib/webhooks";
import { TEAM_EVENT_TYPES } from "@/lib/event-types";
import crypto from "crypto";

// GET — Team-Webhooks mit Deliveries laden
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const webhooks = await prisma.webhookEndpoint.findMany({
      where: { teamId: params.id, userId },
      orderBy: { createdAt: "desc" },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    return Response.json(webhooks);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST — Team-Webhook erstellen oder Test senden
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const body = await request.json();

    // Test senden
    if (body.action === "test") {
      const { webhookId } = body;
      if (!webhookId) {
        return Response.json({ error: "webhookId is required." }, { status: 400 });
      }

      const webhook = await prisma.webhookEndpoint.findFirst({
        where: { id: webhookId, userId, teamId: params.id },
      });
      if (!webhook) {
        return Response.json({ error: "Webhook not found" }, { status: 404 });
      }

      const result = await sendTestWebhook(webhook.id, webhook.url, webhook.secret);
      return Response.json(result);
    }

    // Webhook erstellen
    const { url, events } = body;

    if (!url || !events?.length) {
      return Response.json(
        { error: "URL and at least one event are required." },
        { status: 400 }
      );
    }

    // URL validieren
    try {
      new URL(url);
    } catch {
      return Response.json({ error: "Invalid URL." }, { status: 400 });
    }

    // Events validieren — nur Team-Events erlauben
    const validEvents = (events as string[]).filter((e) =>
      (TEAM_EVENT_TYPES as string[]).includes(e)
    );
    if (validEvents.length === 0) {
      return Response.json(
        { error: "At least one valid team event type is required." },
        { status: 400 }
      );
    }

    // Max 5 Webhooks pro Team
    const count = await prisma.webhookEndpoint.count({
      where: { teamId: params.id },
    });
    if (count >= 5) {
      return Response.json(
        { error: "Maximum 5 webhooks per team." },
        { status: 400 }
      );
    }

    const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        userId,
        teamId: params.id,
        url,
        events: validEvents,
        secret,
      },
      include: {
        deliveries: true,
      },
    });

    return Response.json(webhook, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH — Team-Webhook aktualisieren
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { webhookId, active, url, events } = body;

    if (!webhookId) {
      return Response.json({ error: "webhookId is required." }, { status: 400 });
    }

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId, teamId: params.id },
    });
    if (!existing) {
      return Response.json({ error: "Webhook not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof active === "boolean") updateData.active = active;
    if (url) updateData.url = url;
    if (events) {
      const validEvents = (events as string[]).filter((e) =>
        (TEAM_EVENT_TYPES as string[]).includes(e)
      );
      updateData.events = validEvents;
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: updateData,
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE — Team-Webhook löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { webhookId } = body;

    if (!webhookId) {
      return Response.json({ error: "webhookId is required." }, { status: 400 });
    }

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId, teamId: params.id },
    });
    if (!existing) {
      return Response.json({ error: "Webhook not found" }, { status: 404 });
    }

    await prisma.webhookEndpoint.delete({ where: { id: webhookId } });
    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
