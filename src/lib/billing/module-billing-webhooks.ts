import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";
import { sendBrandedEmail } from "@/lib/email/send-branded-email";
import { isAgencyTier, TIER_PRICE_ENV } from "./agency-tier";

/**
 * Sprint 19.5.3 — Stripe webhook handlers for the platform-tier
 * subscription that also carries module add-on items.
 *
 * Events handled here:
 *   invoice.created             → audit log + record items inventory
 *   invoice.payment_succeeded   → clear grace, audit, send paid email
 *   invoice.payment_failed      → open grace, audit (CRITICAL), notify
 *   customer.subscription.updated → tier-change detection + status sync
 *
 * Idempotency: each row tracks the latest event id we have processed
 * for the two event families separately (subscription.* and invoice.*).
 * Re-deliveries return `{ ok: true, deduplicated: true }` without any
 * side effects.
 *
 * Source of truth: the local DB row. Stripe sync runs best-effort and
 * is never allowed to crash the webhook response — we always return
 * 200 so Stripe stops retrying.
 */

export const PAYMENT_GRACE_DAYS = 7;
export const PAYMENT_GRACE_MS = PAYMENT_GRACE_DAYS * 86_400_000;

export interface WebhookResult {
  ok: true;
  handled: true;
  action: string;
  deduplicated?: boolean;
  /** When the handler triggered an email, that result is reported back. */
  emailSent?: boolean;
}

export interface NoMatchResult {
  ok: true;
  handled: false;
  reason: "no_local_row" | "missing_customer_id" | "missing_subscription_id";
}

export type AnyResult = WebhookResult | NoMatchResult;

interface SendBrandedFn {
  // Loose-shape so test mocks don't need to know about the rich generic.
  (args: {
    template: "invoice-paid" | "invoice-payment-failed" | "modules-disabled-payment";
    to: string | string[];
    orgId: string | null;
    subOrgId?: string | null;
    data: Record<string, unknown>;
  }): Promise<{ ok: boolean; error?: string }>;
}

// Wrap sendBrandedEmail in a typed thunk so tests can swap it cleanly.
const defaultSendEmail: SendBrandedFn = sendBrandedEmail as unknown as SendBrandedFn;

/**
 * Find the AgencyPlatformSubscription row by customer or subscription id.
 * Returns null when we have no record of this Stripe object — that's a
 * legit case (legacy User.stripeCustomerId customers) and the caller
 * should no-op.
 */
async function findRowByEvent(args: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  if (args.stripeSubscriptionId) {
    const row = await prisma.agencyPlatformSubscription.findUnique({
      where: { stripeSubscriptionId: args.stripeSubscriptionId },
    });
    if (row) return row;
  }
  if (args.stripeCustomerId) {
    const row = await prisma.agencyPlatformSubscription.findUnique({
      where: { stripeCustomerId: args.stripeCustomerId },
    });
    if (row) return row;
  }
  return null;
}

function moduleItemsFromInvoice(invoice: Stripe.Invoice): Array<{
  priceId: string | null;
  amount: number;
  description: string | null;
}> {
  const lines = (invoice.lines?.data ?? []) as Stripe.InvoiceLineItem[];
  return lines.map((line) => {
    // Newer Stripe SDK versions moved the price id into a `pricing.price_id`
    // sub-object; older shapes still expose `price.id`. Read both safely.
    const lineAny = line as unknown as {
      price?: { id?: string | null };
      pricing?: { price_id?: string | null };
    };
    const priceId =
      (typeof lineAny.price?.id === "string" ? lineAny.price.id : null) ??
      (typeof lineAny.pricing?.price_id === "string" ? lineAny.pricing.price_id : null);
    return {
      priceId,
      amount: line.amount,
      description: line.description ?? null,
    };
  });
}

/**
 * Map a Stripe Price ID to a tier key by looking up the env vars at
 * runtime. Returns null when no tier matches (i.e. it's a module item).
 */
function tierFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [tier, envVar] of Object.entries(TIER_PRICE_ENV)) {
    const value = process.env[envVar];
    if (value && value.trim() === priceId) return tier;
  }
  return null;
}

export interface HandleInvoiceCreatedArgs {
  event: Stripe.Event;
  sendEmail?: SendBrandedFn;
}

export async function handleInvoiceCreated(
  args: HandleInvoiceCreatedArgs,
): Promise<AnyResult> {
  const invoice = args.event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | null }).subscription === "string"
      ? ((invoice as unknown as { subscription: string }).subscription)
      : null;

  const row = await findRowByEvent({ stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId });
  if (!row) return { ok: true, handled: false, reason: "no_local_row" };

  if (row.lastInvoiceEventId === args.event.id) {
    return { ok: true, handled: true, action: "invoice.created", deduplicated: true };
  }

  const items = moduleItemsFromInvoice(invoice);
  await prisma.agencyPlatformSubscription.update({
    where: { id: row.id },
    data: { lastInvoiceEventId: args.event.id },
  });

  await logAudit({
    orgId: row.orgId,
    actorType: "WEBHOOK",
    action: "INVOICE_CREATED",
    resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
    resourceId: row.id,
    description: `Stripe invoice ${invoice.id} created (${invoice.amount_due} ${invoice.currency})`,
    severity: "INFO",
    metadata: {
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      itemCount: items.length,
      moduleItemCount: items.filter((i) => i.priceId && !tierFromPriceId(i.priceId)).length,
    },
  });

  return { ok: true, handled: true, action: "invoice.created" };
}

export async function handleInvoicePaymentSucceeded(
  args: HandleInvoiceCreatedArgs,
): Promise<AnyResult> {
  const invoice = args.event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | null }).subscription === "string"
      ? ((invoice as unknown as { subscription: string }).subscription)
      : null;

  const row = await findRowByEvent({ stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId });
  if (!row) return { ok: true, handled: false, reason: "no_local_row" };

  if (row.lastInvoiceEventId === args.event.id) {
    return { ok: true, handled: true, action: "invoice.payment_succeeded", deduplicated: true };
  }

  await prisma.agencyPlatformSubscription.update({
    where: { id: row.id },
    data: {
      lastInvoiceEventId: args.event.id,
      // Clear the failed-timestamp on recovery so the grace sweep stops
      // counting down. status is updated separately by subscription.updated.
      invoiceFailedAt: null,
    },
  });

  await logAudit({
    orgId: row.orgId,
    actorType: "WEBHOOK",
    action: "INVOICE_PAID",
    resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
    resourceId: row.id,
    description: `Stripe invoice ${invoice.id} paid (${invoice.amount_paid} ${invoice.currency})`,
    severity: "INFO",
    metadata: {
      invoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    },
  });

  const send = args.sendEmail ?? defaultSendEmail;
  const ownerEmail = await findAgencyOwnerEmail(row.orgId);
  let emailSent = false;
  if (ownerEmail) {
    const result = await send({
      template: "invoice-paid",
      to: ownerEmail,
      orgId: row.orgId,
      data: {
        customerName: "Agency",
        invoiceNumber: invoice.number ?? invoice.id ?? "",
        amountFormatted: formatCurrency(invoice.amount_paid, invoice.currency),
        invoiceDate: new Date((invoice.created ?? Math.floor(Date.now() / 1000)) * 1000).toLocaleDateString("de-DE"),
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdfUrl: invoice.invoice_pdf ?? null,
      },
    });
    emailSent = result.ok;
  }
  return { ok: true, handled: true, action: "invoice.payment_succeeded", emailSent };
}

