import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import {
  getSwarmAnalytics,
  getPromptEffectiveness,
  getToolCorrelations,
} from "@/lib/execution/swarm-learning";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/swarm-intelligence
 * Swarm Learning Dashboard-Daten.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const taskType = request.nextUrl.searchParams.get("taskType") || undefined;

  const [analytics, promptStats, toolStats] = await Promise.all([
    getSwarmAnalytics(userId),
    taskType ? getPromptEffectiveness(taskType) : Promise.resolve([]),
    taskType ? getToolCorrelations(taskType) : Promise.resolve([]),
  ]);

  if (!analytics) {
    return Response.json({ error: "Failed to load analytics" }, { status: 500 });
  }

  return Response.json({
    ...analytics,
    promptEffectiveness: promptStats,
    toolCorrelations: toolStats,
  });
}
