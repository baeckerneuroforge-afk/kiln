"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Circle,
  Clipboard,
  Coins,
  Clock3,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FileType2,
  Globe2,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  Pause,
  Play,
  RefreshCcw,
  Save,
  Sparkles,
  Square,
  User,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import type {
  QuickUseCreditInfo,
  QuickUseFileAttachment,
  QuickUseGeneratedFile,
  QuickUseMemoryPreview,
  QuickUseResult,
  QuickUseResultType,
  QuickUseStreamEvent,
  QuickUseTaskDetail,
  QuickUseTaskSummary,
  QuickUseType,
  InterventionType,
} from "@/lib/quick-use/types";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_FILES_PER_MESSAGE,
} from "@/lib/quick-use/types";
import { enhanceQuickUseResult } from "@/lib/quick-use/result-presentation";
import {
  LiveBrowserView,
  type BrowserViewState,
  type ActionLogEntry,
  type ScreenshotThumb,
} from "@/components/quick-use/live-browser-view";

interface QuickUseChatProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  examplePrompts: string[];
  apiEndpoint: string;
  type: QuickUseType;
}

interface AgentStatusCard {
  id: string;
  task: string;
  status: "running" | "completed" | "failed" | "queued";
  detail?: string;
  model?: string;
}

/** Pending file before upload (client-side only) */
interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: number;
  uploading: boolean;
  error?: string;
}

type ChatEntry =
  | {
      id: string;
      kind: "user";
      content: string;
      files?: { name: string; size: number }[];
    }
  | {
      id: string;
      kind: "assistant";
      content: string;
    }
  | {
      id: string;
      kind: "result";
      result: QuickUseResult;
      credits?: QuickUseCreditInfo;
    }
  | {
      id: string;
      kind: "error";
      content: string;
      suggestions?: string[];
    };

