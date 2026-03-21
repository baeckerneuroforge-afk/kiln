/**
 * Execution Persistence
 * Checkpoint-System für Long-Running Workflow Executions.
 * Ermöglicht Pause/Resume, Crash-Recovery und Progress-Tracking.
 */

import { prisma } from "@/lib/prisma";
import { TeamExecutionStatus } from "@prisma/client";

/* ── Types ── */

export interface ExecutionCheckpoint {
  executionId: string;
  teamId: string;
  userId: string;
  /** Aktueller Kontext-Snapshot */
  context: Record<string, unknown>;
  /** Bereits ausgeführte Node-IDs */
  executedNodeIds: string[];
  /** Aktuelle Queue (Node-IDs die noch ausgeführt werden müssen) */
  pendingQueue: string[];
  /** Zähler */
  completedNodes: number;
  failedNodes: number;
  /** Zeitstempel des letzten Checkpoints */
  checkpointedAt: Date;
  /** Optionaler Grund für den Checkpoint */
  reason?: string;
}

export interface ExecutionResumeData {
  context: Record<string, unknown>;
  executedNodeIds: string[];
  pendingQueue: string[];
  completedNodes: number;
  failedNodes: number;
}

/* ── Checkpoint Save/Load ── */

/**
 * Speichert einen Checkpoint für eine laufende Execution.
 * Wird im executionContext-Feld der TeamExecution gespeichert.
 */
export async function saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
  const checkpointData = {
    _checkpoint: {
      executedNodeIds: checkpoint.executedNodeIds,
      pendingQueue: checkpoint.pendingQueue,
      completedNodes: checkpoint.completedNodes,
      failedNodes: checkpoint.failedNodes,
      checkpointedAt: checkpoint.checkpointedAt.toISOString(),
      reason: checkpoint.reason,
    },
    ...checkpoint.context,
  };

  await prisma.teamExecution.update({
    where: { id: checkpoint.executionId },
    data: {
      executionContext: JSON.parse(JSON.stringify(checkpointData)),
      completedTasks: checkpoint.completedNodes,
      failedTasks: checkpoint.failedNodes,
      status: TeamExecutionStatus.RUNNING,
    },
  });
}

/**
 * Lädt den letzten Checkpoint einer Execution.
 * Gibt null zurück wenn kein Checkpoint existiert.
 */
export async function loadCheckpoint(
  executionId: string
): Promise<ExecutionResumeData | null> {
  const execution = await prisma.teamExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution?.executionContext) return null;

  const ctx = JSON.parse(JSON.stringify(execution.executionContext)) as Record<string, unknown>;
  const cp = ctx._checkpoint as {
    executedNodeIds: string[];
    pendingQueue: string[];
    completedNodes: number;
    failedNodes: number;
  } | undefined;

  if (!cp) return null;

  // Entferne den Checkpoint-Marker aus dem Kontext
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _checkpoint: _unused, ...cleanContext } = ctx;

  return {
    context: cleanContext,
    executedNodeIds: cp.executedNodeIds || [],
    pendingQueue: cp.pendingQueue || [],
    completedNodes: cp.completedNodes || 0,
    failedNodes: cp.failedNodes || 0,
  };
}

/* ── Stale Execution Detection ── */

/**
 * Findet Executions die steckengeblieben sind (keine Updates seit X Minuten).
 */
export async function findStaleExecutions(
  staleMinutes = 15
): Promise<{ id: string; teamId: string; userId: string; startedAt: Date }[]> {
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);

  const stale = await prisma.teamExecution.findMany({
    where: {
      status: TeamExecutionStatus.RUNNING,
      startedAt: { lt: cutoff },
    },
    select: {
      id: true,
      teamId: true,
      userId: true,
      startedAt: true,
    },
    take: 50,
  });

  return stale.map((e) => ({
    id: e.id,
    teamId: e.teamId,
    userId: e.userId,
    startedAt: e.startedAt,
  }));
}

