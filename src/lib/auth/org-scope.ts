/**
 * Org-scoping helpers for Prisma queries.
 *
 * Phase 2.2 migrates user-scoped Prisma reads/writes to org-scoped ones, but
 * with a backward-compat fallback for legacy rows that don't yet have an
 * orgId (orgId IS NULL). The fallback keeps users seeing their own old data
 * via userId so we never lock anyone out.
 *
 * Usage:
 *
 *   const { userId, orgId } = await requireOrgId();
 *   const agents = await prisma.agent.findMany({
 *     where: orgScopeFilter({ userId, orgId }),
 *   });
 *
 * For Update/Delete the existence check uses the same filter so a 404 is
 * returned when the resource exists but lives in another org. We never
 * surface a 403 — leaking existence is a multi-tenancy footgun.
 */

export type OrgScope = { userId: string; orgId: string };

/**
 * Returns a Prisma `where` fragment that matches:
 *   - rows in the active org (orgId === scope.orgId), OR
 *   - legacy rows belonging to the user that haven't been backfilled
 *     yet (orgId IS NULL && userId === scope.userId).
 *
 * Combine with an existing where via spread or `AND`:
 *
 *   where: { ...orgScopeFilter(scope), id: params.id }
 */
export function orgScopeFilter(
  scope: OrgScope
): { OR: [{ orgId: string }, { userId: string; orgId: null }] } {
  return {
    OR: [{ orgId: scope.orgId }, { userId: scope.userId, orgId: null }],
  };
}

/**
 * Variant for tables that don't carry a userId column (e.g. KnowledgeBase,
 * AgentChannel). They scope strictly by orgId — legacy rows with NULL orgId
 * are reachable only via their parent record's scope check.
 */
export function orgOnlyFilter(scope: OrgScope): { orgId: string } {
  return { orgId: scope.orgId };
}

/**
 * Result of the standard "load resource and verify caller can touch it" check.
 * Callers branch on `.found` to return 404 vs proceed.
 */
export type ResourceCheck<T> = { found: T } | { found: null };

/**
 * Convenience for the Update/Delete pattern:
 *
 *   const check = await assertOrgAccess(prisma.agent, params.id, scope);
 *   if (!check.found) return Response.json({ error: "Not found" }, { status: 404 });
 *   const agent = check.found;
 *
 * Returns the row when found in the caller's scope, otherwise null. Always
 * 404-shaped to avoid leaking the existence of out-of-scope resources.
 */
export async function assertOrgAccess<
  Model extends {
    findFirst: (args: {
      where: { id: string } & ReturnType<typeof orgScopeFilter>;
    }) => Promise<unknown>;
  }
>(
  model: Model,
  id: string,
  scope: OrgScope
): Promise<{ found: Awaited<ReturnType<Model["findFirst"]>> | null }> {
  const found = (await model.findFirst({
    where: { id, ...orgScopeFilter(scope) },
  })) as Awaited<ReturnType<Model["findFirst"]>> | null;
  return { found };
}
