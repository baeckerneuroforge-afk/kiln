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
  const fileName = req.fileName || "output.pdf";
  // Reuse jsPDF-based buffer generator, then upload
  const buffer = await generatePdfBuffer(req);
  return uploadGeneratedFile(buffer, fileName, "application/pdf", "pdf", req.userId);
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

/** Replace emojis with ASCII equivalents — jsPDF/Helvetica cannot render them */
function stripEmojis(text: string): string {
  return text
    .replace(/✅/g, "[Yes]")
    .replace(/❌/g, "[No]")
    .replace(/⚠️/g, "[!]")
    .replace(/💰/g, "$")
    .replace(/🔥/g, "*")
    .replace(/👉/g, ">")
    .replace(/[\u{1F600}-\u{1F9FF}\u{1F300}-\u{1F5FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "")
    .replace(/[^\x00-\x7F\xA0-\xFF\u0100-\u017F]/g, "");
}

/**
 * Render a line of text with inline **bold** segments.
 * Splits on ** markers: even segments are normal, odd segments are bold.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPdfLine(doc: any, text: string, x: number, y: number, maxW: number, fontSize: number): number {
  // Strip italic markers first
  const cleaned = text.replace(/\*([^*]+)\*/g, "$1");
  const segments = cleaned.split(/\*\*/);
  if (segments.length <= 1) {
    // No bold — simple render
    const plain = cleaned.replace(/\*\*/g, "");
    const wrapped = doc.splitTextToSize(plain, maxW) as string[];
    doc.text(wrapped, x, y);
    return wrapped.length * (fontSize * 0.5);
  }

  // Measure and render segment by segment (single-line approach for most cases)
  // For multi-line, fall back to concatenated text with bold markers stripped
  let curX = x;
  let totalHeight = fontSize * 0.5;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const isBold = i % 2 === 1;
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    const segW = doc.getTextWidth(seg);
    if (curX + segW > x + maxW) {
      // Wrap: render remaining as simple text
      const remaining = segments.slice(i).join("");
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(remaining, maxW) as string[];
      doc.text(wrapped, x, y + totalHeight);
      totalHeight += wrapped.length * (fontSize * 0.5);
      break;
    }
    doc.text(seg, curX, y);
    curX += segW;
  }
  doc.setFont("helvetica", "normal");
  return totalHeight;
}

/** Parse markdown table lines into headers and row data */
function parseTableBlock(lines: string[]): { headers: string[]; rows: string[][] } | null {
  if (lines.length < 3) return null;
  const parseRow = (line: string) =>
    line.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);
  const headers = parseRow(lines[0]);
  if (headers.length === 0) return null;
  // Skip separator (line 1)
  const rows = lines.slice(2).map(parseRow).filter((r) => r.length > 0);
  return { headers, rows };
}

