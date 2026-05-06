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

/* ── Phase 4: setup-fee + recurring + trial ─────────────────────────── */

export type CreateSubOrgPricingArgs = {
  /** Stripe acct_xxx of the agency. */
  agencyAccountId: string;
  /** Clerk org id of the sub-org (stamped onto product metadata). */
  subOrgId: string;
  /** Display name on the Stripe product. Used for the customer's invoice. */
  subOrgName: string;
  /** One-time setup-fee price in cents. Omit / 0 to skip the setup price. */
  setupFeeCents?: number;
  /** Monthly recurring price in cents. Omit / 0 to skip the monthly price. */
  monthlyPriceCents?: number;
  /** Defaults to "eur". */
  currency?: string;
  /**
   * If the sub-org already has a stripeProductId from a previous pricing
   * round, reuse it instead of creating a second product. Stripe prices
   * are immutable once attached to a subscription, so any existing prices
   * on this product should be archived by the caller before swapping.
   */
  existingProductId?: string | null;
};

/**
 * Create the Stripe Product + up-to-two prices for a sub-org's billing.
 * Returns the IDs the caller persists on OrgRelationship.
 *
 * Two prices live on one product: the recurring monthly price (mode
 * "subscription") and an optional one-time setup price (no `recurring`
 * block). The checkout session attaches both as line items so the
 * customer pays them together; Stripe creates a $X invoice with both
 * line items and bills the recurring item again every month.
 *
 * Trial days are NOT attached to the price — they're attached to the
 * subscription at checkout creation time (see createBrandedCheckoutSession).
 */
export async function createSubOrgPricing(
  args: CreateSubOrgPricingArgs
): Promise<{
  productId: string;
  monthlyPriceId: string | null;
  setupPriceId: string | null;
}> {
  const stripe = getStripe();
  const currency = (args.currency ?? "eur").toLowerCase();
  const stripeAccount = args.agencyAccountId;

  // Reuse the existing product when we have one — keeps the agency's
  // Stripe dashboard tidy. Update the readable name in case the agency
  // renamed the sub-org since the last pricing round.
  let productId = args.existingProductId ?? null;
  if (!productId) {
    const product = await stripe.products.create(
      {
        name: `${args.subOrgName} Subscription`,
        metadata: { kilnSubOrgId: args.subOrgId },
      },
      { stripeAccount }
    );
    productId = product.id;
  } else {
    await stripe.products.update(
      productId,
      { name: `${args.subOrgName} Subscription` },
      { stripeAccount }
    );
  }

  // Recurring monthly. Skipped when monthlyPriceCents is 0/undefined —
  // setup-only billing isn't a real KILN use case but the lib should
  // not enforce that policy.
  let monthlyPriceId: string | null = null;
  if (args.monthlyPriceCents && args.monthlyPriceCents > 0) {
    const price = await stripe.prices.create(
      {
        product: productId,
        unit_amount: args.monthlyPriceCents,
        currency,
        recurring: { interval: "month" },
      },
      { stripeAccount }
    );
    monthlyPriceId = price.id;
  }

  // One-time setup fee. No recurring block — Stripe treats this as a
  // single-charge price. Attached as a checkout line item alongside the
  // recurring price so the first invoice includes both.
  let setupPriceId: string | null = null;
  if (args.setupFeeCents && args.setupFeeCents > 0) {
    const price = await stripe.prices.create(
      {
        product: productId,
        unit_amount: args.setupFeeCents,
        currency,
      },
      { stripeAccount }
    );
    setupPriceId = price.id;
  }

  return { productId, monthlyPriceId, setupPriceId };
}

/**
 * Build a branded Stripe Checkout session that includes the setup-fee
 * line item (when present) plus a trial period (when configured).
 *
 * The connected account's branding (logo, color, name configured in
 * the agency's Stripe Express dashboard) automatically applies to the
 * hosted checkout page — no per-session branding override is needed.
 */
export async function createBrandedCheckoutSession(args: {
  agencyAccountId: string;
  monthlyPriceId: string;
  setupPriceId?: string | null;
  trialDays?: number | null;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  subOrgId: string;
  parentAgencyOrgId: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();

  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: args.monthlyPriceId, quantity: 1 },
  ];
  if (args.setupPriceId) {
    lineItems.unshift({ price: args.setupPriceId, quantity: 1 });
  }

  const subscriptionData: {
    metadata: Record<string, string>;
    trial_period_days?: number;
  } = {
    metadata: {
      kilnSubOrgId: args.subOrgId,
      kilnParentAgencyOrgId: args.parentAgencyOrgId,
    },
  };
  if (args.trialDays && args.trialDays > 0) {
    subscriptionData.trial_period_days = args.trialDays;
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      line_items: lineItems,
      customer_email: args.customerEmail,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata: {
        kilnSubOrgId: args.subOrgId,
        kilnParentAgencyOrgId: args.parentAgencyOrgId,
      },
      subscription_data: subscriptionData,
    },
    { stripeAccount: args.agencyAccountId }
  );

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  return { url: session.url, sessionId: session.id };
}
