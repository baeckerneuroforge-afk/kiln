/**
 * File Generator — Erzeugt Excel, PDF, Word und CSV-Dateien.
 *
 * Strategie: Lokale Node.js-Generierung (ExcelJS, PDFKit) als Standard.
 * E2B-Sandbox nur wenn explizit angefordert (z.B. für Python-Code-Execution).
 * Ergebnis wird in Supabase Storage gespeichert (7 Tage TTL).
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import type { QuickUseGeneratedFile } from "@/lib/quick-use/types";

const OUTPUT_BUCKET = "agent-artifacts";
const SIGNED_URL_TTL = 7 * 24 * 60 * 60; // 7 days

export interface FileGenerationRequest {
  kind: "xlsx" | "pdf" | "docx" | "csv";
  fileName: string;
  /** Structured data for spreadsheets/tables */
  data?: Record<string, unknown>[] | Record<string, Record<string, unknown>[]>;
  /** Text/markdown content for documents */
  content?: string;
  /** Document title */
  title?: string;
  /** User ID for storage path */
  userId: string;
}

/**
 * Generates a file and uploads it to Supabase Storage.
 * Uses local Node.js libraries — no sandbox needed.
 */
export async function generateFile(
  request: FileGenerationRequest
): Promise<QuickUseGeneratedFile> {
  switch (request.kind) {
    case "csv":
      return generateCsv(request);
    case "xlsx":
      return generateExcelLocal(request);
    case "pdf":
      return generatePdfLocal(request);
    case "docx":
      return generateDocxLocal(request);
    default:
      throw new Error(`Nicht unterstützter Dateityp: ${request.kind}`);
  }
}

/**
 * Generates a file and returns the raw Buffer (no Supabase upload).
 * Used by the generate-file API to return files as blob responses.
 */
export async function generateFileBuffer(
  request: FileGenerationRequest
): Promise<Buffer> {
  switch (request.kind) {
    case "csv":
      return generateCsvBuffer(request);
    case "xlsx":
      return generateExcelBuffer(request);
    case "pdf":
      return generatePdfBuffer(request);
    case "docx":
      return generateDocxBuffer(request);
    default:
      throw new Error(`Nicht unterstützter Dateityp: ${request.kind}`);
  }
}

/* ── Smart File Naming ── */

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "shall", "can", "need", "must", "der", "die", "das", "und",
  "oder", "aber", "in", "auf", "an", "zu", "für", "von", "mit", "bei", "aus",
  "ist", "sind", "war", "hat", "ein", "eine", "einen", "einem", "einer",
  "compare", "find", "search", "get", "show", "list", "what", "how", "which",
  "vergleiche", "finde", "suche", "zeige", "was", "wie", "welche",
]);

/**
 * Builds a meaningful file name from the user's topic/message.
 * Pattern: Topic-Type-YYYY-MM-DD.ext
 */
export function buildSmartFileName(
  topic: string,
  fileType: string,
  ext: string,
): string {
  const words = topic
    .replace(/https?:\/\/\S+/g, "") // strip URLs
    .replace(/[^a-zA-ZäöüÄÖÜß0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 4);

  const topicSlug = words.length > 0
    ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("-")
    : "KILN-Output";

  const date = new Date().toISOString().slice(0, 10);
  return `${topicSlug}-${fileType}-${date}.${ext}`;
}

/* ── CSV (no dependencies) ── */

async function generateCsv(req: FileGenerationRequest): Promise<QuickUseGeneratedFile> {
  const rows = Array.isArray(req.data) ? req.data : [];
  if (rows.length === 0) {
    throw new Error("Keine Daten für CSV-Generierung vorhanden");
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCsvField(String(row[h] ?? ""))).join(",")
    ),
  ];
  const csvContent = csvLines.join("\n");
  const buffer = Buffer.from(csvContent, "utf-8");

  return uploadGeneratedFile(buffer, req.fileName || "output.csv", "text/csv", "csv", req.userId);
}

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/* ── Excel (local — ExcelJS) ── */

async function generateExcelLocal(req: FileGenerationRequest): Promise<QuickUseGeneratedFile> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();
  const fileName = req.fileName || "output.xlsx";

  // Handle dict of sheets or single array
  const sheetsData: Record<string, Record<string, unknown>[]> =
    Array.isArray(req.data)
      ? { Data: req.data }
      : (req.data as Record<string, Record<string, unknown>[]>) || { Data: [] };

  for (const [sheetName, rows] of Object.entries(sheetsData)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const sheet = workbook.addWorksheet(sheetName);
    const headers = Object.keys(rows[0]);

    // Define columns
    sheet.columns = headers.map((h) => ({
      header: h,
      key: h,
      width: Math.min(
        Math.max(
          h.length + 2,
          ...rows.slice(0, 100).map((r) => String(r[h] ?? "").length),
          10,
        ) + 2,
        50,
      ),
    }));

    // Style header row — KILN orange
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF97316" },
    };
    headerRow.alignment = { horizontal: "center" };

    // Add data rows (max 2000)
    for (const row of rows.slice(0, 2000)) {
      const values: Record<string, unknown> = {};
      for (const h of headers) {
        values[h] = row[h] ?? "";
      }
      sheet.addRow(values);
    }

    // Freeze header
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return uploadGeneratedFile(
    buffer, fileName,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx", req.userId,
  );
}

