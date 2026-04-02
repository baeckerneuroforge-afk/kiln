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
  "claude-sonnet-4-6": 2,
  "sonar": 2,
  "gemini-2.0-pro": 2,
  // 3 credits — capable
  "gpt-4o": 3,
  // 4 credits — premium
  "sonar-pro": 4,
  // 5 credits — most capable
  "claude-opus-4-6": 5,
};

// Backward-compat mapping for credit lookups
const CREDIT_MODEL_MAP: Record<string, string> = {
  "claude-opus-4-20250514": "claude-opus-4-6",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "o3-mini": "gpt-4o-mini",
  "gpt-4.1": "gpt-4o",
  "gpt-4.1-mini": "gpt-4o-mini",
  "gemini-2.5-pro": "gemini-2.0-pro",
};

export function getCreditCost(modelId: string): number {
  const resolved = CREDIT_MODEL_MAP[modelId] || modelId;
  return MODEL_CREDIT_COSTS[resolved] ?? 2;
}

// ─── Model → Provider Mapping ──────────────────────────────
export function getModelProvider(modelId: string): string {
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt") || modelId.startsWith("o3")) return "openai";
  if (modelId.startsWith("gemini")) return "google";
  if (modelId.startsWith("llama") || modelId.startsWith("mixtral")) return "groq";
  if (modelId.startsWith("sonar")) return "perplexity";
  return "anthropic";
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

  // Admin: nie Credits zurücksetzen, immer bei 999999 lassen
  if (isAdmin(userId)) {
    if (user.aiCreditsBalance < 999999) {
      return prisma.user.update({
        where: { id: userId },
        data: { aiCreditsBalance: 999999, aiCreditsMonthly: 999999 },
      });
    }
    return user;
  }

  const now = new Date();

  if (!user.aiCreditsResetDate || now >= user.aiCreditsResetDate) {
    const newBalance = user.aiCreditsMonthly || getPlanCredits(user.plan, user.creditTier);

    // Reset am 1. des nächsten Monats (vermeidet Overflow: Jan 31 + 1 Monat → Mar 3)
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

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
 * byokKeyProvider (optional): provider of the BYOK key. When set, BYOK only applies
 * if it matches the model's provider.
 */
export async function checkCredits(
  userId: string,
  modelId: string,
  hasByokKey: boolean,
  byokKeyProvider?: string
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

  // BYOK bypass — verify key provider matches model provider when specified
  if (hasByokKey) {
    if (byokKeyProvider) {
      const modelProv = getModelProvider(modelId);
      if (byokKeyProvider.toLowerCase() === modelProv) {
        return { allowed: true, balance: user.aiCreditsBalance, cost: 0, byokActive: true };
      }
      // Key doesn't match model provider — charge credits instead
    } else {
      return { allowed: true, balance: user.aiCreditsBalance, cost: 0, byokActive: true };
    }
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
 * Atomic check-and-deduct: prevents race condition between check and deduct.
 * Returns { success, remaining } — if success is false, balance was insufficient.
 */
export async function checkAndDeductCredits(
  userId: string,
  modelId: string,
  type: CreditUsageType = "CHAT",
  agentId?: string,
  conversationId?: string
): Promise<{ success: boolean; remaining: number }> {
  // Admin bypass
  if (isAdmin(userId)) {
    return { success: true, remaining: 999999 };
  }

  const cost = getCreditCost(modelId);
  if (cost <= 0) return { success: true, remaining: 0 };

  const result = await prisma.user.updateMany({
    where: { id: userId, aiCreditsBalance: { gte: cost } },
    data: { aiCreditsBalance: { decrement: cost } },
  });

  if (result.count === 0) {
    return { success: false, remaining: 0 };
  }

  // Log usage
  await prisma.aiCreditUsage.create({
    data: { userId, agentId, conversationId, creditsUsed: cost, model: modelId, type },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiCreditsBalance: true } });
  return { success: true, remaining: user?.aiCreditsBalance ?? 0 };
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
): Promise<{ newBalance: number; creditsLow?: boolean; totalCredits?: number }> {
  // Admin bypass — keine Credits abziehen
  if (isAdmin(userId)) {
    return { newBalance: 999999, creditsLow: false, totalCredits: 999999 };
  }

  const cost = getCreditCost(modelId);
  if (cost <= 0) return { newBalance: 0 };

  // Atomic deduct with floor check — balance cannot go below 0
  const result = await prisma.user.updateMany({
    where: { id: userId, aiCreditsBalance: { gte: cost } },
    data: { aiCreditsBalance: { decrement: cost } },
  });

  // Log usage regardless
  await prisma.aiCreditUsage.create({
    data: { userId, agentId, conversationId, creditsUsed: cost, model: modelId, type },
  });

  if (result.count === 0) {
    // Balance was insufficient — deduct to 0 instead
    await prisma.user.update({
      where: { id: userId },
      data: { aiCreditsBalance: 0 },
    });
  }

  const updated = await prisma.user.findUnique({ where: { id: userId } });
  if (!updated) return { newBalance: 0 };

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
    if (prevPct > 0.05 && pct <= 0.05 && newBalance > 0) {
      notificationTasks.push(
        sendCreditWarningEmail(updated.email, newBalance, totalCredits, "critical")
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

  // Auto Top-Up prüfen und ggf. auslösen
  checkAutoTopUp(userId, newBalance).catch((err) => {
    console.error("Auto top-up check failed:", err);
  });

  const creditsLow = totalCredits > 0 && newBalance > 0 && (newBalance / totalCredits) <= 0.2;
  return { newBalance, creditsLow, totalCredits };
}

/**
 * Deduct credits for embedding operations (1 credit per 10 chunks).
 */
export async function deductEmbeddingCredits(
  userId: string,
  chunkCount: number,
  agentId?: string
): Promise<{ newBalance: number }> {
  // Admin bypass
  if (isAdmin(userId)) {
    return { newBalance: 999999 };
  }

  const cost = Math.max(1, Math.ceil(chunkCount / 10));

  // Atomic deduct with floor check
  const result = await prisma.user.updateMany({
    where: { id: userId, aiCreditsBalance: { gte: cost } },
    data: { aiCreditsBalance: { decrement: cost } },
  });

  await prisma.aiCreditUsage.create({
    data: { userId, agentId, creditsUsed: cost, model: "embedding", type: "EMBEDDING" },
  });

  if (result.count === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { aiCreditsBalance: 0 },
    });
  }

  const updated = await prisma.user.findUnique({ where: { id: userId } });
  if (!updated) return { newBalance: 0 };

  return { newBalance: Math.max(0, updated.aiCreditsBalance) };
}

/**
 * Deduct an exact number of credits for non-model-based operations.
 */
export async function deductCreditsByAmount(
  userId: string,
  credits: number,
  type: CreditUsageType = "TASK_RUN",
  model: string = "custom_operation",
  agentId?: string,
  conversationId?: string
): Promise<{ success: boolean; newBalance: number }> {
  // Admin bypass — keine Credits abziehen
  if (isAdmin(userId)) {
    return { success: true, newBalance: 999999 };
  }

  const cost = Math.max(0, Math.ceil(credits));

  if (cost <= 0) {
    const user = await ensureCreditsReset(userId);
    return {
      success: true,
      newBalance: user?.aiCreditsBalance ?? 0,
    };
  }

  const result = await prisma.user.updateMany({
    where: { id: userId, aiCreditsBalance: { gte: cost } },
    data: { aiCreditsBalance: { decrement: cost } },
  });

  if (result.count === 0) {
    const user = await ensureCreditsReset(userId);
    return {
      success: false,
      newBalance: user?.aiCreditsBalance ?? 0,
    };
  }

  await prisma.aiCreditUsage.create({
    data: {
      userId,
      agentId,
      conversationId,
      creditsUsed: cost,
      model,
      type,
    },
  });

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCreditsBalance: true },
  });

  return {
    success: true,
    newBalance: updated?.aiCreditsBalance ?? 0,
  };
}

