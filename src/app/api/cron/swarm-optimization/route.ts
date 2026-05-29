/**
 * Cron: Swarm Optimization
 * Wöchentlich: Aggregiert Swarm-Lerndaten, identifiziert Top-Konfigurationen,
 * bereinigt veraltete Low-Quality-Einträge.
 * Vercel Cron: Sonntag 4:00 UTC
 */

import { NextRequest } from "next/server";
import { runWeeklyOptimization, getSwarmAnalytics } from "@/lib/execution/swarm-learning";
import { verifyCronSecret } from "@/lib/api-auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWeeklyOptimization();
    const analytics = await getSwarmAnalytics();

    return Response.json({
      success: true,
      optimization: {
        totalRecords: result.processed,
        topConfigs: result.topConfigs,
        prunedRecords: result.pruned,
      },
      globalStats: analytics
        ? {
            totalExecutions: analytics.totalExecutions,
            avgQuality: analytics.averages.quality,
            avgCredits: analytics.averages.credits,
            qualityTrend: analytics.trend.qualityChangePercent,
          }
        : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/swarm-optimization] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Optimization failed" },
      { status: 500 },
    );
  }
}
