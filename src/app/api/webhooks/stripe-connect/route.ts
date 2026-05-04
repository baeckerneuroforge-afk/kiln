import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { ResellerBilling } from "@/lib/billing/reseller-billing";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// Separater Webhook-Endpoint für Stripe Connect Events
// NICHT den bestehenden /api/webhooks/stripe Endpoint verändern!
export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Signature missing" }, { status: 400 });
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json({ error: "Connect webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await ResellerBilling.handleConnectWebhook(event);
    return Response.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    console.error("Stripe Connect Webhook Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