/**
 * Versucht eine steckengebliebene Execution fortzusetzen.
 * Gibt true zurück wenn ein Resume möglich ist.
 */
export async function canResumeExecution(executionId: string): Promise<boolean> {
  const checkpoint = await loadCheckpoint(executionId);
  return checkpoint !== null && checkpoint.pendingQueue.length > 0;
}

/**
 * Markiert eine Execution als fehlgeschlagen wenn kein Resume möglich ist.
 */
export async function markExecutionStale(executionId: string): Promise<void> {
  await prisma.teamExecution.update({
    where: { id: executionId },
    data: {
      status: TeamExecutionStatus.FAILED,
      completedAt: new Date(),
    },
  });
}

/* ── Progress Notification ── */

/**
 * Sendet eine Progress-Email bei langen Executions.
 */
export async function sendProgressEmail(
  executionId: string,
  userId: string,
  teamName: string,
  completedNodes: number,
  totalNodes: number,
  elapsedMs: number
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  // Lade User-Email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailNotifications: true },
  });

  if (!user?.email || !user.emailNotifications) return;

  const progress = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;
  const elapsedMin = Math.round(elapsedMs / 60000);

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "KILN AI <noreply@kiln.email>",
        to: [user.email],
        subject: `[KILN] Workflow "${teamName}" — ${progress}% abgeschlossen`,
        html: `
          <div style="font-family:DM Sans,sans-serif;max-width:520px;margin:0 auto;padding:32px">
            <h2 style="color:#F97316;margin:0 0 16px">Workflow Progress</h2>
            <p style="color:#a8a29e;margin:0 0 8px"><strong style="color:#fafaf9">${teamName}</strong></p>
            <div style="background:#1c1917;border-radius:8px;padding:16px;margin:16px 0">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="color:#a8a29e">Fortschritt</span>
                <span style="color:#F97316;font-weight:600">${progress}%</span>
              </div>
              <div style="background:#292524;border-radius:4px;height:8px;overflow:hidden">
                <div style="background:linear-gradient(90deg,#F97316,#DC2626);height:100%;width:${progress}%;border-radius:4px"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:12px;color:#78716c;font-size:13px">
                <span>${completedNodes}/${totalNodes} Nodes</span>
                <span>${elapsedMin} Min. vergangen</span>
              </div>
            </div>
            <p style="color:#78716c;font-size:12px;margin:24px 0 0">
              Execution ID: ${executionId}
            </p>
          </div>
        `,
      }),
    });
  } catch {
    // Nicht-kritisch
  }
}

/* ── Execution Time Limits ── */

const DEFAULT_MAX_EXECUTION_MS = 30 * 60 * 1000; // 30 Minuten

/**
 * Prüft ob eine Execution das Zeitlimit überschritten hat.
 */
export function isExecutionTimedOut(
  startedAt: Date,
  maxExecutionMs?: number
): boolean {
  const limit = maxExecutionMs || DEFAULT_MAX_EXECUTION_MS;
  return Date.now() - startedAt.getTime() > limit;
}

/**
 * Gibt die konfigurierbare maximale Ausführungszeit zurück.
 */
export function getMaxExecutionMs(teamConfig: unknown): number {
  if (!teamConfig || typeof teamConfig !== "object") return DEFAULT_MAX_EXECUTION_MS;
  const cfg = teamConfig as Record<string, unknown>;
  const maxMinutes = Number(cfg.maxExecutionMinutes);
  if (maxMinutes > 0 && maxMinutes <= 120) {
    return maxMinutes * 60 * 1000;
  }
  return DEFAULT_MAX_EXECUTION_MS;
}

/* ── Checkpoint Interval ── */

const DEFAULT_CHECKPOINT_INTERVAL = 3; // Alle 3 Nodes

/**
 * Bestimmt ob ein Checkpoint gespeichert werden soll.
 */
export function shouldCheckpoint(
  executedCount: number,
  interval?: number
): boolean {
  const every = interval || DEFAULT_CHECKPOINT_INTERVAL;
  return executedCount > 0 && executedCount % every === 0;
}
