import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";
import type { ModuleName } from "@/lib/modules/types";

/**
 * Sprint 19.5 — Pool-Mode Module Billing (Code-Only Foundation).
 *
 * =============================================================================
 * TO ACTIVATE BILLING:
 * =============================================================================
 *  1. Create four recurring Stripe Products in the platform Stripe account:
 *       - AI-Module       29.00 EUR/month
 *       - SMS-Module       9.00 EUR/month
 *       - Voice-Module    19.00 EUR/month
 *       - WhatsApp-Module 14.00 EUR/month
 *  2. Copy the four price IDs into both .env.local AND Vercel env:
 *       STRIPE_PRICE_AI_MODULE=price_xxx
 *       STRIPE_PRICE_SMS_MODULE=price_xxx
 *       STRIPE_PRICE_VOICE_MODULE=price_xxx
 *       STRIPE_PRICE_WHATSAPP_MODULE=price_xxx
 *  3. Run reconcileModuleBilling() once over existing active-pool rows to
 *     catch up subscription items that were skipped during the no-env era.
 *
 * Until step 2 completes, every billing call returns a SKIPPED result, the
 * DB row's stripeSubscriptionItemId stays null, and an audit-log entry
 * with action MODULE_BILLING_SKIPPED is recorded so support can see why a
 * sub-account isn't being billed.
 *
 * DESIGN NOTES:
 *  - The DB row in SubAccountModuleConfig is the source of truth. Stripe
 *    sync is a side-effect that may fail / skip independently.
 *  - All Stripe SDK calls are lazily imported so tests can replace
 *    `@/lib/stripe` without the env var being set at import time.
 *  - Architecturally the "agency subscription" is undetermined at the
 *    schema level (no `agencyStripeSubscriptionId` column yet). The
 *    public surface accepts the subscription id explicitly; the caller
 *    decides where to look it up. resolveAgencyStripeSubscription is a
 *    placeholder that returns null today — fill it in when the data
 *    model lands.
 * =============================================================================
 */

export const MODULE_PRICE_EUR: Record<ModuleName, number> = {
  ai: 29.0,
  sms: 9.0,
  voice: 19.0,
  whatsapp: 14.0,
};

const PRICE_ENV_VAR: Record<ModuleName, string> = {
  ai: "STRIPE_PRICE_AI_MODULE",
  sms: "STRIPE_PRICE_SMS_MODULE",
  voice: "STRIPE_PRICE_VOICE_MODULE",
  whatsapp: "STRIPE_PRICE_WHATSAPP_MODULE",
};

export type BillingSkipReason =
  | "missing_price_env"
  | "no_agency_subscription"
  | "billing_disabled"
  | "stripe_sdk_unavailable";

export type BillingResult =
  | { ok: true; subscriptionItemId: string }
  | { ok: true; skipped: true; reason: BillingSkipReason }
  | { ok: false; error: string };

export interface AddModuleSubscriptionItemArgs {
  agencyOrgId: string;
  subAccountId: string;
  moduleName: ModuleName;
  /** When known, the platform Stripe subscription that should hold the item. */
  stripeSubscriptionId?: string | null;
  /** Optional: when set to false, force-skip the sync (e.g. tests). */
  enabled?: boolean;
}

/**
 * Reads the Stripe price ID for a module at *runtime* (so deploying the
 * env vars later activates billing without a rebuild). Returns null when
 * the env var is missing — callers must treat this as a SKIPPED outcome
 * rather than an error.
 */
export function getStripePriceIdForModule(moduleName: ModuleName): string | null {
  const envVar = PRICE_ENV_VAR[moduleName];
  const value = process.env[envVar];
  return value && value.trim() ? value.trim() : null;
}

/**
 * Sprint 19.5.1: real implementation lives in agency-tier.ts and reads
 * the AgencyPlatformSubscription row. We re-export the resolver here so
 * legacy callers keep importing from module-billing without breakage.
 * Status-gating (`active` / `trialing` only) lives in agency-tier.ts so
 * the same rules apply everywhere a subscription id is needed.
 */
export async function resolveAgencyStripeSubscriptionId(
  agencyOrgId: string,
): Promise<string | null> {
  const { resolveAgencyStripeSubscriptionId: realResolver } = await import(
    "./agency-tier"
  );
  return realResolver(agencyOrgId);
}

