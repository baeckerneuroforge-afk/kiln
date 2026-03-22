import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";

export interface AuditEventInput {
  userId: string;
  category: "agent" | "workflow" | "mcp" | "approval" | "settings" | "portal" | "export";
  action: string;
  resourceId?: string;
  resourceType?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  severity?: "info" | "warning" | "critical";
}

/**
 * AuditLogger — Append-only Audit Trail für Compliance.
 * Events werden nur erstellt, nie editiert oder gelöscht.
 * Retention basiert auf Plan-Tier.
 */
export class AuditLogger {

  /**
   * Loggt ein Audit-Event (append-only).
   */
  static async log(event: AuditEventInput) {
    return prisma.auditEvent.create({
      data: {
        userId: event.userId,
        category: event.category,
        action: event.action,
        resourceId: event.resourceId,
        resourceType: event.resourceType,
        details: (event.details ?? undefined) as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        severity: event.severity || "info",
      },
    });
  }

  /**
   * Convenience-Methode für Agent-Events.
   */
  static async logAgentEvent(
    userId: string,
    action: string,
    agentId: string,
    details?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      category: "agent",
      action: `agent.${action}`,
      resourceId: agentId,
      resourceType: "Agent",
      details,
    });
  }

  /**
   * Convenience-Methode für Workflow-Events.
   */
  static async logWorkflowEvent(
    userId: string,
    action: string,
    workflowId: string,
    details?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      category: "workflow",
      action: `workflow.${action}`,
      resourceId: workflowId,
      resourceType: "Workflow",
      details,
    });
  }

  /**
   * Convenience-Methode für Approval-Events.
   */
  static async logApprovalEvent(
    userId: string,
    action: string,
    approvalId: string,
    details?: Record<string, unknown>,
  ) {
    return this.log({
      userId,
      category: "approval",
      action: `approval.${action}`,
      resourceId: approvalId,
      resourceType: "WorkflowApproval",
      details,
      severity: action === "rejected" ? "warning" : "info",
    });
  }

  /**
   * Lädt Audit-Events mit Filtern.
   */
  static async query(params: {
    userId: string;
    category?: string;
    action?: string;
    resourceId?: string;
    severity?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = { userId: params.userId };
    if (params.category) where.category = params.category;
    if (params.action) where.action = { contains: params.action };
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.severity) where.severity = params.severity;
    if (params.from || params.to) {
      where.createdAt = {
        ...(params.from ? { gte: params.from } : {}),
        ...(params.to ? { lte: params.to } : {}),
      };
    }

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: params.limit || 50,
        skip: params.offset || 0,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    return { events, total };
  }

  /**
   * Exportiert Events als JSON oder CSV.
   */
  static async exportEvents(
    userId: string,
    format: "json" | "csv",
    filters?: { category?: string; from?: Date; to?: Date },
  ): Promise<string> {
    const { events } = await this.query({
      userId,
      category: filters?.category,
      from: filters?.from,
      to: filters?.to,
      limit: 10000,
    });

    if (format === "json") {
      return JSON.stringify(events, null, 2);
    }

    // CSV-Export
    const headers = ["id", "category", "action", "resourceType", "resourceId", "severity", "createdAt", "details"];
    const rows = events.map((e) =>
      headers.map((h) => {
        const val = e[h as keyof typeof e];
        if (val instanceof Date) return val.toISOString();
        if (typeof val === "object" && val !== null) return JSON.stringify(val).replace(/"/g, '""');
        return String(val ?? "");
      }).join(",")
    );

    return [headers.join(","), ...rows].join("\n");
  }

  /**
   * Bereinigt alte Events basierend auf Plan-Retention.
   */
  static async cleanupExpiredEvents() {
    const users = await prisma.user.findMany({
      select: { id: true, plan: true },
    });

    let totalDeleted = 0;

    for (const user of users) {
      const planKey = (user.plan || "FREE") as PlanType;
      const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.FREE;
      const retentionDays = limits.auditRetentionDays;

      if (retentionDays <= 0) {
        // Kein Audit Trail — lösche alle Events
        const result = await prisma.auditEvent.deleteMany({
          where: { userId: user.id },
        });
        totalDeleted += result.count;
      } else if (retentionDays < 999999) {
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);
        const result = await prisma.auditEvent.deleteMany({
          where: { userId: user.id, createdAt: { lt: cutoff } },
        });
        totalDeleted += result.count;
      }
    }

    return totalDeleted;
  }

  /**
   * Zählt Events nach Kategorie (für Dashboard).
   */
  static async getEventCounts(userId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);

    const counts = await prisma.auditEvent.groupBy({
      by: ["category"],
      where: { userId, createdAt: { gte: since } },
      _count: { id: true },
    });

    return Object.fromEntries(counts.map((c) => [c.category, c._count.id]));
  }
}
