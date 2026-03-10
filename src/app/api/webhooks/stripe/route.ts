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
    return Response.json({ error: "Signature fehlt" }, { status: 400 });
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json({ error: "Webhook Secret nicht konfiguriert" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Ungültige Signatur" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerkUserId;
        if (!clerkUserId || !session.subscription) break;

        // Subscription holen um Price ID zu prüfen
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
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const plan = getPlanFromSubscription(subscription);

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan },
        });
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
    const message = err instanceof Error ? err.message : "Webhook-Fehler";
    console.error("Stripe Webhook Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

function getPlanFromSubscription(subscription: Stripe.Subscription): Plan {
  const priceId = subscription.items.data[0]?.price?.id;
  const proPriceId = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID;
  const agencyPriceId = process.env.NEXT_PUBLIC_STRIPE_AGENCY_PRICE_ID;

  if (priceId === agencyPriceId) return "AGENCY";
  if (priceId === proPriceId) return "PRO";
  return "FREE";
}
