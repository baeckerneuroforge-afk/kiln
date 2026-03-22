import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import { publishNode } from "@/lib/nodes-sdk/node-publisher";
import type { CustomNodeDefinitionJSON } from "@/lib/nodes-sdk/node-sdk-types";

/**
 * POST /api/nodes-marketplace/submit
 * Custom Node zur Pruefung einreichen. Plan-gated: customNodePublishing.
 */
export async function POST(request: NextRequest) {
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
    if (!limits.customNodePublishing) {
      return Response.json({ error: "Upgrade required" }, { status: 403 });
    }

    const body = await request.json();
    const { definition, readme } = body as {
      definition: CustomNodeDefinitionJSON;
      readme?: string;
    };

    if (!definition) {
      return Response.json({ error: "definition ist erforderlich" }, { status: 400 });
    }

    const result = await publishNode(userId, definition, readme);

    return Response.json(result, { status: 201 });
  } catch (err) {
    console.error("POST /api/nodes-marketplace/submit error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 400 });
  }
}
