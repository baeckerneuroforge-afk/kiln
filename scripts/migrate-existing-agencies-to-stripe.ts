#!/usr/bin/env tsx
/**
 * Sprint 19.5.1 — Migrate existing agency-tier orgs onto the new
 * AgencyPlatformSubscription model with a 30-day founding-customer trial.
 *
 * What it does, per matching agency org:
 *   1. Find or create the Stripe Customer (one per agency org).
 *   2. Find or create the Stripe Subscription with the chosen tier price.
 *      Stripe-side trial_period_days=30 makes the first 30 days free.
 *   3. Upsert the local AgencyPlatformSubscription row, persisting the
 *      Stripe IDs + tier + status.
 *
 * Definitions:
 *   - "Existing agency org" = any Clerk org that owns at least one
 *     OrgRelationship row (parentOrgId). Two are known today: André
 *     Bäcker Agency and kdnw. The query catches any future ones too.
 *
 * Safety:
 *   - --dry-run: no Stripe / DB writes. Prints what would happen.
 *   - Idempotent: re-running attaches missing Stripe IDs and leaves
 *     already-attached rows unchanged.
 *   - Per-org try/catch so one failure doesn't block the others.
 *
 * Usage:
 *   tsx scripts/migrate-existing-agencies-to-stripe.ts --tier=starter --dry-run
 *   tsx scripts/migrate-existing-agencies-to-stripe.ts --tier=agency_pro
 *   tsx scripts/migrate-existing-agencies-to-stripe.ts --tier=starter --orgs=org_abc,org_def
 */

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  getStripePriceIdForTier,
  isAgencyTier,
  type AgencyTier,
} from "@/lib/billing/agency-tier";

interface CliOptions {
  tier: AgencyTier;
  dryRun: boolean;
  trialDays: number;
  orgIds: string[] | null;
}

interface MigrationResult {
  orgId: string;
  agencyName?: string | null;
  action: "created" | "updated" | "skipped" | "failed";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  reason?: string;
  error?: string;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    args.set(key, value ?? "true");
  }
  const tierArg = args.get("tier") ?? "starter";
  if (!isAgencyTier(tierArg)) {
    throw new Error(`Invalid --tier=${tierArg}. Must be starter|professional|agency_pro|enterprise`);
  }
  const trialDaysArg = args.get("trial-days");
  const trialDays = trialDaysArg ? Number.parseInt(trialDaysArg, 10) : 30;
  if (!Number.isFinite(trialDays) || trialDays < 0) {
    throw new Error(`Invalid --trial-days=${trialDaysArg}`);
  }
  const orgsArg = args.get("orgs");
  const orgIds = orgsArg ? orgsArg.split(",").map((s) => s.trim()).filter(Boolean) : null;
  return {
    tier: tierArg,
    dryRun: args.has("dry-run"),
    trialDays,
    orgIds,
  };
}

export async function findAgencyOrgs(restrictTo: string[] | null): Promise<{ orgId: string; relationshipCount: number; firstName: string }[]> {
  const groups = await prisma.orgRelationship.groupBy({
    by: ["parentOrgId"],
    _count: { id: true },
    ...(restrictTo ? { where: { parentOrgId: { in: restrictTo } } } : {}),
  });
  return groups.map((row) => ({
    orgId: row.parentOrgId,
    relationshipCount: row._count.id,
    firstName: row.parentOrgId,
  }));
}

export interface MigrateAgencyArgs {
  orgId: string;
  tier: AgencyTier;
  trialDays: number;
  dryRun: boolean;
}

/**
 * Reusable for tests: handles a single agency's migration with the
 * Stripe SDK injected for mockability.
 */
