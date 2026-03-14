import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import type { PlanType } from "@/lib/stripe";

// Credit allocation per plan (monthly)
export const PLAN_CREDITS: Record<string, number> = {
  FREE: 50,
  STARTER: 500,
  PRO: 2000,
  AGENCY: 5000,
  ENTERPRISE: 50000,
};

// Credit cost per model (per response)
export const MODEL_CREDIT_COSTS: Record<string, number> = {
  // Anthropic
  "claude-haiku-4-5-20251001": 1,
  "claude-sonnet-4-20250514": 2,
  "claude-opus-4-20250514": 5,
  // OpenAI
  "gpt-4o-mini": 1,
  "gpt-4o": 3,
  "o3-mini": 3,
  // Perplexity
  "sonar": 2,
  "sonar-pro": 4,
  // Google
  "gemini-2.0-flash": 1,
  "gemini-2.5-pro": 3,
  // Groq
  "llama-3.3-70b-versatile": 1,
  "mixtral-8x7b-32768": 1,
};

export function getCreditCost(modelId: string): number {
  return MODEL_CREDIT_COSTS[modelId] ?? 2; // Default 2 credits
}

/**
 * Check and reset credits if the billing cycle has passed.
 * Returns the user with potentially updated credit balance.
 */
export async function ensureCreditsReset(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const now = new Date();

  // If no reset date set, or reset date has passed, reset credits
  if (!user.aiCreditsResetDate || now >= user.aiCreditsResetDate) {
    const plan = (user.plan || "FREE") as PlanType;
    const newBalance = PLAN_CREDITS[plan] ?? PLAN_CREDITS.FREE;

    // Next reset: 1 month from now
    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setHours(0, 0, 0, 0);

    return prisma.user.update({
      where: { id: userId },
      data: {
        aiCreditsBalance: newBalance,
        aiCreditsResetDate: nextReset,
      },
    });
  }

  return user;
}

/**
 * Check if a user has enough credits for a model call.
 * Returns { allowed, balance, cost, byokActive }
 */
export async function checkCredits(
  userId: string,
  modelId: string,
  hasByokKey: boolean
): Promise<{
  allowed: boolean;
  balance: number;
  cost: number;
  byokActive: boolean;
  message?: string;
}> {
  // Admins always allowed
  if (isAdmin(userId)) {
    return { allowed: true, balance: 999999, cost: 0, byokActive: false };
  }

  const user = await ensureCreditsReset(userId);
  if (!user) {
    return { allowed: false, balance: 0, cost: 0, byokActive: false, message: "User not found" };
  }

  const cost = getCreditCost(modelId);

  // BYOK bypass: if user has their own key for this model, no credits consumed
  if (hasByokKey) {
    return { allowed: true, balance: user.aiCreditsBalance, cost: 0, byokActive: true };
  }

  if (user.aiCreditsBalance >= cost) {
    return { allowed: true, balance: user.aiCreditsBalance, cost, byokActive: false };
  }

  return {
    allowed: false,
    balance: user.aiCreditsBalance,
    cost,
    byokActive: false,
    message: `You've used all your AI credits this month. Upgrade your plan for more credits, or add your own API key for unlimited usage.`,
  };
}

/**
 * Deduct credits after a successful LLM response.
 * Records usage in AiCreditUsage.
 */
export async function deductCredits(
  userId: string,
  modelId: string,
  agentId?: string,
  conversationId?: string
): Promise<{ newBalance: number }> {
  const cost = getCreditCost(modelId);
  if (cost <= 0) return { newBalance: 0 };

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        aiCreditsBalance: { decrement: cost },
      },
    }),
    prisma.aiCreditUsage.create({
      data: {
        userId,
        agentId,
        conversationId,
        creditsUsed: cost,
        model: modelId,
      },
    }),
  ]);

  const newBalance = Math.max(0, updated.aiCreditsBalance);
  const plan = (updated.plan || "FREE") as string;
  const totalCredits = PLAN_CREDITS[plan] ?? PLAN_CREDITS.FREE;

  // Send email notifications at thresholds (fire-and-forget)
  if (totalCredits > 0) {
    const percentage = newBalance / totalCredits;
    const prevPercentage = (newBalance + cost) / totalCredits;

    // Crossed 20% threshold
    if (prevPercentage > 0.2 && percentage <= 0.2 && newBalance > 0) {
      sendCreditWarningEmail(updated.email, newBalance, totalCredits, "low").catch(() => {});
    }
    // Hit 0
    if (newBalance <= 0 && (newBalance + cost) > 0) {
      sendCreditWarningEmail(updated.email, 0, totalCredits, "empty").catch(() => {});
    }
  }

  return { newBalance };
}

