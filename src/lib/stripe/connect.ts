/**
 * Stripe Connect Express helpers for the agency-tier monetization stack.
 *
 * Model: GHL-style. Each agency org gets its own Connect Express account.
 * Sub-org subscriptions live entirely in that connected account — KILN takes
 * NO application fee and never moves money. We only mediate onboarding,
 * cache the readiness flags, and listen to webhooks.
 *
 * Public surface:
 *   - createConnectAccount(orgId, email)         — first-time onboarding
 *   - getConnectAccount(orgId)                   — DB lookup
 *   - createOnboardingLink(stripeAccountId, ...) — Stripe-hosted KYC
 *   - refreshAccountStatus(stripeAccountId)      — pull → DB sync
 *   - disconnectAccount(orgId)                   — DB-side cleanup
 *
 * The lib never throws on a missing connect account; routes / webhooks
 * decide whether the absence is a 404 or a no-op.
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export type ConnectAccountRow = {
  id: string;
  orgId: string;
  stripeAccountId: string;
  onboardingComplete: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  requirementsJson: unknown;
  lastSyncedAt: Date | null;
};

/**
 * Look up an agency's Connect account row by Clerk org id, or null if
 * the org has not started Stripe onboarding.
 */
export async function getConnectAccount(
  orgId: string
): Promise<ConnectAccountRow | null> {
  const row = await prisma.agencyStripeAccount.findUnique({
    where: { orgId },
  });
  return row;
}

/**
 * Create a brand-new Stripe Express account for the agency and persist a
 * matching row. Idempotent at the agency-org level: if the org already has
 * a Connect account, returns the existing row instead of creating a second.
 */
export async function createConnectAccount(
  orgId: string,
  email: string,
  country = "DE"
): Promise<ConnectAccountRow> {
  const existing = await getConnectAccount(orgId);
  if (existing) return existing;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    country,
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "company",
    metadata: { orgId, kilnPlatform: "kiln" },
  });

  const row = await prisma.agencyStripeAccount.create({
    data: {
      orgId,
      stripeAccountId: account.id,
    },
  });
  return row;
}

/**
 * Generate a one-time Stripe-hosted onboarding URL. The agency owner is
 * sent here from the billing settings page; Stripe handles all KYC,
 * banking, and payout setup, then redirects back to `returnUrl`.
 *
 * `refreshUrl` covers the "user abandoned the link, came back later"
 * case — Stripe redirects there to issue a fresh link.
 */
export async function createOnboardingLink(
  stripeAccountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ url: string; expiresAt: number }> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return { url: link.url, expires_at: link.expires_at } as unknown as {
    url: string;
    expiresAt: number;
  };
}

/**
 * Pull the latest account snapshot from Stripe and mirror the readiness
 * flags into our DB. Called from:
 *   - the manual "Refresh" button in the agency billing UI
 *   - the `account.updated` Connect webhook
 *
 * Returns the updated DB row.
 */
export async function refreshAccountStatus(
  stripeAccountId: string
): Promise<ConnectAccountRow> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(stripeAccountId);

  return persistAccountSnapshot(stripeAccountId, account);
}

/**
 * Internal — given a Stripe.Account from any source (retrieve / webhook),
 * upsert the readiness flags. Extracted so the webhook handler doesn't
 * have to re-fetch what Stripe already sent us.
 */
export async function persistAccountSnapshot(
  stripeAccountId: string,
  account: Stripe.Account
): Promise<ConnectAccountRow> {
  const detailsSubmitted = Boolean(account.details_submitted);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const chargesEnabled = Boolean(account.charges_enabled);
  const onboardingComplete = detailsSubmitted && payoutsEnabled && chargesEnabled;

  return prisma.agencyStripeAccount.update({
    where: { stripeAccountId },
    data: {
      detailsSubmitted,
      payoutsEnabled,
      chargesEnabled,
      onboardingComplete,
      requirementsJson: (account.requirements ?? null) as never,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Disconnect an agency's Stripe Connect account from KILN's side.
 *
 * Important: We do NOT delete the underlying Stripe account or revoke
 * Stripe's authorization — the agency owner does that in their Stripe
 * dashboard. We just clear our DB pointer so KILN stops referring to it.
 * Sub-org subscriptions stay in Stripe under the connected account; the
 * caller (route handler) decides whether to cancel them too.
 *
 * Returns the deleted row, or null if there was no account to disconnect.
 */
export async function disconnectAccount(
  orgId: string
): Promise<ConnectAccountRow | null> {
  const existing = await getConnectAccount(orgId);
  if (!existing) return null;

  await prisma.agencyStripeAccount.delete({ where: { orgId } });
  return existing;
}
