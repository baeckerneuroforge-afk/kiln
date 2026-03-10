import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const plan = (user?.plan || "FREE") as PlanType;
    const limits = PLAN_LIMITS[plan];

    // Agent-Anzahl
    const agentCount = await prisma.agent.count({ where: { userId } });

    // Gespräche dieses Monats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const chatCount = await prisma.conversation.count({
      where: {
        agent: { userId },
        createdAt: { gte: startOfMonth },
      },
    });

    return Response.json({
      plan,
      agentCount,
      chatCount,
      limits,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}
