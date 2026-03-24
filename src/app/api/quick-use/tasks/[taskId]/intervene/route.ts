import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { addIntervention } from "@/lib/quick-use/background-executor";
import type { InterventionType, QuickUseIntervention } from "@/lib/quick-use/types";

export const dynamic = "force-dynamic";

const VALID_TYPES: InterventionType[] = ["redirect", "add_context", "pause", "resume", "cancel"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const body = await request.json().catch(() => null) as {
    type?: InterventionType;
    message?: string;
  } | null;

  const interventionType = body?.type || "add_context";
  if (!VALID_TYPES.includes(interventionType)) {
    return Response.json({ error: "Invalid intervention type" }, { status: 400 });
  }

  const message = body?.message?.trim() || "";
  if (!message && interventionType !== "pause" && interventionType !== "resume" && interventionType !== "cancel") {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const intervention: QuickUseIntervention = {
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: interventionType,
    message,
    timestamp: new Date().toISOString(),
  };

  const result = await addIntervention(taskId, userId, intervention);

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 429 });
  }

  return Response.json({ success: true, interventionId: intervention.id });
}
