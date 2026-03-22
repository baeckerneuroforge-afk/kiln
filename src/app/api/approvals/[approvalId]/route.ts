import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ApprovalManager } from "@/lib/approvals/approval-manager";
import { AuditLogger } from "@/lib/audit/audit-logger";
import { NotificationRouter } from "@/lib/notifications/notification-router";

// GET /api/approvals/:id — Einzelnes Approval laden
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { approvalId } = await params;
  const { events } = await AuditLogger.query({
    userId,
    resourceId: approvalId,
    category: "approval",
    limit: 10,
  });

  return NextResponse.json({ events });
}

// POST /api/approvals/:id — Approval genehmigen oder ablehnen
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { approvalId } = await params;
  const body = await req.json();
  const { action, note, modifiedPayload } = body;

  if (!action || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  let result;
  if (action === "approve") {
    result = await ApprovalManager.approve(approvalId, userId, note, modifiedPayload);
    await AuditLogger.logApprovalEvent(userId, "approved", approvalId);
  } else {
    result = await ApprovalManager.reject(approvalId, userId, note);
    await AuditLogger.logApprovalEvent(userId, "rejected", approvalId, { note });
  }

  // Notification an den Agent-Besitzer
  await NotificationRouter.send({
    userId,
    eventType: "approval_request",
    title: `Approval ${action === "approve" ? "genehmigt" : "abgelehnt"}`,
    body: `Approval #${approvalId.slice(0, 8)} wurde ${action === "approve" ? "genehmigt" : "abgelehnt"}.`,
    url: "/dashboard/approvals",
  });

  return NextResponse.json({ result });
}
