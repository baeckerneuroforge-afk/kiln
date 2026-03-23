/**
 * File Processor — Extrahiert Text aus verschiedenen Dateiformaten.
 * Unterstützt PDF, DOCX, XLSX, CSV, TXT, JSON und Bilder (via Claude Vision).
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import type { QuickUseFileAttachment } from "./types";

const TEMP_BUCKET = "quick-use-uploads";

export interface ProcessedFile {
  id: string;
  fileName: string;
  mimeType: string;
  /** Extracted text content (for text-based files) */
  textContent?: string;
  /** Base64 data URL (for images, sent to Claude Vision) */
  imageDataUrl?: string;
  /** Structured data (for XLSX/CSV — array of row objects) */
  structuredData?: Record<string, unknown>[];
  /** Number of pages/sheets/rows */
  stats?: {
    pages?: number;
    sheets?: number;
    rows?: number;
    characters?: number;
  };
  /** Processing error if extraction failed */
  error?: string;
}

/**
 * Downloads a file from Supabase Storage by its storage path.
 */
async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(TEMP_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Download fehlgeschlagen: ${error?.message || "Keine Daten"}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * Extracts text from a PDF file using pdf-parse.
 */
async function processPdf(buffer: Buffer, fileName: string): Promise<ProcessedFile> {
  try {
    // Dynamic import to avoid bundling issues
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);

    return {
      id: "",
      fileName,
      mimeType: "application/pdf",
      textContent: result.text.trim(),
      stats: {
        pages: result.numpages,
        characters: result.text.length,
      },
    };
  } catch (err) {
    return {
      id: "",
      fileName,
      mimeType: "application/pdf",
      error: `PDF-Verarbeitung fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
    };
  }
}

/**
 * Extracts text from a DOCX file using mammoth.
 */
async function processDocx(buffer: Buffer, fileName: string): Promise<ProcessedFile> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });

    return {
      id: "",
      fileName,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      textContent: result.value.trim(),
      stats: {
        characters: result.value.length,
      },
    };
  } catch (err) {
    return {
      id: "",
      fileName,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      error: `DOCX-Verarbeitung fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
    };
  }
}

/**
 * Extracts data from an XLSX file using xlsx/sheetjs.
 */
async function processXlsx(buffer: Buffer, fileName: string): Promise<ProcessedFile> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const allRows: Record<string, unknown>[] = [];
    const textParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      allRows.push(...rows);

      const csv = XLSX.utils.sheet_to_csv(sheet);
      textParts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
    }

    return {
      id: "",
      fileName,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      textContent: textParts.join("\n\n"),
      structuredData: allRows.slice(0, 500), // Cap at 500 rows for context
      stats: {
        sheets: workbook.SheetNames.length,
        rows: allRows.length,
        characters: textParts.join("").length,
      },
    };
  } catch (err) {
    return {
      id: "",
      fileName,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      error: `XLSX-Verarbeitung fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
    };
  }
}

/**
 * Parses a CSV file.
 */
function processCsv(buffer: Buffer, fileName: string): ProcessedFile {
  try {
    const text = buffer.toString("utf-8");
    const lines = text.split("\n").filter((l) => l.trim());
    const headers = lines[0]?.split(",").map((h) => h.trim()) || [];

    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length && i <= 500; i++) {
      const values = lines[i].split(",");
      const row: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim() || "";
      });
      rows.push(row);
    }

    return {
      id: "",
      fileName,
      mimeType: "text/csv",
      textContent: text.slice(0, 50000),
      structuredData: rows,
      stats: {
        rows: lines.length - 1,
        characters: text.length,
      },
    };
  } catch (err) {
    return {
      id: "",
      fileName,
      mimeType: "text/csv",
      error: `CSV-Verarbeitung fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
    };
  }
}

/**
 * Reads a plain text or JSON file.
 */
function processText(buffer: Buffer, fileName: string, mimeType: string): ProcessedFile {
  const text = buffer.toString("utf-8");

  return {
    id: "",
    fileName,
    mimeType,
    textContent: text.slice(0, 50000),
    stats: {
      characters: text.length,
    },
  };
}

/**
 * Converts an image to a base64 data URL for Claude Vision.
 */
function processImage(buffer: Buffer, fileName: string, mimeType: string): ProcessedFile {
  const base64 = buffer.toString("base64");
  return {
    id: "",
    fileName,
    mimeType,
    imageDataUrl: `data:${mimeType};base64,${base64}`,
    stats: {
      characters: 0,
    },
  };
}

/**
 * Processes a single file attachment and returns extracted content.
 */
export async function processFile(attachment: QuickUseFileAttachment): Promise<ProcessedFile> {
  const buffer = await downloadFromStorage(attachment.storagePath);

  let result: ProcessedFile;

  switch (attachment.mimeType) {
    case "application/pdf":
      result = await processPdf(buffer, attachment.fileName);
      break;

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      result = await processDocx(buffer, attachment.fileName);
      break;

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      result = await processXlsx(buffer, attachment.fileName);
      break;

    case "text/csv":
      result = processCsv(buffer, attachment.fileName);
      break;

    case "text/plain":
    case "application/json":
      result = processText(buffer, attachment.fileName, attachment.mimeType);
      break;

    case "image/png":
    case "image/jpeg":
    case "image/webp":
      result = processImage(buffer, attachment.fileName, attachment.mimeType);
      break;

    default:
      result = {
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        error: `Nicht unterstützter Dateityp: ${attachment.mimeType}`,
      };
  }

  result.id = attachment.id;
  return result;
}

/**
 * Processes multiple file attachments in parallel.
 */
export async function processFiles(
  attachments: QuickUseFileAttachment[]
): Promise<ProcessedFile[]> {
  return Promise.all(attachments.map(processFile));
}

/**
 * Builds a text context block from processed files for inclusion in LLM prompts.
 */
export function buildFileContext(files: ProcessedFile[]): string {
  if (files.length === 0) return "";

  const parts: string[] = ["=== ATTACHED FILES ==="];

  for (const file of files) {
    if (file.error) {
      parts.push(`\n[${file.fileName}] Error: ${file.error}`);
      continue;
    }

    if (file.textContent) {
      // Truncate very long files to ~8000 chars per file
      const content = file.textContent.length > 8000
        ? file.textContent.slice(0, 8000) + "\n... [truncated]"
        : file.textContent;

      parts.push(`\n[${file.fileName}] (${file.mimeType})`);
      if (file.stats?.pages) parts.push(`Pages: ${file.stats.pages}`);
      if (file.stats?.sheets) parts.push(`Sheets: ${file.stats.sheets}`);
      if (file.stats?.rows) parts.push(`Rows: ${file.stats.rows}`);
      parts.push(`\n${content}`);
    }

    if (file.imageDataUrl) {
      parts.push(`\n[${file.fileName}] (image — sent as visual input)`);
    }
  }

  parts.push("\n=== END ATTACHED FILES ===");
  return parts.join("\n");
}
