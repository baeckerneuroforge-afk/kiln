import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

// ─── Credit Tiers per Plan ──────────────────────────────────
// Each plan has 3 tiers: base (0), mid (1), high (2)
export interface CreditTier {
  credits: number;
  monthlyPrice: number;
  yearlyPrice: number; // 30% off monthly
}

export const PLAN_CREDIT_TIERS: Record<string, CreditTier[]> = {
  FREE: [{ credits: 50, monthlyPrice: 0, yearlyPrice: 0 }],
  STARTER: [
    { credits: 500, monthlyPrice: 39, yearlyPrice: 327 },
    { credits: 1000, monthlyPrice: 49, yearlyPrice: 412 },
    { credits: 2000, monthlyPrice: 59, yearlyPrice: 496 },
  ],
  PRO: [
    { credits: 2000, monthlyPrice: 99, yearlyPrice: 832 },
    { credits: 5000, monthlyPrice: 129, yearlyPrice: 1084 },
    { credits: 10000, monthlyPrice: 169, yearlyPrice: 1420 },
  ],
  AGENCY: [
    { credits: 5000, monthlyPrice: 249, yearlyPrice: 2091 },
    { credits: 15000, monthlyPrice: 329, yearlyPrice: 2764 },
    { credits: 30000, monthlyPrice: 449, yearlyPrice: 3772 },
  ],
  ENTERPRISE: [{ credits: 50000, monthlyPrice: 0, yearlyPrice: 0 }],
};

export function getPlanCredits(plan: string, tier: number = 0): number {
  const tiers = PLAN_CREDIT_TIERS[plan] || PLAN_CREDIT_TIERS.FREE;
  const t = tiers[Math.min(tier, tiers.length - 1)];
  return t?.credits ?? 50;
}

export function getPlanTier(plan: string, tier: number = 0): CreditTier {
  const tiers = PLAN_CREDIT_TIERS[plan] || PLAN_CREDIT_TIERS.FREE;
  return tiers[Math.min(tier, tiers.length - 1)] ?? tiers[0];
}

// ─── Credit Costs by Model ──────────────────────────────────
export const MODEL_CREDIT_COSTS: Record<string, number> = {
  // 1 credit — fast/cheap
  "claude-haiku-4-5-20251001": 1,
  "gpt-4o-mini": 1,
  "llama-3.3-70b-versatile": 1,
  "mixtral-8x7b-32768": 1,
  "gemini-2.0-flash": 1,
  // 2 credits — balanced
  "claude-sonnet-4-20250514": 2,
  "sonar": 2,
  "o3-mini": 2,
  // 3 credits — capable
  "gpt-4o": 3,
  "gemini-2.5-pro": 3,
  // 4 credits — premium
  "sonar-pro": 4,
  // 5 credits — most capable
  "claude-opus-4-20250514": 5,
};

export function getCreditCost(modelId: string): number {
  return MODEL_CREDIT_COSTS[modelId] ?? 2;
}

// ─── Credit Usage Type ──────────────────────────────────────
export type CreditUsageType = "CHAT" | "TEAM_TASK" | "ORCHESTRATION" | "SCHEDULED" | "WEBHOOK" | "EMBEDDING" | "TASK_RUN";

// ─── Core Credit Functions ──────────────────────────────────

/**
 * Check and reset credits if the billing cycle has passed.
 */
export async function ensureCreditsReset(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const now = new Date();

  if (!user.aiCreditsResetDate || now >= user.aiCreditsResetDate) {
    const newBalance = user.aiCreditsMonthly || getPlanCredits(user.plan, user.creditTier);

    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setHours(0, 0, 0, 0);

    return prisma.user.update({
      where: { id: userId },
      data: {
        aiCreditsBalance: newBalance,
        aiCreditsMonthly: newBalance,
        aiCreditsResetDate: nextReset,
      },
    });
  }

  return user;
}

/**
 * Check if a user has enough credits for a model call.
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
  if (isAdmin(userId)) {
    return { allowed: true, balance: 999999, cost: 0, byokActive: false };
  }

  const user = await ensureCreditsReset(userId);
  if (!user) {
    return { allowed: false, balance: 0, cost: 0, byokActive: false, message: "User not found" };
  }

  const cost = getCreditCost(modelId);

  // BYOK bypass
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
    message: "You've used all your AI credits this month. Three options: 1) Upgrade your credit tier, 2) Buy a top-up, 3) Add your own API key for unlimited usage.",
  };
}

/**
 * Deduct credits after a successful LLM response.
 */
export async function deductCredits(
  userId: string,
  modelId: string,
  type: CreditUsageType = "CHAT",
  agentId?: string,
  conversationId?: string
): Promise<{ newBalance: number }> {
  const cost = getCreditCost(modelId);
  if (cost <= 0) return { newBalance: 0 };

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { aiCreditsBalance: { decrement: cost } },
    }),
    prisma.aiCreditUsage.create({
      data: { userId, agentId, conversationId, creditsUsed: cost, model: modelId, type },
    }),
  ]);

  const newBalance = Math.max(0, updated.aiCreditsBalance);
  const totalCredits = updated.aiCreditsMonthly || getPlanCredits(updated.plan, updated.creditTier);

  const notificationTasks: Promise<void>[] = [];
  if (totalCredits > 0) {
    const pct = newBalance / totalCredits;
    const prevPct = (newBalance + cost) / totalCredits;

    if (prevPct > 0.2 && pct <= 0.2 && newBalance > 0) {
      notificationTasks.push(
        sendCreditWarningEmail(updated.email, newBalance, totalCredits, "low")
      );
    }
    if (newBalance <= 0 && (newBalance + cost) > 0) {
      notificationTasks.push(
        sendCreditWarningEmail(updated.email, 0, totalCredits, "empty")
      );
    }
  }

  if (notificationTasks.length > 0) {
    const results = await Promise.allSettled(notificationTasks);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Credit warning email failed:", result.reason);
      }
    }
  }

  return { newBalance };
}

