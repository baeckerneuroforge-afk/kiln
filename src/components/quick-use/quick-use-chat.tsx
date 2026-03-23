"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  Clipboard,
  Coins,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  Paperclip,
  RefreshCcw,
  Save,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/ui/error-state";
import { MarkdownMessage } from "@/components/agents/markdown-message";
import { cn } from "@/lib/utils";
import type {
  QuickUseCreditInfo,
  QuickUseFileAttachment,
  QuickUseGeneratedFile,
  QuickUseResult,
  QuickUseStreamEvent,
  QuickUseType,
} from "@/lib/quick-use/types";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_FILES_PER_MESSAGE,
} from "@/lib/quick-use/types";

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
    <div className="group relative overflow-hidden rounded-2xl border border-white/6 bg-black/20">
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
        <p className="text-xs text-zinc-400">{name}</p>
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
      return <FileSpreadsheet className="h-5 w-5 text-zinc-400" />;
  }
}

function GeneratedFileCard({ file }: { file: QuickUseGeneratedFile }) {
  return (
    <a
      href={file.url}
      download={file.name}
      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 transition-colors hover:border-white/14 hover:bg-white/[0.06]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/6 bg-white/[0.04]">
        <GeneratedFileIcon kind={file.kind} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{file.name}</p>
        <p className="text-xs text-zinc-400">{file.kind.toUpperCase()} &middot; {formatFileSize(file.size)}</p>
      </div>
      <Download className="h-4 w-4 shrink-0 text-zinc-400" />
    </a>
  );
}

/* ── UI Components ── */

