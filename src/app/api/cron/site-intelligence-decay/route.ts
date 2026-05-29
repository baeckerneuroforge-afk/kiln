/**
 * Cron: Site Intelligence Decay
 * Wöchentlich: Confidence-Decay für veraltete Selektoren, Pruning von Low-Confidence-Records.
 * Vercel Cron: Sonntag 3:00 UTC
 */

import { NextRequest } from "next/server";
import { decayAndPrune, getIntelligenceStats } from "@/lib/browser/collective-learning";
import { verifyCronSecret } from "@/lib/api-auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await decayAndPrune();
    const stats = await getIntelligenceStats();

    return Response.json({
      success: true,
      decayed: result.decayed,
      pruned: result.pruned,
      stats: {
        totalRecords: stats.totalRecords,
        uniqueDomains: stats.uniqueDomains,
        avgConfidence: stats.avgConfidence,
      },
    });
  } catch (error) {
    console.error("[site-intelligence-decay] Cron failed:", error);
    return Response.json(
      { error: "Decay cron failed", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}
