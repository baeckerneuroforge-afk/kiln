import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Cancel Stripe subscription if active
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (user?.stripeCustomerId) {
      try {
        const stripe = getStripe();
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: "active",
        });
        for (const sub of subscriptions.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
      } catch {
        // Subscription may already be cancelled
      }
    }

    // 2) Delete all agents (cascade handles conversations, messages, KB, chunks, memories, leads, analytics, custom tools, webhooks, automations, test cases, test runs, versions, orchestrations, actions)
    await prisma.agent.deleteMany({ where: { userId } });

    // 3) Delete API access keys
    await prisma.apiAccessKey.deleteMany({ where: { userId } });

    // 4) Delete user API keys (BYOK)
    await prisma.apiKey.deleteMany({ where: { userId } });

    // 5) Delete webhook endpoints
    await prisma.webhookEndpoint.deleteMany({ where: { userId } });

    // 6) Delete referral credits
    await prisma.referralCredit.deleteMany({ where: { userId } });

    // 7) Delete user record from DB
    await prisma.user.delete({ where: { id: userId } });

    // 8) Delete Clerk user account
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