function createId() {
  return `quick_use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stringifyData(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function formatSwarmFinding(value: unknown): string {
  if (typeof value === "string") return value;
  return stringifyData(value).slice(0, 200);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isAllowedFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/** Filter out internal backend warnings from user-facing text */
const INTERNAL_WARNING_PATTERNS = [/E2B/i, /fallback/i, /Browserless/i, /compatibility mode/i];

function isInternalWarning(text: string): boolean {
  return INTERNAL_WARNING_PATTERNS.some((pattern) => pattern.test(text));
}

function filterWarnings(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isInternalWarning(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Generate a download filename from a screenshot name */
function screenshotFileName(name: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
  return `kiln-screenshot-${slug}-${ts}.png`;
}

/** Download a data URL as a file */
function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}

/** Copy image data URL to clipboard as PNG */
async function copyImageToClipboard(dataUrl: string) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
  } catch {
    // Fallback: some browsers don't support ClipboardItem with images
  }
}

/* ── Screenshot Lightbox ── */

function ScreenshotLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
      >
        <X className="h-5 w-5" />
      </button>
      <Image
        src={src}
        alt={alt}
        width={1920}
        height={1080}
        unoptimized
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/* ── Interactive Screenshot Card ── */

function ScreenshotCard({
  dataUrl,
  name,
  onOpenLightbox,
}: {
  dataUrl: string;
  name: string;
  onOpenLightbox: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-muted/60">
      <button
        type="button"
        onClick={onOpenLightbox}
        className="block w-full cursor-pointer"
      >
        <Image
          src={dataUrl}
          alt={name}
          width={1200}
          height={800}
          unoptimized
          className="h-auto w-full object-cover transition-[filter] group-hover:brightness-110"
        />
      </button>

      {/* Action buttons — visible on hover */}
      <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => downloadDataUrl(dataUrl, screenshotFileName(name))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={async () => {
            await copyImageToClipboard(dataUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          title={copied ? "Copied!" : "Copy to clipboard"}
        >
          <Clipboard className={cn("h-3.5 w-3.5", copied && "text-emerald-400")} />
        </button>
      </div>

      {/* Caption */}
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground">{name}</p>
      </div>
    </div>
  );
}

function exportResearchAsPdf(result: QuickUseResult) {
  const report = result.markdown || result.summary;
  const sources = (result.sources || [])
    .map((source) => `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title || source.url)}</a></li>`)
    .join("");

  const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!popup) return;

  popup.document.write(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(result.title || "Research Report")}</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; margin: 48px; color: #171717; }
      h1 { font-size: 28px; margin-bottom: 8px; }
      .meta { color: #6b7280; margin-bottom: 32px; }
      pre { white-space: pre-wrap; font-family: inherit; line-height: 1.65; font-size: 14px; }
      a { color: #ea580c; text-decoration: none; }
      ul { line-height: 1.6; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(result.title || "Research Report")}</h1>
    <p class="meta">${escapeHtml(result.summary)}</p>
    <pre>${escapeHtml(report)}</pre>
    ${sources ? `<h2>Sources</h2><ul>${sources}</ul>` : ""}
  </body>
</html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 200);
}

/* ── File icon helper ── */

function GeneratedFileIcon({ kind }: { kind: QuickUseGeneratedFile["kind"] }) {
  switch (kind) {
    case "xlsx":
      return <FileSpreadsheet className="h-5 w-5 text-emerald-400" />;
    case "pdf":
      return <FileText className="h-5 w-5 text-red-400" />;
    case "docx":
      return <FileType2 className="h-5 w-5 text-blue-400" />;
    case "csv":
      return <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />;
  }
}

function GeneratedFileCard({ file }: { file: QuickUseGeneratedFile }) {
  return (
    <a
      href={file.url}
      download={file.name}
      className="flex items-center gap-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-3 transition-colors hover:border-orange-500/30 hover:bg-orange-500/[0.1]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
        <GeneratedFileIcon kind={file.kind} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
        <p className="text-xs text-muted-foreground">{file.kind.toUpperCase()} &middot; {formatFileSize(file.size)}</p>
      </div>
      <Download className="h-4 w-4 shrink-0 text-orange-400" />
    </a>
  );
}

/** On-demand file generation button — calls /api/quick-use/generate-file */
function OnDemandFileButton({
  kind,
  label,
  icon: Icon,
  data,
  markdown,
  topic,
  title,
  onGenerated,
}: {
  kind: "xlsx" | "pdf" | "docx" | "csv";
  label: string;
  icon: LucideIcon;
  data?: Record<string, unknown>[];
  markdown?: string;
  topic?: string;
  title?: string;
  onGenerated: (file: QuickUseGeneratedFile) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-use/generate-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, data, markdown, topic, title }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(errJson.error || `Generation failed (${res.status})`);
        return;
      }
      // API returns blob directly — create object URL for download
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const fileNameMatch = disposition.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch?.[1] || `report.${kind}`;
      const blobUrl = URL.createObjectURL(blob);

      onGenerated({
        kind,
        name: fileName,
        url: blobUrl,
        size: blob.size,
        mimeType: blob.type,
      });
      setDone(true);

      // Auto-download
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("File generation error:", err);
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={loading || done}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
          error
            ? "border-red-500/20 bg-red-500/[0.06] text-red-400"
            : done
              ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400"
              : "border-border bg-muted text-muted-foreground hover:border-white/14 hover:text-foreground",
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
        {error ? "Failed" : done ? "Created" : label}
      </button>
      {error && (
        <span className="text-[10px] text-red-400/70">{error}</span>
      )}
    </div>
  );
}

/** Preview first rows of tabular data */
function DataPreviewTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data || data.length === 0) return null;
  const headers = Object.keys(data[0]);
  const previewRows = data.slice(0, 5);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-muted/60">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-border bg-muted">
            {headers.map((h) => (
              <th key={h} className="px-3 py-1.5 font-semibold text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, i) => (
            <tr key={i} className="border-b border-border">
              {headers.map((h) => (
                <td key={h} className="px-3 py-1.5 text-foreground whitespace-nowrap max-w-[200px] truncate">
                  {String(row[h] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 5 && (
        <p className="px-3 py-1.5 text-[10px] text-muted-foreground">
          +{data.length - 5} more rows
        </p>
      )}
    </div>
  );
}

/** Combined file output section: auto-generated downloads + on-demand buttons + preview */
function FileOutputSection({
  result,
  onFileGenerated,
}: {
  result: QuickUseResult;
  onFileGenerated: (file: QuickUseGeneratedFile) => void;
}) {
  const [extraFiles, setExtraFiles] = useState<QuickUseGeneratedFile[]>([]);
  const allFiles = [...(result.generatedFiles || []), ...extraFiles];
  const hasMarkdown = !!result.markdown && result.markdown.length > 100;
  const hasTable = !!result.markdown && /\|.*\|.*\|/m.test(result.markdown);

  // Determine which on-demand options to show (exclude already-generated types)
  const existingKinds = new Set(allFiles.map((f) => f.kind));
  const onDemandOptions: Array<{
    kind: "xlsx" | "pdf" | "docx" | "csv";
    label: string;
    icon: LucideIcon;
    show: boolean;
  }> = [
    { kind: "xlsx", label: "Excel", icon: FileSpreadsheet, show: hasTable && !existingKinds.has("xlsx") },
    { kind: "pdf", label: "PDF", icon: FileText, show: hasMarkdown && !existingKinds.has("pdf") },
    { kind: "docx", label: "Word", icon: FileType2, show: hasMarkdown && !existingKinds.has("docx") },
    { kind: "csv", label: "CSV", icon: FileSpreadsheet, show: hasTable && !existingKinds.has("csv") },
  ];
  const visibleOptions = onDemandOptions.filter((o) => o.show);

  // Extract table data for preview — but skip if markdown already has a rendered table
  // (to avoid showing the same data twice: once in markdown, once in DataPreviewTable)
  const markdownHasRenderedTable = result.markdown
    ? /^\|.+\|$/m.test(result.markdown) && /^\|[-:| ]+\|$/m.test(result.markdown)
    : false;
  const tableData = hasTable && !markdownHasRenderedTable ? extractPreviewTable(result.markdown!) : null;

  const handleGenerated = (file: QuickUseGeneratedFile) => {
    setExtraFiles((prev) => [...prev, file]);
    onFileGenerated(file);
  };

  if (allFiles.length === 0 && visibleOptions.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Auto-generated file downloads (prominent) */}
      {allFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-400/70">
            Downloads
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {allFiles.map((file) => (
              <GeneratedFileCard key={`${file.name}-${file.url}`} file={file} />
            ))}
          </div>
        </div>
      )}

      {/* Data preview for table results */}
      {tableData && tableData.length > 0 && (
        <DataPreviewTable data={tableData} />
      )}

      {/* On-demand generation buttons */}
      {visibleOptions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Or generate
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleOptions.map((opt) => (
              <OnDemandFileButton
                key={opt.kind}
                kind={opt.kind}
                label={opt.label}
                icon={opt.icon}
                data={tableData ?? undefined}
                markdown={result.markdown}
                topic={result.title}
                title={result.title}
                onGenerated={handleGenerated}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Extract first N rows from a markdown table for preview */
function extractPreviewTable(markdown: string): Record<string, string>[] | null {
  const lines = markdown.split("\n");
  const tableLines = lines.filter((l) => l.trim().startsWith("|") && l.trim().endsWith("|"));
  if (tableLines.length < 3) return null;

  const headerLine = tableLines[0];
  const headers = headerLine.split("|").map((h) => h.trim()).filter(Boolean);
  if (headers.length === 0) return null;

  const dataLines = tableLines.slice(2);
  const rows: Record<string, string>[] = [];

  for (const line of dataLines) {
    const cells = line.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);
    if (cells.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ""; });
    rows.push(row);
  }

  return rows.length > 0 ? rows : null;
}

/* ── UI Components ── */

function MessageBubble({ children, icon, className }: {
  children: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-kiln-orange">
        {icon}
      </div>
      <div className={cn("w-full max-w-3xl rounded-[24px] border border-border bg-card/95 p-4 text-sm text-foreground shadow-[0_16px_40px_rgba(0,0,0,0.22)]", className)}>
        {children}
      </div>
    </div>
  );
}

function AgentStatusGrid({ statuses }: { statuses: AgentStatusCard[] }) {
  if (statuses.length === 0) return null;

  return (
    <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {statuses.map((status) => (
        <div
          key={status.id}
          className="rounded-2xl border border-border bg-muted/90 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
              {status.id}
            </p>
            <Badge
              className={cn(
                "border-0",
                status.status === "completed" && "bg-emerald-500/15 text-emerald-300",
                status.status === "running" && "bg-orange-500/15 text-orange-300",
                status.status === "failed" && "bg-red-500/15 text-red-300",
                status.status === "queued" && "bg-muted/15 text-foreground"
              )}
            >
              {status.status}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-foreground">{status.task}</p>
          {status.detail ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{status.detail}</p>
          ) : null}
          {status.model ? (
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#6f645c]">
              {status.model}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

interface ParsedMarkdownTable {
  headers: string[];
  rows: { label: string; cells: string[] }[];
}

function humanizeModel(model?: string): string | null {
  if (!model) return null;
  if (/haiku/i.test(model)) return "Haiku";
  if (/sonnet/i.test(model)) return "Sonnet";
  if (/sonar/i.test(model)) return "Sonar";
  return model;
}

function formatDuration(durationMs?: number): string | null {
  if (!durationMs || !Number.isFinite(durationMs)) return null;
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function resultTypeLabel(resultType: QuickUseResultType): string {
  switch (resultType) {
    case "comparison":
      return "Comparison";
    case "research":
      return "Research";
    case "price_list":
      return "Price Scan";
    case "single_fact":
      return "Answer";
    case "list":
      return "List";
    default:
      return "Analysis";
  }
}

function parseMarkdownTable(markdown?: string): ParsedMarkdownTable | null {
  if (!markdown) return null;
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length - 1; index++) {
    if (!lines[index].includes("|") || !lines[index + 1].includes("|---")) continue;
    const block: string[] = [lines[index], lines[index + 1]];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor].includes("|")) {
      block.push(lines[cursor]);
      cursor++;
    }

    const rows = block
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));

    if (rows.length < 3) continue;
    const headers = rows[0];
    const body = rows.slice(2).filter((row) => row.length === headers.length);
    if (headers.length < 2 || body.length === 0) continue;

    return {
      headers,
      rows: body.map((row) => ({
        label: row[0],
        cells: row.slice(1),
      })),
    };
  }
  return null;
}

function parseNumericValue(text: string): number | null {
  const match = text.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function availabilityScore(value: string): number | null {
  const lower = value.toLowerCase();
  if (lower.includes("same day")) return 100;
  if (lower.includes("in stock") || lower.includes("available")) return 90;
  if (lower.includes("1 day") || lower.includes("next day")) return 80;
  if (lower.includes("2-3")) return 70;
  if (lower.includes("3-5")) return 60;
  if (lower.includes("preorder")) return 40;
  if (lower.includes("out of stock") || lower.includes("unavailable")) return 0;
  return null;
}

function winnerIndexes(rowLabel: string, cells: string[]): number[] {
  const lower = rowLabel.toLowerCase();

  if (/price|cost|shipping/.test(lower)) {
    const scored = cells.map((cell, index) => ({ index, value: parseNumericValue(cell) }))
      .filter((entry) => entry.value !== null) as Array<{ index: number; value: number }>;
    if (scored.length === 0) return [];
    const best = Math.min(...scored.map((entry) => entry.value));
    return scored.filter((entry) => entry.value === best).map((entry) => entry.index);
  }

  if (/rating|score/.test(lower)) {
    const scored = cells.map((cell, index) => ({ index, value: parseNumericValue(cell) }))
      .filter((entry) => entry.value !== null) as Array<{ index: number; value: number }>;
    if (scored.length === 0) return [];
    const best = Math.max(...scored.map((entry) => entry.value));
    return scored.filter((entry) => entry.value === best).map((entry) => entry.index);
  }

  if (/availability|delivery/.test(lower)) {
    const scored = cells.map((cell, index) => ({ index, value: availabilityScore(cell) }))
      .filter((entry) => entry.value !== null) as Array<{ index: number; value: number }>;
    if (scored.length === 0) return [];
    const best = Math.max(...scored.map((entry) => entry.value));
    return scored.filter((entry) => entry.value === best).map((entry) => entry.index);
  }

  return [];
}

function availabilityTone(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("in stock") || lower.includes("available")) return "bg-emerald-400";
  if (lower.includes("2-3") || lower.includes("3-5") || lower.includes("preorder")) return "bg-amber-400";
  if (lower.includes("out of stock") || lower.includes("unavailable")) return "bg-red-400";
  return "bg-muted-foreground";
}

function markdownSections(markdown?: string): { intro: string; sections: Array<{ title: string; content: string }> } | null {
  if (!markdown) return null;
  const matches = Array.from(markdown.matchAll(/^#{1,3}\s+(.+)$/gm));
  if (matches.length === 0) return null;

  const intro = markdown.slice(0, matches[0].index).trim();
  const sections = matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index || markdown.length) : markdown.length;
    return {
      title: match[1].trim(),
      content: markdown.slice(start, end).trim(),
    };
  }).filter((section) => section.content);

  return { intro, sections };
}

function markdownListItems(markdown?: string): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim());
}

function extractHighlightStats(text: string): string[] {
  return Array.from(new Set(text.match(/(?:[$€£]\s?\d[\d.,]*|\d+(?:\.\d+)?%|\d+(?:\.\d+)?x|\b20\d{2}\b)/g) || [])).slice(0, 4);
}

function citationMarkdown(markdown: string, sourceIds: number[]): string {
  const knownIds = new Set(sourceIds);
  return markdown.replace(/\[(\d+)\](?!\()/g, (match, id) => (
    knownIds.has(Number(id)) ? `[\\[${id}\\]](#source-${id})` : match
  ));
}