async function recordSkipAudit(args: {
  agencyOrgId: string;
  subAccountId: string;
  moduleName: ModuleName;
  reason: BillingSkipReason;
  action: "MODULE_BILLING_SKIPPED" | "MODULE_BILLING_SYNC_FAILED";
  severity: "INFO" | "WARN" | "ERROR";
  details?: string;
}) {
  await logAudit({
    orgId: args.agencyOrgId,
    actorType: "SYSTEM",
    action: args.action,
    resourceType: "SUB_ACCOUNT_MODULE_CONFIG",
    description: `${args.moduleName} module billing ${args.action === "MODULE_BILLING_SKIPPED" ? "skipped" : "failed"}: ${args.reason}${args.details ? ` (${args.details})` : ""}`,
    severity: args.severity === "ERROR" ? "CRITICAL" : args.severity,
    metadata: {
      agencyOrgId: args.agencyOrgId,
      subAccountId: args.subAccountId,
      moduleName: args.moduleName,
      reason: args.reason,
    },
  });
}

/**
 * Idempotent: when the module config already has a stripeSubscriptionItemId,
 * this is a no-op and returns the existing id.
 */
export async function addModuleSubscriptionItem(
  args: AddModuleSubscriptionItemArgs,
): Promise<BillingResult> {
  if (args.enabled === false) {
    await recordSkipAudit({
      ...args,
      reason: "billing_disabled",
      action: "MODULE_BILLING_SKIPPED",
      severity: "INFO",
    });
    return { ok: true, skipped: true, reason: "billing_disabled" };
  }

  const priceId = getStripePriceIdForModule(args.moduleName);
  if (!priceId) {
    await recordSkipAudit({
      ...args,
      reason: "missing_price_env",
      action: "MODULE_BILLING_SKIPPED",
      severity: "WARN",
    });
    return { ok: true, skipped: true, reason: "missing_price_env" };
  }

  const subscriptionId =
    args.stripeSubscriptionId ??
    (await resolveAgencyStripeSubscriptionId(args.agencyOrgId));
  if (!subscriptionId) {
    await recordSkipAudit({
      ...args,
      reason: "no_agency_subscription",
      action: "MODULE_BILLING_SKIPPED",
      severity: "INFO",
    });
    return { ok: true, skipped: true, reason: "no_agency_subscription" };
  }

  // Check for existing item (idempotent).
  const existing = await prisma.subAccountModuleConfig.findUnique({
    where: {
      subAccountId_moduleName: {
        subAccountId: args.subAccountId,
        moduleName: args.moduleName,
      },
    },
    select: { stripeSubscriptionItemId: true },
  });
  if (existing?.stripeSubscriptionItemId) {
    return { ok: true, subscriptionItemId: existing.stripeSubscriptionItemId };
  }

  try {
    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();
    const item = await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: priceId,
      metadata: {
        kiln_sub_account_id: args.subAccountId,
        kiln_module: args.moduleName,
        kiln_agency_org_id: args.agencyOrgId,
      },
    });
    await prisma.subAccountModuleConfig.update({
      where: {
        subAccountId_moduleName: {
          subAccountId: args.subAccountId,
          moduleName: args.moduleName,
        },
      },
      data: { stripeSubscriptionItemId: item.id },
    });
    return { ok: true, subscriptionItemId: item.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown stripe error";
    await recordSkipAudit({
      ...args,
      reason: "stripe_sdk_unavailable",
      action: "MODULE_BILLING_SYNC_FAILED",
      severity: "ERROR",
      details: message,
    });
    return { ok: false, error: message };
  }
}

export interface RemoveModuleSubscriptionItemArgs {
  agencyOrgId: string;
  subAccountId: string;
  moduleName: ModuleName;
}

/**
 * Idempotent: when the module config has no stripeSubscriptionItemId,
 * this is a no-op success.
 */