// ─── Team Execution Cost Estimation ────────────────────────

/**
 * Schätzt die Gesamtkosten einer Team-Execution vorab.
 * HEAD/COORDINATOR/REPORTER = 1 LLM-Call, EXECUTOR = ~3 (Tool-Loop).
 */
export function estimateTeamExecutionCost(
  members: Array<{ role: string; agent?: { llmModel?: string | null } | null }>
): number {
  return members.reduce((total, member) => {
    const model = member.agent?.llmModel || "claude-haiku-4-5-20251001";
    const costPerCall = getCreditCost(model);
    // HEAD = 1 call (delegation), EXECUTOR = ~3 (tool loop avg), others = 1
    const estimatedCalls = member.role === "EXECUTOR" ? 3 : 1;
    return total + costPerCall * estimatedCalls;
  }, 0);
}

/**
 * Pre-flight check: hat der User genug Credits für eine komplette Team-Execution?
 */
export async function checkTeamExecutionCredits(
  userId: string,
  members: Array<{ role: string; agent?: { llmModel?: string | null } | null }>
): Promise<{ allowed: boolean; estimated: number; balance: number; message?: string }> {
  if (isAdmin(userId)) {
    return { allowed: true, estimated: 0, balance: 999999 };
  }

  const user = await ensureCreditsReset(userId);
  if (!user) {
    return { allowed: false, estimated: 0, balance: 0, message: "User not found" };
  }

  const estimated = estimateTeamExecutionCost(members);
  const balance = user.aiCreditsBalance;

  // Zusätzlich +2 Credits für die Task-Decomposition (Claude Sonnet Call)
  const totalEstimated = estimated + getCreditCost("claude-sonnet-4-6");

  if (balance >= totalEstimated) {
    return { allowed: true, estimated: totalEstimated, balance };
  }

  return {
    allowed: false,
    estimated: totalEstimated,
    balance,
    message: `Insufficient credits. This team needs ~${totalEstimated} credits, you have ${balance}. Top up or add your own API key.`,
  };
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

// ─── Auto Top-Up ────────────────────────────────────────────

/** Top-Up Package Preise (match CREDIT_PACKAGES) */
const TOP_UP_PRICES: Record<number, number> = {
  500: 900,    // €9 in Cents
  2000: 2900,  // €29 in Cents
  5000: 5900,  // €59 in Cents
};

/**
 * Prüft ob Auto-Top-Up ausgelöst werden soll.
 * Wird nach jeder Credit-Deduktion aufgerufen.
 */
export async function checkAutoTopUp(userId: string, currentBalance: number): Promise<void> {
  const config = await prisma.autoTopUpConfig.findUnique({ where: { userId } });
  if (!config || !config.isEnabled) return;
  if (currentBalance >= config.triggerThreshold) return;
  if (!config.stripePaymentMethodId) return;

  // Monatszähler zurücksetzen wenn neuer Monat
  const now = new Date();
  if (config.topUpsResetDate) {
    const resetDate = new Date(config.topUpsResetDate);
    if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
      await prisma.autoTopUpConfig.update({
        where: { userId },
        data: { topUpsThisMonth: 0, topUpsResetDate: now },
      });
      config.topUpsThisMonth = 0;
    }
  }

  if (config.topUpsThisMonth >= config.maxPerMonth) return;

  const amountCents = TOP_UP_PRICES[config.creditAmount];
  if (!amountCents) return;

  // Stripe Charge erstellen
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) return;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true, email: true } });
    if (!user?.stripeCustomerId) return;

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);

    await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      customer: user.stripeCustomerId,
      payment_method: config.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `KILN Auto Top-Up: ${config.creditAmount} Credits`,
      metadata: { userId, credits: String(config.creditAmount), type: "auto_top_up" },
    });

    // Credits hinzufügen und Zähler erhöhen
    await Promise.all([
      addPurchasedCredits(userId, config.creditAmount),
      prisma.autoTopUpConfig.update({
        where: { userId },
        data: {
          topUpsThisMonth: { increment: 1 },
          lastTopUpAt: now,
          topUpsResetDate: config.topUpsResetDate || now,
        },
      }),
    ]);

    const newTopUpCount = config.topUpsThisMonth + 1;
    console.log(`Auto top-up successful: ${config.creditAmount} credits for user ${userId} (${newTopUpCount}/${config.maxPerMonth} this month)`);

    // Bestätigungs-Email senden mit Zähler-Info
    const priceFmt = (amountCents / 100).toFixed(0);
    if (user.email) {
      sendAutoTopUpNotification(
        user.email,
        config.creditAmount,
        Number(priceFmt),
        newTopUpCount,
        config.maxPerMonth
      ).catch(() => {});
    }
  } catch (err) {
    console.error(`Auto top-up failed for user ${userId}:`, err);

    // Bei Zahlung-Fehler: Auto-Top-Up deaktivieren und User informieren
    await prisma.autoTopUpConfig.update({
      where: { userId },
      data: { isEnabled: false },
    });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) {
      sendAutoTopUpFailedNotification(user.email).catch(() => {});
    }
  }
}

