import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ClientPortal } from "@/lib/portal/client-portal";
import { AuditLogger } from "@/lib/audit/audit-logger";

// GET /api/portal/:id — Portal-Details + Agents + Analytics
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ portalId: string }> },
) {
  const { portalId } = await params;

  // Zwei Auth-Modi: Clerk (Dashboard) oder Token (Client)
  const token = req.headers.get("x-portal-token");
  if (token) {
    // Token-basierte Auth
    const portal = await ClientPortal.authenticateByToken(token);
    if (!portal || portal.id !== portalId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const agents = await ClientPortal.getPortalAgents(portalId);
    const analytics = await ClientPortal.getPortalAnalytics(portalId);
    return NextResponse.json({ portal, agents, analytics });
  }

  // Clerk Auth (Agency-Besitzer)
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const portals = await ClientPortal.listByUser(userId);
  const portal = portals.find((p) => p.id === portalId);
  if (!portal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const agents = await ClientPortal.getPortalAgents(portalId);
  const analytics = await ClientPortal.getPortalAnalytics(portalId);
  return NextResponse.json({ portal, agents, analytics });
}

// PATCH /api/portal/:id — Portal aktualisieren
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ portalId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { portalId } = await params;
  const body = await req.json();

  const portal = await ClientPortal.update(portalId, userId, body);

  await AuditLogger.log({
    userId,
    category: "portal",
    action: "portal.updated",
    resourceId: portalId,
    resourceType: "ClientPortal",
  });

  return NextResponse.json({ portal });
}

// DELETE /api/portal/:id — Portal löschen
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ portalId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { portalId } = await params;
  await ClientPortal.remove(portalId, userId);

  await AuditLogger.log({
    userId,
    category: "portal",
    action: "portal.deleted",
    resourceId: portalId,
    resourceType: "ClientPortal",
    severity: "warning",
  });

  return NextResponse.json({ success: true });
}
