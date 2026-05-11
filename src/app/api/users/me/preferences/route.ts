import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isValidPreference, normalizePreference } from "@/lib/dashboard/view-resolver";
import { logAudit } from "@/lib/audit/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/me/preferences
 * Returns the current user's UI preferences (currently just
 * dashboardPreference). Used by the Settings page to populate the
 * dashboard-view toggle.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dashboardPreference: true },
  });
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    dashboardPreference: normalizePreference(user.dashboardPreference),
  });
}

/**
 * PATCH /api/users/me/preferences
 * Body: { dashboardPreference: 'auto' | 'onboarding' | 'operations' }
 * Updates the calling user's preference. Other preferences can be added
 * as additional optional fields in future without touching callers.
 */
export async function PATCH(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  // Whitelist exactly what the client can update — no spread, no mass-
  // assignment vulnerability.
  if (!("dashboardPreference" in body)) {
    return Response.json({ error: "No supported preferences in body" }, { status: 400 });
  }
  if (!isValidPreference(body.dashboardPreference)) {
    return Response.json(
      { error: "dashboardPreference must be 'auto' | 'onboarding' | 'operations'" },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { dashboardPreference: body.dashboardPreference },
    select: { dashboardPreference: true },
  });

  await logAudit({
    orgId: orgId ?? userId,
    actorUserId: userId,
    actorOrgId: orgId ?? null,
    action: "USER_PREFERENCE_UPDATED",
    resourceType: "USER",
    resourceId: userId,
    description: `dashboardPreference -> ${updated.dashboardPreference}`,
    severity: "INFO",
    metadata: { dashboardPreference: updated.dashboardPreference },
    request,
  });

  return Response.json(updated);
}
