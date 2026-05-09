import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { transitionDeadLetterStatus } from "@/lib/workflows/error-handling";
import { logAudit } from "@/lib/audit/logger";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

const VALID_ACTIONS = ["retry", "discard"] as const;
type Action = (typeof VALID_ACTIONS)[number];

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    if (!VALID_ACTIONS.includes(action as Action)) {
      return Response.json({ error: "action=retry|discard required" }, { status: 400 });
    }
    const item = await prisma.workflowDeadLetter.findFirst({
      where: { id: params.id, agentTeam: { orgId: scope.orgId } },
      select: { id: true, status: true, agentTeamId: true, nodeId: true },
    });
    if (!item) return Response.json({ error: "Not found" }, { status: 404 });
    if (item.status !== "OPEN") {
      return Response.json({ error: `Item already ${item.status}` }, { status: 409 });
    }
    const newStatus = action === "retry" ? "RETRIED" : "DISCARDED";
    const updated = await transitionDeadLetterStatus({ id: item.id, status: newStatus });
    await logAudit({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      actorOrgId: scope.orgId,
      action: action === "retry" ? "WORKFLOW_DEAD_LETTER_RETRIED" : "WORKFLOW_DEAD_LETTER_DISCARDED",
      resourceType: "WORKFLOW_DEAD_LETTER",
      resourceId: item.id,
      severity: "INFO",
      metadata: { teamId: item.agentTeamId, nodeId: item.nodeId },
    });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[workflows/dead-letter] action failed", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
}
