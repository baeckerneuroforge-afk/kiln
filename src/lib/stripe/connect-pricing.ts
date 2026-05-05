/**
 * Sub-org pricing helpers — products + prices live in the AGENCY's
 * connected Stripe account, never in the KILN platform account. Every
 * Stripe call uses `{ stripeAccount: agencyAccountId }` to address the
 * connected account.
 *
 * Public surface:
 *   - upsertSubOrgPrice(agencyAccountId, subOrg, opts) — create/replace
 *     the recurring price + its product on the connected account.
 *   - archiveSubOrgPrice(agencyAccountId, priceId)     — soft-archive an
 *     old price (Stripe doesn't allow hard delete once a sub used it).
 *   - createCheckoutSession(...)                       — Stripe-hosted
 *     subscription checkout under the connected account.
 *
 * KILN takes no application_fee_percent and never sets a transfer_data
 * destination — the agency keeps 100% of revenue, GHL-style.
 */
import { getStripe } from "@/lib/stripe";

type Currency = "eur" | "usd" | "gbp" | string;

export type UpsertPriceArgs = {
  /** Display name on the invoice + checkout page. */
  productName: string;
  /** Optional subtitle on checkout. */
  productDescription?: string;
  /** Recurring price in cents. */
  amount: number;
  /** Defaults to "eur". */
  currency?: Currency;
  /** Defaults to "month"; "year" is the other common one. */
  interval?: "day" | "week" | "month" | "year";
  /**
   * If the sub-org already has a stripePriceId, we DO NOT mutate the
   * existing one (Stripe prices are immutable once a subscription uses
   * them). Instead we create a fresh price and let the caller archive
   * the old one separately.
   */
  existingProductId?: string | null;
  /** Free-form metadata persisted on the Stripe Product. */
  metadata?: Record<string, string>;
};

/**
 * Create (or extend an existing product with) a recurring price on the
 * agency's connected account. Returns the new product + price IDs;
 * caller is responsible for persisting them on OrgRelationship.
 */
export async function upsertSubOrgPrice(
  agencyAccountId: string,
  args: UpsertPriceArgs
): Promise<{ productId: string; priceId: string }> {
  const stripe = getStripe();
  const currency = args.currency ?? "eur";
  const interval = args.interval ?? "month";

  // Reuse an existing product when we have one — keeps the Stripe
  // dashboard tidy. New products are created on first pricing setup.
  let productId = args.existingProductId ?? null;
  if (!productId) {
    const product = await stripe.products.create(
      {
        name: args.productName,
        description: args.productDescription,
        metadata: args.metadata ?? {},
      },
      { stripeAccount: agencyAccountId }
    );
    productId = product.id;
  } else if (args.productName || args.productDescription) {
    // Update the readable name when the agency renames the sub-org.
    await stripe.products.update(
      productId,
      {
        name: args.productName,
        description: args.productDescription,
      },
      { stripeAccount: agencyAccountId }
    );
  }

  const price = await stripe.prices.create(
    {
      unit_amount: args.amount,
      currency,
      recurring: { interval },
      product: productId,
    },
    { stripeAccount: agencyAccountId }
  );

  return { productId, priceId: price.id };
}

/**
 * Archive a price on the connected account so it can no longer be
 * attached to new subscriptions. Existing subscriptions keep billing.
 *
 * No-op + no throw when the price is already archived or missing —
 * lets pricing flips be idempotent without extra ceremony.
 */
export async function archiveSubOrgPrice(
  agencyAccountId: string,
  priceId: string
): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.prices.update(
      priceId,
      { active: false },
      { stripeAccount: agencyAccountId }
    );
  } catch {
    // best-effort
  }
}

/**
 * Build a Stripe Checkout session for a sub-org's subscription on the
 * agency's connected account. The session is created inside the
 * connected account so the customer + subscription end up there too —
 * not in the KILN platform account.
 *
 * `metadata` is forwarded onto the resulting subscription so the
 * webhook can route the event back to the right sub-org row.
 */
export async function createCheckoutSession(args: {
  agencyAccountId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  subOrgId: string;
  parentAgencyOrgId: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      line_items: [{ price: args.priceId, quantity: 1 }],
      customer_email: args.customerEmail,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata: {
        kilnSubOrgId: args.subOrgId,
        kilnParentAgencyOrgId: args.parentAgencyOrgId,
      },
      subscription_data: {
        metadata: {
          kilnSubOrgId: args.subOrgId,
          kilnParentAgencyOrgId: args.parentAgencyOrgId,
        },
      },
    },
    { stripeAccount: args.agencyAccountId }
  );

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  return { url: session.url, sessionId: session.id };
}

/**
 * Cancel a sub-org subscription at period end on the connected account.
 * The Stripe webhook will mirror the canceled state into our DB row.
 */
export async function cancelSubscriptionAtPeriodEnd(
  agencyAccountId: string,
  stripeSubscriptionId: string
): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(
    stripeSubscriptionId,
    { cancel_at_period_end: true },
    { stripeAccount: agencyAccountId }
  );
}
