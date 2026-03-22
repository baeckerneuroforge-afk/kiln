import { prisma } from "@/lib/prisma";
import { NotificationRouter } from "@/lib/notifications/notification-router";

export interface ExecutionRecord {
  agentId: string;
  executionType: "chat" | "workflow" | "computer_use" | "scheduled";
  success: boolean;
  durationMs: number;
  creditsUsed?: number;
  errorType?: string;
  errorMessage?: string;
}

export interface AgentHealth {
  agentId: string;
  agentName: string;
  uptime: number; // 0-100
  avgResponseTime: number; // ms
  totalRuns: number;
  failureRate: number; // 0-100
  errorBreakdown: Record<string, number>;
  status: "healthy" | "warning" | "critical" | "inactive";
  lastError?: { type: string; message: string; at: string };
}

/**
 * AgentHealthMonitor — Echtzeit-Überwachung für Agent-Ausführungen.
 * Nicht-blockierend: Record wird async geloggt, verzögert nie die Response.
 */
export class AgentHealthMonitor {

  /**
   * Zeichnet eine Ausführung auf (non-blocking).
   * Sollte in einem fire-and-forget Pattern aufgerufen werden.
   */
  static async recordExecution(record: ExecutionRecord) {
    try {
      await prisma.agentHealthRecord.create({
        data: {
          agentId: record.agentId,
          executionType: record.executionType,
          success: record.success,
          durationMs: record.durationMs,
          creditsUsed: record.creditsUsed,
          errorType: record.errorType,
          errorMessage: record.errorMessage,
        },
      });

      // Alerts prüfen (non-blocking)
      this.checkHealthAlerts(record.agentId).catch(() => {});
    } catch {
      // Health Recording darf nie die Hauptlogik beeinflussen
    }
  }

