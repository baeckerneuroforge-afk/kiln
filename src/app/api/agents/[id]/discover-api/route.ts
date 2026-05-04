import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { startDiscovery, processDiscovery } from "@/lib/sandbox/api-discoverer";

/**
 * POST /api/agents/[id]/discover-api — API-Discovery starten
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: agentId } = await params;

  // Agent prüfen
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });
  if (!agent) {
    return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
  }

  // Plan-Check: Pro+ für API Discovery (Admins bypass — siehe lib/admin.ts).
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (
    user &&
    !["PRO", "AGENCY", "ENTERPRISE"].includes(user.plan) &&
    !isAdmin(userId)
  ) {
    return Response.json(
      { error: "API Discovery ist ab dem Pro-Plan verfügbar" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json() as {
      serviceName?: string;
      docsUrl?: string;
      apiKey?: string;
    };

    if (!body.serviceName || typeof body.serviceName !== "string") {
      return Response.json({ error: "serviceName fehlt" }, { status: 400 });
    }

    const discoveryId = await startDiscovery(
      agentId,
      userId,
      body.serviceName,
      body.docsUrl,
    );

    // Async verarbeiten
    processDiscovery(discoveryId, body.apiKey).catch((err) => {
      console.error("[ApiDiscovery] Processing error:", err);
    });

    return Response.json({
      discoveryId,
      status: "processing",
    }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/agents/[id]/discover-api — Liste aller Discoveries
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: agentId } = await params;

  const discoveries = await prisma.apiDiscovery.findMany({
    where: { agentId, userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      serviceName: true,
      docsUrl: true,
      status: true,
      isActivated: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return Response.json({ discoveries });
}
