import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET — Liste aller Automations für einen Agent
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prüfen ob Agent dem User gehört
  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const automations = await prisma.automationRule.findMany({
    where: { agentId: params.id },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(automations);
}

// POST — Neue Automation erstellen
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, cronExpression, taskDescription, notificationMethod, notificationTarget } = body;

  if (!name || !cronExpression || !taskDescription) {
    return Response.json(
      { error: "Name, schedule, and task description are required." },
      { status: 400 }
    );
  }

  // Max 10 Automations pro Agent
  const count = await prisma.automationRule.count({
    where: { agentId: params.id },
  });
  if (count >= 10) {
    return Response.json(
      { error: "Maximum 10 automations per agent." },
      { status: 400 }
    );
  }

  const automation = await prisma.automationRule.create({
    data: {
      agentId: params.id,
      name,
      cronExpression,
      taskDescription,
      notificationMethod: notificationMethod || "NONE",
      notificationTarget: notificationTarget || null,
    },
  });

  return Response.json(automation, { status: 201 });
}

// PATCH — Automation aktualisieren (enable/disable oder Felder ändern)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await request.json();
  const { automationId, enabled, name, cronExpression, taskDescription, notificationMethod, notificationTarget } = body;

  if (!automationId) {
    return Response.json({ error: "automationId is required." }, { status: 400 });
  }

  // Sicherstellen dass die Automation zum Agent gehört
  const existing = await prisma.automationRule.findFirst({
    where: { id: automationId, agentId: params.id },
  });
  if (!existing) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (typeof enabled === "boolean") updateData.enabled = enabled;
  if (name) updateData.name = name;
  if (cronExpression) updateData.cronExpression = cronExpression;
  if (taskDescription) updateData.taskDescription = taskDescription;
  if (notificationMethod !== undefined) updateData.notificationMethod = notificationMethod;
  if (notificationTarget !== undefined) updateData.notificationTarget = notificationTarget;

  const updated = await prisma.automationRule.update({
    where: { id: automationId },
    data: updateData,
  });

  return Response.json(updated);
}

// DELETE — Automation löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const automationId = searchParams.get("automationId");

  if (!automationId) {
    return Response.json({ error: "automationId is required." }, { status: 400 });
  }

  const existing = await prisma.automationRule.findFirst({
    where: { id: automationId, agentId: params.id },
  });
  if (!existing) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  await prisma.automationRule.delete({ where: { id: automationId } });

  return Response.json({ success: true });
}
