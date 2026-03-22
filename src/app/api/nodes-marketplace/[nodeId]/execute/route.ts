import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { nodeRuntime } from "@/lib/nodes-sdk/node-runtime";

/**
 * POST /api/nodes-marketplace/[nodeId]/execute
 * Test-Ausfuehrung eines Custom Nodes (nur fuer den Creator).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { nodeId } = await params;

    // Nur der Creator darf testen
    const node = await prisma.customNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      return Response.json({ error: "Node nicht gefunden" }, { status: 404 });
    }

    if (node.creatorId !== userId) {
      return Response.json({ error: "Nur der Ersteller kann Nodes testen" }, { status: 403 });
    }

    const body = await request.json();
    const { input, config } = body as {
      input?: Record<string, unknown>;
      config?: Record<string, unknown>;
    };

    const result = await nodeRuntime.executeNode(
      userId,
      nodeId,
      input || {},
      config || {}
    );

    return Response.json(result);
  } catch (err) {
    console.error("POST /api/nodes-marketplace/[nodeId]/execute error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