async function sendAutoTopUpNotification(
  email: string,
  credits: number,
  priceEur: number,
  topUpNumber: number,
  maxPerMonth: number
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  const maxMonthlySpend = maxPerMonth * priceEur;
  const remaining = maxPerMonth - topUpNumber;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "KILN <noreply@kilnbase.com>",
      to: [email],
      subject: `KILN: Auto top-up ${topUpNumber}/${maxPerMonth} — ${credits} credits added (€${priceEur})`,
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#22C55E">Auto Top-Up Successful</h2>
        <p><strong>${credits} credits</strong> have been added to your account (€${priceEur}).</p>
        <p style="color:#666;font-size:13px">This is auto top-up <strong>${topUpNumber} of ${maxPerMonth}</strong> this month.${remaining > 0 ? ` ${remaining} remaining.` : " This was your last auto top-up this month."}</p>
        <p style="color:#666;font-size:13px">Maximum monthly auto-charge: ${maxPerMonth} × €${priceEur} = €${maxMonthlySpend}</p>
        <p style="color:#888;font-size:12px">You can manage auto top-up in your <a href="${appUrl}/dashboard/settings?tab=billing">billing settings</a>.</p>
        <p style="color:#888;font-size:12px">— The KILN Team</p>
      </div>`,
    }),
  });
}

async function sendAutoTopUpFailedNotification(email: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "KILN <noreply@kilnbase.com>",
      to: [email],
      subject: "KILN: Auto top-up payment failed — auto top-up disabled",
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#DC2626">Auto Top-Up Payment Failed</h2>
        <p>We couldn't charge your payment method. Auto top-up has been disabled.</p>
        <p>Please update your payment method in <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com"}/dashboard/settings?tab=billing">billing settings</a> and re-enable auto top-up.</p>
        <p style="color:#888;font-size:12px">— The KILN Team</p>
      </div>`,
    }),
  });
}

