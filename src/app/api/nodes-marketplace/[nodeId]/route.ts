import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/nodes-marketplace/[nodeId]
 * Details eines Custom Nodes laden.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { nodeId } = await params;

    const node = await prisma.customNode.findUnique({
      where: { id: nodeId },
      include: {
        _count: { select: { installations: true } },
      },
    });

    if (!node) {
      return Response.json({ error: "Node nicht gefunden" }, { status: 404 });
    }

    // Nur veroeffentlichte Nodes oder eigene Nodes anzeigen
    if (node.status !== "published" && node.creatorId !== userId) {
      return Response.json({ error: "Node nicht gefunden" }, { status: 404 });
    }

    // Pruefen ob vom aktuellen User installiert
    const installation = await prisma.customNodeInstallation.findUnique({
      where: {
        userId_customNodeId: { userId, customNodeId: node.id },
      },
    });

    return Response.json({
      ...node,
      installed: !!installation,
    });
  } catch (err) {
    console.error("GET /api/nodes-marketplace/[nodeId] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
