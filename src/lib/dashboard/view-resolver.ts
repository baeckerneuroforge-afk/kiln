/**
 * Sprint 19.6 — unified /dashboard view selection.
 *
 * The user has three possible preferences:
 *   - 'auto' (default): the system picks between onboarding and operations
 *     based on activity heuristics so new users see the activation
 *     checklist and established agencies see the operations cockpit.
 *   - 'onboarding': always render the onboarding checklist + quick start.
 *   - 'operations': always render the operations cockpit.
 *
 * The auto heuristic considers two signals:
 *   - subOrgCount: how many Sub-Orgs the agency operates.
 *   - daysSinceSignup: account age, so users with high sub-org counts
 *     within the first two weeks still get the onboarding context.
 *
 * Both signals must clear their thresholds (3+ Sub-Orgs *and* 14+ days
 * since signup) for auto-mode to flip to operations. Otherwise the user
 * keeps the onboarding experience.
 */

export type DashboardView = "onboarding" | "operations";
export type DashboardPreference = "auto" | "onboarding" | "operations";

export interface PickDashboardViewArgs {
  preference: string | null | undefined;
  subOrgCount: number;
  daysSinceSignup: number;
}

const AUTO_MIN_SUB_ORGS = 3;
const AUTO_MIN_ACCOUNT_AGE_DAYS = 14;

export function pickDashboardView(args: PickDashboardViewArgs): DashboardView {
  const preference = normalizePreference(args.preference);
  if (preference === "onboarding" || preference === "operations") return preference;

  // Auto-mode: both thresholds must clear before flipping to operations.
  const subOrgsReady = args.subOrgCount >= AUTO_MIN_SUB_ORGS;
  const accountAgeReady = args.daysSinceSignup >= AUTO_MIN_ACCOUNT_AGE_DAYS;
  return subOrgsReady && accountAgeReady ? "operations" : "onboarding";
}

export function normalizePreference(value: string | null | undefined): DashboardPreference {
  if (value === "onboarding" || value === "operations" || value === "auto") return value;
  return "auto";
}

export function isValidPreference(value: unknown): value is DashboardPreference {
  return value === "auto" || value === "onboarding" || value === "operations";
}

export function daysSince(date: Date, reference: Date = new Date()): number {
  const ms = reference.getTime() - date.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export const AUTO_THRESHOLDS = {
  minSubOrgs: AUTO_MIN_SUB_ORGS,
  minAccountAgeDays: AUTO_MIN_ACCOUNT_AGE_DAYS,
} as const;
