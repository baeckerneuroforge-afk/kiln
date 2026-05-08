import { NextRequest } from "next/server";
import { handleWebhookTrigger } from "@/lib/departments/trigger-system";
import { asJsonRecord } from "@/lib/departments/json";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = asJsonRecord(await request.json().catch(() => ({})));
  const result = await handleWebhookTrigger({
    departmentId: params.id,
    secret: request.headers.get("x-kiln-webhook-secret"),
    payload,
  });

  if (!result.queued) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ status: "queued" });
}
