/**
 * GET /api/email-branding/resolve
 *
 * Returns the merged email branding for the active org. If a `subOrgId`
 * query parameter is supplied, that sub-org's override is layered on top.
 * Used by the preview UI and by integration tests.
 */
import { auth } from "@clerk/nextjs/server";
import { resolveEmailBranding } from "@/lib/email/branding-resolver";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const subOrgId = url.searchParams.get("subOrgId");

  const branding = await resolveEmailBranding({
    orgId: orgId ?? null,
    subOrgId,
  });

  return Response.json(branding);
}
