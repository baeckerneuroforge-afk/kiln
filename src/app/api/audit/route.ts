import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { AuditLogger } from "@/lib/audit/audit-logger";
import { checkFeatureAccess } from "@/lib/feature-access";

// GET /api/audit — Audit-Events mit Filtern laden
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(userId, "auditTrail");
  if (!access.allowed) {
    return NextResponse.json({ error: access.upgradeMessage, events: [], total: 0 }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || undefined;
  const action = searchParams.get("action") || undefined;
  const resourceId = searchParams.get("resourceId") || undefined;
  const severity = searchParams.get("severity") || undefined;
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  const result = await AuditLogger.query({
    userId,
    category,
    action,
    resourceId,
    severity,
    from,
    to,
    limit,
    offset,
  });

  return NextResponse.json(result);
}
