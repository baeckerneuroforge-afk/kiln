/**
 * Diff Detection Workflow Node
 * Überwacht Websites auf Änderungen und gibt erkannte Differenzen weiter.
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import { DiffDetector } from "@/lib/sandbox/diff-detector";

/* ── Config ── */

export interface DiffDetectionConfig {
  urls: string[];
  sensitivity: "all_changes" | "important_only" | "price_changes_only";
  compareWith: "previous" | "baseline";
  continueIfNoChanges: boolean;
  agentId: string;
}

/* ── Executor ── */

export async function executeDiffDetection(
  config: Record<string, unknown>,
  context: ExpressionContext,
): Promise<ActionNodeResult> {
  const urls = (config.urls as string[]) || [];
  const resolvedUrls = urls.map((u) => resolveExpression(u, context));
  const sensitivity = String(config.sensitivity || "important_only");
  const continueIfNoChanges = config.continueIfNoChanges !== false;
  const agentId = String(config.agentId || context.agentId || "");

  if (resolvedUrls.length === 0) {
    return { contextDelta: {}, success: false, error: "No URLs configured for diff detection" };
  }

  if (!agentId) {
    return { contextDelta: {}, success: false, error: "Agent ID required for diff detection" };
  }

  const detector = new DiffDetector();
  const allResults: Record<string, unknown>[] = [];
  let totalChanges = 0;

  try {
    for (const url of resolvedUrls) {
      // Snapshot nehmen
      const current = await detector.captureSnapshot(url, agentId);

      // Vorherigen Snapshot suchen (via DB)
      const { prisma } = await import("@/lib/prisma");
      const previousRecord = await prisma.diffSnapshot.findFirst({
        where: {
          agentId,
          url,
          id: { not: current.id },
        },
        orderBy: { capturedAt: "desc" },
      });

      if (!previousRecord) {
        allResults.push({
          url,
          hasChanges: false,
          changes: [],
          summary: "First snapshot — no comparison available yet.",
        });
        continue;
      }

      // Vorherigen Snapshot rekonstruieren
      const previous = {
        id: previousRecord.id,
        agentId: previousRecord.agentId,
        url: previousRecord.url,
        screenshotUrl: previousRecord.screenshotUrl,
        screenshotBase64: null,
        htmlContentHash: previousRecord.htmlContentHash,
        htmlContent: "",
        capturedAt: previousRecord.capturedAt,
      };

      const result = await detector.detectChanges(current, previous, sensitivity);
      totalChanges += result.changes.length;

      allResults.push({
        url,
        hasChanges: result.hasChanges,
        changes: result.changes,
        summary: result.summary,
        screenshotBefore: previousRecord.screenshotUrl,
        screenshotAfter: current.screenshotUrl,
      });
    }

    // Wenn keine Änderungen und continueIfNoChanges=false: als fehlgeschlagen markieren (stoppt downstream)
    if (totalChanges === 0 && !continueIfNoChanges) {
      return {
        contextDelta: { diffResults: allResults, diffChangesCount: 0 },
        success: false,
        error: "No changes detected — skipping downstream nodes",
      };
    }

    return {
      contextDelta: {
        diffResults: allResults,
        diffChangesCount: totalChanges,
        diffSummary: allResults
          .filter((r) => r.hasChanges)
          .map((r) => r.summary)
          .join(" | "),
      },
      success: true,
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: `Diff detection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
