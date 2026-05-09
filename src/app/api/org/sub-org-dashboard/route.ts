import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [relationship, conversationsToday, pendingApprovals, activeDepartments, recentConversations] =
      await Promise.all([
        prisma.orgRelationship.findFirst({
          where: { childOrgId: orgId },
          select: { subOrgName: true, brandColor: true, logoUrl: true },
        }),
        prisma.conversation.count({
          where: { orgId, createdAt: { gte: today } },
        }),
        prisma.departmentBacklogItem.count({
          where: {
            status: "PENDING",
            department: { orgId },
          },
        }),
        prisma.department.count({
          where: { orgId, status: "ACTIVE" },
        }),
        prisma.conversation.findMany({
          where: { orgId },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: {
            id: true,
            visitorName: true,
            visitorEmail: true,
            channel: true,
            updatedAt: true,
            agent: { select: { name: true } },
          },
        }),
      ]);

    return NextResponse.json({
      subOrgName: relationship?.subOrgName ?? "Customer Workspace",
      brandColor: relationship?.brandColor ?? null,
      logoUrl: relationship?.logoUrl ?? null,
      conversationsToday,
      pendingApprovals,
      activeDepartments,
      recentConversations: recentConversations.map((conversation) => ({
        id: conversation.id,
        visitorName: conversation.visitorName,
        visitorEmail: conversation.visitorEmail,
        channel: conversation.channel,
        agentName: conversation.agent.name,
        updatedAt: conversation.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[org/sub-org-dashboard] Failed to load dashboard", error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
