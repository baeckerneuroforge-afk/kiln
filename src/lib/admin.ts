/**
 * Admin detection — used to bypass credit, plan, and feature gates so the
 * platform owner can test on production / preview without being throttled.
 *
 * Source of truth: `ADMIN_USER_IDS` environment variable, comma-separated
 * Clerk user IDs. Resolved once per process at module load.
 *
 * **Canonical bypass pattern**: route handlers should NOT add their own
 * `isAdmin` checks before calling credit / plan / feature helpers — the
 * helpers themselves bypass admins internally. Today this is wired into:
 *
 *   - lib/credits.ts            — checkCredits, checkAndDeductCredits,
 *                                 deductCredits, deductCreditsByAmount,
 *                                 deductEmbeddingCredits,
 *                                 checkTeamExecutionCredits,
 *                                 ensureCreditsReset
 *   - lib/plan-limits.ts        — canCreateAgent
 *   - lib/feature-access.ts     — checkFeatureAccess
 *   - lib/a2a-billing.ts        — checkA2ACredits, deductA2ACredits
 *   - lib/cost/cost-estimator.ts — admin gets free estimates
 *
 * Use a *direct* `isAdmin(userId)` call only when:
 *   - You're bypassing a check that doesn't go through one of the helpers
 *     above (e.g. inline `if (user.plan === "FREE") return 403` in a
 *     route — those should `|| isAdmin(userId)` instead).
 *   - You want to expose admin-only debug output, internal logs, or
 *     feature flags (see e.g. quick-use/agent-swarm exposing debug
 *     events only to admins).
 *
 * Things admins do NOT bypass:
 *   - Authentication / org membership checks. Admin still has to be
 *     authenticated and a member of the org they're acting on.
 *   - Org-scope filters. Admin sees only orgs they're a member of —
 *     ADMIN_USER_IDS doesn't grant cross-tenant visibility.
 *   - Rate limits. Bypassing rate limits would make accidental
 *     infinite-loops blow up production.
 */
/**
 * Reads ADMIN_USER_IDS lazily on each call rather than caching at module
 * load. The lazy form is robust against test ordering — `beforeAll`
 * mutations of process.env are honored even when this module was imported
 * earlier — and the cost is negligible (small string parse per call).
 */
function getAdminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getAdminUserIds().includes(userId);
}