export async function handleInvoicePaymentFailed(
  args: HandleInvoiceCreatedArgs,
): Promise<AnyResult> {
  const invoice = args.event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | null }).subscription === "string"
      ? ((invoice as unknown as { subscription: string }).subscription)
      : null;

  const row = await findRowByEvent({ stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId });
  if (!row) return { ok: true, handled: false, reason: "no_local_row" };

  if (row.lastInvoiceEventId === args.event.id) {
    return { ok: true, handled: true, action: "invoice.payment_failed", deduplicated: true };
  }

  await prisma.agencyPlatformSubscription.update({
    where: { id: row.id },
    data: {
      lastInvoiceEventId: args.event.id,
      // Only stamp the first failure — subsequent retries within the same
      // grace window keep the original timestamp so the 7-day clock keeps
      // counting from the original miss.
      invoiceFailedAt: row.invoiceFailedAt ?? new Date(),
    },
  });

  await logAudit({
    orgId: row.orgId,
    actorType: "WEBHOOK",
    action: "INVOICE_PAYMENT_FAILED",
    resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
    resourceId: row.id,
    description: `Payment failed for invoice ${invoice.id} — grace period started`,
    severity: "CRITICAL",
    metadata: {
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      graceUntil: new Date(((row.invoiceFailedAt ?? new Date()).getTime() + PAYMENT_GRACE_MS)).toISOString(),
    },
  });

  const send = args.sendEmail ?? defaultSendEmail;
  const ownerEmail = await findAgencyOwnerEmail(row.orgId);
  let emailSent = false;
  if (ownerEmail) {
    const result = await send({
      template: "invoice-payment-failed",
      to: ownerEmail,
      orgId: row.orgId,
      data: {
        customerName: "Agency",
        invoiceNumber: invoice.number ?? invoice.id ?? "",
        amountFormatted: formatCurrency(invoice.amount_due, invoice.currency),
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        graceUntilFormatted: formatGraceEnd(row.invoiceFailedAt ?? new Date()),
      },
    });
    emailSent = result.ok;
  }
  return { ok: true, handled: true, action: "invoice.payment_failed", emailSent };
}

