/**
 * Phase 3 Connect-webhook handler. Mirrors Stripe events into the new
 * AgencyStripeAccount + SubOrgSubscription + SubOrgInvoice tables.
 *
 * Lives alongside the legacy `ResellerBilling.handleConnectWebhook` which
 * still owns `clientSubscription` / `resellerAccount` for grandfathered
 * accounts. Both handlers are called from the same /api/webhooks/stripe-
 * connect route — they target disjoint tables, so calling them in sequence
 * is a no-op for the events one of them cannot resolve.
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { persistAccountSnapshot } from "@/lib/stripe/connect";

const RELEVANT_EVENTS = new Set<Stripe.Event["type"]>([
  "account.updated",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

export async function handlePhase3ConnectEvent(event: Stripe.Event) {
  if (!RELEVANT_EVENTS.has(event.type)) return;

  // Connect events surface the connected account on the top-level
  // `account` field. If it's missing, the event is not a Connect event.
  const connectedAccountId = (event as Stripe.Event & { account?: string })
    .account;
  if (!connectedAccountId) return;

  switch (event.type) {
    case "account.updated":
      await persistAccountSnapshotIfTracked(
        connectedAccountId,
        event.data.object as Stripe.Account
      );
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionChanged(
        event.data.object as Stripe.Subscription
      );
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription
      );
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handleInvoiceFailed(event.data.object as Stripe.Invoice);
      break;
  }
}

/**
 * Only persist the account snapshot when we actually track the account
 * — otherwise an event for a legacy reseller account would crash the
 * Phase 3 handler (no row to update).
 */
async function persistAccountSnapshotIfTracked(
  stripeAccountId: string,
  account: Stripe.Account
) {
  const existing = await prisma.agencyStripeAccount.findUnique({
    where: { stripeAccountId },
  });
  if (!existing) return;
  await persistAccountSnapshot(stripeAccountId, account);
}

function mapStatus(
  status: Stripe.Subscription.Status
):
  | "INCOMPLETE"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "TRIALING" {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "trialing":
      return "TRIALING";
    case "incomplete":
    case "incomplete_expired":
    default:
      return "INCOMPLETE";
  }
}

async function handleSubscriptionChanged(subscription: Stripe.Subscription) {
  // Metadata stamped at checkout creation routes the event to the right
  // sub-org row. Without it we cannot link the subscription to a KILN org;
  // this is expected for legacy reseller subscriptions and is a no-op.
  const subOrgId = subscription.metadata?.kilnSubOrgId;
  const parentAgencyOrgId = subscription.metadata?.kilnParentAgencyOrgId;
  if (!subOrgId || !parentAgencyOrgId) return;

  const item = subscription.items.data[0];
  if (!item) return;
  const price = item.price;

  const sub = subscription as Stripe.Subscription & {
    current_period_end?: number;
  };
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  await prisma.subOrgSubscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      subOrgId,
      parentAgencyOrgId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      stripePriceId: price.id,
      stripeProductId: typeof price.product === "string" ? price.product : null,
      status: mapStatus(subscription.status),
      currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      priceAmount: price.unit_amount ?? 0,
      priceCurrency: price.currency,
      priceInterval: price.recurring?.interval ?? "month",
    },
    update: {
      status: mapStatus(subscription.status),
      currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      stripePriceId: price.id,
      priceAmount: price.unit_amount ?? 0,
      priceCurrency: price.currency,
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await prisma.subOrgSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: "CANCELED", cancelAtPeriodEnd: false },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return;

  const subRow = await prisma.subOrgSubscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: { subOrgId: true, parentAgencyOrgId: true },
  });
  if (!subRow) return;

  // Phase 4: distinguish setup-fee invoices from recurring subscription
  // invoices. Setup is a one-time line item with no `recurring.interval`
  // — when EVERY line on the invoice lacks a recurring block, the
  // invoice is a pure setup charge. Mixed invoices (setup + first
  // monthly on the same charge) are tagged SUBSCRIPTION since they
  // contain at least one recurring item; the agency dashboard will
  // count the full invoice amount as monthly revenue. A future split
  // would require per-line cents — out of scope here.
  const invoiceType = inferInvoiceType(invoice);

  await prisma.subOrgInvoice.upsert({
    where: { stripeInvoiceId: invoice.id ?? "" },
    create: {
      subOrgId: subRow.subOrgId,
      parentAgencyOrgId: subRow.parentAgencyOrgId,
      stripeInvoiceId: invoice.id ?? "",
      amount: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? "eur",
      status: invoice.status ?? "paid",
      invoiceType,
      invoiceDate: new Date((invoice.created ?? 0) * 1000),
      paidAt: invoice.status === "paid" ? new Date() : null,
      pdfUrl: invoice.invoice_pdf ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    },
    update: {
      amount: invoice.amount_paid ?? 0,
      status: invoice.status ?? "paid",
      invoiceType,
      paidAt: invoice.status === "paid" ? new Date() : null,
      pdfUrl: invoice.invoice_pdf ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    },
  });
}

/**
 * Inspects the invoice line items and decides whether the invoice
 * represents a one-time setup charge or a recurring-subscription bill.
 *
 *   - 0 lines:               default to SUBSCRIPTION (defensive).
 *   - all lines non-recurring: SETUP_FEE.
 *   - any line recurring:    SUBSCRIPTION (covers first-invoice mixed
 *                            charges; setup + first monthly land here).
 */
export function inferInvoiceType(
  invoice: Stripe.Invoice
): "SUBSCRIPTION" | "SETUP_FEE" {
  const lines = invoice.lines?.data ?? [];
  if (lines.length === 0) return "SUBSCRIPTION";
  const hasRecurring = lines.some((line) => {
    const price = (line as { price?: Stripe.Price | null }).price;
    return Boolean(price?.recurring);
  });
  return hasRecurring ? "SUBSCRIPTION" : "SETUP_FEE";
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return;

  await prisma.subOrgSubscription.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data: { status: "PAST_DUE" },
  });
}

function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  // The Stripe types diverge across versions on whether `subscription` is
  // a string, an expanded object, or absent. Treat it loosely.
  const value = (
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }
  ).subscription;
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id ?? null;
}
