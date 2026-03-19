import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdmin } from "@/lib/admin";
import {
  queryOrchestrationLogs,
  exportTrainingData,
  type OrchestrationEventType,
} from "@/lib/orchestration-logger";

/**
 * GET /api/admin/orchestration-logs
 * Query orchestration logs with filters.
 * ?format=training returns JSONL for fine-tuning.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isAdmin(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = req.nextUrl;
  const format = url.searchParams.get("format");
  const teamId = url.searchParams.get("teamId") || undefined;
  const executionId = url.searchParams.get("executionId") || undefined;
  const eventType = url.searchParams.get("eventType") as OrchestrationEventType | undefined;
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : undefined;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : undefined;
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  try {
    if (format === "training") {
      const jsonl = await exportTrainingData({ teamId, executionId, eventType, from, to });
      return new NextResponse(jsonl, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Content-Disposition": `attachment; filename="orchestration-training-${new Date().toISOString().split("T")[0]}.jsonl"`,
        },
      });
    }

    const { logs, total } = await queryOrchestrationLogs({
      teamId, executionId, eventType, from, to, limit, offset,
    });

    return NextResponse.json({ logs, total, limit, offset });
  } catch (err) {
    console.error("[Admin] Failed to query orchestration logs:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
