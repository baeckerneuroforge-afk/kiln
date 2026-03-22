import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ApprovalManager } from "@/lib/approvals/approval-manager";
import { AuditLogger } from "@/lib/audit/audit-logger";

// GET /api/approvals — Offene Approvals für den User laden
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const approvals = await ApprovalManager.getPendingForUser(userId);
  return NextResponse.json({ approvals });
}

// POST /api/approvals — Neuen Approval-Request erstellen (intern)
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { agentId, executionId, actionType, actionPayload, actionSummary, approverEmail, autoApproveTimeoutMinutes } = body;

  if (!agentId || !actionType || !actionSummary) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const approvalId = await ApprovalManager.requestApproval({
    agentId,
    userId,
    executionId,
    actionType,
    actionPayload: actionPayload || {},
    actionSummary,
    approverEmail: approverEmail || "",
    autoApproveTimeoutMinutes,
  });

  await AuditLogger.logApprovalEvent(userId, "requested", approvalId, { actionType, agentId });

  return NextResponse.json({ approvalId });
}