function sourceFavicon(sourceUrl: string): string {
  try {
    const domain = new URL(sourceUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  } catch {
    return "";
  }
}

function ResultMarkdown({
  markdown,
  sourceIds,
  onSourceReference,
}: {
  markdown: string;
  sourceIds: number[];
  onSourceReference: (sourceId: number) => void;
}) {
  return (
    <div className="prose max-w-none prose-headings:font-serif prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-orange-200 prose-pre:border prose-pre:border-border prose-pre:bg-muted/70 prose-li:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#source-")) {
              const sourceId = Number(href.replace("#source-", ""));
              return (
                <button
                  type="button"
                  onClick={() => onSourceReference(sourceId)}
                  className="rounded px-0.5 text-orange-300 underline underline-offset-2 transition-colors hover:text-orange-200"
                >
                  {children}
                </button>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-300 underline underline-offset-2 transition-colors hover:text-orange-200"
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted text-foreground">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-white/6">{children}</tbody>,
          tr: ({ children }) => <tr className="odd:bg-muted">{children}</tr>,
          th: ({ children }) => <th className="border-b border-border px-4 py-3 text-left font-medium [&_strong]:font-bold [&_strong]:text-foreground">{children}</th>,
          td: ({ children }) => <td className="px-4 py-3 align-top text-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{children}</td>,
          code: ({ className, children }) => {
            const inline = !className;
            return inline ? (
              <code className="rounded bg-black/25 px-1.5 py-0.5 text-xs text-orange-200">{children}</code>
            ) : (
              <code className="block overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6">{children}</code>
            );
          },
        }}
      >
        {citationMarkdown(markdown, sourceIds)}
      </ReactMarkdown>
    </div>
  );
}

/** Render markdown fragments inside table cells: **bold**, [text](url) → text, [N] → superscript */
function renderCellContent(text: string): React.ReactNode {
  // Split on **bold** segments, markdown links, and citation refs
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\[\d+\])/g);
  return parts.map((part, i) => {
    // Bold
    const boldMatch = part.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      return <strong key={i} className="font-semibold text-foreground">{boldMatch[1]}</strong>;
    }
    // Markdown link — show text only
    const linkMatch = part.match(/^\[([^\]]+)\]\([^)]+\)$/);
    if (linkMatch) {
      return <span key={i}>{linkMatch[1]}</span>;
    }
    // Citation [N]
    const citeMatch = part.match(/^\[(\d+)\]$/);
    if (citeMatch) {
      return <span key={i} className="ml-0.5 text-[10px] text-orange-400/70 align-super">[{citeMatch[1]}]</span>;
    }
    return part;
  });
}