  /**
   * Lädt den Health-Status eines einzelnen Agents.
   */
  static async getAgentHealth(agentId: string, days = 7): Promise<AgentHealth | null> {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true },
    });
    if (!agent) return null;

    const records = await prisma.agentHealthRecord.findMany({
      where: { agentId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });

    if (records.length === 0) {
      return {
        agentId,
        agentName: agent.name,
        uptime: 100,
        avgResponseTime: 0,
        totalRuns: 0,
        failureRate: 0,
        errorBreakdown: {},
        status: "inactive",
      };
    }

    const total = records.length;
    const successful = records.filter((r) => r.success).length;
    const uptime = (successful / total) * 100;
    const failureRate = 100 - uptime;
    const avgResponseTime = Math.round(
      records.reduce((sum, r) => sum + r.durationMs, 0) / total,
    );

    // Error-Breakdown
    const errorBreakdown: Record<string, number> = {};
    for (const r of records) {
      if (!r.success && r.errorType) {
        errorBreakdown[r.errorType] = (errorBreakdown[r.errorType] || 0) + 1;
      }
    }

    // Letzter Fehler
    const lastFailure = records.find((r) => !r.success);
    const lastError = lastFailure
      ? {
          type: lastFailure.errorType || "unknown",
          message: lastFailure.errorMessage || "",
          at: lastFailure.createdAt.toISOString(),
        }
      : undefined;

    // Status bestimmen
    let status: AgentHealth["status"] = "healthy";
    if (uptime < 80) status = "critical";
    else if (uptime < 95) status = "warning";

    return {
      agentId,
      agentName: agent.name,
      uptime: Math.round(uptime * 10) / 10,
      avgResponseTime,
      totalRuns: total,
      failureRate: Math.round(failureRate * 10) / 10,
      errorBreakdown,
      status,
      lastError,
    };
  }

  /**
   * Lädt die System-Health über alle Agents eines Users.
   */
  static async getSystemHealth(userId: string) {
    const agents = await prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    const healthResults: AgentHealth[] = [];
    for (const agent of agents) {
      const health = await this.getAgentHealth(agent.id);
      if (health) healthResults.push(health);
    }

    const healthy = healthResults.filter((h) => h.status === "healthy").length;
    const warning = healthResults.filter((h) => h.status === "warning").length;
    const critical = healthResults.filter((h) => h.status === "critical").length;
    const inactive = healthResults.filter((h) => h.status === "inactive").length;

    const activeAgents = healthResults.filter((h) => h.status !== "inactive");
    const overallUptime = activeAgents.length > 0
      ? Math.round(activeAgents.reduce((sum, a) => sum + a.uptime, 0) / activeAgents.length * 10) / 10
      : 100;

    // Unbestätigte Alerts
    const unacknowledgedAlerts = await prisma.agentHealthAlert.findMany({
      where: { userId, acknowledged: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return {
      totalAgents: agents.length,
      healthyAgents: healthy,
      warningAgents: warning,
      criticalAgents: critical,
      inactiveAgents: inactive,
      overallUptime,
      agents: healthResults,
      alerts: unacknowledgedAlerts,
    };
  }

  /**
   * Prüft Health-Alerts für einen Agent.
   * Wird automatisch nach jeder Ausführung aufgerufen.
   */
  static async checkHealthAlerts(agentId: string) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, userId: true, name: true },
    });
    if (!agent) return;

    // Letzte 10 Ausführungen prüfen
    const recentRecords = await prisma.agentHealthRecord.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (recentRecords.length < 3) return;

    // Prüfung 1: 3+ aufeinanderfolgende Fehler
    const lastThree = recentRecords.slice(0, 3);
    if (lastThree.every((r) => !r.success)) {
      await this.createAlert(
        agentId,
        agent.userId,
        "consecutive_failures",
        "critical",
        `Agent "${agent.name}" hat 3 aufeinanderfolgende Fehler. Letzte Fehlermeldung: ${lastThree[0].errorMessage || "Unbekannt"}`,
      );
    }

    // Prüfung 2: Uptime unter 80% (letzte 10 Runs)
    const successCount = recentRecords.filter((r) => r.success).length;
    const uptimeRate = (successCount / recentRecords.length) * 100;

    if (uptimeRate < 80 && recentRecords.length >= 5) {
      await this.createAlert(
        agentId,
        agent.userId,
        "low_uptime",
        "warning",
        `Agent "${agent.name}" hat nur ${Math.round(uptimeRate)}% Erfolgsrate in den letzten ${recentRecords.length} Ausführungen.`,
      );
    }
  }

  /**
   * Erstellt einen Health-Alert (nur wenn noch keiner für diesen Typ offen ist).
   */
  private static async createAlert(
    agentId: string,
    userId: string,
    alertType: string,
    severity: string,
    message: string,
  ) {
    // Prüfen ob schon ein unbestätigter Alert existiert
    const existing = await prisma.agentHealthAlert.findFirst({
      where: { agentId, alertType, acknowledged: false },
    });
    if (existing) return;

    await prisma.agentHealthAlert.create({
      data: { agentId, userId, alertType, severity, message },
    });

    // Benachrichtigung senden
    await NotificationRouter.send({
      userId,
      agentId,
      eventType: "error",
      title: severity === "critical" ? "Kritischer Agent-Fehler" : "Agent-Warnung",
      body: message,
      url: "/dashboard/health",
    }).catch(() => {});
  }

  /**
   * Bestätigt einen Alert.
   */
  static async acknowledgeAlert(alertId: string, userId: string) {
    return prisma.agentHealthAlert.updateMany({
      where: { id: alertId, userId },
      data: { acknowledged: true },
    });
  }

  /**
   * Bestätigt alle Alerts für einen User.
   */
  static async acknowledgeAllAlerts(userId: string) {
    return prisma.agentHealthAlert.updateMany({
      where: { userId, acknowledged: false },
      data: { acknowledged: true },
    });
  }

  /**
   * Lädt Performance-Trend (tägliche Aggregation).
   */
  static async getPerformanceTrend(agentId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);

    const records = await prisma.agentHealthRecord.findMany({
      where: { agentId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });

    // Nach Tag gruppieren
    const byDay = new Map<string, { total: number; success: number; totalMs: number }>();
    for (const r of records) {
      const day = r.createdAt.toISOString().slice(0, 10);
      const existing = byDay.get(day) || { total: 0, success: 0, totalMs: 0 };
      existing.total++;
      if (r.success) existing.success++;
      existing.totalMs += r.durationMs;
      byDay.set(day, existing);
    }

    return Array.from(byDay.entries()).map(([date, data]) => ({
      date,
      runs: data.total,
      uptime: Math.round((data.success / data.total) * 1000) / 10,
      avgResponseTime: Math.round(data.totalMs / data.total),
    }));
  }
}
