import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureCreditsReset, PLAN_CREDITS, getCreditUsageStats } from "@/lib/credits";
import { isAdmin } from "@/lib/admin";
import type { PlanType } from "@/lib/stripe";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const user = await ensureCreditsReset(userId);
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    const plan = (user.plan || "FREE") as PlanType;
    const totalCredits = PLAN_CREDITS[plan] ?? PLAN_CREDITS.FREE;

    // Check if user has any BYOK keys
    const byokKeyCount = await prisma.apiKey.count({ where: { userId } });

    const stats = await getCreditUsageStats(userId);

    return Response.json({
      balance: user.aiCreditsBalance,
      totalCredits,
      resetDate: user.aiCreditsResetDate,
      byokActive: byokKeyCount > 0,
      byokKeyCount,
      plan,
      isAdmin: isAdmin(userId),
      usage: stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