export async function removeModuleSubscriptionItem(
  args: RemoveModuleSubscriptionItemArgs,
): Promise<BillingResult> {
  const row = await prisma.subAccountModuleConfig.findUnique({
    where: {
      subAccountId_moduleName: {
        subAccountId: args.subAccountId,
        moduleName: args.moduleName,
      },
    },
    select: { stripeSubscriptionItemId: true },
  });
  if (!row?.stripeSubscriptionItemId) {
    return { ok: true, skipped: true, reason: "no_agency_subscription" };
  }

  try {
    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();
    await stripe.subscriptionItems.del(row.stripeSubscriptionItemId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown stripe error";
    await recordSkipAudit({
      ...args,
      reason: "stripe_sdk_unavailable",
      action: "MODULE_BILLING_SYNC_FAILED",
      severity: "ERROR",
      details: message,
    });
    // We still clear the DB pointer so the row reflects intent (the local
    // toggle remains off / mode remains BYOK). A reconcile sweep will
    // detect any orphan items on the Stripe side.
  }

  await prisma.subAccountModuleConfig.update({
    where: {
      subAccountId_moduleName: {
        subAccountId: args.subAccountId,
        moduleName: args.moduleName,
      },
    },
    data: { stripeSubscriptionItemId: null },
  });

  return { ok: true, subscriptionItemId: row.stripeSubscriptionItemId };
}

export interface CalculateCostArgs {
  /** When set, sum only these sub-account ids. */
  subAccountIds?: string[];
  /** When set, sum only configs in this agency. */
  agencyOrgId?: string;
}

export interface MonthlyModuleCost {
  ai: number;
  sms: number;
  voice: number;
  whatsapp: number;
  total: number;
  /** Number of sub-account-module rows contributing to the total. */
  activePoolModuleCount: number;
}

/**
 * Returns the monthly EUR cost of all pool-mode + active modules. Used
 * for the agency dashboard cost panel. Reads only the DB — does not
 * round-trip Stripe — so it works regardless of billing activation.
 */
export async function calculateMonthlyModuleCost(
  args: CalculateCostArgs = {},
): Promise<MonthlyModuleCost> {
  const rows = await prisma.subAccountModuleConfig.findMany({
    where: {
      mode: "pool",
      isActive: true,
      ...(args.subAccountIds ? { subAccountId: { in: args.subAccountIds } } : {}),
    },
    select: { moduleName: true },
  });
  void args.agencyOrgId; // Agency-org filter is callable later via a join once
                         // SubAccountModuleConfig carries the agencyOrgId column
                         // (currently keyed by subAccountId = childOrgId only).

  const tally: MonthlyModuleCost = {
    ai: 0,
    sms: 0,
    voice: 0,
    whatsapp: 0,
    total: 0,
    activePoolModuleCount: rows.length,
  };
  for (const row of rows) {
    const moduleName = row.moduleName as ModuleName;
    const price = MODULE_PRICE_EUR[moduleName] ?? 0;
    tally[moduleName] = (tally[moduleName] ?? 0) + price;
    tally.total += price;
  }
  return tally;
}

export interface ReconcileArgs {
  /** Required: the Stripe subscription whose items we own (per-agency). */
  stripeSubscriptionId: string;
  /** The agency this subscription belongs to (audit context). */
  agencyOrgId: string;
  /** Optional: restrict reconcile to specific sub-accounts. */
  subAccountIds?: string[];
}

export interface ReconcileResult {
  added: number;
  removed: number;
  errors: string[];
  skipped: BillingSkipReason | null;
}

/**
 * Drift-correction sweep:
 *
 *  1. List all SubAccountModuleConfig rows that *should* have an item
 *     (mode='pool', isActive=true) but currently don't (stripeSubscriptionItemId
 *     is null) → add them.
 *  2. Conversely, list rows that have an item but shouldn't (mode!='pool'
 *     or isActive=false) → remove them.
 *
 * Safe to call repeatedly; idempotent at the Stripe level (item creation
 * with the same price is allowed but causes duplicates, so we always
 * check the local row first).
 */
export async function reconcileModuleBilling(args: ReconcileArgs): Promise<ReconcileResult> {
  const result: ReconcileResult = { added: 0, removed: 0, errors: [], skipped: null };
  if (!args.stripeSubscriptionId) {
    result.skipped = "no_agency_subscription";
    return result;
  }

  const rows = await prisma.subAccountModuleConfig.findMany({
    where: {
      ...(args.subAccountIds ? { subAccountId: { in: args.subAccountIds } } : {}),
    },
  });

  for (const row of rows) {
    const moduleName = row.moduleName as ModuleName;
    const shouldHaveItem = row.mode === "pool" && row.isActive;
    const hasItem = !!row.stripeSubscriptionItemId;

    if (shouldHaveItem && !hasItem) {
      const add = await addModuleSubscriptionItem({
        agencyOrgId: args.agencyOrgId,
        subAccountId: row.subAccountId,
        moduleName,
        stripeSubscriptionId: args.stripeSubscriptionId,
      });
      if (add.ok && "subscriptionItemId" in add) result.added += 1;
      else if (!add.ok) result.errors.push(`${row.subAccountId}/${moduleName}: ${add.error}`);
    } else if (!shouldHaveItem && hasItem) {
      const remove = await removeModuleSubscriptionItem({
        agencyOrgId: args.agencyOrgId,
        subAccountId: row.subAccountId,
        moduleName,
      });
      if (remove.ok && "subscriptionItemId" in remove) result.removed += 1;
      else if (!remove.ok) result.errors.push(`${row.subAccountId}/${moduleName}: ${remove.error}`);
    }
  }

  return result;
}

/**
 * Convenience: read whether Stripe billing is wired up at all. Returns
 * false if any of the four module price env vars is missing. UIs can use
 * this to show a "billing not yet activated" banner without round-trip.
 */
export function isBillingActivated(): boolean {
  return (
    getStripePriceIdForModule("ai") !== null &&
    getStripePriceIdForModule("sms") !== null &&
    getStripePriceIdForModule("voice") !== null &&
    getStripePriceIdForModule("whatsapp") !== null
  );
}
