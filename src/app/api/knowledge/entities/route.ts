import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, PlanType } from "@/lib/stripe";
import { knowledgeGraph } from "@/lib/knowledge/knowledge-graph";

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const graph = await knowledgeGraph.getGraph(userId, { type, limit });

    return NextResponse.json({ entities: graph.nodes, relations: graph.edges });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