function MessageBubble({ children, icon, className }: {
  children: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#201b17] text-kiln-orange">
        {icon}
      </div>
      <div className={cn("w-full max-w-3xl rounded-[24px] border border-[#332f2b] bg-[#1d1916]/95 p-4 text-sm text-zinc-200 shadow-[0_16px_40px_rgba(0,0,0,0.22)]", className)}>
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
          className="rounded-2xl border border-[#332f2b] bg-[#171311]/90 p-4"
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
                status.status === "queued" && "bg-zinc-500/15 text-zinc-300"
              )}
            >
              {status.status}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-zinc-100">{status.task}</p>
          {status.detail ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{status.detail}</p>
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

function ResultCard({
  result,
  credits,
  type,
  onExport,
  onSave,
  actionBusy,
  actionDone,
}: {
  result: QuickUseResult;
  credits?: QuickUseCreditInfo;
  type: QuickUseType;
  onExport?: () => void;
  onSave?: () => void;
  actionBusy?: boolean;
  actionDone?: boolean;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null);

  // Filter internal warnings from user-facing text
  const cleanSummary = filterWarnings(result.summary);
  const cleanMarkdown = result.markdown ? filterWarnings(result.markdown) : undefined;

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
        className="bg-[linear-gradient(180deg,rgba(36,26,20,0.97),rgba(24,20,17,0.96))]"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            {result.title ? <h3 className="text-base font-semibold text-white">{result.title}</h3> : null}
            <p className="text-sm leading-relaxed text-zinc-300">{cleanSummary}</p>
          </div>

          {cleanMarkdown ? (
            <div className="rounded-2xl border border-white/6 bg-black/15 p-4 text-[15px] leading-7 text-zinc-200">
              <MarkdownMessage content={cleanMarkdown} />
            </div>
          ) : null}

          {result.data !== undefined ? (
            <div className="rounded-2xl border border-white/6 bg-black/20 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
                Structured Data
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-zinc-300">
                {stringifyData(result.data)}
              </pre>
            </div>
          ) : null}

          {/* Generated Files */}
          {result.generatedFiles?.length ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
                Generated Files
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.generatedFiles.map((file) => (
                  <GeneratedFileCard key={`${file.name}-${file.url}`} file={file} />
                ))}
              </div>
            </div>
          ) : null}

          {result.artifacts?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {result.artifacts.map((artifact) => (
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
                    <div className="flex items-center justify-between overflow-hidden rounded-2xl border border-white/6 bg-black/20 p-4">
                      <div>
                        <p className="text-sm font-medium text-white">{artifact.name}</p>
                        <p className="text-xs text-zinc-400">{artifact.mimeType || artifact.kind}</p>
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

        {result.sources?.length ? (
          <div className="rounded-2xl border border-white/6 bg-black/15 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
              Sources
            </p>
            <div className="space-y-3">
              {result.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-white/6 bg-white/[0.02] p-3 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{source.title || source.url}</p>
                    <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
                  </div>
                  {source.domain ? <p className="mt-1 text-xs text-orange-300">{source.domain}</p> : null}
                  {source.snippet ? <p className="mt-2 text-xs leading-relaxed text-zinc-400">{source.snippet}</p> : null}
                </a>
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
          {typeof result.qualityScore === "number" ? (
            <Badge className="bg-emerald-500/15 text-emerald-300">
              Quality {Math.round(result.qualityScore)}
            </Badge>
          ) : null}
          {credits?.creditsUsed !== undefined ? (
            <Badge className="bg-orange-500/15 text-orange-300">
              <Coins className="h-3 w-3" />
              {credits.creditsUsed} credits used
            </Badge>
          ) : null}
          {credits?.creditsRemaining !== undefined ? (
            <Badge variant="outline" className="border-[#40372f] text-zinc-300">
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
                : "border-[#3a322d] bg-[#201a17] text-zinc-300"
          )}
        >
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="max-w-[140px] truncate">{f.name}</span>
          <span className="text-zinc-500">{formatFileSize(f.size)}</span>
          {f.uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              className="rounded-full p-0.5 text-zinc-400 transition-colors hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
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
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orderedAgentStatuses = Object.values(agentStatuses).sort((a, b) => a.id.localeCompare(b.id));

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeProgress, findings, orderedAgentStatuses.length]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
  }, [input]);

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
    setPendingFiles([]);
    setIsDragOver(false);
  }

  function appendMessage(entry: ChatEntry) {
    setMessages((current) => [...current, entry]);
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

    setInput("");
    setActiveProgress(hasFiles ? "Uploading files..." : "Starting execution...");
    setAgentStatuses({});
    setFindings([]);
    setEstimatedCredits(undefined);
    setSavingState("idle");
    setActiveResultId(null);

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

            if (event.type === "result") {
              setActiveProgress(null);
              const id = createId();
              appendMessage({
                id,
                kind: "result",
                result: event.result,
                credits: {
                  estimatedCredits: event.credits?.estimatedCredits ?? estimatedCredits,
                  creditsUsed: event.credits?.creditsUsed,
                  creditsRemaining: event.credits?.creditsRemaining,
                },
              });
              setActiveResultId(id);
            }

            if (event.type === "error") {
              setActiveProgress(null);
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
      appendMessage({
        id: createId(),
        kind: "error",
        content: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setIsStreaming(false);
      setPendingFiles([]);
    }
  }

  return (
    <div
      className={cn(
        "relative mx-auto flex min-h-[78vh] max-w-6xl overflow-hidden rounded-[30px] border bg-[#171311] shadow-[0_28px_90px_rgba(0,0,0,0.36)]",
        isDragOver ? "border-orange-500/50" : "border-[#332f2b]"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(120,53,15,0.22),transparent_28%)]" />

      {/* Drag overlay */}
      {isDragOver ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-orange-500/30 bg-[#1a1613] p-8">
            <Paperclip className="h-8 w-8 text-orange-400" />
            <p className="text-lg font-medium text-white">Drop files here</p>
            <p className="text-sm text-zinc-400">PDF, DOCX, XLSX, CSV, TXT, JSON, PNG, JPG</p>
          </div>
        </div>
      ) : null}

      <div className="relative flex flex-1 flex-col">
        <div className="border-b border-[#2f2925] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-orange-500/20 bg-orange-500/10 text-orange-300">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-serif text-2xl text-white">{title}</h1>
                <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
              </div>
            </div>

            <Button variant="outline" onClick={resetChat}>
              <RefreshCcw className="h-3.5 w-3.5" />
              New Chat
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {type === "agent-swarm" ? <AgentStatusGrid statuses={orderedAgentStatuses} /> : null}

          {findings.length > 0 ? (
            <div className="mb-5 rounded-2xl border border-[#332f2b] bg-[#120f0d]/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7a6f]">
                Progressive Findings
              </p>
              <div className="mt-3 space-y-2">
                {findings.map((finding, index) => (
                  <div
                    key={`${finding}-${index}`}
                    className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-zinc-300"
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
                    <p className="whitespace-pre-wrap leading-relaxed text-zinc-200">{message.content}</p>
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
                          <p key={suggestion} className="text-xs text-zinc-400">
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
                />
              );
            })}

            {activeProgress ? (
              <MessageBubble
                icon={<Loader2 className="h-4 w-4 animate-spin" />}
                className="border-orange-500/20 bg-[linear-gradient(180deg,rgba(34,20,12,0.95),rgba(27,20,16,0.94))]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm leading-relaxed text-zinc-100">{activeProgress}</p>
                  {estimatedCredits ? (
                    <Badge className="bg-orange-500/15 text-orange-300">
                      <Coins className="h-3 w-3" />
                      ~{estimatedCredits} credits
                    </Badge>
                  ) : null}
                </div>
              </MessageBubble>
            ) : null}

            {messages.length === 0 && !activeProgress ? (
              <div className="flex min-h-[34vh] items-center justify-center">
                <div className="max-w-2xl text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-orange-500/20 bg-orange-500/10 text-orange-300">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h2 className="font-serif text-3xl text-white">{title}</h2>
                  <p className="mt-3 text-base leading-relaxed text-zinc-400">{subtitle}</p>
                </div>
              </div>
            ) : null}
          </div>
          <div ref={scrollRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-[#2f2925] bg-[#130f0d]/95 px-4 py-4 backdrop-blur-sm sm:px-6">
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
                    className="rounded-full border border-[#3a322d] bg-[#201a17] px-4 py-2 text-left text-sm text-zinc-300 transition-colors hover:border-orange-500/30 hover:bg-[#261d17] hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-[26px] border border-[#332f2b] bg-[#1a1613] p-3 shadow-[0_-12px_35px_rgba(0,0,0,0.18)]">
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
              className="min-h-[72px] resize-none border-0 bg-transparent px-2 py-2 text-base text-white placeholder:text-[#6f645c] focus-visible:ring-0"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {/* Attach file button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#3a322d] bg-[#201a17] text-zinc-400 transition-colors hover:border-orange-500/30 hover:text-orange-300 disabled:opacity-40"
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
        </div>
      </div>
    </div>
  );
}
