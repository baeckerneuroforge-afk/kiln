import { runDailyApprovalDigest } from "@/lib/departments/notifications/digest-builder";
import { verifyCronSecret } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
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
