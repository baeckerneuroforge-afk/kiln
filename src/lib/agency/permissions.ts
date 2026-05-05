/**
 * Agency-tier permission helpers.
 *
 * Agency-tier orgs can spawn Sub-Orgs ("client workspaces") whose data
 * lives in a separate Clerk org but rolls up to the agency for billing
 * and branding. The functions here gate the relevant API routes:
 *
 *   - isAgencyTierPlan(plan): static check on the user's plan tier
 *   - canManageSubOrgs(userId, orgId): full check including admin
 *     bypass and per-org capacity enforcement
 *
 * Admin bypass: any user in ADMIN_USER_IDS skips the plan check, the
 * capacity check, and counts as "agency tier" for tooling purposes.
 * Same canonical pattern documented in src/lib/admin.ts.
 */
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";

/** Plan tiers eligible to manage Sub-Orgs. AGENCY and above. */
const AGENCY_TIER_PLANS = new Set<PlanType>(["AGENCY", "ENTERPRISE"]);

export function isAgencyTierPlan(plan: PlanType | null | undefined): boolean {
  if (!plan) return false;
  return AGENCY_TIER_PLANS.has(plan);
}

export function getMaxSubOrgs(plan: PlanType | null | undefined): number {
  if (!plan) return 0;
  const limits = PLAN_LIMITS[plan];
  if (!limits) return 0;
  return (limits as { maxSubOrgs?: number }).maxSubOrgs ?? 0;
}

export type SubOrgPermissionDecision =
  | { allowed: true; max: number; current: number }
  | {
      allowed: false;
      reason: "no_plan" | "wrong_tier" | "capacity_reached";
      max: number;
      current: number;
    };

/**
 * Authoritative check: can this user create a new Sub-Org under the given
 * agency org? Combines plan-tier and per-org capacity in one call so
 * routes don't have to chain three checks themselves.
 *
 * Admins always pass with max=999999 — see src/lib/admin.ts.
 */
export async function canCreateSubOrg(
  userId: string,
  agencyOrgId: string
): Promise<SubOrgPermissionDecision> {
  // Admin bypass — same pattern as the credit / plan-limit helpers.
  if (isAdmin(userId)) {
    return { allowed: true, max: 999999, current: 0 };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) {
    return { allowed: false, reason: "no_plan", max: 0, current: 0 };
  }
  const plan = user.plan as PlanType;
  if (!isAgencyTierPlan(plan)) {
    return { allowed: false, reason: "wrong_tier", max: 0, current: 0 };
  }
  const max = getMaxSubOrgs(plan);

  // Count active sub-orgs under this agency. Archived ones don't count
  // against capacity — the operator should be able to retire dead
  // workspaces without paying for them.
  const current = await prisma.orgRelationship.count({
    where: { parentOrgId: agencyOrgId, subOrgStatus: "ACTIVE" },
  });

  if (current >= max) {
    return { allowed: false, reason: "capacity_reached", max, current };
  }
  return { allowed: true, max, current };
}

/**
 * "Can this user manage sub-orgs of this agency?" Used to gate
 * read/list/branding endpoints — covers both creating new sub-orgs and
 * acting on existing ones.
 */
export async function canManageSubOrgs(
  userId: string,
  agencyOrgId: string
): Promise<boolean> {
  if (isAdmin(userId)) return true;
  const decision = await canCreateSubOrg(userId, agencyOrgId);
  // The wrong-tier branch is the "no, you're not an agency" answer.
  // capacity_reached still means "you're an agency, but full" — managing
  // existing sub-orgs is allowed even when the cap is reached.
  if (decision.allowed) return true;
  if (decision.reason === "capacity_reached") return true;
  return false;
}
