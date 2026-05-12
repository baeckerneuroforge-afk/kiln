/**
 * Sprint 19.7.4.1 — GET /api/orgs/hierarchy
 *
 * Hierarchical view of every Clerk org the caller is a member of,
 * joined with our OrgRelationship table so sub-orgs render under
 * their parent agency. Consumed by the SingleContextSwitcher.
 *
 * Cache-Control: 60s — switcher fetches once on mount, server-side
 * org-switch refreshes the cache key via cookies.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getUserOrgHierarchy } from "@/lib/org/get-user-org-hierarchy";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hierarchy = await getUserOrgHierarchy(userId, { clerk: clerkClient });
  return Response.json(hierarchy, {
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  });
}