/* ── PDF (local — PDFKit) ── */

async function generatePdfLocal(req: FileGenerationRequest): Promise<QuickUseGeneratedFile> {
  const PDFDocument = (await import("pdfkit")).default;
  const fileName = req.fileName || "output.pdf";
  const title = req.title || "Report";
  const content = req.content || "";

  return new Promise<QuickUseGeneratedFile>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: title,
        Creator: "KILN",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const result = await uploadGeneratedFile(buffer, fileName, "application/pdf", "pdf", req.userId);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    doc.on("error", reject);

    // Title — KILN Orange
    doc.fontSize(24).fillColor("#F97316").text(title, { align: "left" });
    doc.moveDown(0.5);

    // Thin orange line under title
    doc.strokeColor("#F97316").lineWidth(1)
      .moveTo(72, doc.y).lineTo(523, doc.y).stroke();
    doc.moveDown(1);

    // Reset to body color
    doc.fillColor("#1a1613");

    // Parse markdown-like content
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        doc.moveDown(0.3);
        continue;
      }

      if (trimmed.startsWith("### ")) {
        doc.moveDown(0.5);
        doc.fontSize(13).font("Helvetica-Bold").text(trimmed.slice(4));
        doc.moveDown(0.2);
        doc.font("Helvetica");
      } else if (trimmed.startsWith("## ")) {
        doc.moveDown(0.8);
        doc.fontSize(15).font("Helvetica-Bold").fillColor("#F97316").text(trimmed.slice(3));
        doc.fillColor("#1a1613");
        doc.moveDown(0.3);
        doc.font("Helvetica");
      } else if (trimmed.startsWith("# ")) {
        doc.moveDown(0.8);
        doc.fontSize(18).font("Helvetica-Bold").text(trimmed.slice(2));
        doc.moveDown(0.3);
        doc.font("Helvetica");
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        doc.fontSize(11).font("Helvetica").text(`  •  ${trimmed.slice(2)}`, { lineGap: 3 });
      } else if (trimmed.startsWith("> ")) {
        doc.fontSize(11).font("Helvetica-Oblique").fillColor("#666666")
          .text(trimmed.slice(2), { indent: 20 });
        doc.fillColor("#1a1613").font("Helvetica");
      } else if (/^\|/.test(trimmed)) {
        // Markdown table row — render as monospace
        doc.fontSize(9).font("Courier").text(trimmed);
        doc.font("Helvetica");
      } else {
        // Strip inline markdown bold/italic for cleaner rendering
        const cleaned = trimmed
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/\[(\d+)\]/g, "[$1]"); // Keep citation references
        doc.fontSize(11).font("Helvetica").text(cleaned, { lineGap: 3 });
      }

      // Page break safety
      if (doc.y > 750) {
        doc.addPage();
      }
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor("#999999")
      .text(`Generated by KILN — ${new Date().toISOString().slice(0, 10)}`, { align: "center" });

    doc.end();
  });
}

/* ── Word/DOCX (local — minimal OOXML) ── */

async function generateDocxLocal(req: FileGenerationRequest): Promise<QuickUseGeneratedFile> {
  const fileName = req.fileName || "output.docx";
  const title = req.title || "Report";
  const content = req.content || "";

  // Minimal DOCX using raw OOXML — no external dependency needed
  // DOCX is a ZIP with XML files inside
  const { createDocxBuffer } = await import("@/lib/output/docx-builder");
  const buffer = await createDocxBuffer(title, content);

  return uploadGeneratedFile(
    buffer, fileName,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx", req.userId,
  );
}

/* ── Buffer-only generators (no Supabase upload) ── */

async function generateCsvBuffer(req: FileGenerationRequest): Promise<Buffer> {
  const rows = Array.isArray(req.data) ? req.data : [];
  if (rows.length === 0) {
    throw new Error("Keine Daten für CSV-Generierung vorhanden");
  }
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCsvField(String(row[h] ?? ""))).join(",")
    ),
  ];
  return Buffer.from(csvLines.join("\n"), "utf-8");
}

