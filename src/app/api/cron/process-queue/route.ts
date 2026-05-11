import { processAllQueues } from "@/lib/execution-queue";
import {
  findStaleExecutions,
  canResumeExecution,
  markExecutionStale,
} from "@/lib/execution-persistence";
import { executeWorkflow } from "@/lib/services/workflow-runtime";
import { checkOpenTrackings } from "@/lib/sla/tracker";
import { dispatchSlaEscalation } from "@/lib/sla/notifications";
import { executeDeletion, findDueDeletions } from "@/lib/dsgvo/delete-service";
import { expireOldExports } from "@/lib/dsgvo/export-service";
import { runReportCron } from "@/lib/reporting/cron";
import { runPaymentGraceSweep } from "@/lib/billing/module-billing-webhooks";
import { prisma } from "@/lib/prisma";

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

    const dsgvoResult: { deletionsExecuted: number; exportsExpired: number; auditPruned: number } = {
      deletionsExecuted: 0,
      exportsExpired: 0,
      auditPruned: 0,
    };
    try {
      const due = await findDueDeletions();
      for (const deletion of due) {
        await executeDeletion({ deletionId: deletion.id }).catch((err) => {
          console.error("[cron/process-queue] deletion execution failed", err);
          return null;
        });
        dsgvoResult.deletionsExecuted += 1;
      }
      dsgvoResult.exportsExpired = await expireOldExports();
      // 7-year retention: prune audit log older than 7 years (HGB §257 territory).
      const cutoff = new Date(Date.now() - 7 * 365 * 24 * 3_600_000);
      const pruned = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      dsgvoResult.auditPruned = pruned.count;
    } catch (err) {
      console.error("[cron/process-queue] DSGVO sweep failed", err);
    }

    let reportingResult = {
      configsInspected: 0,
      reportsGenerated: 0,
      reportsSent: 0,
      failures: 0,
    };
    try {
      reportingResult = await runReportCron();
    } catch (err) {
      console.error("[cron/process-queue] reporting sweep failed", err);
    }

    let paymentGraceResult = {
      inspected: 0,
      disabledAgencies: 0,
      modulesDisabled: 0,
      errors: [] as string[],
    };
    try {
      paymentGraceResult = await runPaymentGraceSweep();
    } catch (err) {
      console.error("[cron/process-queue] payment-grace sweep failed", err);
    }

    return Response.json({
      ok: true,
      ...result,
      staleRecovered: recoveredCount,
      staleMarkedFailed: failedStaleCount,
      sla: slaResult,
      dsgvo: dsgvoResult,
      reporting: reportingResult,
      paymentGrace: paymentGraceResult,
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
