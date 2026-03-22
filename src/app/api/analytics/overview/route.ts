import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [conversations, leads, analytics] = await Promise.all([
      prisma.conversation.count({
        where: {
          agent: { userId },
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.conversation.count({
        where: {
          agent: { userId },
          createdAt: { gte: startOfMonth },
          visitorEmail: { not: null },
        },
      }),
      prisma.agentAnalytics.aggregate({
        where: {
          agent: { userId },
        },
        _sum: { estimatedValue: true },
      }),
    ]);

    return Response.json({
      conversations,
      leads,
      estimatedValue: analytics._sum.estimatedValue ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
