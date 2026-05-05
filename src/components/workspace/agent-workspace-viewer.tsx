"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FolderOpen,
  FileText,
  Download,
  Trash2,
  Upload,
  History,
  HardDrive,
  Loader2,
  File,
  Image,
  FileCode,
  Table,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface WorkspaceFile {
  path: string;
  mimeType: string;
  sizeBytes: number;
  latestVersion: number;
  updatedAt: string;
}

/* ── File Icon Helper ── */

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.includes("json") || mimeType.includes("javascript") || mimeType.includes("typescript")) return FileCode;
  if (mimeType.includes("csv") || mimeType.includes("spreadsheet")) return Table;
  return FileText;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Component ── */

export function AgentWorkspaceViewer({ agentId }: { agentId: string }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/workspace`);
      if (!res.ok) return;
      const data = await res.json();
      setFiles(data.files || []);
      setTotalSize(data.totalSizeBytes || 0);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", file.name);

      const res = await fetch(`/api/agents/${agentId}/workspace`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        fetchFiles();
      }
    } catch {
      // Handle error
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (path: string) => {
    try {
      const res = await fetch(
        `/api/agents/${agentId}/workspace/${encodeURIComponent(path)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.path !== path));
        if (selectedFile === path) {
          setSelectedFile(null);
          setPreview(null);
        }
      }
    } catch {
      // Handle error
    }
  };

  const handlePreview = async (file: WorkspaceFile) => {
    setSelectedFile(file.path);
    setPreviewLoading(true);

    try {
      const res = await fetch(
        `/api/agents/${agentId}/workspace/${encodeURIComponent(file.path)}`
      );
      if (!res.ok) {
        setPreview(null);
        return;
      }

      if (file.mimeType.startsWith("text/") || file.mimeType.includes("json") || file.mimeType.includes("csv")) {
        const text = await res.text();
        setPreview(text);
      } else if (file.mimeType.startsWith("image/")) {
        const blob = await res.blob();
        setPreview(URL.createObjectURL(blob));
      } else {
        setPreview("[Binärdatei — klicke auf Download]");
      }
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Gruppiere Dateien nach Ordner
  const folders = new Map<string, WorkspaceFile[]>();
  for (const file of files) {
    const parts = file.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder)!.push(file);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-kiln-orange" />
          <h3 className="text-sm font-semibold text-foreground">Workspace</h3>
          <span className="text-xs text-muted-foreground">
            {files.length} Dateien · {formatBytes(totalSize)}
          </span>
        </div>
        <label
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted",
            uploading && "pointer-events-none opacity-50"
          )}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          Upload
          <input
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {/* Storage Usage */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
        <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-kiln-orange to-kiln-ember"
              style={{ width: `${Math.min(100, (totalSize / (1024 * 1024 * 1024)) * 100)}%` }}
            />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">{formatBytes(totalSize)}</span>
      </div>

      {/* Empty State */}
      {files.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted py-10 text-center">
          <File className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Keine Dateien im Workspace</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Agents können hier Dateien speichern und in späteren Runs wiederverwenden.
          </p>
        </div>
      )}

      {/* File List + Preview */}
      {files.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* File Tree */}
          <div className="space-y-1">
            {Array.from(folders.entries()).map(([folder, folderFiles]) => (
              <div key={folder}>
                {folder !== "/" && (
                  <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                    <FolderOpen className="h-3 w-3" />
                    {folder}
                  </div>
                )}
                {folderFiles.map((file) => {
                  const Icon = getFileIcon(file.mimeType);
                  const fileName = file.path.split("/").pop() || file.path;
                  const isSelected = selectedFile === file.path;

                  return (
                    <div
                      key={file.path}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer",
                        isSelected
                          ? "bg-kiln-orange/10 border border-kiln-orange/20"
                          : "hover:bg-muted border border-transparent"
                      )}
                      onClick={() => handlePreview(file)}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-foreground">
                        {fileName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        v{file.latestVersion}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatBytes(file.sizeBytes)}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <a
                          href={`/api/agents/${agentId}/workspace/${encodeURIComponent(file.path)}`}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="rounded p-1 hover:bg-muted"
                        >
                          <Download className="h-3 w-3 text-muted-foreground" />
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file.path);
                          }}
                          className="rounded p-1 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3 w-3 text-red-400/60" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Preview Panel */}
          <div className="rounded-xl border border-border bg-muted p-4">
            {!selectedFile && (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Datei auswählen für Vorschau
              </div>
            )}
            {selectedFile && previewLoading && (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {selectedFile && !previewLoading && preview && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    {selectedFile}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <History className="h-3 w-3" />
                    {files.find((f) => f.path === selectedFile)?.latestVersion || 1} Versionen
                  </div>
                </div>
                {preview.startsWith("blob:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt={selectedFile}
                    className="max-h-64 rounded-lg object-contain"
                  />
                ) : (
                  <pre className="max-h-80 overflow-auto rounded-lg bg-muted/70 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {preview.slice(0, 5000)}
                    {preview.length > 5000 && "\n\n... (gekürzt)"}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
