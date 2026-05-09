import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import {
  completeExportRequest,
  createExportRequest,
  failExportRequest,
  gatherExportData,
  type DataExportScope,
  type DataExportFormat,
} from "@/lib/dsgvo/export-service";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

const SCOPE_VALUES = ["FULL", "CUSTOMERS_ONLY", "AGENTS_ONLY", "AUDIT_ONLY"];
const FORMAT_VALUES = ["JSON", "CSV", "BOTH"];

export async function GET() {
  try {
    const scope = await requireOrgId();
    const exports = await prisma.dataExportRequest.findMany({
      where: { orgId: scope.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return Response.json({
      exports: exports.map((row) => ({
        ...row,
        fileSizeBytes: row.fileSizeBytes ? row.fileSizeBytes.toString() : null,
      })),
    });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to list exports" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const exportScope: DataExportScope = SCOPE_VALUES.includes(body.scope) ? body.scope : "FULL";
    const format: DataExportFormat = FORMAT_VALUES.includes(body.format) ? body.format : "JSON";

    const requestRow = await createExportRequest({
      orgId: ctx.orgId,
      requestedByUserId: ctx.userId,
      scope: exportScope,
      format,
    });

    // Background gather: best-effort, doesn't block the response. Real
    // production deployments would offload this to Vercel Queues; for now
    // we run it on the same function with a fire-and-forget promise.
    void (async () => {
      try {
        await prisma.dataExportRequest.update({
          where: { id: requestRow.id },
          data: { status: "PROCESSING" },
        });
        const payload = await gatherExportData({ orgId: ctx.orgId, scope: exportScope });
        const json = JSON.stringify(payload);
        // Local fallback: store the payload in fileUrl as a data: URI when no
        // blob storage is configured. Production setups should swap this for
        // Vercel Blob or S3.
        const fileUrl = `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
        await completeExportRequest({
          exportId: requestRow.id,
          fileUrl,
          fileSizeBytes: Buffer.byteLength(json, "utf8"),
        });
      } catch (err) {
        await failExportRequest({
          exportId: requestRow.id,
          errorMessage: err instanceof Error ? err.message : "unknown",
        });
      }
    })();

    return Response.json(requestRow, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[dsgvo/export] failed", error);
    return Response.json({ error: "Export request failed" }, { status: 500 });
  }
}
