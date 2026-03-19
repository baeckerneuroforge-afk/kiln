/**
 * A2A Inter-Agent Billing (Credit System)
 * A2A Calls verbrauchen Credits des AUFRUFENDEN Agent-Owners.
 */

import { prisma } from "@/lib/prisma";

interface BillingCheck {
  allowed: boolean;
  required: number;
  available: number;
  callerUserId?: string;
}

/**
 * Prüft ob der Caller genug Credits hat.
 * callerIdentifier: entweder userId direkt oder via API-Key Lookup.
 */
export async function checkA2ACredits(
  callerUserId: string,
  creditCost: number
): Promise<BillingCheck> {
  const user = await prisma.user.findUnique({
    where: { id: callerUserId },
    select: { aiCreditsBalance: true },
  });

  if (!user) {
    return { allowed: false, required: creditCost, available: 0 };
  }

  return {
    allowed: user.aiCreditsBalance >= creditCost,
    required: creditCost,
    available: user.aiCreditsBalance,
    callerUserId,
  };
}

/**
 * Zieht Credits ab und loggt den Verbrauch.
 */
export async function deductA2ACredits(
  callerUserId: string,
  receiverAgentId: string,
  credits: number,
  sourceIp?: string,
  sourceAgentUrl?: string
): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: callerUserId },
      data: { aiCreditsBalance: { decrement: credits } },
    }),
    prisma.a2AUsage.create({
      data: {
        callerUserId,
        receiverAgentId,
        credits,
        sourceIp,
        sourceAgentUrl,
      },
    }),
  ]);
}

/**
 * A2A Usage-Statistiken für einen Agent.
 */
export async function getA2AUsageStats(agentId: string, days = 7) {
  const since = new Date(Date.now() - days * 86400000);

  const [inboundLogs, usageRecords] = await Promise.all([
    prisma.a2AInteractionLog.findMany({
      where: { agentId, direction: "inbound", createdAt: { gte: since } },
      select: { remoteAgentUrl: true, durationMs: true },
    }),
    prisma.a2AUsage.findMany({
      where: { receiverAgentId: agentId, createdAt: { gte: since } },
      select: { callerUserId: true, credits: true },
    }),
  ]);

  const uniqueCallers = new Set(inboundLogs.map((l) => l.remoteAgentUrl));
  const totalCreditsEarned = usageRecords.reduce((sum, u) => sum + u.credits, 0);

  return {
    callsThisWeek: inboundLogs.length,
    uniqueCallers: uniqueCallers.size,
    totalCreditsEarned,
    avgResponseMs: inboundLogs.length > 0
      ? Math.round(inboundLogs.reduce((sum, l) => sum + (l.durationMs || 0), 0) / inboundLogs.length)
      : 0,
  };
}
