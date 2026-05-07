import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendTestWebhook } from "@/lib/webhooks";
import crypto from "crypto";

function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}

// GET: Load webhooks with recent deliveries.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhooks = await prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  return Response.json(webhooks);
}

// POST: Create a webhook or send a test event.
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user || user.plan === "FREE") {
    return Response.json(
      { error: "Webhooks require a Pro or Agency plan." },
      { status: 403 }
    );
  }

  const body = await request.json();

  if (body.action === "test") {
    const { webhookId } = body;
    if (!webhookId) {
      return Response.json({ error: "webhookId is required." }, { status: 400 });
    }

    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });
    if (!webhook) {
      return Response.json({ error: "Webhook not found" }, { status: 404 });
    }

    const result = await sendTestWebhook(webhook.id, webhook.url, webhook.secret);
    return Response.json(result);
  }

  const { url, events } = body;

  if (!url || !events?.length) {
    return Response.json(
      { error: "URL and at least one event are required." },
      { status: 400 }
    );
  }

  try {
    new URL(url);
  } catch {
    return Response.json({ error: "Invalid URL." }, { status: 400 });
  }

  const count = await prisma.webhookEndpoint.count({ where: { userId } });
  if (count >= 5) {
    return Response.json({ error: "Maximum 5 webhooks per account." }, { status: 400 });
  }

  const webhook = await prisma.webhookEndpoint.create({
    data: {
      userId,
      url,
      events,
      secret: generateWebhookSecret(),
    },
    include: {
      deliveries: true,
    },
  });

  return Response.json(webhook, { status: 201 });
}

// PATCH: Update a webhook or regenerate its signing secret.
export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { webhookId, active, url, events, action } = body;

  if (!webhookId) {
    return Response.json({ error: "webhookId is required." }, { status: 400 });
  }

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: webhookId, userId },
  });
  if (!existing) {
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (action === "regenerateSecret") updateData.secret = generateWebhookSecret();
  if (typeof active === "boolean") updateData.active = active;
  if (url) updateData.url = url;
  if (events) updateData.events = events;

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
}

// DELETE: Delete a webhook.
export async function DELETE(request: NextRequest) {
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
    where: { id: webhookId, userId },
  });
  if (!existing) {
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  }

  await prisma.webhookEndpoint.delete({ where: { id: webhookId } });
  return Response.json({ success: true });
}
