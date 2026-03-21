import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { activateDiscovery } from "@/lib/sandbox/api-discoverer";

/**
 * GET /api/agents/[id]/discover-api/[discoveryId] — Discovery-Status + Details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; discoveryId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { discoveryId } = await params;

  const discovery = await prisma.apiDiscovery.findFirst({
    where: { id: discoveryId, userId },
  });

  if (!discovery) {
    return Response.json({ error: "Discovery nicht gefunden" }, { status: 404 });
  }

  return Response.json({
    id: discovery.id,
    agentId: discovery.agentId,
    serviceName: discovery.serviceName,
    docsUrl: discovery.docsUrl,
    status: discovery.status,
    apiSpec: discovery.apiSpec,
    generatedCode: discovery.generatedCode,
    toolDefinitions: discovery.toolDefinitions,
    testResults: discovery.testResults,
    isActivated: discovery.isActivated,
    errorMessage: discovery.errorMessage,
    createdAt: discovery.createdAt,
  });
}

/**
 * PUT /api/agents/[id]/discover-api/[discoveryId] — Integration bearbeiten
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; discoveryId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { discoveryId } = await params;

  try {
    const body = await request.json() as {
      generatedCode?: string;
      toolDefinitions?: unknown;
    };

    const updateData: Record<string, unknown> = {};
    if (body.generatedCode !== undefined) updateData.generatedCode = body.generatedCode;
    if (body.toolDefinitions !== undefined) {
      updateData.toolDefinitions = JSON.parse(JSON.stringify(body.toolDefinitions));
    }

    await prisma.apiDiscovery.updateMany({
      where: { id: discoveryId, userId },
      data: updateData,
    });

    return Response.json({ updated: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/agents/[id]/discover-api/[discoveryId] — Integration aktivieren
 * Body: { action: "activate" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; discoveryId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { discoveryId } = await params;

  // Verify ownership
  const discovery = await prisma.apiDiscovery.findFirst({
    where: { id: discoveryId, userId },
  });
  if (!discovery) {
    return Response.json({ error: "Discovery nicht gefunden" }, { status: 404 });
  }

  try {
    const body = await request.json() as { action?: string };

    if (body.action === "activate") {
      await activateDiscovery(discoveryId);
      return Response.json({ status: "activated" });
    }

    return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/agents/[id]/discover-api/[discoveryId] — Discovery löschen
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; discoveryId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { discoveryId } = await params;

  try {
    await prisma.apiDiscovery.deleteMany({
      where: { id: discoveryId, userId },
    });
    return Response.json({ deleted: true });
  } catch {
    return Response.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
  }
}