/**
 * Deduct credits for embedding operations (1 credit per 10 chunks).
 */
export async function deductEmbeddingCredits(
  userId: string,
  chunkCount: number,
  agentId?: string
): Promise<{ newBalance: number }> {
  const cost = Math.max(1, Math.ceil(chunkCount / 10));

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { aiCreditsBalance: { decrement: cost } },
    }),
    prisma.aiCreditUsage.create({
      data: { userId, agentId, creditsUsed: cost, model: "embedding", type: "EMBEDDING" },
    }),
  ]);

  return { newBalance: Math.max(0, updated.aiCreditsBalance) };
}

// ─── Credit Top-up Packages ─────────────────────────────────
export const CREDIT_PACKAGES = [
  { id: "credits_500", credits: 500, price: 9, label: "500 Credits", description: "€9 one-time" },
  { id: "credits_2000", credits: 2000, price: 29, label: "2,000 Credits", description: "€29 one-time" },
  { id: "credits_5000", credits: 5000, price: 59, label: "5,000 Credits", description: "€59 one-time" },
] as const;

export async function addPurchasedCredits(userId: string, credits: number) {
  return prisma.user.update({
    where: { id: userId },
    data: { aiCreditsBalance: { increment: credits } },
  });
}

// ─── Usage Stats ────────────────────────────────────────────

export async function getCreditUsageStats(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [dailyUsage, topAgents, totalUsed, byType] = await Promise.all([
    prisma.$queryRaw<{ date: string; total: bigint }[]>`
      SELECT DATE("createdAt") as date, SUM("creditsUsed")::bigint as total
      FROM "AiCreditUsage"
      WHERE "userId" = ${userId} AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
    prisma.$queryRaw<{ agentId: string; total: bigint; agentName: string }[]>`
      SELECT u."agentId", SUM(u."creditsUsed")::bigint as total, a."name" as "agentName"
      FROM "AiCreditUsage" u
      LEFT JOIN "Agent" a ON u."agentId" = a."id"
      WHERE u."userId" = ${userId} AND u."createdAt" >= ${thirtyDaysAgo} AND u."agentId" IS NOT NULL
      GROUP BY u."agentId", a."name"
      ORDER BY total DESC
      LIMIT 5
    `,
    prisma.aiCreditUsage.aggregate({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      _sum: { creditsUsed: true },
    }),
    prisma.$queryRaw<{ type: string; total: bigint }[]>`
      SELECT "type", SUM("creditsUsed")::bigint as total
      FROM "AiCreditUsage"
      WHERE "userId" = ${userId} AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY "type"
      ORDER BY total DESC
    `,
  ]);

  return {
    dailyUsage: dailyUsage.map((d) => ({ date: String(d.date), credits: Number(d.total) })),
    topAgents: topAgents.map((a) => ({ agentId: a.agentId, agentName: a.agentName || "Unknown", credits: Number(a.total) })),
    totalUsed: totalUsed._sum.creditsUsed || 0,
    byType: byType.map((t) => ({ type: t.type, credits: Number(t.total) })),
  };
}

export async function getAgentCreditUsage(agentId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await prisma.aiCreditUsage.aggregate({
    where: { agentId, createdAt: { gte: thirtyDaysAgo } },
    _sum: { creditsUsed: true },
    _count: true,
  });

  return { creditsUsed: result._sum.creditsUsed || 0, messageCount: result._count };
}

// ─── Email Notifications ────────────────────────────────────

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
    ? "KILN: Your AI credits are exhausted — upgrade or add your API key"
    : `KILN: Your AI credits are running low (${balance} remaining)`;

  const html = type === "empty"
    ? `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#F97316">Your AI Credits Are Exhausted</h2>
        <p>Your KILN agents can no longer respond until you have more credits.</p>
        <p><strong>Three options:</strong></p>
        <ul>
          <li><a href="${appUrl}/dashboard/settings?tab=billing">Upgrade your credit tier</a></li>
          <li><a href="${appUrl}/dashboard/settings?tab=billing">Buy a credit top-up</a> (starting at €9)</li>
          <li><a href="${appUrl}/dashboard/settings?tab=api-keys">Add your own API key</a> for unlimited usage</li>
        </ul>
        <p style="color:#888;font-size:12px">— The KILN Team</p>
      </div>`
    : `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#EAB308">Your AI Credits Are Running Low</h2>
        <p>You have <strong>${balance} of ${total}</strong> AI credits remaining this month.</p>
        <p>Consider <a href="${appUrl}/dashboard/settings?tab=billing">upgrading your credit tier</a> or <a href="${appUrl}/dashboard/settings?tab=api-keys">adding your API key</a>.</p>
        <p style="color:#888;font-size:12px">— The KILN Team</p>
      </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "KILN <noreply@kiln.hephaistos-systems.de>",
      to: [email],
      subject,
      html,
    }),
  });
}
