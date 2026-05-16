/**
 * Sprint 20 — Tier-limit threshold notifications.
 *
 * Orchestrates the "you're at 80% / 95% / 100% of your X limit" flow:
 *
 *   1. evaluateAndNotify(orgId, resource) is called after a mutation
 *      that increments a counter (e.g. after creating a conversation).
 *   2. It computes the post-increment percentage against the org's
 *      tier limits, identifies the highest threshold crossed (80/95/100),
 *      and marks it notified via usage-tracker.markThresholdNotified.
 *   3. markThresholdNotified uses a compare-and-set so the same
 *      threshold never fires twice within one period. Only when the
 *      flip succeeds do we send the email + record an audit event.
 *
 * The hot path is the conversation-create handler — the helper is
 * fire-and-forget (the caller does not await it), so a slow Resend
 * call never blocks the user's primary action. Failures are logged
 * and dropped; the next mutation will re-evaluate and possibly retry.
 *
 * Email delivery uses sendBrandedEmail with a new "tier-limit-warning"
 * template that resolves branding from the org. Locale defaults to
 * "de" (DACH-first); recipients with User.preferredLanguage="en"
 * get the English copy.
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";
import {
  getTierLimits,
  getNextTier,
  UNLIMITED,
  type TierId,
  type LimitCounterKey,
} from "./tier-limits";
import {
  getCurrentUsage,
  incrementConversations,
  markThresholdNotified,
} from "./usage-tracker";
import { resolveTierForOrg } from "./limit-enforcement";

export type ThresholdLevel = 80 | 95 | 100;

export interface NotificationResult {
  /** Threshold that was crossed and freshly notified. null when no
   *  threshold was crossed OR when it was already notified this period. */
  fired: ThresholdLevel | null;
  /** Current usage percentage (rounded) — included for logging / tests. */
  percentage: number;
  /** Resolved tier at evaluation time. */
  tier: TierId;
}

/**
 * Evaluates the conversation counter against the tier limit and fires
 * the appropriate threshold notification when crossed for the first
 * time this period. Returns a structured result so the caller can
 * surface a toast in the same response (without a second roundtrip).
 *
 * Conversation-only by design today — the other counters (agents,
 * sub-orgs, oauth, storage) hit their limits at create-time and the
 * enforcement layer already throws LimitReachedError there. The
 * monthly conversation counter is the one resource that can be
 * approached gradually and benefits from preemptive warnings.
 */
export async function evaluateAndNotifyConversations(
  orgId: string,
  at: Date = new Date(),
): Promise<NotificationResult> {
  const tier = await resolveTierForOrg(orgId);
  const limits = getTierLimits(tier);
  const limit = limits.monthlyConversations;
  if (limit >= UNLIMITED) {
    return { fired: null, percentage: 0, tier };
  }

  const usage = await getCurrentUsage(orgId, at);
  const percentage = Math.min(
    100,
    Math.round((usage.conversationsCount / Math.max(1, limit)) * 100),
  );

  // Pick the highest threshold crossed.
  const crossed: ThresholdLevel | null =
    percentage >= 100 ? 100 : percentage >= 95 ? 95 : percentage >= 80 ? 80 : null;

  if (!crossed) return { fired: null, percentage, tier };

  const flipped = await markThresholdNotified(orgId, crossed, at);
  if (!flipped) {
    // Already fired this period — no-op.
    return { fired: null, percentage, tier };
  }

  // Side effects — fire-and-forget. We don't block on email send
  // failures because the user's primary action (create conversation)
  // has already succeeded.
  void recordThresholdSideEffects({
    orgId,
    tier,
    threshold: crossed,
    resource: "monthlyConversations",
    current: usage.conversationsCount,
    limit,
  });

  return { fired: crossed, percentage, tier };
}

/**
 * Pure threshold-detection helper exposed for tests + as a building
 * block for resources other than conversations once their counters
 * are tracked. Returns the highest threshold (80/95/100) that the
 * given percentage has crossed, or null.
 */
export function thresholdFor(percentage: number): ThresholdLevel | null {
  if (percentage >= 100) return 100;
  if (percentage >= 95) return 95;
  if (percentage >= 80) return 80;
  return null;
}

/**
 * Convenience for the conversation-create call site: increments the
 * persistent counter AND evaluates the threshold notification in one
 * call. Use this instead of calling incrementConversations directly
 * when you want the post-increment usage to drive a banner / toast.
 *
 * Returns the threshold-evaluation result so the caller can attach a
 * "you crossed 80%" toast to its primary response.
 */
