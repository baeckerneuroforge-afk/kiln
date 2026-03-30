/**
 * On-Demand File Generation API
 * Generates Excel, PDF, Word, or CSV from result data.
 * Returns the file directly as a blob response (no Supabase Storage needed).
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { generateFileBuffer, buildSmartFileName, extractTableFromMarkdown } from "@/lib/output/file-generator";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MIME_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    kind: "xlsx" | "pdf" | "docx" | "csv";
    /** Structured data rows (for xlsx/csv) */
    data?: Record<string, unknown>[];
    /** Markdown content (for pdf/docx) */
    markdown?: string;
    /** Original user query — used for smart file naming */
    topic?: string;
    /** Document title */
    title?: string;
  } | null;

  if (!body?.kind) {
    return Response.json({ error: "kind is required" }, { status: 400 });
  }

  const { kind, data, markdown, topic, title } = body;

  try {
    let buffer: Buffer;
    let fileName: string;

    if (kind === "xlsx" || kind === "csv") {
      let rows = data;
      if (!rows && markdown) {
        rows = extractTableFromMarkdown(markdown) ?? undefined;
      }
      if (!rows || rows.length === 0) {
        return Response.json({ error: "No tabular data available for spreadsheet generation" }, { status: 400 });
      }

      fileName = buildSmartFileName(topic || title || "Export", kind === "xlsx" ? "Tabelle" : "Daten", kind);
      buffer = await generateFileBuffer({
        kind,
        fileName,
        data: rows,
        title: title || topic,
        userId,
      });
    } else {
      if (!markdown) {
        return Response.json({ error: "No content available for document generation" }, { status: 400 });
      }

      fileName = buildSmartFileName(topic || title || "Document", kind === "pdf" ? "Report" : "Dokument", kind);
      buffer = await generateFileBuffer({
        kind,
        fileName,
        content: markdown,
        title: title || topic?.slice(0, 80) || "Report",
        userId,
      });
    }

    const mimeType = MIME_TYPES[kind] || "application/octet-stream";

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "File generation failed";
    console.error("[generate-file] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
