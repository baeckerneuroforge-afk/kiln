import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import { knowledgeGraph } from "@/lib/knowledge/knowledge-graph";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const limits = PLAN_LIMITS[(user?.plan || "FREE") as PlanType];
  if (!limits.knowledgeGraph) {
    return NextResponse.json(
      { error: "Upgrade required to save research into the Knowledge Base." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null) as {
    title?: string;
    summary?: string;
    markdown?: string;
    sources?: Array<{ title: string; url: string; domain?: string; snippet?: string }>;
  } | null;

  const title = body?.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const saved = await knowledgeGraph.addEntity(userId, {
    type: "Insight",
    name: title.slice(0, 120),
    properties: {
      summary: body?.summary || "",
      report: body?.markdown || "",
      sources: body?.sources || [],
      sourceType: "quick_use_deep_research",
      savedAt: new Date().toISOString(),
    },
    source: {
      agentId: "quick-use:deep-research",
      timestamp: new Date(),
    },
  });

  return NextResponse.json({ id: saved.id, name: saved.name });
}
