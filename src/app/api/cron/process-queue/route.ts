import { processAllQueues } from "@/lib/execution-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron job to process queued team executions.
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

    return Response.json({
      ok: true,
      ...result,
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
