import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";

/**
 * Prüft ob der User sein Agent-Limit erreicht hat
 */
export async function canCreateAgent(userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const plan = (user?.plan || "FREE") as PlanType;
  const limits = PLAN_LIMITS[plan];

  const agentCount = await prisma.agent.count({ where: { userId } });

  return {
    allowed: agentCount < limits.agents,
    current: agentCount,
    limit: limits.agents,
  };
}

/**
 * Prüft ob der Agent sein monatliches Chat-Limit erreicht hat
 */
export async function canChat(agentId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { user: true },
  });

  if (!agent) return { allowed: false, current: 0, limit: 0 };

  const plan = (agent.user.plan || "FREE") as PlanType;
  const limits = PLAN_LIMITS[plan];

  // Gespräche dieses Monats zählen
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const chatCount = await prisma.conversation.count({
    where: {
      agent: { userId: agent.userId },
      createdAt: { gte: startOfMonth },
    },
  });

  return {
    allowed: chatCount < limits.chatsPerMonth,
    current: chatCount,
    limit: limits.chatsPerMonth,
  };
}