// Credit top-up packages
export const CREDIT_PACKAGES = [
  { id: "credits_500", credits: 500, price: 9, label: "500 Credits", description: "€9 one-time" },
  { id: "credits_2000", credits: 2000, price: 29, label: "2,000 Credits", description: "€29 one-time" },
  { id: "credits_5000", credits: 5000, price: 59, label: "5,000 Credits", description: "€59 one-time" },
] as const;

/**
 * Add purchased credits to user's balance.
 */
export async function addPurchasedCredits(userId: string, credits: number) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      aiCreditsBalance: { increment: credits },
    },
  });
}

/**
 * Get credit usage stats for a user (last 30 days).
 */
export async function getCreditUsageStats(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [dailyUsage, topAgents, totalUsed] = await Promise.all([
    // Daily breakdown
    prisma.$queryRaw<{ date: string; total: bigint }[]>`
      SELECT DATE("createdAt") as date, SUM("creditsUsed")::bigint as total
      FROM "AiCreditUsage"
      WHERE "userId" = ${userId} AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
    // Top agents by credit consumption
    prisma.$queryRaw<{ agentId: string; total: bigint; agentName: string }[]>`
      SELECT u."agentId", SUM(u."creditsUsed")::bigint as total, a."name" as "agentName"
      FROM "AiCreditUsage" u
      LEFT JOIN "Agent" a ON u."agentId" = a."id"
      WHERE u."userId" = ${userId} AND u."createdAt" >= ${thirtyDaysAgo} AND u."agentId" IS NOT NULL
      GROUP BY u."agentId", a."name"
      ORDER BY total DESC
      LIMIT 5
    `,
    // Total credits used this period
    prisma.aiCreditUsage.aggregate({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      _sum: { creditsUsed: true },
    }),
  ]);

  return {
    dailyUsage: dailyUsage.map((d) => ({
      date: String(d.date),
      credits: Number(d.total),
    })),
    topAgents: topAgents.map((a) => ({
      agentId: a.agentId,
      agentName: a.agentName || "Unknown",
      credits: Number(a.total),
    })),
    totalUsed: totalUsed._sum.creditsUsed || 0,
  };
}

/**
 * Get credit usage for a specific agent.
 */
export async function getAgentCreditUsage(agentId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await prisma.aiCreditUsage.aggregate({
    where: { agentId, createdAt: { gte: thirtyDaysAgo } },
    _sum: { creditsUsed: true },
    _count: true,
  });

  return {
    creditsUsed: result._sum.creditsUsed || 0,
    messageCount: result._count,
  };
}

/**
 * Send credit warning email via Resend.
 */
async function sendCreditWarningEmail(
  email: string,
  balance: number,
  total: number,
  type: "low" | "empty"
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kiln.hephaistos-systems.de";
  const subject = type === "empty"
    ? "KILN: Your AI credits are used up"
    : `KILN: You have ${balance} credits remaining`;

  const html = type === "empty"
    ? `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#F97316">Your AI Credits Are Used Up</h2>
        <p>Your KILN agents can no longer respond to conversations until you have more credits.</p>
        <p>You have 3 options:</p>
        <ul>
          <li><a href="${appUrl}/dashboard/settings?tab=billing">Upgrade your plan</a> for more monthly credits</li>
          <li><a href="${appUrl}/dashboard/settings?tab=billing">Buy a credit top-up</a> (starting at €9)</li>
          <li><a href="${appUrl}/dashboard/settings?tab=api-keys">Add your own API key</a> for unlimited usage</li>
        </ul>
        <p style="color:#888;font-size:12px">— The KILN Team</p>
      </div>`
    : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#EAB308">Low Credit Warning</h2>
        <p>You have <strong>${balance} of ${total}</strong> AI credits remaining this month.</p>
        <p>Consider <a href="${appUrl}/dashboard/settings?tab=billing">buying more credits</a> or <a href="${appUrl}/dashboard/settings?tab=api-keys">adding your own API key</a> for unlimited usage.</p>
        <p style="color:#888;font-size:12px">— The KILN Team</p>
      </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "KILN <noreply@kiln.hephaistos-systems.de>",
      to: [email],
      subject,
      html,
    }),
  });
}