// ─── Email Notifications ────────────────────────────────────

async function sendCreditWarningEmail(
  email: string,
  balance: number,
  total: number,
  type: "low" | "critical" | "empty"
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  let subject: string;
  let html: string;

  if (type === "empty") {
    subject = "KILN: Your AI credits are exhausted — agents paused";
    html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
      <h2 style="color:#DC2626">Your AI Credits Are Exhausted</h2>
      <p>Your KILN agents are paused and can no longer respond until you have more credits.</p>
      <p><strong>Three options:</strong></p>
      <ul>
        <li><a href="${appUrl}/dashboard/settings?tab=billing">Upgrade your credit tier</a></li>
        <li><a href="${appUrl}/dashboard/settings?tab=billing">Buy a credit top-up</a> (starting at €9)</li>
        <li><a href="${appUrl}/dashboard/settings?tab=api-keys">Add your own API key</a> for unlimited usage</li>
      </ul>
      <p style="color:#888;font-size:12px">Tip: Enable Auto Top-Up in billing settings to prevent this in the future.</p>
      <p style="color:#888;font-size:12px">— The KILN Team</p>
    </div>`;
  } else if (type === "critical") {
    subject = `KILN: Only ${balance} credits left — agents will stop soon`;
    html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
      <h2 style="color:#DC2626">Only ${balance} Credits Left</h2>
      <p>You have <strong>${balance} of ${total}</strong> AI credits remaining. Your agents will stop when credits reach 0.</p>
      <p><a href="${appUrl}/dashboard/settings?tab=billing" style="display:inline-block;background:#F97316;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Top Up Now</a></p>
      <p style="color:#888;font-size:12px">Or <a href="${appUrl}/dashboard/settings?tab=api-keys">add your own API key</a> for unlimited usage.</p>
      <p style="color:#888;font-size:12px">— The KILN Team</p>
    </div>`;
  } else {
    subject = `KILN: Your AI credits are running low (${balance} remaining)`;
    html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
      <h2 style="color:#EAB308">Your AI Credits Are Running Low</h2>
      <p>You have <strong>${balance} of ${total}</strong> AI credits remaining this month.</p>
      <p>Consider <a href="${appUrl}/dashboard/settings?tab=billing">upgrading your credit tier</a> or <a href="${appUrl}/dashboard/settings?tab=api-keys">adding your API key</a>.</p>
      <p style="color:#888;font-size:12px">— The KILN Team</p>
    </div>`;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "KILN <noreply@kilnbase.com>",
      to: [email],
      subject,
      html,
    }),
  });
}
