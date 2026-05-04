import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, PlanType } from "@/lib/stripe";
import { knowledgeGraph } from "@/lib/knowledge/knowledge-graph";

export const dynamic = "force-dynamic";

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
    const q = searchParams.get("q");
    const type = searchParams.get("type") || undefined;

    if (!q) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const result = await knowledgeGraph.search(userId, q);
    const entities = type
      ? result.entities.filter((e) => e.type === type)
      : result.entities;

    return NextResponse.json({ entities });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
