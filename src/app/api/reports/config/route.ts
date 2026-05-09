import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

const FREQUENCIES = ["MONTHLY", "WEEKLY", "NONE"];

export async function GET() {
  try {
    const scope = await requireOrgId();
    const config = await prisma.customerReportConfig.findUnique({ where: { orgId: scope.orgId } });
    return Response.json(config);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to load config" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const recipientEmails: string[] = Array.isArray(body.recipientEmails)
      ? body.recipientEmails.filter((value: unknown): value is string => typeof value === "string" && value.includes("@"))
      : [];
    const includeMetrics: string[] = Array.isArray(body.includeMetrics)
      ? body.includeMetrics.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const frequency = FREQUENCIES.includes(body.frequency) ? body.frequency : "MONTHLY";
    const sendDayOfMonth = typeof body.sendDayOfMonth === "number"
      ? Math.min(28, Math.max(1, Math.trunc(body.sendDayOfMonth)))
      : 1;
    const sendHour = typeof body.sendHour === "number" ? Math.min(23, Math.max(0, Math.trunc(body.sendHour))) : 8;
    const customMessage = typeof body.customMessage === "string" ? body.customMessage.slice(0, 4_000) : null;
    const isEnabled = body.isEnabled !== false;
    const sendOnEmpty = body.sendOnEmpty !== false;

    const config = await prisma.customerReportConfig.upsert({
      where: { orgId: scope.orgId },
      update: {
        frequency,
        recipientEmails,
        includeMetrics,
        sendDayOfMonth,
        sendHour,
        customMessage,
        isEnabled,
        sendOnEmpty,
      },
      create: {
        orgId: scope.orgId,
        frequency,
        recipientEmails,
        includeMetrics,
        sendDayOfMonth,
        sendHour,
        customMessage,
        isEnabled,
        sendOnEmpty,
      },
    });
    return Response.json(config);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[reports/config] save failed", error);
    return Response.json({ error: "Failed to save config" }, { status: 500 });
  }
}
