import { departmentScheduleTick } from "@/lib/departments/trigger-system";

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

  const result = await departmentScheduleTick();
  return Response.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    ...result,
  });
}
