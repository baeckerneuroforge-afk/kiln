import { departmentScheduleTick } from "@/lib/departments/trigger-system";
import { verifyCronSecret } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await departmentScheduleTick();
  return Response.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    ...result,
  });
}
