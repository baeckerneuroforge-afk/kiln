"use client";

import { useState } from "react";
import {
  FileText, Image as ImageIcon, Table, Code2,
  Download, ChevronDown, ChevronRight, File,
  Eye, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ── Types ── */

interface ArtifactInfo {
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
  size?: number;
}

interface ArtifactViewerProps {
  artifacts: ArtifactInfo[];
  className?: string;
}

/* ── MIME Type Helpers ── */

function getArtifactIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType === "text/csv" || mimeType.includes("spreadsheet")) return Table;
  if (mimeType === "application/json" || mimeType.startsWith("text/x-") || mimeType === "text/javascript") return Code2;
  if (mimeType === "application/pdf") return FileText;
  return File;
}

function getArtifactColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "text-purple-400";
  if (mimeType === "text/csv" || mimeType.includes("spreadsheet")) return "text-green-400";
  if (mimeType === "application/json") return "text-yellow-400";
  if (mimeType.startsWith("text/x-") || mimeType === "text/javascript") return "text-blue-400";
  if (mimeType === "application/pdf") return "text-red-400";
  return "text-zinc-400";
}

function isPreviewable(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    mimeType === "text/csv" ||
    mimeType === "application/json" ||
    mimeType === "text/plain" ||
    mimeType.startsWith("text/x-") ||
    mimeType === "text/javascript" ||
    mimeType === "text/html"
  );
}

/* ── Preview Components ── */

function ImagePreview({ url, fileName }: { url: string; fileName: string }) {
  return (
    <div className="rounded-lg overflow-hidden border border-[#2a2a3a] bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={fileName}
        className="max-w-full max-h-[400px] object-contain mx-auto"
      />
    </div>
  );
}

function TextPreview({ url, mimeType }: { url: string; mimeType: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadContent = async () => {
    if (content !== null) return;
    setLoading(true);
    try {
      const res = await fetch(url);
      const text = await res.text();
      setContent(text.slice(0, 10000));
    } catch {
      setContent("Fehler beim Laden");
    }
    setLoading(false);
  };

  if (content === null) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={loadContent}
        disabled={loading}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        <Eye className="mr-1.5 h-3 w-3" />
        {loading ? "Laden..." : "Vorschau"}
      </Button>
    );
  }

  const isJson = mimeType === "application/json";
  const isCsv = mimeType === "text/csv";

  if (isCsv) {
    return <CsvPreview content={content} />;
  }

  let displayContent = content;
  if (isJson) {
    try {
      displayContent = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // Bereits formatiert oder ungültig
    }
  }

  return (
    <div className="rounded-lg border border-[#2a2a3a] bg-[#0d0d12] max-h-[300px] overflow-auto">
      <pre className="p-3 text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-words">
        {displayContent}
      </pre>
    </div>
  );
}

function CsvPreview({ content }: { content: string }) {
  const lines = content.split("\n").filter((l) => l.trim());
  const headers = lines[0]?.split(",").map((h) => h.trim().replace(/^"|"$/g, "")) || [];
  const rows = lines.slice(1, 21).map((line) =>
    line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""))
  );

  return (
    <div className="rounded-lg border border-[#2a2a3a] overflow-auto max-h-[300px]">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-[#1a1a24] sticky top-0">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-zinc-400 border-b border-[#2a2a3a] whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#1a1a24] hover:bg-[#141418]">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-zinc-500 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {lines.length > 21 && (
        <div className="px-3 py-2 text-[10px] text-zinc-600 bg-[#141418] border-t border-[#2a2a3a]">
          Zeige 20 von {lines.length - 1} Zeilen
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */

export function ArtifactViewer({ artifacts, className }: ArtifactViewerProps) {
  const [expanded, setExpanded] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  if (artifacts.length === 0) {
    return (
      <div className={cn("text-[11px] text-zinc-600 py-2", className)}>
        Keine Artifacts erstellt
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-300 transition-colors w-full"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">Artifacts ({artifacts.length})</span>
      </button>

      {expanded && (
        <div className="space-y-1.5">
          {artifacts.map((artifact) => {
            const IconComp = getArtifactIcon(artifact.mimeType);
            const color = getArtifactColor(artifact.mimeType);
            const canPreview = isPreviewable(artifact.mimeType);
            const isOpen = previewId === artifact.id;

            return (
              <div key={artifact.id} className="rounded-lg border border-[#2a2a3a] bg-[#141418] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <IconComp className={cn("h-4 w-4 shrink-0", color)} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-zinc-300 truncate">
                        {artifact.fileName}
                      </p>
                      <p className="text-[9px] text-zinc-600">{artifact.mimeType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canPreview && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewId(isOpen ? null : artifact.id)}
                        className="h-6 w-6 p-0 text-zinc-600 hover:text-zinc-300"
                        title="Vorschau"
                      >
                        {isOpen ? <X className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    )}
                    <a
                      href={`/api/workflows/artifacts/${artifact.id}`}
                      download={artifact.fileName}
                      className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-[#2a2a3a] transition-colors"
                      title="Herunterladen"
                    >
                      <Download className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Preview */}
                {isOpen && (
                  <div className="px-3 pb-3 border-t border-[#1a1a24]">
                    <div className="pt-2">
                      {artifact.mimeType.startsWith("image/") ? (
                        <ImagePreview url={artifact.url} fileName={artifact.fileName} />
                      ) : (
                        <TextPreview url={artifact.url} mimeType={artifact.mimeType} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