async function generatePdfBuffer(req: FileGenerationRequest): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");
  const title = stripEmojis(req.title || "Report");
  const content = stripEmojis(req.content || "");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const marginL = 20;
  const marginR = 20;
  const maxW = pageW - marginL - marginR;
  let y = 20;

  const addPage = () => { doc.addPage(); y = 20; };
  const checkPage = (need: number) => { if (y + need > 275) addPage(); };

  // Title — orange
  doc.setFontSize(20);
  doc.setTextColor(249, 115, 22);
  doc.text(title, marginL, y);
  y += 8;

  // Orange line
  doc.setDrawColor(249, 115, 22);
  doc.setLineWidth(0.4);
  doc.line(marginL, y, pageW - marginR, y);
  y += 8;

  // Body
  doc.setTextColor(26, 22, 19);
  const lines = content.split("\n");

  // Collect table blocks
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Accumulate consecutive table lines
    if (/^\|/.test(trimmed)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const table = parseTableBlock(tableLines);
      if (table && table.headers.length > 0) {
        // Render proper table
        const colCount = table.headers.length;
        const colW = maxW / colCount;
        const cellPad = 2;
        const rowH = 7;

        checkPage(rowH * (table.rows.length + 2));

        // Header row — orange background
        doc.setFillColor(249, 115, 22);
        doc.rect(marginL, y - 4, maxW, rowH, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        for (let c = 0; c < colCount; c++) {
          const cellText = stripEmojis(table.headers[c] || "").replace(/\*\*([^*]+)\*\*/g, "$1");
          doc.text(cellText, marginL + c * colW + cellPad, y, { maxWidth: colW - cellPad * 2 });
        }
        y += rowH;

        // Data rows — alternating background
        doc.setTextColor(26, 22, 19);
        for (let r = 0; r < table.rows.length; r++) {
          checkPage(rowH);
          if (r % 2 === 0) {
            doc.setFillColor(245, 245, 244);
            doc.rect(marginL, y - 4, maxW, rowH, "F");
          }
          doc.setFontSize(8);
          for (let c = 0; c < colCount; c++) {
            const raw = stripEmojis(table.rows[r][c] || "");
            // Render bold segments in cells
            const hasBold = /\*\*/.test(raw);
            if (hasBold) {
              const segs = raw.split(/\*\*/);
              let cx = marginL + c * colW + cellPad;
              for (let s = 0; s < segs.length; s++) {
                if (!segs[s]) continue;
                doc.setFont("helvetica", s % 2 === 1 ? "bold" : "normal");
                doc.text(segs[s], cx, y, { maxWidth: colW - cellPad * 2 });
                cx += doc.getTextWidth(segs[s]);
              }
              doc.setFont("helvetica", "normal");
            } else {
              doc.setFont("helvetica", "normal");
              doc.text(raw, marginL + c * colW + cellPad, y, { maxWidth: colW - cellPad * 2 });
            }
          }
          y += rowH;
        }

        // Table bottom line
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(marginL, y - 4, marginL + maxW, y - 4);
        y += 3;
      } else {
        // Fallback: render as plain text
        for (const tl of tableLines) {
          checkPage(5);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text(tl, marginL, y);
          y += 4;
        }
      }
      continue;
    }

    i++;

    if (!trimmed) { y += 3; continue; }
    checkPage(8);

    if (trimmed.startsWith("### ")) {
      y += 3;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(stripEmojis(trimmed.slice(4)), marginL, y, { maxWidth: maxW });
      y += 6;
      doc.setFont("helvetica", "normal");
    } else if (trimmed.startsWith("## ")) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(249, 115, 22);
      doc.text(stripEmojis(trimmed.slice(3)), marginL, y, { maxWidth: maxW });
      y += 7;
      doc.setTextColor(26, 22, 19);
      doc.setFont("helvetica", "normal");
    } else if (trimmed.startsWith("# ")) {
      y += 5;
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(stripEmojis(trimmed.slice(2)), marginL, y, { maxWidth: maxW });
      y += 8;
      doc.setFont("helvetica", "normal");
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      doc.setFontSize(10);
      const bulletText = stripEmojis(trimmed.slice(2));
      const h = renderPdfLine(doc, `  •  ${bulletText}`, marginL, y, maxW, 10);
      y += h;
    } else if (trimmed.startsWith("> ")) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(102, 102, 102);
      const wrapped = doc.splitTextToSize(stripEmojis(trimmed.slice(2)), maxW - 10) as string[];
      doc.text(wrapped, marginL + 10, y);
      y += wrapped.length * 5;
      doc.setTextColor(26, 22, 19);
      doc.setFont("helvetica", "normal");
    } else {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const h = renderPdfLine(doc, trimmed, marginL, y, maxW, 10);
      y += h;
    }
  }

  // Footer
  checkPage(15);
  doc.setFontSize(7);
  doc.setTextColor(153, 153, 153);
  doc.text(`Generated by KILN — ${new Date().toISOString().slice(0, 10)}`, marginL, 285);

  return Buffer.from(doc.output("arraybuffer"));
}

async function generateDocxBuffer(req: FileGenerationRequest): Promise<Buffer> {
  const title = req.title || "Report";
  const content = req.content || "";
  const { createDocxBuffer } = await import("@/lib/output/docx-builder");
  return createDocxBuffer(title, content);
}

/* renderPdfContent removed — jsPDF handles PDF generation directly in generatePdfBuffer */

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
