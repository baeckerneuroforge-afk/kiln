import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { trackUserSignal } from "@/lib/execution/swarm-learning";

export const dynamic = "force-dynamic";

/**
 * POST /api/quick-use/swarm-signal
 * User-Feedback (Daumen hoch/runter) für eine Swarm-Ausführung speichern.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    intelligenceId?: string;
    signal?: number;
  } | null;

  const intelligenceId = body?.intelligenceId;
  const signal = body?.signal;

  if (!intelligenceId || (signal !== 1 && signal !== -1)) {
    return Response.json(
      { error: "intelligenceId and signal (1 or -1) are required" },
      { status: 400 },
    );
  }

  await trackUserSignal(intelligenceId, signal);

  return Response.json({ success: true });
}
