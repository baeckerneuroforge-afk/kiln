import { runDailyApprovalDigest } from "@/lib/departments/notifications/digest-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyApprovalDigest();
    return Response.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "digest_failed",
      },
      { status: 500 }
    );
  }
}
