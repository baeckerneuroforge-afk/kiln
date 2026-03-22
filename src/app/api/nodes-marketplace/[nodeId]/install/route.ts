import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import { installNode, uninstallNode } from "@/lib/nodes-sdk/node-publisher";

/**
 * POST /api/nodes-marketplace/[nodeId]/install
 * Custom Node installieren. Plan-gated: customNodes.
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

    // Plan-Gating
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const limits = PLAN_LIMITS[(user?.plan || "FREE") as PlanType];
    if (!limits.customNodes) {
      return Response.json({ error: "Upgrade required" }, { status: 403 });
    }

    const { nodeId } = await params;
    const body = await request.json().catch(() => ({}));
    const action = (body as Record<string, unknown>).action || "install";

    if (action === "uninstall") {
      const result = await uninstallNode(userId, nodeId);
      return Response.json(result);
    }

    const result = await installNode(userId, nodeId);
    return Response.json(result);
  } catch (err) {
    console.error("POST /api/nodes-marketplace/[nodeId]/install error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 400 });
  }
}
