/**
 * On-Demand File Generation API
 * Generates Excel, PDF, Word, or CSV from result data.
 * Called when user clicks "Create Excel" / "Create PDF" buttons.
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { generateFile, buildSmartFileName, extractTableFromMarkdown } from "@/lib/output/file-generator";
import type { QuickUseGeneratedFile } from "@/lib/quick-use/types";

export const dynamic = "force-dynamic";

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
    let file: QuickUseGeneratedFile;

    if (kind === "xlsx" || kind === "csv") {
      // For spreadsheets: use provided data or extract from markdown
      let rows = data;
      if (!rows && markdown) {
        rows = extractTableFromMarkdown(markdown) ?? undefined;
      }
      if (!rows || rows.length === 0) {
        return Response.json({ error: "No tabular data available for spreadsheet generation" }, { status: 400 });
      }

      file = await generateFile({
        kind,
        fileName: buildSmartFileName(topic || title || "Export", kind === "xlsx" ? "Tabelle" : "Daten", kind),
        data: rows,
        title: title || topic,
        userId,
      });
    } else {
      // For documents: use markdown content
      if (!markdown) {
        return Response.json({ error: "No content available for document generation" }, { status: 400 });
      }

      file = await generateFile({
        kind,
        fileName: buildSmartFileName(topic || title || "Document", kind === "pdf" ? "Report" : "Dokument", kind),
        content: markdown,
        title: title || topic?.slice(0, 80) || "Report",
        userId,
      });
    }

    return Response.json({ file });
  } catch (error) {
    const message = error instanceof Error ? error.message : "File generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
