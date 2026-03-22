import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, PlanType } from "@/lib/stripe";
import { knowledgeGraph } from "@/lib/knowledge/knowledge-graph";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Plan-Gating: Knowledge Graph nur für berechtigte Pläne
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const limits = PLAN_LIMITS[(user?.plan || "FREE") as PlanType];
    if (!limits.knowledgeGraph) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 });
    }

    const { entityId } = await params;

    const entity = await knowledgeGraph.getEntity(entityId);
    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    // Sicherstellen, dass die Entity dem User gehört
    if (entity.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const history = await knowledgeGraph.getEntityHistory(entityId);

    return NextResponse.json({
      entity,
      history,
      relations: [...(entity.relationsFrom || []), ...(entity.relationsTo || [])],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
