import { processAllQueues } from "@/lib/execution-queue";
import {
  findStaleExecutions,
  canResumeExecution,
  markExecutionStale,
} from "@/lib/execution-persistence";
import { executeWorkflow } from "@/lib/services/workflow-runtime";
import { checkOpenTrackings } from "@/lib/sla/tracker";
import { dispatchSlaEscalation } from "@/lib/sla/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Master cron job: processes the team-execution queue, recovers stale runs,
 * and runs the daily SLA-tracking sweep.
 *
 * NOTE on SLA cadence: the Hobby plan currently allows two daily Vercel Cron
 * jobs total. We piggy-back the SLA sweep on the existing process-queue
 * cadence; sub-daily checks happen *inline* whenever an inbound webhook
 * lands (see `src/app/api/webhooks/department-*` routes). True real-time
 * SLA monitoring requires a Vercel Pro upgrade so we can run a dedicated
 * cron every 5-15 minutes.
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

    let slaResult = { inspected: 0, warnings: 0, breaches: 0 };
    try {
      slaResult = await checkOpenTrackings({ notify: dispatchSlaEscalation });
    } catch (err) {
      console.error("[cron/process-queue] SLA sweep failed", err);
    }

    return Response.json({
      ok: true,
      ...result,
      staleRecovered: recoveredCount,
      staleMarkedFailed: failedStaleCount,
      sla: slaResult,
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
