/**
 * GET /api/sub-orgs/for-current-user
 *
 * Returns the sub-orgs the authenticated user has SubOrgMembership in,
 * with the cached display name + their role/permission-set. Used by
 * the ContextSwitcher in the sidebar (Sprint 19.7.2).
 */
import { auth } from "@clerk/nextjs/server";
import { getUserSubOrgs } from "@/lib/sub-org/get-user-sub-orgs";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const subOrgs = await getUserSubOrgs(userId);
  return Response.json({ subOrgs });
}
