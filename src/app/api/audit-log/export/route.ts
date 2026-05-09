import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const COLUMNS = [
  "createdAt",
  "severity",
  "action",
  "resourceType",
  "resourceId",
  "actorUserId",
  "actorType",
  "description",
  "ipAddress",
];

export async function GET(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const url = new URL(request.url);
    const since = url.searchParams.get("since");
    const where: Record<string, unknown> = { orgId: scope.orgId };
    if (since) where.createdAt = { gte: new Date(since) };

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(`${COLUMNS.join(",")}\n`));
        const pageSize = 500;
        let cursor: string | null = null;
        while (true) {
          const rows: Awaited<ReturnType<typeof prisma.auditLog.findMany>> = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: pageSize,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          if (rows.length === 0) break;
          for (const row of rows) {
            const line = COLUMNS.map((column) => csvEscape((row as unknown as Record<string, unknown>)[column])).join(",");
            controller.enqueue(new TextEncoder().encode(`${line}\n`));
          }
          cursor = rows[rows.length - 1]?.id ?? null;
          if (rows.length < pageSize) break;
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit-log-${scope.orgId}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[audit-log/export] failed", error);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}
