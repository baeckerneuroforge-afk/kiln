/**
 * Execution Queue
 * Verwaltet Long-Running Executions über mehrere Serverless-Invocations hinweg.
 * Erstellt eine Kette von kurzen Funktionsaufrufen für lange Tasks.
 */

import { prisma } from "@/lib/prisma";
import { TeamExecutionStatus } from "@prisma/client";
import { saveCheckpoint, loadCheckpoint } from "@/lib/execution-persistence";

/* ── Types ── */

export interface ExecutionQueueConfig {
  executionId: string;
  teamId: string;
  userId: string;
  /** Max Dauer pro Segment in ms (80% des Serverless-Timeouts) */
  segmentTimeoutMs?: number;
  /** Checkpoint-ID für Resume */
  checkpointId?: string;
  /** Aktuelles Segment (1-basiert) */
  currentSegment?: number;
  /** Max. Anzahl Segmente (verhindert Endlosschleifen) */
  maxSegments?: number;
}

export interface SegmentResult {
  status: "completed" | "continued" | "failed" | "max_segments_reached";
  executionId: string;
  segment: number;
  estimatedTotalSegments?: number;
  checkpointId?: string;
  error?: string;
}

/* ── Constants ── */

/** 80% von 300s Vercel Pro Timeout = 240s */
const DEFAULT_SEGMENT_TIMEOUT_MS = 240_000;
const DEFAULT_MAX_SEGMENTS = 50;

/* ── Execution Queue ── */

export class ExecutionQueue {
  private startTime: number = 0;
  private segmentTimeoutMs: number;
  private maxSegments: number;

  constructor(config?: { segmentTimeoutMs?: number; maxSegments?: number }) {
    this.segmentTimeoutMs = config?.segmentTimeoutMs || DEFAULT_SEGMENT_TIMEOUT_MS;
    this.maxSegments = config?.maxSegments || DEFAULT_MAX_SEGMENTS;
  }

  /**
   * Startet oder setzt eine Execution fort.
   * Gibt true zurück wenn die Execution innerhalb des Zeitlimits bleibt.
   */
  startSegmentTimer(): void {
    this.startTime = Date.now();
  }

  /**
   * Prüft ob das aktuelle Segment bald das Zeitlimit erreicht.
   * Sollte VOR jeder teuren Operation aufgerufen werden.
   */
  shouldYield(): boolean {
    if (!this.startTime) return false;
    const elapsed = Date.now() - this.startTime;
    return elapsed >= this.segmentTimeoutMs;
  }

  /**
   * Gibt die verbleibende Zeit im aktuellen Segment zurück (ms).
   */
  remainingMs(): number {
    if (!this.startTime) return this.segmentTimeoutMs;
    return Math.max(0, this.segmentTimeoutMs - (Date.now() - this.startTime));
  }

  /**
   * Speichert den aktuellen State und plant die Fortsetzung.
   * Wird aufgerufen wenn shouldYield() true zurückgibt.
   */
  async yieldExecution(config: {
    executionId: string;
    teamId: string;
    userId: string;
    currentSegment: number;
    context: Record<string, unknown>;
    executedNodeIds: string[];
    pendingQueue: string[];
    completedNodes: number;
    failedNodes: number;
  }): Promise<SegmentResult> {
    const { executionId, teamId, userId, currentSegment, ...state } = config;

    if (currentSegment >= this.maxSegments) {
      console.warn(
        `[ExecutionQueue] Max Segmente (${this.maxSegments}) erreicht für ${executionId}`
      );
      return {
        status: "max_segments_reached",
        executionId,
        segment: currentSegment,
        error: `Max. ${this.maxSegments} Segmente erreicht`,
      };
    }

    // Checkpoint speichern
    await saveCheckpoint({
      executionId,
      teamId,
      userId,
      context: {
        ...state.context,
        _queueMeta: {
          segment: currentSegment,
          yieldedAt: new Date().toISOString(),
          reason: "segment_timeout",
        },
      },
      executedNodeIds: state.executedNodeIds,
      pendingQueue: state.pendingQueue,
      completedNodes: state.completedNodes,
      failedNodes: state.failedNodes,
      checkpointedAt: new Date(),
      reason: `Segment ${currentSegment} Timeout — wird fortgesetzt`,
    });

    // Status aktualisieren
    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: TeamExecutionStatus.RUNNING,
        executionContext: {
          _resumeSegment: currentSegment + 1,
          _totalSegments: currentSegment,
        },
      },
    });

    // Continuation per internem API-Aufruf planen
    await this.scheduleResume(executionId, currentSegment + 1);

    return {
      status: "continued",
      executionId,
      segment: currentSegment,
      estimatedTotalSegments: undefined,
      checkpointId: executionId,
    };
  }

  /**
   * Lädt den State für ein neues Segment.
   */
  async loadSegmentState(executionId: string): Promise<{
    context: Record<string, unknown>;
    executedNodeIds: string[];
    pendingQueue: string[];
    completedNodes: number;
    failedNodes: number;
    segment: number;
  } | null> {
    const checkpoint = await loadCheckpoint(executionId);
    if (!checkpoint) return null;

    const meta = checkpoint.context._queueMeta as
      | { segment: number }
      | undefined;

    return {
      context: checkpoint.context,
      executedNodeIds: checkpoint.executedNodeIds,
      pendingQueue: checkpoint.pendingQueue,
      completedNodes: checkpoint.completedNodes,
      failedNodes: checkpoint.failedNodes,
      segment: (meta?.segment || 0) + 1,
    };
  }

  /**
   * Plant die Fortsetzung einer Execution per internem API-Aufruf.
   */
  private async scheduleResume(
    executionId: string,
    nextSegment: number
  ): Promise<void> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (!baseUrl) {
      console.error("[ExecutionQueue] Keine Base-URL für Resume-Aufruf");
      return;
    }

    const url = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/workflows/resume`;

    try {
      // Fire-and-forget: löst nächstes Segment aus
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Internes Auth-Token um Zugriff zu verifizieren
          "x-internal-token": process.env.INTERNAL_API_TOKEN || "",
        },
        body: JSON.stringify({
          executionId,
          segment: nextSegment,
        }),
      }).catch(() => {
        // Non-critical: der stale-detection cronjob wird es auch aufgreifen
      });
    } catch {
      console.warn("[ExecutionQueue] Resume-Aufruf fehlgeschlagen, wird per Cron aufgegriffen");
    }
  }
}

/**
 * Factory für eine neue ExecutionQueue mit Standard-Konfiguration.
 */
export function createExecutionQueue(): ExecutionQueue {
  const timeout = process.env.VERCEL_FUNCTION_TIMEOUT
    ? Math.floor(parseInt(process.env.VERCEL_FUNCTION_TIMEOUT, 10) * 0.8 * 1000)
    : DEFAULT_SEGMENT_TIMEOUT_MS;

  return new ExecutionQueue({ segmentTimeoutMs: timeout });
}
