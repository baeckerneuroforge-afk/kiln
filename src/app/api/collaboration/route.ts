import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, PlanType } from "@/lib/stripe";
import { agentCollaboration } from "@/lib/collaboration/agent-collaboration";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const mySharedAgents = await agentCollaboration.getMySharedAgents(userId);
    const sharedWithMe = await agentCollaboration.getSharedWithMe(userId);

    return NextResponse.json({ mySharedAgents, sharedWithMe });
  } catch (error) {
    console.error("Collaboration list error:", error);
    return NextResponse.json({ error: "Failed to list collaborations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    const limits = PLAN_LIMITS[(user?.plan || "FREE") as PlanType];

    if (!limits.agentCollaboration) {
      return NextResponse.json({ error: "Agent collaboration is not available on your plan" }, { status: 403 });
    }

    const { agentId, targetUserEmail, permissions } = await req.json();

    const collaboration = await agentCollaboration.shareAgent(
      userId,
      agentId,
      targetUserEmail,
      permissions,
    );

    return NextResponse.json(collaboration, { status: 201 });
  } catch (error) {
    console.error("Collaboration share error:", error);
    return NextResponse.json({ error: "Failed to share agent" }, { status: 500 });
  }
}
