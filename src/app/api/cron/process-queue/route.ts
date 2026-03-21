import { processAllQueues } from "@/lib/execution-queue";
import {
  findStaleExecutions,
  canResumeExecution,
  markExecutionStale,
} from "@/lib/execution-persistence";
import { executeWorkflow } from "@/lib/services/workflow-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron job to process queued team executions + recover stale ones.
 * Runs every minute via Vercel Cron.
 */
export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processAllQueues();

    // Stale Executions erkennen und wiederherstellen
    let recoveredCount = 0;
    let failedStaleCount = 0;
    try {
      const staleExecutions = await findStaleExecutions(15);
      for (const stale of staleExecutions.slice(0, 5)) {
        const resumable = await canResumeExecution(stale.id);
        if (resumable) {
          // Resume im Hintergrund
          executeWorkflow({
            teamId: stale.teamId,
            userId: stale.userId,
            resumeExecutionId: stale.id,
          }).catch(() => {});
          recoveredCount++;
        } else {
          await markExecutionStale(stale.id);
          failedStaleCount++;
        }
      }
    } catch {
      // Stale-Recovery ist nicht kritisch
    }

    return Response.json({
      ok: true,
      ...result,
      staleRecovered: recoveredCount,
      staleMarkedFailed: failedStaleCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Queue processing cron failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 }
    );
  }
}