export async function handleSubscriptionUpdated(
  args: HandleInvoiceCreatedArgs,
): Promise<AnyResult> {
  const subscription = args.event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;

  const row = await findRowByEvent({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  });
  if (!row) return { ok: true, handled: false, reason: "no_local_row" };

  if (row.lastSubscriptionEventId === args.event.id) {
    return { ok: true, handled: true, action: "customer.subscription.updated", deduplicated: true };
  }

  // Find the tier item — match by env-var price id.
  const items = subscription.items?.data ?? [];
  let detectedTier: string | null = null;
  let tierItemId: string | null = row.tierSubscriptionItemId ?? null;
  for (const item of items) {
    const tier = tierFromPriceId(item.price?.id);
    if (tier && isAgencyTier(tier)) {
      detectedTier = tier;
      tierItemId = item.id;
      break;
    }
  }

  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const cpe =
    (items[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    null;
  const currentPeriodEnd = cpe ? new Date(cpe * 1000) : row.currentPeriodEnd;

  await prisma.agencyPlatformSubscription.update({
    where: { id: row.id },
    data: {
      lastSubscriptionEventId: args.event.id,
      stripeSubscriptionId: subscription.id,
      tierSubscriptionItemId: tierItemId,
      tier: detectedTier ?? row.tier,
      status: subscription.status,
      currentPeriodEnd,
      trialEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  if (detectedTier && detectedTier !== row.tier) {
    await logAudit({
      orgId: row.orgId,
      actorType: "WEBHOOK",
      action: "AGENCY_SUBSCRIPTION_TIER_DETECTED",
      resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
      resourceId: row.id,
      description: `Tier changed via Stripe ${row.tier} → ${detectedTier}`,
      severity: "INFO",
      metadata: { previousTier: row.tier, tier: detectedTier, subscriptionId: subscription.id },
    });
  }

  return { ok: true, handled: true, action: "customer.subscription.updated" };
}

/**
 * Daily grace sweep — called by the master cron. Finds any subscription
 * row whose invoiceFailedAt is older than the grace window AND is not
 * already canceled, then:
 *   1. flips every pool-mode SubAccountModuleConfig for that org to
 *      isActive=false (BYOK rows are untouched — they're not billed
 *      so the grace period doesn't apply).
 *   2. writes an MODULES_AUTO_DISABLED_PAYMENT_FAILURE audit entry.
 *   3. emails the agency owner via the modules-disabled-payment
 *      template (if an owner email can be resolved).
 *   4. clears invoiceFailedAt so the sweep doesn't repeat for this row.
 *
 * Idempotent — re-running after the same disable would find no rows
 * still over the threshold with invoiceFailedAt set (we clear it as
 * part of disabling).
 */
export interface RunGraceSweepArgs {
  now?: Date;
  sendEmail?: SendBrandedFn;
}

export interface GraceSweepResult {
  inspected: number;
  disabledAgencies: number;
  modulesDisabled: number;
  errors: string[];
}

export async function runPaymentGraceSweep(args: RunGraceSweepArgs = {}): Promise<GraceSweepResult> {
  const now = args.now ?? new Date();
  const cutoff = new Date(now.getTime() - PAYMENT_GRACE_MS);
  const send = args.sendEmail ?? defaultSendEmail;
  const due = await prisma.agencyPlatformSubscription.findMany({
    where: {
      invoiceFailedAt: { lte: cutoff },
      status: { in: ["past_due", "unpaid", "active"] },
    },
  });

  const result: GraceSweepResult = {
    inspected: due.length,
    disabledAgencies: 0,
    modulesDisabled: 0,
    errors: [],
  };

  for (const row of due) {
    try {
      const childIds = await prisma.orgRelationship.findMany({
        where: { parentOrgId: row.orgId },
        select: { childOrgId: true },
      });
      const childOrgIds = childIds.map((c) => c.childOrgId);

      const update = await prisma.subAccountModuleConfig.updateMany({
        where: {
          subAccountId: { in: childOrgIds },
          mode: "pool",
          isActive: true,
        },
        data: { isActive: false },
      });
      result.modulesDisabled += update.count;
      result.disabledAgencies += update.count > 0 ? 1 : 0;

      await prisma.agencyPlatformSubscription.update({
        where: { id: row.id },
        data: { invoiceFailedAt: null },
      });

      await logAudit({
        orgId: row.orgId,
        actorType: "SYSTEM",
        action: "MODULES_AUTO_DISABLED_PAYMENT_FAILURE",
        resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
        resourceId: row.id,
        description: `Auto-disabled ${update.count} pool-mode modules after ${PAYMENT_GRACE_DAYS}-day payment-failure grace`,
        severity: "CRITICAL",
        metadata: {
          modulesDisabled: update.count,
          graceDays: PAYMENT_GRACE_DAYS,
          failedAt: row.invoiceFailedAt?.toISOString() ?? null,
        },
      });

      const ownerEmail = await findAgencyOwnerEmail(row.orgId);
      if (ownerEmail) {
        await send({
          template: "modules-disabled-payment",
          to: ownerEmail,
          orgId: row.orgId,
          data: {
            customerName: "Agency",
            modulesDisabled: update.count,
            graceDays: PAYMENT_GRACE_DAYS,
            billingUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/agency/billing`,
          },
        });
      }
    } catch (err) {
      result.errors.push(
        `${row.orgId}: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  return result;
}

async function findAgencyOwnerEmail(orgId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { personalOrgId: orgId },
    select: { email: true },
  });
  return user?.email ?? null;
}

function formatCurrency(amount: number, currency: string): string {
  const major = (amount / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${major} ${currency.toUpperCase()}`;
}

function formatGraceEnd(failedAt: Date): string {
  return new Date(failedAt.getTime() + PAYMENT_GRACE_MS).toLocaleDateString("de-DE");
}

export const __test__ = { findRowByEvent, tierFromPriceId, moduleItemsFromInvoice };
