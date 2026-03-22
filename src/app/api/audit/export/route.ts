import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { AuditLogger } from "@/lib/audit/audit-logger";
import { checkFeatureAccess } from "@/lib/feature-access";

// GET /api/audit/export?format=csv|json — Audit-Events exportieren
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(userId, "auditTrail");
  if (!access.allowed) {
    return NextResponse.json({ error: access.upgradeMessage }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") || "json") as "json" | "csv";
  const category = searchParams.get("category") || undefined;
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

  const data = await AuditLogger.exportEvents(userId, format, { category, from, to });

  await AuditLogger.log({
    userId,
    category: "export",
    action: "audit.exported",
    details: { format, category },
  });

  const contentType = format === "csv" ? "text/csv" : "application/json";
  const filename = `kiln-audit-${new Date().toISOString().slice(0, 10)}.${format}`;

  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
