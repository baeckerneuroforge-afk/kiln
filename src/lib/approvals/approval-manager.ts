import { prisma } from "@/lib/prisma";
import { WorkflowApprovalStatus } from "@prisma/client";
import crypto from "crypto";

export interface ApprovalRequest {
  agentId: string;
  userId: string;
  executionId?: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  actionSummary: string;
  approverEmail: string;
  autoApproveTimeoutMinutes?: number;
}

export interface ApprovalResult {
  id: string;
  status: WorkflowApprovalStatus;
  modifiedPayload?: Record<string, unknown>;
  respondedBy?: string;
  responseNote?: string;
}

/**
 * ApprovalManager — Human-in-the-Loop Genehmigungen für Agent-Aktionen.
 * Erstellt Approval-Requests, prüft Agent-Konfiguration,
 * und verarbeitet Genehmigungen/Ablehnungen.
 */
export class ApprovalManager {

  /**
   * Prüft ob eine Aktion Genehmigung braucht basierend auf Agent-Config.
   */
  static async needsApproval(agentId: string, actionType: string): Promise<boolean> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { approvalMode: true, approvalConfig: true },
    });

    if (!agent) return false;

    switch (agent.approvalMode) {
      case "none":
        return false;

      case "all_actions":
        return true;

      case "critical_only":
        return this.isCriticalAction(actionType);

      case "custom": {
        const config = agent.approvalConfig as Record<string, unknown> | null;
        const checklist = (config?.checklist as string[]) || [];
        return checklist.includes(actionType);
      }

      default:
        return false;
    }
  }

  /**
   * Erstellt einen neuen Approval-Request und gibt die ID zurück.
   */
  static async requestApproval(req: ApprovalRequest): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");

    // Auto-Approve-Timeout berechnen
    let autoApproveAt: Date | undefined;
    if (req.autoApproveTimeoutMinutes && req.autoApproveTimeoutMinutes > 0) {
      autoApproveAt = new Date(Date.now() + req.autoApproveTimeoutMinutes * 60_000);
    }

    // Expiry: 7 Tage
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);

    const approval = await prisma.workflowApproval.create({
      data: {
        agentId: req.agentId,
        userId: req.userId,
        executionId: req.executionId,
        actionType: req.actionType,
        actionPayload: req.actionPayload as unknown as import("@prisma/client").Prisma.InputJsonValue,
        actionSummary: req.actionSummary,
        approverEmail: req.approverEmail,
        token,
        autoApproveAt,
        expiresAt,
      },
    });

    return approval.id;
  }

  /**
   * Genehmigt einen Approval-Request.
   */
  static async approve(
    approvalId: string,
    respondedBy: string,
    note?: string,
    modifiedPayload?: Record<string, unknown>,
  ): Promise<ApprovalResult> {
    const approval = await prisma.workflowApproval.update({
      where: { id: approvalId },
      data: {
        status: "APPROVED",
        respondedBy,
        responseNote: note,
        modifiedPayload: (modifiedPayload ?? undefined) as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
        respondedAt: new Date(),
      },
    });

    return {
      id: approval.id,
      status: approval.status,
      modifiedPayload: modifiedPayload,
      respondedBy: approval.respondedBy ?? undefined,
      responseNote: approval.responseNote ?? undefined,
    };
  }

  /**
   * Lehnt einen Approval-Request ab.
   */
  static async reject(
    approvalId: string,
    respondedBy: string,
    note?: string,
  ): Promise<ApprovalResult> {
    const approval = await prisma.workflowApproval.update({
      where: { id: approvalId },
      data: {
        status: "REJECTED",
        respondedBy,
        responseNote: note,
        respondedAt: new Date(),
      },
    });

    return {
      id: approval.id,
      status: approval.status,
      respondedBy: approval.respondedBy ?? undefined,
      responseNote: approval.responseNote ?? undefined,
    };
  }

  /**
   * Genehmigt per Token (E-Mail-Link).
   */
  static async approveByToken(token: string): Promise<ApprovalResult | null> {
    const approval = await prisma.workflowApproval.findUnique({ where: { token } });
    if (!approval || approval.status !== "PENDING") return null;

    // Expiry prüfen
    if (approval.expiresAt && approval.expiresAt < new Date()) {
      await prisma.workflowApproval.update({
        where: { id: approval.id },
        data: { status: "EXPIRED", respondedAt: new Date() },
      });
      return null;
    }

    return this.approve(approval.id, "email");
  }

  /**
   * Lehnt per Token (E-Mail-Link) ab.
   */
  static async rejectByToken(token: string, note?: string): Promise<ApprovalResult | null> {
    const approval = await prisma.workflowApproval.findUnique({ where: { token } });
    if (!approval || approval.status !== "PENDING") return null;

    return this.reject(approval.id, "email", note);
  }

  /**
   * Verarbeitet abgelaufene Auto-Approve-Timeouts.
   */
  static async processAutoApprovals(): Promise<number> {
    const now = new Date();
    const expired = await prisma.workflowApproval.findMany({
      where: {
        status: "PENDING",
        autoApproveAt: { lte: now },
      },
    });

    for (const approval of expired) {
      await prisma.workflowApproval.update({
        where: { id: approval.id },
        data: {
          status: "AUTO_APPROVED",
          respondedBy: "auto",
          respondedAt: now,
        },
      });
    }

    return expired.length;
  }

  /**
   * Lädt alle offenen Approvals für einen User.
   */
  static async getPendingForUser(userId: string) {
    return prisma.workflowApproval.findMany({
      where: { userId, status: "PENDING" },
      include: { agent: { select: { name: true, slug: true } } },
      orderBy: { requestedAt: "desc" },
    });
  }

  /**
   * Lädt den Approval-Verlauf für einen Agent.
   */
  static async getHistoryForAgent(agentId: string, limit = 50) {
    return prisma.workflowApproval.findMany({
      where: { agentId },
      orderBy: { requestedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Bestimmt ob eine Aktion als "kritisch" gilt.
   */
  private static isCriticalAction(actionType: string): boolean {
    const criticalActions = [
      "send_email",
      "http_request",
      "fire_webhook",
      "send_slack",
      "a2a_call",
      "custom_code",
    ];
    return criticalActions.includes(actionType);
  }

  /**
   * Liest die Approval-Konfiguration eines Agents.
   */
  static async getAgentApprovalConfig(agentId: string) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { approvalMode: true, approvalConfig: true },
    });
    return {
      mode: agent?.approvalMode || "none",
      config: (agent?.approvalConfig as Record<string, unknown>) || {},
    };
  }

  /**
   * Aktualisiert die Approval-Konfiguration eines Agents.
   */
  static async updateAgentApprovalConfig(
    agentId: string,
    mode: string,
    config: Record<string, unknown>,
  ) {
    return prisma.agent.update({
      where: { id: agentId },
      data: {
        approvalMode: mode,
        approvalConfig: config as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  }
}
