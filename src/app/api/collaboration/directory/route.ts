import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, PlanType } from "@/lib/stripe";
import { agentDirectory } from "@/lib/collaboration/agent-directory";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const category = searchParams.get("category") || undefined;

    const agents = await agentDirectory.searchPublicAgents(q, category);

    return NextResponse.json(agents);
  } catch (error) {
    console.error("Agent directory search error:", error);
    return NextResponse.json({ error: "Failed to search agent directory" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    const limits = PLAN_LIMITS[(user?.plan || "FREE") as PlanType];

    if (!limits.publicAgentDirectory) {
      return NextResponse.json({ error: "Public agent directory is not available on your plan" }, { status: 403 });
    }

    const { agentId, publicName, publicDescription, category } = await req.json();

    const published = await agentDirectory.publishAgent(
      userId,
      agentId,
      publicName,
      publicDescription,
      category,
      "public",
    );

    return NextResponse.json(published, { status: 201 });
  } catch (error) {
    console.error("Agent directory publish error:", error);
    return NextResponse.json({ error: "Failed to publish agent" }, { status: 500 });
  }
}