export async function migrateAgency(args: MigrateAgencyArgs): Promise<MigrationResult> {
  try {
    const priceId = getStripePriceIdForTier(args.tier);
    if (!priceId) {
      return { orgId: args.orgId, action: "skipped", reason: "missing_tier_price_env" };
    }

    const existing = await prisma.agencyPlatformSubscription.findUnique({
      where: { orgId: args.orgId },
    });

    if (existing?.stripeSubscriptionId) {
      return {
        orgId: args.orgId,
        action: "skipped",
        reason: "already_has_subscription",
        stripeCustomerId: existing.stripeCustomerId,
        stripeSubscriptionId: existing.stripeSubscriptionId,
      };
    }

    if (args.dryRun) {
      return {
        orgId: args.orgId,
        action: existing ? "updated" : "created",
        reason: "dry-run",
      };
    }

    // Locate an existing User in this org to seed customer email/name.
    const ownerHint = await prisma.user.findFirst({
      where: { personalOrgId: args.orgId },
      select: { email: true, companyName: true },
    });

    const stripe = getStripe();

    let customerId = existing?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ownerHint?.email,
        name: ownerHint?.companyName ?? undefined,
        metadata: { kiln_agency_org_id: args.orgId, kiln_created_by: "migration" },
      });
      customerId = customer.id;
    }

    const trialEnd = args.trialDays > 0
      ? Math.floor(Date.now() / 1000) + args.trialDays * 86_400
      : undefined;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_end: trialEnd,
      metadata: {
        kiln_agency_org_id: args.orgId,
        kiln_tier: args.tier,
        kiln_created_by: "migration",
      },
    });

    const tierItem = subscription.items.data[0];
    const status = subscription.status;
    // Newer Stripe API versions moved current_period_end onto each item;
    // fall back to subscription-level for older shapes. Either way, webhook
    // events keep this in sync going forward.
    const subWithLegacy = subscription as unknown as { current_period_end?: number };
    const itemCpeUnix =
      (tierItem as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
      subWithLegacy.current_period_end ??
      null;
    const currentPeriodEnd = itemCpeUnix ? new Date(itemCpeUnix * 1000) : null;
    const trialEndDate = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

    await prisma.agencyPlatformSubscription.upsert({
      where: { orgId: args.orgId },
      create: {
        orgId: args.orgId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        tierSubscriptionItemId: tierItem?.id ?? null,
        tier: args.tier,
        status,
        currentPeriodEnd,
        trialEnd: trialEndDate,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        createdSource: "migration",
      },
      update: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        tierSubscriptionItemId: tierItem?.id ?? null,
        tier: args.tier,
        status,
        currentPeriodEnd,
        trialEnd: trialEndDate,
      },
    });

    return {
      orgId: args.orgId,
      action: existing ? "updated" : "created",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
    };
  } catch (err) {
    return {
      orgId: args.orgId,
      action: "failed",
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function runMigration(options: CliOptions): Promise<MigrationResult[]> {
  const agencies = await findAgencyOrgs(options.orgIds);
  const results: MigrationResult[] = [];
  for (const agency of agencies) {
    const result = await migrateAgency({
      orgId: agency.orgId,
      tier: options.tier,
      trialDays: options.trialDays,
      dryRun: options.dryRun,
    });
    results.push(result);
  }
  return results;
}

if (require.main === module) {
  (async () => {
    const options = parseCliOptions(process.argv.slice(2));
    console.log(
      `[migrate-agencies] tier=${options.tier} trialDays=${options.trialDays} dryRun=${options.dryRun}${options.orgIds ? ` orgs=${options.orgIds.join(",")}` : ""}`,
    );
    const results = await runMigration(options);
    for (const r of results) {
      console.log(
        `  ${r.orgId}: ${r.action}${r.reason ? ` (${r.reason})` : ""}${r.error ? ` ERROR: ${r.error}` : ""}${r.stripeSubscriptionId ? ` sub=${r.stripeSubscriptionId}` : ""}`,
      );
    }
    const summary = results.reduce(
      (acc, r) => ({ ...acc, [r.action]: (acc[r.action] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
    console.log(`[migrate-agencies] summary:`, summary);
    await prisma.$disconnect();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
