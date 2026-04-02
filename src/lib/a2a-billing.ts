/**
 * A2A Inter-Agent Billing (Credit System)
 * A2A Calls verbrauchen Credits des AUFRUFENDEN Agent-Owners.
 * BYOK-User mit passendem API-Key werden nicht belastet.
 */

import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

interface BillingCheck {
  allowed: boolean;
  required: number;
  available: number;
  callerUserId?: string;
  byokActive?: boolean;
}

/**
 * Prüft ob der Caller genug Credits hat.
 * Berücksichtigt BYOK: wenn der User einen eigenen API-Key für den
 * genutzten Provider hat, werden keine Credits abgezogen.
 */
export async function checkA2ACredits(
  callerUserId: string,
  creditCost: number,
  modelProvider?: string
): Promise<BillingCheck> {
  if (isAdmin(callerUserId)) {
    return { allowed: true, required: 0, available: 999999, callerUserId, byokActive: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: callerUserId },
    select: { aiCreditsBalance: true },
  });

  if (!user) {
    return { allowed: false, required: creditCost, available: 0 };
  }

  // BYOK Check: User hat eigenen API-Key für diesen Provider?
  if (modelProvider) {
    const hasKey = await prisma.apiKey.findUnique({
      where: { userId_provider: { userId: callerUserId, provider: modelProvider.toLowerCase() } },
      select: { id: true },
    });
    if (hasKey) {
      return { allowed: true, required: 0, available: user.aiCreditsBalance, callerUserId, byokActive: true };
    }
  }

  return {
    allowed: user.aiCreditsBalance >= creditCost,
    required: creditCost,
    available: user.aiCreditsBalance,
    callerUserId,
    byokActive: false,
  };
}

/**
 * Zieht Credits ab und loggt den Verbrauch.
 * Wenn byokActive=true, wird nur geloggt aber nicht abgezogen.
 */
export async function deductA2ACredits(
  callerUserId: string,
  receiverAgentId: string,
  credits: number,
  sourceIp?: string,
  sourceAgentUrl?: string,
  byokActive?: boolean
): Promise<void> {
  if (isAdmin(callerUserId) || byokActive) {
    // Nur loggen, keine Credits abziehen
    await prisma.a2AUsage.create({
      data: { callerUserId, receiverAgentId, credits: 0, sourceIp, sourceAgentUrl },
    });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: callerUserId },
      data: { aiCreditsBalance: { decrement: credits } },
    }),
    prisma.a2AUsage.create({
      data: { callerUserId, receiverAgentId, credits, sourceIp, sourceAgentUrl },
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
