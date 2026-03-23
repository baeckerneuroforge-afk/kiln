/**
 * File Generator — Erzeugt Excel, PDF, Word und CSV-Dateien.
 * Nutzt E2B Sandbox für Excel/PDF/Word-Generierung.
 * CSV wird direkt ohne Sandbox erzeugt.
 * Ergebnis wird in Supabase Storage gespeichert (7 Tage TTL).
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  isCodeSandboxAvailable,
  createSandbox,
  executeCode,
  destroySandbox,
} from "@/lib/sandbox/code-sandbox";
import type { QuickUseGeneratedFile } from "@/lib/quick-use/types";

const OUTPUT_BUCKET = "agent-artifacts";
const SIGNED_URL_TTL = 7 * 24 * 60 * 60; // 7 days

interface FileGenerationRequest {
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
 * Returns a QuickUseGeneratedFile with a signed download URL.
 */
export async function generateFile(
  request: FileGenerationRequest
): Promise<QuickUseGeneratedFile> {
  switch (request.kind) {
    case "csv":
      return generateCsv(request);
    case "xlsx":
      return generateExcel(request);
    case "pdf":
      return generatePdf(request);
    case "docx":
      return generateDocx(request);
    default:
      throw new Error(`Nicht unterstützter Dateityp: ${request.kind}`);
  }
}

/* ── CSV (no sandbox needed) ── */

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

  return uploadGeneratedFile(
    buffer,
    req.fileName || "output.csv",
    "text/csv",
    "csv",
    req.userId
  );
}

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/* ── Excel (via E2B sandbox) ── */