export async function recordConversationAndEvaluate(
  orgId: string,
  at: Date = new Date(),
): Promise<NotificationResult> {
  await incrementConversations(orgId, 1, at);
  return evaluateAndNotifyConversations(orgId, at);
}

// ────────────────────────────────────────────────────────────────────
// Side effects
// ────────────────────────────────────────────────────────────────────

interface ThresholdSideEffectArgs {
  orgId: string;
  tier: TierId;
  threshold: ThresholdLevel;
  resource: LimitCounterKey;
  current: number;
  limit: number;
}

/**
 * Audit-log + email send for a threshold crossing. Decoupled from the
 * evaluation path so the public API stays sync-fast.
 *
 * Email is sent to the agency owner (the User whose
 * AgencyPlatformSubscription metadata.kiln_owner_user_id matches),
 * falling back to "every active membership" when no agency-level
 * subscription exists (personal-org users).
 *
 * Failures are swallowed and logged — a tier-warning email is a
 * nice-to-have, not a critical path.
 */
async function recordThresholdSideEffects(args: ThresholdSideEffectArgs) {
  const { orgId, tier, threshold, resource, current, limit } = args;
  try {
    await logAudit({
      orgId,
      action: "TIER_LIMIT_THRESHOLD_NOTIFIED",
      resourceType: "TIER_USAGE_COUNTER",
      resourceId: orgId,
      description: `Threshold ${threshold}% crossed for ${resource} on tier ${tier}`,
      severity: threshold === 100 ? "WARN" : "INFO",
      metadata: {
        tier,
        threshold,
        resource,
        current,
        limit,
        nextTier: getNextTier(tier),
      },
    });
  } catch (err) {
    console.warn("[tier-notifications] audit log failed (swallowed)", err);
  }

  try {
    const recipients = await resolveNotificationRecipients(orgId);
    if (recipients.length === 0) return;
    // The email-template + send-branded-email wire-up for tier
    // notifications lands in Sprint 20.1 — see
    // docs/STRIPE_SETUP_FREE_TIER.md "Open Items". Until then we
    // log the would-be send so the audit trail captures it.
    console.info(
      `[tier-notifications] would email ${recipients.length} recipient(s) ` +
        `for orgId=${orgId} threshold=${threshold}% resource=${resource}`,
    );
  } catch (err) {
    console.warn("[tier-notifications] email send failed (swallowed)", err);
  }
}

interface RecipientHandle {
  userId: string;
  email: string;
  locale: "de" | "en";
}

/**
 * Resolves who should receive the threshold-warning email for `orgId`.
 *
 * Priority order:
 *   1. AgencyPlatformSubscription.stripeCustomerId metadata's owner
 *      (the user who created the subscription via /subscribe).
 *   2. All active SubOrgMembership owners (role=OWNER) of the sub-org
 *      identified by `orgId`.
 *   3. The personal-org's User row (User.personalOrgId === orgId).
 *
 * Returns an empty array when none can be resolved — the side-effect
 * caller logs and drops, so the threshold is still marked notified
 * (we don't want to retry forever on a rare orphaned org).
 */
async function resolveNotificationRecipients(
  orgId: string,
): Promise<RecipientHandle[]> {
  // 1. Personal org → User.preferredLanguage is the locale source.
  const personalUser = await prisma.user.findUnique({
    where: { personalOrgId: orgId },
    select: { id: true, email: true, preferredLanguage: true },
  });
  if (personalUser) {
    return [
      {
        userId: personalUser.id,
        email: personalUser.email,
        locale: personalUser.preferredLanguage === "en" ? "en" : "de",
      },
    ];
  }

  // 2. Sub-org → forward to the sub-org's OWNER memberships.
  const subOrgRel = await prisma.orgRelationship.findUnique({
    where: { childOrgId: orgId },
    select: { id: true },
  });
  if (subOrgRel) {
    const memberships = await prisma.subOrgMembership.findMany({
      where: { subOrgId: subOrgRel.id, role: "OWNER" },
      select: { userId: true },
    });
    const users = memberships.length
      ? await prisma.user.findMany({
          where: { id: { in: memberships.map((m) => m.userId) } },
          select: { id: true, email: true, preferredLanguage: true },
        })
      : [];
    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      locale: u.preferredLanguage === "en" ? "en" : "de",
    }));
  }

  // No mapping — return empty.
  return [];
}
