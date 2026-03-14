import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getStripe, PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Agent count
    const agentCount = await prisma.agent.count({ where: { userId } });

    // Conversations this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const chatCount = await prisma.conversation.count({
      where: {
        agent: { userId },
        createdAt: { gte: startOfMonth },
      },
    });

    // Admins bekommen Agency-Rechte ohne Stripe
    if (isAdmin(userId)) {
      return Response.json({
        plan: "ADMIN",
        agentCount,
        chatCount,
        limits: PLAN_LIMITS.ENTERPRISE,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const plan = (user?.plan || "FREE") as PlanType;
    const limits = PLAN_LIMITS[plan];

    // Subscription status from Stripe
    let cancelAtPeriodEnd = false;
    let cancelAt: string | null = null;

    if (user?.stripeCustomerId && plan !== "FREE") {
      try {
        const stripe = getStripe();
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: "active",
          limit: 1,
        });
        const sub = subscriptions.data[0];
        if (sub) {
          cancelAtPeriodEnd = sub.cancel_at_period_end;
          if (sub.cancel_at_period_end && sub.cancel_at) {
            cancelAt = new Date(sub.cancel_at * 1000).toISOString();
          }
        }
      } catch {
        // Stripe fetch failed — continue without subscription info
      }
    }

    return Response.json({
      plan,
      agentCount,
      chatCount,
      limits,
      cancelAtPeriodEnd,
      cancelAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
