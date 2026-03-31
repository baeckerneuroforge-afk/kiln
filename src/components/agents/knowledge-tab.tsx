"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  BookOpen,
  Upload,
  Globe,
  FileText,
  HelpCircle,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface KnowledgeEntry {
  id: string;
  type: string;
  sourceName: string;
  embeddingStatus: string;
  chunkCount: number;
  createdAt: string;
}

interface KnowledgeTabProps {
  agentId: string;
  initialEntries: KnowledgeEntry[];
}

type UploadMode = null | "pdf" | "url" | "faq" | "text";

const statusIcons = {
  PENDING: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  PROCESSING: <Loader2 className="h-3.5 w-3.5 animate-spin text-kiln-orange" />,
  READY: <CheckCircle2 className="h-3.5 w-3.5 text-kiln-green" />,
  ERROR: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
};

const statusLabels = {
  PENDING: "Pending",
  PROCESSING: "Processing...",
  READY: "Ready",
  ERROR: "Error",
};

export function KnowledgeTab({ agentId, initialEntries }: KnowledgeTabProps) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>(initialEntries);
  const [uploadMode, setUploadMode] = useState<UploadMode>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL-Eingabe State
  const [urlInput, setUrlInput] = useState("");

  // Text-Eingabe State
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  // FAQ State
  const [faqPairs, setFaqPairs] = useState([{ question: "", answer: "" }]);

  // Poll for PROCESSING entries until they complete
  const hasProcessing = entries.some((e) => e.embeddingStatus === "PROCESSING");

  const pollEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`);
      if (!res.ok) return;
      const data = (await res.json()) as KnowledgeEntry[];
      setEntries(data);
    } catch {
      // Stille Fehlerbehandlung — nächster Poll versucht erneut
    }
  }, [agentId]);

  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(pollEntries, 3000);
    return () => clearInterval(interval);
  }, [hasProcessing, pollEntries]);

  async function handlePdfUpload(file: File) {
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setEntries((prev) => [data, ...prev]);
      setUploadMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload error");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleUrlSubmit() {
    if (!urlInput.trim()) return;
    setIsUploading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "URL", url: urlInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "URL import failed");

      setEntries((prev) => [data, ...prev]);
      setUrlInput("");
      setUploadMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import error");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleTextSubmit() {
    if (!textContent.trim()) return;
    setIsUploading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TEXT",
          title: textTitle || "Text",
          content: textContent,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Text import failed");

      setEntries((prev) => [data, ...prev]);
      setTextTitle("");
      setTextContent("");
      setUploadMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import error");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleFaqSubmit() {
    const validPairs = faqPairs.filter(
      (p) => p.question.trim() && p.answer.trim()
    );
    if (validPairs.length === 0) return;
    setIsUploading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "FAQ",
          title: `FAQ (${validPairs.length} Einträge)`,
          pairs: validPairs,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "FAQ import failed");

      setEntries((prev) => [data, ...prev]);
      setFaqPairs([{ question: "", answer: "" }]);
      setUploadMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "FAQ import failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(kbId: string) {
    if (!confirm("Delete this knowledge entry?")) return;

    try {
      await fetch(`/api/agents/${agentId}/knowledge/${kbId}`, {
        method: "DELETE",
      });
      setEntries((prev) => prev.filter((e) => e.id !== kbId));
    } catch {
      // Stille Fehlerbehandlung
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Upload documents so your agent can answer from them.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Upload-Buttons */}
      {!uploadMode && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { mode: "pdf" as const, icon: Upload, label: "Upload PDF" },
            { mode: "url" as const, icon: Globe, label: "Import URL" },
            { mode: "text" as const, icon: FileText, label: "Enter Text" },
            { mode: "faq" as const, icon: HelpCircle, label: "Add FAQ" },
          ].map((item) => (
            <button
              key={item.mode}
              onClick={() => {
                setUploadMode(item.mode);
                setError(null);
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
            >
              <item.icon className="h-6 w-6" />
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* PDF Upload */}
      {uploadMode === "pdf" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">
              Upload PDF
            </h3>
            <button
              onClick={() => setUploadMode(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePdfUpload(file);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Select PDF file
              </>
            )}
          </button>
        </div>
      )}

      {/* URL Import */}
      {uploadMode === "url" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">
              Import URL
            </h3>
            <button
              onClick={() => setUploadMode(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.example.com/page"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <Button
              onClick={handleUrlSubmit}
              disabled={!urlInput.trim() || isUploading}
              size="sm"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Import"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Text Eingabe */}
      {uploadMode === "text" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Enter Text
            </h3>
            <button
              onClick={() => setUploadMode(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <input
            type="text"
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder="Title (e.g. Price List, Terms)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Enter text..."
            rows={6}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none"
          />
          <Button
            onClick={handleTextSubmit}
            disabled={!textContent.trim() || isUploading}
            size="sm"
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Add
          </Button>
        </div>
      )}

      {/* FAQ Eingabe */}
      {uploadMode === "faq" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Add FAQ
            </h3>
            <button
              onClick={() => setUploadMode(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {faqPairs.map((pair, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-background p-3">
              <input
                type="text"
                value={pair.question}
                onChange={(e) => {
                  const updated = [...faqPairs];
                  updated[i].question = e.target.value;
                  setFaqPairs(updated);
                }}
                placeholder="Question"
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <textarea
                value={pair.answer}
                onChange={(e) => {
                  const updated = [...faqPairs];
                  updated[i].answer = e.target.value;
                  setFaqPairs(updated);
                }}
                placeholder="Answer"
                rows={2}
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setFaqPairs([...faqPairs, { question: "", answer: "" }])
              }
            >
              + Add another
            </Button>
            <Button
              onClick={handleFaqSubmit}
              disabled={
                !faqPairs.some((p) => p.question.trim() && p.answer.trim()) ||
                isUploading
              }
              size="sm"
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save FAQ
            </Button>
          </div>
        </div>
      )}

      {/* Bestehende Einträge */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            Knowledge Sources ({entries.length})
          </h3>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  {entry.type === "PDF" && (
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  )}
                  {entry.type === "URL" && (
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  )}
                  {entry.type === "TEXT" && (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  {entry.type === "FAQ" && (
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground truncate max-w-[250px]">
                    {entry.sourceName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{entry.type}</span>
                    {entry.chunkCount > 0 && (
                      <span>· {entry.chunkCount} Chunks</span>
                    )}
                    <span className="flex items-center gap-1">
                      ·{" "}
                      {
                        statusIcons[
                          entry.embeddingStatus as keyof typeof statusIcons
                        ]
                      }{" "}
                      {
                        statusLabels[
                          entry.embeddingStatus as keyof typeof statusLabels
                        ]
                      }
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(entry.id)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {entries.length === 0 && !uploadMode && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-8">
          <BookOpen className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No knowledge added yet
          </p>
        </div>
      )}
    </div>
  );
}