async function generateExcel(req: FileGenerationRequest): Promise<QuickUseGeneratedFile> {
  if (!isCodeSandboxAvailable()) {
    throw new Error("Code-Sandbox nicht verfügbar (E2B_API_KEY fehlt)");
  }

  const dataJson = JSON.stringify(req.data || []);
  const title = req.title || "Report";
  const fileName = req.fileName || "output.xlsx";

  const pythonCode = `
import json
import base64
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

data = json.loads('''${dataJson.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}''')
title = "${title.replace(/"/g, '\\"')}"

wb = openpyxl.Workbook()

# Handle dict of sheets or single array
if isinstance(data, dict):
    sheets_data = data
else:
    sheets_data = {"Data": data}

first = True
for sheet_name, rows in sheets_data.items():
    if not isinstance(rows, list) or len(rows) == 0:
        continue
    ws = wb.active if first else wb.create_sheet(sheet_name)
    if first:
        ws.title = sheet_name
        first = False

    headers = list(rows[0].keys()) if rows else []

    # Header styling
    header_fill = PatternFill(start_color="F97316", end_color="F97316", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    thin_border = Border(
        bottom=Side(style="thin", color="DDDDDD")
    )

    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    # Data rows
    for row_idx, row in enumerate(rows[:2000], 2):
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=row.get(header, ""))
            cell.border = thin_border

    # Auto-width columns
    for col_idx, header in enumerate(headers, 1):
        max_len = max(
            len(str(header)),
            max((len(str(row.get(header, ""))) for row in rows[:100]), default=0)
        )
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = min(max_len + 4, 50)

    # Freeze header row
    ws.freeze_panes = "A2"

output_path = "/tmp/${fileName}"
wb.save(output_path)

with open(output_path, "rb") as f:
    content = f.read()
    print("FILE_BASE64:" + base64.b64encode(content).decode())
    print("FILE_SIZE:" + str(len(content)))
`;

  return executeSandboxAndUpload(pythonCode, fileName,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx", req.userId, ["openpyxl"]);
}

/* ── PDF (via E2B sandbox) ── */

async function generatePdf(req: FileGenerationRequest): Promise<QuickUseGeneratedFile> {
  if (!isCodeSandboxAvailable()) {
    throw new Error("Code-Sandbox nicht verfügbar (E2B_API_KEY fehlt)");
  }

  const content = (req.content || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
  const title = (req.title || "Report").replace(/"/g, '\\"');
  const fileName = req.fileName || "output.pdf";

  const pythonCode = `
import base64
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

output_path = "/tmp/${fileName}"
doc = SimpleDocTemplate(output_path, pagesize=A4,
    leftMargin=25*mm, rightMargin=25*mm, topMargin=30*mm, bottomMargin=25*mm)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="KilnTitle",
    parent=styles["Title"],
    fontSize=24,
    textColor=HexColor("#F97316"),
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="KilnBody",
    parent=styles["Normal"],
    fontSize=11,
    leading=16,
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="KilnH2",
    parent=styles["Heading2"],
    fontSize=14,
    textColor=HexColor("#1a1613"),
    spaceBefore=16,
    spaceAfter=8,
))

content = '''${content}'''
title = "${title}"

story = []
story.append(Paragraph(title, styles["KilnTitle"]))
story.append(Spacer(1, 12))

for line in content.split("\\n"):
    line = line.strip()
    if not line:
        story.append(Spacer(1, 6))
    elif line.startswith("## "):
        story.append(Paragraph(line[3:], styles["KilnH2"]))
    elif line.startswith("# "):
        story.append(Paragraph(line[2:], styles["KilnTitle"]))
    else:
        story.append(Paragraph(line, styles["KilnBody"]))

doc.build(story)

with open(output_path, "rb") as f:
    data = f.read()
    print("FILE_BASE64:" + base64.b64encode(data).decode())
    print("FILE_SIZE:" + str(len(data)))
`;

  return executeSandboxAndUpload(pythonCode, fileName,
    "application/pdf", "pdf", req.userId, ["reportlab"]);
}

/* ── Word/DOCX (via E2B sandbox) ── */

async function generateDocx(req: FileGenerationRequest): Promise<QuickUseGeneratedFile> {
  if (!isCodeSandboxAvailable()) {
    throw new Error("Code-Sandbox nicht verfügbar (E2B_API_KEY fehlt)");
  }

  const content = (req.content || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
  const title = (req.title || "Report").replace(/"/g, '\\"');
  const fileName = req.fileName || "output.docx";

  const pythonCode = `
import base64
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Style: Title
style = doc.styles["Title"]
style.font.size = Pt(24)
style.font.color.rgb = RGBColor(0xF9, 0x73, 0x16)

title = "${title}"
content = '''${content}'''

doc.add_heading(title, level=0)

for line in content.split("\\n"):
    line = line.strip()
    if not line:
        doc.add_paragraph("")
    elif line.startswith("## "):
        doc.add_heading(line[3:], level=2)
    elif line.startswith("# "):
        doc.add_heading(line[2:], level=1)
    elif line.startswith("- "):
        doc.add_paragraph(line[2:], style="List Bullet")
    else:
        doc.add_paragraph(line)

output_path = "/tmp/${fileName}"
doc.save(output_path)

with open(output_path, "rb") as f:
    data = f.read()
    print("FILE_BASE64:" + base64.b64encode(data).decode())
    print("FILE_SIZE:" + str(len(data)))
`;

  return executeSandboxAndUpload(pythonCode, fileName,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx", req.userId, ["python-docx"]);
}

/* ── Shared: Execute in sandbox and upload ── */

async function executeSandboxAndUpload(
  pythonCode: string,
  fileName: string,
  mimeType: string,
  kind: QuickUseGeneratedFile["kind"],
  userId: string,
  pipPackages: string[]
): Promise<QuickUseGeneratedFile> {
  const session = await createSandbox("python", 2 * 60 * 1000); // 2 min timeout
  if (!session.sandbox) {
    throw new Error("Sandbox konnte nicht erstellt werden");
  }

  try {
    // Install required packages
    const installCode = pipPackages.map((p) => `!pip install -q ${p}`).join("\n");
    if (installCode) {
      await executeCode(session.id, "python", installCode);
    }

    // Run generation code
    const result = await executeCode(session.id, "python", pythonCode);

    if (!result.success) {
      throw new Error(result.error || result.stderr || "Datei-Generierung fehlgeschlagen");
    }

    // Extract base64 from stdout
    const base64Match = result.stdout.match(/FILE_BASE64:(.+)/);
    const sizeMatch = result.stdout.match(/FILE_SIZE:(\d+)/);

    if (!base64Match?.[1]) {
      throw new Error("Sandbox hat keine Datei-Ausgabe produziert");
    }

    const fileBuffer = Buffer.from(base64Match[1], "base64");
    const fileSize = sizeMatch ? parseInt(sizeMatch[1], 10) : fileBuffer.length;

    return uploadGeneratedFile(fileBuffer, fileName, mimeType, kind, userId, fileSize);
  } finally {
    await destroySandbox(session.id);
  }
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
