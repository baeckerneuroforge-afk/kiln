import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET: Execution Logs mit Filter, Suche und Export
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; execId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "json"; // json | csv
    const nodeType = url.searchParams.get("nodeType"); // filter by node type
    const status = url.searchParams.get("status"); // filter by status
    const search = url.searchParams.get("search"); // search in taskTitle, output, error
    const fromDate = url.searchParams.get("from"); // ISO date
    const toDate = url.searchParams.get("to"); // ISO date

    // Prüfe Zugriff
    const execution = await prisma.teamExecution.findFirst({
      where: { id: params.execId, teamId: params.id, userId },
      select: { id: true },
    });

    if (!execution) {
      return Response.json({ error: "Execution not found" }, { status: 404 });
    }

    // Build filter
    const where: Record<string, unknown> = {
      executionId: params.execId,
      teamId: params.id,
    };

    if (nodeType) {
      where.nodeType = nodeType;
    }
    if (status) {
      where.status = status;
    }
    if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {};
      if (fromDate) dateFilter.gte = new Date(fromDate);
      if (toDate) dateFilter.lte = new Date(toDate);
      where.startedAt = dateFilter;
    }

    const logs = await prisma.teamExecutionLog.findMany({
      where,
      orderBy: [{ startedAt: "asc" }, { taskIndex: "asc" }],
      select: {
        id: true,
        nodeId: true,
        nodeType: true,
        taskTitle: true,
        status: true,
        startedAt: true,
        completedAt: true,
        tokensIn: true,
        tokensOut: true,
        model: true,
        estimatedCost: true,
        output: true,
        error: true,
        input: true,
        structuredOutput: true,
      },
    });

    // Search filter (in-memory da Prisma kein Volltext auf diesen Feldern hat)
    let filtered = logs;
    if (search) {
      const lower = search.toLowerCase();
      filtered = logs.filter((log) => {
        const searchable = [
          log.taskTitle,
          log.nodeType,
          log.nodeId,
          log.output,
          log.error,
          log.model,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(lower);
      });
    }

    // Format: Berechne durationMs
    const enriched = filtered.map((log) => {
      const durationMs =
        log.startedAt && log.completedAt
          ? log.completedAt.getTime() - log.startedAt.getTime()
          : null;

      return {
        id: log.id,
        nodeId: log.nodeId,
        nodeType: log.nodeType,
        taskTitle: log.taskTitle,
        status: log.status,
        startedAt: log.startedAt?.toISOString() || null,
        completedAt: log.completedAt?.toISOString() || null,
        durationMs,
        tokensIn: log.tokensIn,
        tokensOut: log.tokensOut,
        model: log.model,
        estimatedCost: log.estimatedCost,
        output: log.output
          ? log.output.length > 2000
            ? log.output.slice(0, 2000) + "…"
            : log.output
          : null,
        error: log.error,
        input: log.input,
        structuredOutput: log.structuredOutput,
      };
    });

    if (format === "csv") {
      const headers = [
        "id",
        "nodeId",
        "nodeType",
        "taskTitle",
        "status",
        "startedAt",
        "completedAt",
        "durationMs",
        "tokensIn",
        "tokensOut",
        "model",
        "estimatedCost",
        "error",
      ];

      const csvRows = [
        headers.join(","),
        ...enriched.map((row) =>
          headers
            .map((h) => {
              const val = row[h as keyof typeof row];
              if (val === null || val === undefined) return "";
              const str = String(val);
              // CSV-escape
              return str.includes(",") || str.includes('"') || str.includes("\n")
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            })
            .join(",")
        ),
      ];

      return new Response(csvRows.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="execution-${params.execId}-logs.csv"`,
        },
      });
    }

    return Response.json({
      executionId: params.execId,
      total: enriched.length,
      logs: enriched,
    });
  } catch (err) {
    console.error("GET /api/teams/[id]/executions/[execId]/logs error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