async function generateExcelBuffer(req: FileGenerationRequest): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();

  const sheetsData: Record<string, Record<string, unknown>[]> =
    Array.isArray(req.data)
      ? { Data: req.data }
      : (req.data as Record<string, Record<string, unknown>[]>) || { Data: [] };

  for (const [sheetName, rows] of Object.entries(sheetsData)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const sheet = workbook.addWorksheet(sheetName);
    const headers = Object.keys(rows[0]);

    sheet.columns = headers.map((h) => ({
      header: h,
      key: h,
      width: Math.min(
        Math.max(h.length + 2, ...rows.slice(0, 100).map((r) => String(r[h] ?? "").length), 10) + 2,
        50,
      ),
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF97316" } };
    headerRow.alignment = { horizontal: "center" };

    for (const row of rows.slice(0, 2000)) {
      const values: Record<string, unknown> = {};
      for (const h of headers) values[h] = row[h] ?? "";
      sheet.addRow(values);
    }

    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

async function generatePdfBuffer(req: FileGenerationRequest): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const title = req.title || "Report";
  const content = req.content || "";

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: { Title: title, Creator: "KILN" },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderPdfContent(doc, title, content);
    doc.end();
  });
}

async function generateDocxBuffer(req: FileGenerationRequest): Promise<Buffer> {
  const title = req.title || "Report";
  const content = req.content || "";
  const { createDocxBuffer } = await import("@/lib/output/docx-builder");
  return createDocxBuffer(title, content);
}

/** Shared PDF content renderer — used by both buffer and upload paths */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPdfContent(doc: any, title: string, content: string) {
  // Title — KILN Orange
  doc.fontSize(24).fillColor("#F97316").text(title, { align: "left" });
  doc.moveDown(0.5);

  // Thin orange line under title
  doc.strokeColor("#F97316").lineWidth(1)
    .moveTo(72, doc.y).lineTo(523, doc.y).stroke();
  doc.moveDown(1);

  doc.fillColor("#1a1613");

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) { doc.moveDown(0.3); continue; }

    if (trimmed.startsWith("### ")) {
      doc.moveDown(0.5);
      doc.fontSize(13).font("Helvetica-Bold").text(trimmed.slice(4));
      doc.moveDown(0.2);
      doc.font("Helvetica");
    } else if (trimmed.startsWith("## ")) {
      doc.moveDown(0.8);
      doc.fontSize(15).font("Helvetica-Bold").fillColor("#F97316").text(trimmed.slice(3));
      doc.fillColor("#1a1613");
      doc.moveDown(0.3);
      doc.font("Helvetica");
    } else if (trimmed.startsWith("# ")) {
      doc.moveDown(0.8);
      doc.fontSize(18).font("Helvetica-Bold").text(trimmed.slice(2));
      doc.moveDown(0.3);
      doc.font("Helvetica");
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      doc.fontSize(11).font("Helvetica").text(`  •  ${trimmed.slice(2)}`, { lineGap: 3 });
    } else if (trimmed.startsWith("> ")) {
      doc.fontSize(11).font("Helvetica-Oblique").fillColor("#666666")
        .text(trimmed.slice(2), { indent: 20 });
      doc.fillColor("#1a1613").font("Helvetica");
    } else if (/^\|/.test(trimmed)) {
      doc.fontSize(9).font("Courier").text(trimmed);
      doc.font("Helvetica");
    } else {
      const cleaned = trimmed
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/\[(\d+)\]/g, "[$1]");
      doc.fontSize(11).font("Helvetica").text(cleaned, { lineGap: 3 });
    }

    if (doc.y > 750) doc.addPage();
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor("#999999")
    .text(`Generated by KILN — ${new Date().toISOString().slice(0, 10)}`, { align: "center" });
}

/* ── Upload to Supabase ── */

async function uploadGeneratedFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  kind: QuickUseGeneratedFile["kind"],
  userId: string,
  overrideSize?: number
): Promise<QuickUseGeneratedFile> {
  const supabase = getSupabaseAdmin();
  const id = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `generated/${userId}/${id}_${fileName}`;

  const { error } = await supabase.storage
    .from(OUTPUT_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload fehlgeschlagen: ${error.message}`);
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from(OUTPUT_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  if (signError || !signedData?.signedUrl) {
    throw new Error("Download-URL konnte nicht erstellt werden");
  }

  return {
    kind,
    name: fileName,
    url: signedData.signedUrl,
    size: overrideSize ?? buffer.length,
    mimeType,
  };
}

/**
 * Extracts tabular data from markdown for preview/file generation.
 * Returns rows as Record<string, string>[] or null if no table found.
 */
export function extractTableFromMarkdown(markdown: string): Record<string, string>[] | null {
  const lines = markdown.split("\n");
  const tableLines = lines.filter((l) => l.trim().startsWith("|") && l.trim().endsWith("|"));
  if (tableLines.length < 3) return null; // Need header + separator + at least 1 row

  // Parse header
  const headerLine = tableLines[0];
  const headers = headerLine.split("|").map((h) => h.trim()).filter(Boolean);
  if (headers.length === 0) return null;

  // Skip separator line (---|---)
  const dataLines = tableLines.slice(2);
  const rows: Record<string, string>[] = [];

  for (const line of dataLines) {
    const cells = line.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);
    if (cells.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] || "";
    });
    rows.push(row);
  }

  return rows.length > 0 ? rows : null;
}
