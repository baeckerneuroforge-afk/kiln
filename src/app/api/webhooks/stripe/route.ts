import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Signature missing" }, { status: 400 });
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerkUserId;
        if (!clerkUserId || !session.subscription) break;

        // Get subscription to check Price ID
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const plan = getPlanFromSubscription(subscription);

        await prisma.user.update({
          where: { id: clerkUserId },
          data: {
            plan,
            stripeCustomerId: session.customer as string,
          },
        });

        // Referral-Credit: Wenn dieser User von jemandem referred wurde, Referrer belohnen
        if (plan !== "FREE") {
          await rewardReferrer(clerkUserId, plan, stripe);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const plan = getPlanFromSubscription(subscription);

        // Update plan on price changes (upgrade/downgrade via portal)
        // When cancel_at_period_end=true, user still has access — keep their current plan
        // Plan downgrade to FREE only happens on subscription.deleted
        if (subscription.status === "active") {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { plan },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: "FREE" },
        });
        break;
      }
    }

    return Response.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    console.error("Stripe Webhook Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

function getPlanFromSubscription(subscription: Stripe.Subscription): Plan {
  const priceId = subscription.items.data[0]?.price?.id;

  // Monatliche und jährliche Price IDs prüfen
  const planMap: { plan: Plan; envKeys: string[] }[] = [
    { plan: "ENTERPRISE", envKeys: ["NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID", "NEXT_PUBLIC_STRIPE_ENTERPRISE_YEARLY_PRICE_ID"] },
    { plan: "AGENCY", envKeys: ["NEXT_PUBLIC_STRIPE_AGENCY_PRICE_ID", "NEXT_PUBLIC_STRIPE_AGENCY_YEARLY_PRICE_ID"] },
    { plan: "PRO", envKeys: ["NEXT_PUBLIC_STRIPE_PRO_PRICE_ID", "NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID"] },
    { plan: "STARTER", envKeys: ["NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID", "NEXT_PUBLIC_STRIPE_STARTER_YEARLY_PRICE_ID"] },
  ];

  for (const { plan, envKeys } of planMap) {
    for (const key of envKeys) {
      if (priceId === process.env[key]) return plan;
    }
  }

  return "FREE";
}

// Referrer mit 1 Monat gratis belohnen wenn referred User upgraded
async function rewardReferrer(referredUserId: string, plan: Plan, stripe: Stripe) {
  try {
    const referredUser = await prisma.user.findUnique({ where: { id: referredUserId } });
    if (!referredUser?.referredBy) return;

    // Prüfen ob für diesen Referred User schon ein Upgrade-Credit existiert
    const existingCredit = await prisma.referralCredit.findFirst({
      where: {
        userId: referredUser.referredBy,
        referredUserId,
        type: { startsWith: "UPGRADE_" },
      },
    });
    if (existingCredit) return;

    const referrer = await prisma.user.findUnique({ where: { id: referredUser.referredBy } });
    if (!referrer?.stripeCustomerId) return;

    // Stripe Coupon erstellen: 100% off für 1 Monat
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: "once",
      name: `Referral Credit – ${referredUser.email} upgraded to ${plan}`,
      metadata: { referrerId: referrer.id, referredUserId },
    });

    // Coupon auf aktives Subscription des Referrers anwenden
    const subscriptions = await stripe.subscriptions.list({
      customer: referrer.stripeCustomerId,
      status: "active",
      limit: 1,
    });

    let applied = false;
    if (subscriptions.data.length > 0) {
      await stripe.subscriptions.update(subscriptions.data[0].id, {
        discounts: [{ coupon: coupon.id }],
      });
      applied = true;
    }

    // Credit in DB tracken
    await prisma.referralCredit.create({
      data: {
        userId: referrer.id,
        referredUserId,
        referredEmail: referredUser.email,
        type: `UPGRADE_${plan}`,
        applied,
      },
    });
  } catch (err) {
    console.error("Referral reward error:", err);
    // Nicht den Webhook fehlschlagen lassen
  }
}
