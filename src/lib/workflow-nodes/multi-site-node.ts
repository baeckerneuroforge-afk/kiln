/**
 * Multi-Site Workflow Node
 * Führt die gleiche Aufgabe auf mehreren Websites parallel aus.
 * Nutzt MultiSiteOrchestrator für die Ausführung.
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import { MultiSiteOrchestrator } from "@/lib/sandbox/multi-site-orchestrator";

/* ── Config ── */

export interface MultiSiteNodeConfig {
  urls: string[];
  taskPerSite: string;
  preset: "custom" | "price_comparison" | "content_monitoring" | "competitor_analysis";
  mergeStrategy: "compare_and_rank" | "aggregate" | "summarize";
  outputFormat: "table" | "json" | "csv" | "pdf";
  maxParallel: number;
  timeoutPerSite: number;
  productName?: string; // Für price_comparison Preset
}

/* ── Executor ── */

export async function executeMultiSite(
  config: Record<string, unknown>,
  context: ExpressionContext,
): Promise<ActionNodeResult> {
  const urls = ((config.urls as string[]) || []).map((u) => resolveExpression(u, context));
  const preset = String(config.preset || "custom");
  const agentId = String(config.agentId || context.agentId || "");
  const workflowRunId = context.workflowRunId as string | undefined;

  if (urls.length === 0) {
    return { contextDelta: {}, success: false, error: "No URLs configured for multi-site execution" };
  }

  if (urls.length > 20) {
    return { contextDelta: {}, success: false, error: "Maximum 20 URLs per multi-site execution" };
  }

  const orchestrator = new MultiSiteOrchestrator();

  try {
    // Preset oder Custom-Config verwenden
    let siteConfig;
    switch (preset) {
      case "price_comparison": {
        const productName = resolveExpression(String(config.productName || ""), context);
        siteConfig = orchestrator.priceComparison(agentId, productName, urls);
        break;
      }
      case "content_monitoring":
        siteConfig = orchestrator.contentMonitoring(agentId, urls);
        break;
      case "competitor_analysis":
        siteConfig = orchestrator.competitorAnalysis(agentId, urls);
        break;
      default:
        siteConfig = {
          agentId,
          urls,
          taskPerSite: resolveExpression(String(config.taskPerSite || ""), context),
          mergeStrategy: (config.mergeStrategy as "compare_and_rank" | "aggregate" | "summarize") || "aggregate",
          outputFormat: (config.outputFormat as "table" | "json" | "csv" | "pdf") || "json",
        };
    }

    // Überschreibbare Optionen
    siteConfig.maxParallel = Math.min(Math.max(Number(config.maxParallel) || 3, 1), 10);
    siteConfig.workflowRunId = workflowRunId;
    if (config.timeoutPerSite) {
      (siteConfig as unknown as Record<string, unknown>).timeoutPerSite = Number(config.timeoutPerSite) || 60;
    }

    const result = await orchestrator.orchestrate(siteConfig);

    const completedCount = result.results.filter((r) => r.status === "completed").length;
    const failedCount = result.results.filter((r) => r.status === "failed").length;

    return {
      contextDelta: {
        multiSiteResults: result.results,
        multiSiteMerged: result.mergedOutput,
        multiSiteArtifactUrl: result.artifactUrl || null,
        multiSiteExecutionId: result.executionId,
        multiSiteSummary: `${completedCount}/${urls.length} sites completed, ${failedCount} failed, ${Math.round(result.totalDurationMs / 1000)}s total`,
      },
      success: completedCount > 0,
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: `Multi-site execution failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
