import { NextResponse } from "next/server";
import { ClientPortal } from "@/lib/portal/client-portal";
import { checkFeatureAccess } from "@/lib/feature-access";
import { AuditLogger } from "@/lib/audit/audit-logger";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";

// GET /api/portal — Alle Portale der aktiven Org (mit Legacy-Fallback)
export async function GET() {
  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
  const { userId, orgId } = scope;

  const access = await checkFeatureAccess(userId, "clientPortal");
  if (!access.allowed) {
    return NextResponse.json({ error: access.upgradeMessage, portals: [] }, { status: 403 });
  }

  const portals = await ClientPortal.listByUser(userId, orgId);
  return NextResponse.json({ portals });
}

// POST /api/portal — Neues Portal erstellen
export async function POST(req: Request) {
  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
  const { userId, orgId } = scope;

  const access = await checkFeatureAccess(userId, "clientPortal");
  if (!access.allowed) {
    return NextResponse.json({ error: access.upgradeMessage }, { status: 403 });
  }

  const body = await req.json();
  const { name, clientEmail, clientName, agentIds, branding, permissions } = body;

  if (!name || !clientEmail || !agentIds?.length) {
    return NextResponse.json({ error: "Name, E-Mail und mindestens ein Agent erforderlich" }, { status: 400 });
  }

  const portal = await ClientPortal.create({
    userId,
    orgId,
    name,
    clientEmail,
    clientName,
    agentIds,
    branding,
    permissions,
  });

  await AuditLogger.log({
    userId,
    category: "portal",
    action: "portal.created",
    resourceId: portal.id,
    resourceType: "ClientPortal",
    details: { name, clientEmail, agentCount: agentIds.length },
  });

  return NextResponse.json({ portal });
}
