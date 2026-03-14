import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureCreditsReset, getPlanCredits, getCreditUsageStats, PLAN_CREDIT_TIERS } from "@/lib/credits";
import { isAdmin } from "@/lib/admin";
import type { PlanType } from "@/lib/stripe";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const user = await ensureCreditsReset(userId);
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    const plan = (user.plan || "FREE") as PlanType;
    const creditTier = user.creditTier || 0;
    const totalCredits = user.aiCreditsMonthly || getPlanCredits(plan, creditTier);
    const tiers = PLAN_CREDIT_TIERS[plan] || PLAN_CREDIT_TIERS.FREE;

    const byokKeyCount = await prisma.apiKey.count({ where: { userId } });
    const stats = await getCreditUsageStats(userId);

    return Response.json({
      balance: user.aiCreditsBalance,
      totalCredits,
      monthlyCredits: totalCredits,
      resetDate: user.aiCreditsResetDate,
      byokActive: byokKeyCount > 0,
      byokKeyCount,
      plan,
      creditTier,
      tiers,
      isAdmin: isAdmin(userId),
      usage: stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
