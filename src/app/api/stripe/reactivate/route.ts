import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.stripeCustomerId) {
      return Response.json({ error: "No Stripe account found" }, { status: 400 });
    }

    const stripe = getStripe();
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: "active",
      limit: 1,
    });

    const sub = subscriptions.data[0];
    if (!sub) {
      return Response.json({ error: "No active subscription found" }, { status: 400 });
    }

    if (!sub.cancel_at_period_end) {
      return Response.json({ error: "Subscription is not scheduled for cancellation" }, { status: 400 });
    }

    // Remove cancellation
    await stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: false,
    });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
