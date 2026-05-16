/**
 * Sprint 20 — Usage-tracker for Free-Tier enforcement.
 *
 * Two surfaces:
 *
 *   1. getCurrentUsage(orgId) — snapshot of every metered resource
 *      this org consumes right now. Persisted monthly counters
 *      (conversations) are read from TierUsageCounter; current-state
 *      counters (agents, oauth-connections, sub-orgs, storage) are
 *      computed via prisma.<model>.count() so they're always exact
 *      without denormalization drift.
 *
 *   2. incrementConversations(orgId, n=1) — atomic +n on the
 *      (orgId, periodMonth) row. Used by the conversation-create code
 *      path to record metered usage. Returns the new count so the
 *      caller can decide whether to fire a threshold notification.
 *
 * orgId is the Clerk Org ID — either User.personalOrgId for a personal
 * user or OrgRelationship.childOrgId for an agency sub-org. The
 * counters don't care which one; both are valid scopes.
 *
 * Monthly reset is implicit: periodMonth is the YYYY-MM string and the
 * unique (orgId, periodMonth) constraint means the first increment in
 * a new month inserts a fresh row with all counters back to zero. No
 * cron job needed.
 */

import { prisma } from "@/lib/prisma";

export interface CurrentUsage {
  orgId: string;
  periodMonth: string;
  conversationsCount: number;
  agentsCount: number;
  oauthConnectionsCount: number;
  subOrgsCount: number;
  storageUsedBytes: number;
}

/**
 * Returns the calendar-month key for `at` in UTC. Pulled out for the
 * tests — they freeze time and need to predict the bucket. The format
 * matches the spec's "2026-05" example.
 */
export function periodMonthFor(at: Date = new Date()): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Snapshot of everything we meter against tier limits. Read-only —
 * mutations go through the increment* helpers so we get a single audit
 * surface for threshold-notification side effects.
 */
export async function getCurrentUsage(
  orgId: string,
  at: Date = new Date(),
): Promise<CurrentUsage> {
  const periodMonth = periodMonthFor(at);

  const [counter, agentsCount, oauthConnectionsCount, subOrgsCount] = await Promise.all([
    prisma.tierUsageCounter.findUnique({
      where: { orgId_periodMonth: { orgId, periodMonth } },
    }),
    prisma.agent.count({ where: { orgId } }),
    prisma.integrationConnection.count({ where: { orgId, isActive: true } }),
    prisma.orgRelationship.count({
      where: { parentOrgId: orgId, subOrgStatus: "ACTIVE" },
    }),
  ]);

  // Storage is not tracked in the DB today — Sub-Org file storage lives in
  // Supabase Storage. Wiring an exact byte count requires a Supabase admin
  // round-trip which is too slow for the enforcement hot path. Until we
  // add a denormalized AgentWorkspaceFile.sizeBytes sum, return 0 so the
  // enforcement layer never wrongly blocks on storage. Sprint 20.x will
  // close this gap; for now the storage limit is effectively unenforced
  // and the UI shows "Storage tracking coming soon".
  const storageUsedBytes = 0;

  return {
    orgId,
    periodMonth,
    conversationsCount: counter?.conversationsCount ?? 0,
    agentsCount,
    oauthConnectionsCount,
    subOrgsCount,
    storageUsedBytes,
  };
}

/**
 * Atomically increments the conversation counter for this org's
 * current calendar month. Returns the new count so the caller can
 * decide whether to fire 80%/95%/100% threshold notifications.
 *
 * Uses upsert with `increment` so concurrent webhook callers compose
 * cleanly: every +1 lands exactly once, no read-modify-write race.
 */
export async function incrementConversations(
  orgId: string,
  delta = 1,
  at: Date = new Date(),
): Promise<number> {
  const periodMonth = periodMonthFor(at);
  const row = await prisma.tierUsageCounter.upsert({
    where: { orgId_periodMonth: { orgId, periodMonth } },
    create: { orgId, periodMonth, conversationsCount: delta },
    update: { conversationsCount: { increment: delta } },
  });
  return row.conversationsCount;
}

/**
 * Marks a threshold as notified for this period so the
 * tier-notifications service doesn't fire the same warning twice.
 * Returns true when this call was the one that flipped the flag —
 * the caller should send the email/toast only when this returns true.
 *
 * The `updateMany` + `where: { notifiedAtX: null }` pattern is a
 * compare-and-set: only the first call that sees the field null
 * gets a row-affected count of 1; later calls see 0.
 */
export async function markThresholdNotified(
  orgId: string,
  threshold: 80 | 95 | 100,
  at: Date = new Date(),
): Promise<boolean> {
  const periodMonth = periodMonthFor(at);
  const field =
    threshold === 80 ? "notifiedAt80" : threshold === 95 ? "notifiedAt95" : "notifiedAt100";

  const result = await prisma.tierUsageCounter.updateMany({
    where: {
      orgId,
      periodMonth,
      [field]: null,
    },
    data: { [field]: at },
  });
  return result.count === 1;
}

/**
 * Returns null when no row exists for the period — distinguishes
 * "haven't fired a single notification" from "fired all three" so the
 * banner UI can show the right state.
 */
export async function getNotificationState(
  orgId: string,
  at: Date = new Date(),
): Promise<{
  notifiedAt80: Date | null;
  notifiedAt95: Date | null;
  notifiedAt100: Date | null;
} | null> {
  const periodMonth = periodMonthFor(at);
  const row = await prisma.tierUsageCounter.findUnique({
    where: { orgId_periodMonth: { orgId, periodMonth } },
    select: { notifiedAt80: true, notifiedAt95: true, notifiedAt100: true },
  });
  if (!row) return null;
  return row;
}