function ComparisonTable({ table }: { table: ParsedMarkdownTable }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-muted/60">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-muted">
          <tr>
            {table.headers.map((header) => (
              <th key={header} className="border-b border-border px-4 py-3 text-left font-medium text-foreground">
                {renderCellContent(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => {
            const winners = winnerIndexes(row.label, row.cells);
            return (
              <tr key={row.label} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 font-medium text-foreground">{renderCellContent(row.label)}</td>
                {row.cells.map((cell, index) => {
                  const isWinner = winners.includes(index);
                  const rowLower = row.label.toLowerCase();
                  return (
                    <td
                      key={`${row.label}-${index}`}
                      className={cn(
                        "px-4 py-3 text-foreground",
                        isWinner && "bg-orange-500/10 text-white"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {/availability|delivery/.test(rowLower) ? (
                          <span className={cn("h-2.5 w-2.5 rounded-full", availabilityTone(cell))} />
                        ) : null}
                        <span className={cn(/price|cost/.test(rowLower) && "font-semibold text-foreground")}>
                          {renderCellContent(cell)}
                        </span>
                        {isWinner ? <Sparkles className="h-3.5 w-3.5 text-orange-300" /> : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PriceCards({
  table,
  sources,
}: {
  table: ParsedMarkdownTable;
  sources: NonNullable<QuickUseResult["sources"]>;
}) {
  const priceRow = table.rows.find((row) => /price|cost/i.test(row.label));
  if (!priceRow) return null;

  const cards = table.headers.slice(1).map((vendor, index) => {
    const price = priceRow.cells[index] || "";
    const numericPrice = parseNumericValue(price) ?? Number.POSITIVE_INFINITY;
    const availability = table.rows.find((row) => /availability/i.test(row.label))?.cells[index];
    const shipping = table.rows.find((row) => /shipping|delivery/i.test(row.label))?.cells[index];
    const rating = table.rows.find((row) => /rating|score/i.test(row.label))?.cells[index];
    const source = sources.find((entry) =>
      vendor.toLowerCase().includes((entry.domain || entry.title || "").toLowerCase())
      || (entry.title || "").toLowerCase().includes(vendor.toLowerCase())
    );

    return { vendor, price, numericPrice, availability, shipping, rating, source };
  }).sort((a, b) => a.numericPrice - b.numericPrice);

  const cheapest = cards[0];
  const mostExpensive = cards[cards.length - 1];
  const savings = Number.isFinite(cheapest?.numericPrice) && Number.isFinite(mostExpensive?.numericPrice)
    ? Math.max(0, mostExpensive.numericPrice - cheapest.numericPrice)
    : 0;
  const currencySymbol = [cheapest?.price || "", mostExpensive?.price || ""]
    .map((price) => price.match(/[€$£]/)?.[0])
    .find(Boolean) || "";

  return (
    <div className="space-y-3">
      {savings > 0 ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Save {currencySymbol}{savings.toFixed(2)} by choosing {cheapest.vendor} over {mostExpensive.vendor}.
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, index) => (
          <div key={card.vendor} className="rounded-2xl border border-border bg-muted/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{card.vendor}</p>
                <p className="mt-2 text-2xl font-semibold text-orange-200">{card.price}</p>
              </div>
              {index === 0 ? (
                <Badge className="bg-emerald-500/15 text-emerald-300">Best Deal</Badge>
              ) : null}
            </div>
            <div className="mt-4 space-y-2 text-sm text-foreground">
              {card.availability ? <p>Availability: {card.availability}</p> : null}
              {card.shipping ? <p>Shipping: {card.shipping}</p> : null}
              {card.rating ? <p>Rating: {card.rating}</p> : null}
            </div>
            {card.source ? (
              <a
                href={card.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-orange-300"
              >
                View source
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StructuredReport({
  markdown,
  sourceIds,
  onSourceReference,
}: {
  markdown: string;
  sourceIds: number[];
  onSourceReference: (sourceId: number) => void;
}) {
  const parsed = markdownSections(markdown);
  if (!parsed) {
    return <ResultMarkdown markdown={markdown} sourceIds={sourceIds} onSourceReference={onSourceReference} />;
  }

  return (
    <div className="space-y-4">
      {parsed.intro ? (
        <div className="rounded-2xl border border-orange-500/15 bg-orange-500/8 p-4">
          <p className="text-base leading-7 text-foreground">{parsed.intro}</p>
        </div>
      ) : null}
      <div className="space-y-3">
        {parsed.sections.map((section, index) => (
          <details
            key={section.title}
            open={index === 0}
            className="rounded-2xl border border-border bg-muted/60 p-4"
          >
            <summary className="cursor-pointer list-none text-base font-semibold text-foreground">
              {section.title}
            </summary>
            <div className="mt-4 text-sm text-foreground">
              <ResultMarkdown markdown={section.content} sourceIds={sourceIds} onSourceReference={onSourceReference} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function SourceSection({
  sources,
  open,
  highlightedSourceId,
  onToggle,
}: {
  sources: NonNullable<QuickUseResult["sources"]>;
  open: boolean;
  highlightedSourceId: number | null;
  onToggle: () => void;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-black/15 p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
            Sources ({sources.length})
          </p>
        </div>
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {sources.map((source, index) => {
            const sourceId = source.id ?? index + 1;
            return (
              <a
                key={`${sourceId}-${source.url}`}
                id={`source-${sourceId}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "block rounded-xl border border-border bg-muted p-3 transition-colors hover:border-border hover:bg-muted",
                  highlightedSourceId === sourceId && "border-orange-500/40 bg-orange-500/10"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="h-5 w-5 shrink-0 rounded-sm bg-cover bg-center"
                      style={{ backgroundImage: `url("${sourceFavicon(source.url)}")` }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        [{sourceId}] {source.title || source.url}
                      </p>
                      <p className="truncate text-xs text-orange-300">{source.domain || source.url}</p>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
                {source.snippet ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{source.snippet}</p> : null}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ResultCard({
  result,
  credits,
  type,
  onExport,
  onSave,
  actionBusy,
  actionDone,
  onFollowUp,
}: {
  result: QuickUseResult;
  credits?: QuickUseCreditInfo;
  type: QuickUseType;
  onExport?: () => void;
  onSave?: () => void;
  actionBusy?: boolean;
  actionDone?: boolean;
  onFollowUp?: (question: string) => void;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [highlightedSourceId, setHighlightedSourceId] = useState<number | null>(null);
  const [followUpsDismissed, setFollowUpsDismissed] = useState(false);

  const prepared = enhanceQuickUseResult({
    ...result,
    summary: filterWarnings(result.summary),
    markdown: result.markdown ? filterWarnings(result.markdown) : undefined,
  }, { quickUseType: type });
  const sourceIds = (prepared.sources || []).map((source, index) => source.id ?? index + 1);
  const table = parseMarkdownTable(prepared.markdown);
  const listItems = markdownListItems(prepared.markdown);
  const topStats = extractHighlightStats(`${prepared.summary}\n${prepared.markdown || ""}`);
  const modelLabel = humanizeModel(prepared.model);
  const durationLabel = formatDuration(prepared.durationMs);

  function focusSource(sourceId: number) {
    setSourcesOpen(true);
    setHighlightedSourceId(sourceId);
    const element = document.getElementById(`source-${sourceId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    window.setTimeout(() => setHighlightedSourceId((current) => (current === sourceId ? null : current)), 1800);
  }

  function renderPrimaryContent() {
    if (prepared.resultType === "price_list" && table && prepared.sources) {
      return <PriceCards table={table} sources={prepared.sources} />;
    }

    if (prepared.resultType === "comparison" && table) {
      return <ComparisonTable table={table} />;
    }

    if (prepared.resultType === "research" && prepared.markdown) {
      const sections = markdownSections(prepared.markdown);
      if (sections) {
        return (
          <div className="space-y-4">
            {topStats.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {topStats.map((stat) => (
                  <div key={stat} className="rounded-2xl border border-border bg-muted/60 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#8a7a6f]">Key stat</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">{stat}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="rounded-2xl border border-border bg-muted/60 p-4">
              <StructuredReport
                markdown={prepared.markdown}
                sourceIds={sourceIds}
                onSourceReference={focusSource}
              />
            </div>
          </div>
        );
      }
    }

    if (prepared.resultType === "single_fact") {
      return (
        <div className="rounded-2xl border border-orange-500/15 bg-orange-500/8 p-5">
          <p className="text-lg leading-8 text-foreground">{prepared.summary}</p>
        </div>
      );
    }

    if (prepared.resultType === "list" && listItems.length > 0) {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {listItems.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-2xl border border-border bg-muted/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8a7a6f]">Item {index + 1}</p>
              <p className="mt-2 text-sm leading-7 text-foreground">{item}</p>
            </div>
          ))}
        </div>
      );
    }

    if (prepared.markdown) {
      return (
        <div className="rounded-2xl border border-border bg-black/15 p-4 text-[15px] leading-7 text-foreground">
          <ResultMarkdown
            markdown={prepared.markdown}
            sourceIds={sourceIds}
            onSourceReference={focusSource}
          />
        </div>
      );
    }

    return null;
  }

  return (
    <>
      {lightboxSrc ? (
        <ScreenshotLightbox
          src={lightboxSrc.src}
          alt={lightboxSrc.alt}
          onClose={() => setLightboxSrc(null)}
        />
      ) : null}

      <MessageBubble
        icon={<Sparkles className="h-4 w-4" />}
        className="border-t-2 border-t-orange-500/70 bg-[linear-gradient(180deg,rgba(36,26,20,0.97),rgba(24,20,17,0.96))] shadow-none"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-orange-500/15 text-orange-300">{resultTypeLabel(prepared.resultType || "general")}</Badge>
            {modelLabel ? (
              <Badge variant="outline" className="border-border text-foreground">
                <Sparkles className="h-3 w-3" />
                {modelLabel}
              </Badge>
            ) : null}
            {durationLabel ? (
              <Badge variant="outline" className="border-border text-foreground">
                <Clock3 className="h-3 w-3" />
                {durationLabel}
              </Badge>
            ) : null}
          </div>

          <div className="space-y-2">
            {prepared.title ? <h3 className="text-lg font-semibold text-foreground">{prepared.title}</h3> : null}
            <div className="text-sm leading-7 text-foreground">
              <ResultMarkdown
                markdown={prepared.summary}
                sourceIds={sourceIds}
                onSourceReference={focusSource}
              />
            </div>
          </div>

          {renderPrimaryContent()}

          {prepared.data !== undefined ? (
            <div className="rounded-2xl border border-border bg-muted/60 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
                Structured Data
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-foreground">
                {stringifyData(prepared.data)}
              </pre>
            </div>
          ) : null}

          <FileOutputSection
            result={prepared}
            onFileGenerated={(file) => {
              // Add to the result's generated files (local state update)
              prepared.generatedFiles = [...(prepared.generatedFiles || []), file];
            }}
          />

          {prepared.artifacts?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {prepared.artifacts.map((artifact) => (
                <div key={`${artifact.name}-${artifact.url || artifact.dataUrl || ""}`}>
                  {artifact.kind === "image" && artifact.dataUrl ? (
                    <ScreenshotCard
                      dataUrl={artifact.dataUrl}
                      name={artifact.name}
                      onOpenLightbox={() =>
                        setLightboxSrc({ src: artifact.dataUrl!, alt: artifact.name })
                      }
                    />
                  ) : (
                    <div className="flex items-center justify-between overflow-hidden rounded-2xl border border-border bg-muted/60 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{artifact.name}</p>
                        <p className="text-xs text-muted-foreground">{artifact.mimeType || artifact.kind}</p>
                      </div>
                      {artifact.url ? (
                        <a
                          href={artifact.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-orange-300"
                        >
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <SourceSection
            sources={prepared.sources || []}
            open={sourcesOpen}
            highlightedSourceId={highlightedSourceId}
            onToggle={() => setSourcesOpen((current) => !current)}
          />

          {prepared.followUpQuestions?.length && !followUpsDismissed ? (
            <div className="rounded-2xl border border-border bg-black/15 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-foreground">
                <Globe2 className="h-4 w-4 text-orange-300" />
                Continue exploring
              </div>
              <div className="flex flex-wrap gap-2">
                {prepared.followUpQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      setFollowUpsDismissed(true);
                      onFollowUp?.(question);
                    }}
                    className="rounded-full border border-border px-3 py-2 text-sm text-foreground transition-colors hover:border-orange-500/40 hover:bg-orange-500/8 hover:text-foreground"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {type === "deep-research" ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-3.5 w-3.5" />
                Export as PDF
              </Button>
              <Button variant="outline" size="sm" onClick={onSave} disabled={actionBusy || actionDone}>
                {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {actionDone ? "Saved" : "Save to Knowledge Base"}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {typeof prepared.qualityScore === "number" && prepared.sources && prepared.sources.length > 0 ? (
              <Badge className="bg-emerald-500/15 text-emerald-300">
                Quality {Math.round(prepared.qualityScore)}
              </Badge>
            ) : null}
            {credits?.creditsUsed !== undefined ? (
              <Badge className="bg-orange-500/15 text-orange-300">
                <Coins className="h-3 w-3" />
                {credits.creditsUsed} credits used
              </Badge>
            ) : null}
            {credits?.creditsRemaining !== undefined ? (
              <Badge variant="outline" className="border-border text-foreground">
                {credits.creditsRemaining} remaining
              </Badge>
            ) : null}
          </div>
        </div>
      </MessageBubble>
    </>
  );
}

/* ── File Pills (attached files above input) ── */

function FilePills({
  files,
  onRemove,
}: {
  files: PendingFile[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {files.map((f) => (
        <div
          key={f.id}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
            f.error
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : f.uploading
                ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
                : "border-border bg-muted text-foreground"
          )}
        >
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="max-w-[140px] truncate">{f.name}</span>
          <span className="text-muted-foreground">{formatFileSize(f.size)}</span>
          {f.uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Task History Dropdown ── */

function taskTypeIcon(type: string) {
  if (type === "agent_swarm") return "🤖";
  if (type === "computer_use") return "🖥";
  return "🔍";
}

function taskStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return <span className="h-2 w-2 rounded-full bg-emerald-400" />;
    case "RUNNING":
      return <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />;
    case "FAILED":
      return <span className="h-2 w-2 rounded-full bg-red-400" />;
    case "PAUSED":
      return <span className="h-2 w-2 rounded-full bg-amber-400" />;
    case "CANCELLED":
      return <span className="h-2 w-2 rounded-full bg-muted-foreground" />;
    default:
      return <span className="h-2 w-2 rounded-full bg-muted-foreground" />;
  }
}

function TaskHistoryDropdown({
  tasks,
  onSelect,
  onRerun,
}: {
  tasks: QuickUseTaskSummary[];
  onSelect: (taskId: string) => void;
  onRerun: (inputPreview: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-1.5"
      >
        <History className="h-3.5 w-3.5" />
        History
        <Badge className="bg-muted/20 text-foreground">{tasks.length}</Badge>
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl border border-border bg-muted p-2 shadow-2xl">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSelect(task.id);
                }}
                className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted"
              >
                <span className="mt-0.5 text-base">{taskTypeIcon(task.type)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {taskStatusBadge(task.status)}
                    <p className="truncate text-sm text-foreground">{task.inputPreview || "Task"}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                    {task.creditsUsed > 0 ? <span>{task.creditsUsed} credits</span> : null}
                  </div>
                </div>
                {task.hasResult ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      onRerun(task.inputPreview);
                    }}
                    className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-orange-500/30 hover:text-orange-300"
                    title="Rerun with same input"
                  >
                    <RefreshCcw className="h-3 w-3" />
                  </button>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Background Execution Banner ── */

function BackgroundBanner({
  taskId,
  onStop,
}: {
  taskId: string;
  onStop?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/8 px-4 py-3 text-sm text-blue-200">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Circle className="h-2.5 w-2.5 animate-pulse fill-blue-400 text-blue-400" />
          <span>Running in background — you can close this tab.</span>
        </div>
        {onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
          >
            <Square className="mr-1 inline h-3 w-3" />
            Stop
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-blue-300/60">
        We&apos;ll notify you when done. Task ID: {taskId.slice(0, 8)}...
      </p>
    </div>
  );
}

/* ── Task Control Bar (replaces input area during execution) ── */

function TaskControlBar({
  isPaused,
  isStopping,
  onIntervene,
}: {
  isPaused: boolean;
  isStopping: boolean;
  onIntervene: (type: InterventionType, message: string) => Promise<void>;
}) {
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [feedbackInput, setFeedbackInput] = useState("");
  const [sending, setSending] = useState(false);
  const feedbackRef = useRef<HTMLInputElement>(null);

  async function sendIntervention(type: InterventionType, message?: string) {
    setSending(true);
    try {
      await onIntervene(type, message || "");
      if (type === "add_context") {
        setFeedbackInput("");
        setFeedbackMode(false);
      }
    } finally {
      setSending(false);
    }
  }

  // Focus feedback input when entering feedback mode
  useEffect(() => {
    if (feedbackMode) feedbackRef.current?.focus();
  }, [feedbackMode]);

  if (isStopping) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-red-400" />
        <span className="text-sm font-medium text-red-300">Stopping task...</span>
      </div>
    );
  }

  if (feedbackMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-2xl border border-orange-500/20 bg-card p-2">
          <input
            ref={feedbackRef}
            type="text"
            value={feedbackInput}
            onChange={(e) => setFeedbackInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && feedbackInput.trim()) {
                void sendIntervention("add_context", feedbackInput.trim());
              }
              if (e.key === "Escape") {
                setFeedbackMode(false);
                setFeedbackInput("");
              }
            }}
            placeholder="Tell the agent what to do differently..."
            disabled={sending}
            className="flex-1 rounded-lg border-0 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-40"
          />
          <button
            type="button"
            onClick={() => {
              if (feedbackInput.trim()) {
                void sendIntervention("add_context", feedbackInput.trim());
              }
            }}
            disabled={sending || !feedbackInput.trim()}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-orange-500/20 px-3 text-sm text-orange-300 transition-colors hover:bg-orange-500/30 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
            Send
          </button>
          <button
            type="button"
            onClick={() => { setFeedbackMode(false); setFeedbackInput(""); }}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Pause / Resume */}
      {isPaused ? (
        <button
          type="button"
          onClick={() => sendIntervention("resume")}
          disabled={sending}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
        >
          <Play className="h-4 w-4" />
          Resume
        </button>
      ) : (
        <button
          type="button"
          onClick={() => sendIntervention("pause")}
          disabled={sending}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
        >
          <Pause className="h-4 w-4" />
          Pause
        </button>
      )}

      {/* Stop — most prominent */}
      <button
        type="button"
        onClick={() => sendIntervention("cancel")}
        disabled={sending}
        className="flex h-11 flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
      >
        <Square className="h-4 w-4" />
        Stop Task
      </button>

      {/* Give Feedback */}
      <button
        type="button"
        onClick={() => setFeedbackMode(true)}
        disabled={isPaused}
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:border-orange-500/20 hover:text-orange-300 disabled:opacity-40"
      >
        <MessageSquare className="h-4 w-4" />
        Feedback
      </button>
    </div>
  );
}

function MemoryBanner({
  memories,
  selected,
  onUse,
  onDismiss,
}: {
  memories: QuickUseMemoryPreview[];
  selected: boolean;
  onUse: () => void;
  onDismiss: () => void;
}) {
  if (memories.length === 0) return null;

  const primary = memories[0];
  const extraCount = Math.max(0, memories.length - 1);

  return (
    <div className="mb-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
            Related Context
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            {primary.ageLabel}: {primary.summary}
          </p>
          {primary.highlights?.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {primary.highlights.join(" · ")}
            </p>
          ) : null}
          {extraCount > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              +{extraCount} more related task{extraCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onUse}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              selected
                ? "border-orange-500/40 bg-orange-500/12 text-orange-200"
                : "border-border text-foreground hover:border-orange-500/35 hover:text-foreground"
            )}
          >
            {selected ? "Context Pinned" : "Use This Context"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss related context"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */

export function QuickUseChat({
  title,
  subtitle,
  icon: Icon,
  examplePrompts,
  apiEndpoint,
  type,
}: QuickUseChatProps) {
  const { userId } = useAuth();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [activeProgress, setActiveProgress] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatusCard>>({});
  const [findings, setFindings] = useState<string[]>([]);
  const [estimatedCredits, setEstimatedCredits] = useState<number | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle");
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const preliminaryResultIdRef = useRef<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [taskHistory, setTaskHistory] = useState<QuickUseTaskSummary[]>([]);
  const [interventionMessages, setInterventionMessages] = useState<string[]>([]);
  const [memorySuggestions, setMemorySuggestions] = useState<QuickUseMemoryPreview[]>([]);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  const [dismissedMemoryKey, setDismissedMemoryKey] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<Record<string, string[]> | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [browserView, setBrowserView] = useState<BrowserViewState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orderedAgentStatuses = Object.values(agentStatuses).sort((a, b) => a.id.localeCompare(b.id));

  // Fetch task history on mount
  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/quick-use/tasks");
        if (res.ok) {
          const data = await res.json() as { tasks: QuickUseTaskSummary[] };
          setTaskHistory(data.tasks);
        }
      } catch {
        // Ignore — history is non-critical
      }
    }
    void fetchHistory();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeProgress, findings, orderedAgentStatuses.length]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    const query = input.trim();
    if (!userId || isStreaming || query.length < 3) {
      if (query.length === 0) {
        setMemorySuggestions([]);
        setSelectedMemoryIds([]);
        setDismissedMemoryKey(null);
      }
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quick-use/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: query, type }),
          signal: controller.signal,
        });
        if (!response.ok) return;

        const data = await response.json() as { memories?: QuickUseMemoryPreview[] };
        const memories = Array.isArray(data.memories) ? data.memories : [];
        const memoryIds = new Set(memories.map((memory) => memory.id));
        setMemorySuggestions(memories);
        setSelectedMemoryIds((current) => current.filter((id) => memoryIds.has(id)));
      } catch {
        // Ignore aborted or transient memory lookups
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [input, isStreaming, type, userId]);

  const memorySuggestionKey = memorySuggestions.map((memory) => memory.id).join(":");
  const showMemoryBanner = input.trim().length >= 3
    && memorySuggestions.length > 0
    && (selectedMemoryIds.length > 0 || dismissedMemoryKey !== memorySuggestionKey);

  function resetChat() {
    setMessages([]);
    setInput("");
    setActiveProgress(null);
    setAgentStatuses({});
    setFindings([]);
    setEstimatedCredits(undefined);
    setIsStreaming(false);
    setSavingState("idle");
    setActiveResultId(null);
    preliminaryResultIdRef.current = null;
    setDebugLogs(null);
    setPendingFiles([]);
    setIsDragOver(false);
    setActiveTaskId(null);
    setIsPaused(false);
    setIsStopping(false);
    setInterventionMessages([]);
    setMemorySuggestions([]);
    setSelectedMemoryIds([]);
    setDismissedMemoryKey(null);
    setBrowserView(null);
    setLightboxSrc(null);
  }

  function appendMessage(entry: ChatEntry) {
    setMessages((current) => [...current, entry]);
  }

  /** Update an existing message by ID, or append if not found */
  function updateMessage(id: string, entry: ChatEntry) {
    setMessages((current) => {
      const idx = current.findIndex((m) => m.id === id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = entry;
        return updated;
      }
      return [...current, entry];
    });
  }

  /* ── File handling ── */

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: PendingFile[] = [];

    for (const file of Array.from(fileList)) {
      if (!isAllowedFile(file)) {
        newFiles.push({
          id: createId(),
          file,
          name: file.name,
          size: file.size,
          uploading: false,
          error: "Unsupported file type",
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        newFiles.push({
          id: createId(),
          file,
          name: file.name,
          size: file.size,
          uploading: false,
          error: "File exceeds 10 MB",
        });
        continue;
      }
      newFiles.push({
        id: createId(),
        file,
        name: file.name,
        size: file.size,
        uploading: false,
      });
    }

    setPendingFiles((current) => {
      const combined = [...current, ...newFiles];
      return combined.slice(-MAX_FILES_PER_MESSAGE);
    });
  }, []);

  function removePendingFile(id: string) {
    setPendingFiles((current) => current.filter((f) => f.id !== id));
  }

  async function uploadPendingFiles(): Promise<QuickUseFileAttachment[]> {
    const valid = pendingFiles.filter((f) => !f.error);
    if (valid.length === 0) return [];

    setPendingFiles((current) =>
      current.map((f) => (f.error ? f : { ...f, uploading: true }))
    );

    const formData = new FormData();
    for (const pf of valid) {
      formData.append("files", pf.file);
    }

    const response = await fetch("/api/quick-use/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Upload failed" })) as { error?: string };
      throw new Error(err.error || "Upload failed");
    }

    const data = (await response.json()) as {
      attachments: QuickUseFileAttachment[];
      errors?: string[];
    };

    return data.attachments;
  }

  /* ── Drag and Drop ── */

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  /* ── Research save ── */

  async function saveResearchResult(result: QuickUseResult, entryId: string) {
    try {
      setActiveResultId(entryId);
      setSavingState("saving");
      const response = await fetch("/api/quick-use/deep-research/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          summary: result.summary,
          markdown: result.markdown,
          sources: result.sources,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Save failed" })) as { error?: string };
        throw new Error(error.error || "Save failed");
      }

      setSavingState("saved");
      appendMessage({
        id: createId(),
        kind: "assistant",
        content: `Saved "${result.title || "Research Report"}" to the Knowledge Base.`,
      });
      setActiveResultId(entryId);
    } catch (error) {
      appendMessage({
        id: createId(),
        kind: "error",
        content: error instanceof Error ? error.message : "Save failed",
      });
      setSavingState("idle");
    }
  }

  /* ── Intervention ── */

  async function handleIntervene(interventionType: InterventionType, message: string) {
    if (!activeTaskId) return;

    // Show stopping state immediately for cancel
    if (interventionType === "cancel") {
      setIsStopping(true);
    }

    try {
      const res = await fetch(`/api/quick-use/tasks/${activeTaskId}/intervene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: interventionType, message }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" })) as { error?: string };
        setIsStopping(false);
        appendMessage({
          id: createId(),
          kind: "error",
          content: err.error || "Intervention failed",
        });
        return;
      }

      if (interventionType === "pause") {
        setIsPaused(true);
        setActiveProgress("Paused — waiting for you to resume.");
      } else if (interventionType === "resume") {
        setIsPaused(false);
        setActiveProgress("Resuming...");
      } else if (interventionType === "cancel") {
        setActiveProgress(null);
        setIsStreaming(false);
        setIsStopping(false);
        setBrowserView((prev) =>
          prev ? { ...prev, status: "failed", thinkingText: null } : prev
        );
        appendMessage({
          id: createId(),
          kind: "assistant",
          content: "Task stopped. Partial results may be available in History.",
        });
      } else if (message) {
        setInterventionMessages((prev) => [...prev, message]);
      }
    } catch {
      setIsStopping(false);
      appendMessage({
        id: createId(),
        kind: "error",
        content: "Could not send intervention.",
      });
    }
  }

  /* ── Load task from history ── */

  async function loadTaskFromHistory(taskId: string) {
    try {
      const res = await fetch(`/api/quick-use/tasks/${taskId}`);
      if (!res.ok) return;

      const data = await res.json() as { task: QuickUseTaskDetail };
      const task = data.task;

      resetChat();

      // Restore messages from task
      appendMessage({
        id: createId(),
        kind: "user",
        content: task.input.message,
      });

      if (task.status === "RUNNING" || task.status === "PAUSED") {
        setActiveTaskId(task.id);
        setIsPaused(task.status === "PAUSED");
        setActiveProgress(task.progress?.currentStep || "Running...");
        setIsStreaming(true);

        // Poll for updates
        void pollTaskStatus(task.id);
      } else if (task.result) {
        appendMessage({
          id: createId(),
          kind: "result",
          result: task.result,
          credits: task.credits || undefined,
        });
      } else if (task.error) {
        appendMessage({
          id: createId(),
          kind: "error",
          content: task.error,
        });
      }
    } catch {
      appendMessage({
        id: createId(),
        kind: "error",
        content: "Could not load task.",
      });
    }
  }

  async function pollTaskStatus(taskId: string) {
    const pollInterval = 3000;
    const maxPolls = 200; // ~10 minutes max
    let polls = 0;

    while (polls < maxPolls) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      polls++;

      try {
        const res = await fetch(`/api/quick-use/tasks/${taskId}`);
        if (!res.ok) break;

        const data = await res.json() as { task: QuickUseTaskDetail };
        const task = data.task;

        if (task.progress?.currentStep) {
          setActiveProgress(task.progress.currentStep);
        }

        if (task.status === "COMPLETED" && task.result) {
          setActiveProgress(null);
          setIsStreaming(false);
          setActiveTaskId(null);
          appendMessage({
            id: createId(),
            kind: "result",
            result: task.result,
            credits: task.credits || undefined,
          });
          return;
        }

        if (task.status === "FAILED") {
          setActiveProgress(null);
          setIsStreaming(false);
          setActiveTaskId(null);
          appendMessage({
            id: createId(),
            kind: "error",
            content: task.error || "Task failed",
          });
          return;
        }

        if (task.status === "CANCELLED") {
          setActiveProgress(null);
          setIsStreaming(false);
          setActiveTaskId(null);
          appendMessage({
            id: createId(),
            kind: "assistant",
            content: "Task was cancelled.",
          });
          return;
        }

        setIsPaused(task.status === "PAUSED");
      } catch {
        break;
      }
    }
  }

  /* ── Swarm events ── */

  function handleSwarmEvent(event: Extract<QuickUseStreamEvent, { type: "swarm_event" }>["event"]) {
    switch (event.type) {
      case "agent.started": {
        const id = String(event.data.agentId);
        setAgentStatuses((current) => ({
          ...current,
          [id]: {
            id,
            task: String(event.data.task || "Working"),
            status: "running",
            model: String(event.data.model || ""),
          },
        }));
        break;
      }
      case "agent.spawned": {
        const id = String(event.data.newAgentId);
        setAgentStatuses((current) => ({
          ...current,
          [id]: {
            id,
            task: String(event.data.task || "Spawned subtask"),
            status: "queued",
            detail: `Spawned by ${String(event.data.parentId || "another agent")}`,
          },
        }));
        break;
      }
      case "agent.tool_called": {
        const id = String(event.data.agentId);
        setAgentStatuses((current) => ({
          ...current,
          [id]: {
            ...(current[id] || {
              id,
              task: id,
              status: "running" as const,
            }),
            detail: `Using ${String(event.data.tool || "tool")}`,
          },
        }));
        break;
      }
      case "agent.completed": {
        const id = String(event.data.agentId);
        setAgentStatuses((current) => ({
          ...current,
          [id]: {
            ...(current[id] || {
              id,
              task: id,
              status: "completed" as const,
            }),
            status: "completed",
            detail: String(event.data.resultSummary || "Completed"),
          },
        }));
        break;
      }
      case "agent.failed": {
        const id = String(event.data.agentId);
        setAgentStatuses((current) => ({
          ...current,
          [id]: {
            ...(current[id] || {
              id,
              task: id,
              status: "failed" as const,
            }),
            status: "failed",
            detail: String(event.data.error || "Failed"),
          },
        }));
        break;
      }
      case "agent.finding": {
        setFindings((current) => [
          ...current.slice(-5),
          `${String(event.data.agentId)}: ${String(event.data.key)} — ${formatSwarmFinding(event.data.value)}`,
        ]);
        break;
      }
      default:
        break;
    }
  }

  /* ── Send ── */

  async function handleSend(override?: string) {
    const message = (override ?? input).trim();
    if (!message || isStreaming) return;

    const hasFiles = pendingFiles.some((f) => !f.error);
    const pinnedMemoryIds = [...selectedMemoryIds];

    setInput("");
    setActiveProgress(hasFiles ? "Uploading files..." : "Starting execution...");
    setAgentStatuses({});
    setFindings([]);
    setEstimatedCredits(undefined);
    setSavingState("idle");
    setActiveResultId(null);
    setMemorySuggestions([]);
    setSelectedMemoryIds([]);
    setDismissedMemoryKey(null);

    const userFiles = pendingFiles
      .filter((f) => !f.error)
      .map((f) => ({ name: f.name, size: f.size }));

    appendMessage({
      id: createId(),
      kind: "user",
      content: message,
      ...(userFiles.length > 0 ? { files: userFiles } : {}),
    });
    setIsStreaming(true);

    try {
      let fileAttachments: QuickUseFileAttachment[] = [];
      if (hasFiles) {
        fileAttachments = await uploadPendingFiles();
        setPendingFiles([]);
        setActiveProgress("Starting execution...");
      }

      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          userId,
          ...(pinnedMemoryIds.length > 0 ? { memoryIds: pinnedMemoryIds } : {}),
          ...(fileAttachments.length > 0 ? { files: fileAttachments } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string };
        throw new Error(error.error || "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            const event = JSON.parse(data) as QuickUseStreamEvent;

            if (event.type === "meta") {
              setEstimatedCredits(event.meta.estimatedCredits);
              if (event.meta.taskId) {
                setActiveTaskId(event.meta.taskId);
              }
              // Initialize live browser view for computer-use
              if (type === "computer-use") {
                setBrowserView({
                  currentUrl: "",
                  currentStep: 0,
                  maxSteps: 10,
                  liveScreenshot: null,
                  actionLog: [],
                  screenshotTimeline: [],
                  thinkingText: null,
                  status: "running",
                });
              }
            }

            if (event.type === "progress") {
              if (!isInternalWarning(event.message)) {
                setActiveProgress(event.message);
              }
            }

            if (event.type === "finding") {
              setFindings((current) => [...current.slice(-5), event.message]);
            }

            if (event.type === "swarm_event") {
              handleSwarmEvent(event.event);
            }

            if (event.type === "memory") {
              setMemorySuggestions(event.memories);
            }

            // Live browser view events
            if (event.type === "browser_navigation") {
              setBrowserView((prev) =>
                prev
                  ? { ...prev, currentUrl: event.url, currentStep: event.stepIndex + 1 }
                  : prev
              );
            }

            if (event.type === "browser_screenshot") {
              setBrowserView((prev) => {
                if (!prev) return prev;
                const thumb: ScreenshotThumb = {
                  stepIndex: event.stepIndex,
                  imageData: event.imageData,
                  url: event.url,
                  timestamp: Date.now(),
                };
                return {
                  ...prev,
                  liveScreenshot: event.imageData,
                  screenshotTimeline: [...prev.screenshotTimeline, thumb].slice(-20),
                };
              });
            }

            if (event.type === "browser_action") {
              setBrowserView((prev) => {
                if (!prev) return prev;
                const entry: ActionLogEntry = {
                  stepIndex: event.step.stepIndex,
                  action: event.step.action,
                  actionDetail: event.step.actionDetail,
                  url: event.step.url,
                  success: event.step.success,
                  durationMs: event.step.durationMs,
                  timestamp: Date.now(),
                };
                return {
                  ...prev,
                  actionLog: [...prev.actionLog, entry].slice(-50),
                };
              });
            }

            if (event.type === "browser_thinking") {
              setBrowserView((prev) =>
                prev
                  ? { ...prev, thinkingText: event.thought }
                  : prev
              );
            }

            if (event.type === "browser_step_complete") {
              setBrowserView((prev) =>
                prev
                  ? { ...prev, currentStep: event.stepIndex + 1 }
                  : prev
              );
            }

            if (event.type === "preliminary_result") {
              // Update existing preliminary card or create one
              const existingId = preliminaryResultIdRef.current;
              const entry: ChatEntry = {
                id: existingId || createId(),
                kind: "result",
                result: event.result,
                credits: { estimatedCredits: estimatedCredits ?? 0 },
              };
              if (existingId) {
                updateMessage(existingId, entry);
              } else {
                preliminaryResultIdRef.current = entry.id;
                appendMessage(entry);
                setActiveResultId(entry.id);
              }
            }

            if (event.type === "result") {
              setActiveProgress(null);
              setBrowserView((prev) =>
                prev ? { ...prev, status: "completed", thinkingText: null } : prev
              );
              const resultEntry: ChatEntry = {
                id: preliminaryResultIdRef.current || createId(),
                kind: "result",
                result: event.result,
                credits: {
                  estimatedCredits: event.credits?.estimatedCredits ?? estimatedCredits,
                  creditsUsed: event.credits?.creditsUsed,
                  creditsRemaining: event.credits?.creditsRemaining,
                },
              };
              // Replace preliminary card with final result, or append new
              if (preliminaryResultIdRef.current) {
                updateMessage(preliminaryResultIdRef.current, resultEntry);
              } else {
                appendMessage(resultEntry);
              }
              setActiveResultId(resultEntry.id);
              preliminaryResultIdRef.current = null;
            }

            if (event.type === "debug") {
              setDebugLogs(event.debugLogs);
            }

            if (event.type === "agent_debug") {
              setDebugLogs((prev) => ({
                ...prev,
                [event.agentId]: event.debugLog,
              }));
            }

            if (event.type === "error") {
              setActiveProgress(null);
              setBrowserView((prev) =>
                prev ? { ...prev, status: "failed", thinkingText: null } : prev
              );
              appendMessage({
                id: createId(),
                kind: "error",
                content: event.error,
                suggestions: event.suggestions,
              });
            }
          }
        }
      }
    } catch (error) {
      setActiveProgress(null);
      // If we already have a result, suppress network errors (stream timed out but result was already delivered)
      const hasResult = messages.some((m) => m.kind === "result") || preliminaryResultIdRef.current;
      if (!hasResult) {
        appendMessage({
          id: createId(),
          kind: "error",
          content: error instanceof Error ? error.message : "Request failed",
        });
      }
    } finally {
      setIsStreaming(false);
      setPendingFiles([]);
      setActiveTaskId(null);
      setIsPaused(false);
      setIsStopping(false);

      // Fallback: if stream ended with only a preliminary result (no final "result" event),
      // promote the preliminary to a final result with a partial-data note
      setMessages((prev) => {
        const hasFinalResult = prev.some(
          (m) => m.kind === "result" && !(m.result.meta as Record<string, unknown> | undefined)?.stage
        );
        if (hasFinalResult) return prev;

        const prelimId = preliminaryResultIdRef.current;
        if (!prelimId) return prev;

        return prev.map((m) => {
          if (m.id !== prelimId || m.kind !== "result") return m;
          const r = m.result;
          return {
            ...m,
            result: {
              ...r,
              title: r.title?.replace(/^Interim Findings/, "Results") || r.title,
              summary: r.summary + "\n\n⚠️ Results based on partial agent data (stream ended before final merge).",
              meta: { ...((r.meta as Record<string, unknown>) || {}), stage: undefined, partialResult: true },
            },
          };
        });
      });
      preliminaryResultIdRef.current = null;
      // Refresh task history
      fetch("/api/quick-use/tasks")
        .then((r) => r.json())
        .then((data: { tasks: QuickUseTaskSummary[] }) => setTaskHistory(data.tasks))
        .catch(() => {});
    }
  }

  return (
    <div
      className={cn(
        "relative mx-auto flex min-h-[78vh] max-w-6xl overflow-hidden rounded-[30px] border bg-muted shadow-[0_28px_90px_rgba(0,0,0,0.36)]",
        isDragOver ? "border-orange-500/50" : "border-border"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(120,53,15,0.22),transparent_28%)]" />

      {/* Drag overlay */}
      {isDragOver ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-orange-500/30 bg-card p-8">
            <Paperclip className="h-8 w-8 text-orange-400" />
            <p className="text-lg font-medium text-foreground">Drop files here</p>
            <p className="text-sm text-muted-foreground">PDF, DOCX, XLSX, CSV, TXT, JSON, PNG, JPG</p>
          </div>
        </div>
      ) : null}

      <div className="relative flex flex-1 flex-col">
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-orange-500/20 bg-orange-500/10 text-orange-300">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-serif text-2xl text-foreground">{title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <TaskHistoryDropdown
                tasks={taskHistory}
                onSelect={(id) => void loadTaskFromHistory(id)}
                onRerun={(preview) => {
                  setInput(preview);
                  textareaRef.current?.focus();
                }}
              />
              <Button variant="outline" onClick={resetChat}>
                <RefreshCcw className="h-3.5 w-3.5" />
                New Chat
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {type === "agent-swarm" ? <AgentStatusGrid statuses={orderedAgentStatuses} /> : null}

          {findings.length > 0 ? (
            <div className="mb-5 rounded-2xl border border-border bg-card/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
                Progressive Findings
              </p>
              <div className="mt-3 space-y-2">
                {findings.map((finding, index) => (
                  <div
                    key={`${finding}-${index}`}
                    className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground"
                  >
                    {finding}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-5">
            {messages.map((message) => {
              if (message.kind === "user") {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="flex max-w-2xl items-start gap-3">
                      <div className="space-y-2">
                        <div className="rounded-[24px] bg-[linear-gradient(135deg,#f97316,#ea580c)] px-5 py-4 text-sm leading-relaxed text-white shadow-[0_18px_42px_rgba(249,115,22,0.24)]">
                          {message.content}
                        </div>
                        {message.files?.length ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {message.files.map((f) => (
                              <span
                                key={f.name}
                                className="inline-flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-500/10 px-2.5 py-1 text-[11px] text-orange-200"
                              >
                                <Paperclip className="h-2.5 w-2.5" />
                                {f.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 text-orange-200">
                        <User className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                );
              }

              if (message.kind === "assistant") {
                return (
                  <MessageBubble key={message.id} icon={<Sparkles className="h-4 w-4" />}>
                    <p className="whitespace-pre-wrap leading-relaxed text-foreground">{message.content}</p>
                  </MessageBubble>
                );
              }

              if (message.kind === "error") {
                return (
                  <MessageBubble key={message.id} icon={<Sparkles className="h-4 w-4" />}>
                    <ErrorState
                      compact
                      message={message.content}
                    />
                    {message.suggestions?.length ? (
                      <div className="mt-3 space-y-1">
                        {message.suggestions.map((suggestion) => (
                          <p key={suggestion} className="text-xs text-muted-foreground">
                            {suggestion}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </MessageBubble>
                );
              }

              return (
                <ResultCard
                  key={message.id}
                  result={message.result}
                  credits={message.credits}
                  type={type}
                  onExport={
                    type === "deep-research"
                      ? () => exportResearchAsPdf(message.result)
                      : undefined
                  }
                  onSave={
                    type === "deep-research"
                      ? () => saveResearchResult(message.result, message.id)
                      : undefined
                  }
                  actionBusy={savingState === "saving" && activeResultId === message.id}
                  actionDone={savingState === "saved" && activeResultId === message.id}
                  onFollowUp={(question) => {
                    void handleSend(question);
                  }}
                />
              );
            })}

            {debugLogs && Object.keys(debugLogs).length > 0 && (
              <details className="mt-2 rounded-lg border border-border bg-card/50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-mono text-muted-foreground select-none">
                  Debug Log ({Object.values(debugLogs).reduce((s, l) => s + l.length, 0)} entries)
                </summary>
                <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                  {Object.entries(debugLogs).map(([agentId, lines]) => (
                    <div key={agentId}>
                      <div className="text-[10px] font-mono font-bold text-orange-400">{agentId}</div>
                      {lines.map((line, i) => (
                        <div key={i} className="text-[10px] font-mono text-muted-foreground leading-tight pl-2">
                          {line}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {activeProgress ? (
              <div className="space-y-3">
                <MessageBubble
                  icon={isPaused ? <Pause className="h-4 w-4 text-amber-400" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  className="border-orange-500/20 bg-[linear-gradient(180deg,rgba(34,20,12,0.95),rgba(27,20,16,0.94))]"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm leading-relaxed text-foreground">{activeProgress}</p>
                    {estimatedCredits ? (
                      <Badge className="bg-orange-500/15 text-orange-300">
                        <Coins className="h-3 w-3" />
                        ~{estimatedCredits} credits
                      </Badge>
                    ) : null}
                  </div>
                </MessageBubble>

                {/* Live Browser View for Computer Use */}
                {browserView && type === "computer-use" ? (
                  <LiveBrowserView
                    state={browserView}
                    onScreenshotClick={(src) => setLightboxSrc(src)}
                  />
                ) : null}

                {activeTaskId ? (
                  <BackgroundBanner
                    taskId={activeTaskId}
                    onStop={() => void handleIntervene("cancel", "")}
                  />
                ) : null}

                {/* User intervention messages */}
                {interventionMessages.map((msg, i) => (
                  <div key={`int-${i}`} className="flex justify-end">
                    <div className="max-w-md rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-200">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-blue-400">You: </span>
                      {msg}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {messages.length === 0 && !activeProgress ? (
              <div className="flex min-h-[34vh] items-center justify-center">
                <div className="max-w-2xl text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-orange-500/20 bg-orange-500/10 text-orange-300">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h2 className="font-serif text-3xl text-foreground">{title}</h2>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">{subtitle}</p>
                </div>
              </div>
            ) : null}
          </div>
          <div ref={scrollRef} />
        </div>

        {/* Input area / Task controls */}
        <div className="border-t border-border bg-card/95 px-4 py-4 backdrop-blur-sm sm:px-6">
          {/* Task control bar — shown during active execution */}
          {(isStreaming || activeTaskId) ? (
            <TaskControlBar
              isPaused={isPaused}
              isStopping={isStopping}
              onIntervene={handleIntervene}
            />
          ) : (
            <>
              {messages.length === 0 ? (
                <div className="mb-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7d6f66]">
                    Example Prompts
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {examplePrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        className="rounded-full border border-border bg-muted px-4 py-2 text-left text-sm text-foreground transition-colors hover:border-orange-500/30 hover:bg-muted hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-[26px] border border-border bg-card p-3 shadow-[0_-12px_35px_rgba(0,0,0,0.18)]">
                {showMemoryBanner ? (
                  <MemoryBanner
                    memories={memorySuggestions}
                    selected={selectedMemoryIds.length > 0}
                    onUse={() => {
                      setSelectedMemoryIds(memorySuggestions.map((memory) => memory.id));
                      setDismissedMemoryKey(null);
                    }}
                    onDismiss={() => setDismissedMemoryKey(memorySuggestionKey)}
                  />
                ) : null}

                {/* File pills */}
                <FilePills files={pendingFiles} onRemove={removePendingFile} />

                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Describe what you want done..."
                  className="min-h-[72px] resize-none border-0 bg-transparent px-2 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* Attach file button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition-colors hover:border-orange-500/30 hover:text-orange-300 disabled:opacity-40"
                      title="Attach files (PDF, DOCX, XLSX, CSV, TXT, JSON, PNG, JPG)"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ALLOWED_EXTENSIONS.join(",")}
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          addFiles(e.target.files);
                          e.target.value = "";
                        }
                      }}
                    />

                    <p className="text-xs text-[#776b63]">
                      {type === "agent-swarm"
                        ? "Complex tasks are split across multiple agents."
                        : type === "deep-research"
                          ? "Research results stream in as sources are processed."
                          : "Direct browser execution with live step updates."}
                    </p>
                  </div>

                  <Button
                    onClick={() => handleSend()}
                    disabled={(!input.trim() && pendingFiles.length === 0) || isStreaming}
                    className="h-11 rounded-2xl bg-[linear-gradient(135deg,#f97316,#ea580c)] px-4 text-white hover:opacity-95"
                  >
                    {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Screenshot lightbox */}
      {lightboxSrc ? (
        <ScreenshotLightbox
          src={lightboxSrc}
          alt="Browser screenshot"
          onClose={() => setLightboxSrc(null)}
        />
      ) : null}
    </div>
  );
}
