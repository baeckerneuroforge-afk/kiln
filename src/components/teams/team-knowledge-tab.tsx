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
  Users,
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

interface TeamKnowledgeTabProps {
  teamId: string;
}

type UploadMode = null | "pdf" | "url" | "faq" | "text";

const statusIcons = {
  PENDING: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  PROCESSING: <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />,
  READY: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  ERROR: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
};

const statusLabels = {
  PENDING: "Pending",
  PROCESSING: "Processing...",
  READY: "Ready",
  ERROR: "Error",
};

export function TeamKnowledgeTab({ teamId }: TeamKnowledgeTabProps) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadMode, setUploadMode] = useState<UploadMode>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [urlInput, setUrlInput] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [faqPairs, setFaqPairs] = useState([{ question: "", answer: "" }]);

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/knowledge`);
      if (res.ok) {
        setEntries(await res.json());
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handlePdfUpload(file: File) {
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/teams/${teamId}/knowledge`, {
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
      const res = await fetch(`/api/teams/${teamId}/knowledge`, {
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
      const res = await fetch(`/api/teams/${teamId}/knowledge`, {
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
    const validPairs = faqPairs.filter((p) => p.question.trim() && p.answer.trim());
    if (validPairs.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "FAQ",
          title: `FAQ (${validPairs.length} entries)`,
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
      await fetch(`/api/teams/${teamId}/knowledge/${kbId}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== kbId));
    } catch {
      // Silent
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-400" />
          <p className="text-xs text-zinc-300">
            Documents in this knowledge base are available to <strong>all agents</strong> in the team during execution.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Upload buttons */}
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
              onClick={() => { setUploadMode(item.mode); setError(null); }}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-4 text-sm text-zinc-400 transition-all hover:border-orange-500/30 hover:text-zinc-200"
            >
              <item.icon className="h-6 w-6" />
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* PDF Upload */}
      {uploadMode === "pdf" && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-100">Upload PDF</h3>
            <button onClick={() => setUploadMode(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 py-8 text-sm text-zinc-400 transition-colors hover:border-orange-500/30 hover:text-zinc-200 disabled:opacity-50"
          >
            {isUploading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</>
            ) : (
              <><Upload className="h-5 w-5" /> Select PDF file</>
            )}
          </button>
        </div>
      )}

      {/* URL Import */}
      {uploadMode === "url" && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-100">Import URL</h3>
            <button onClick={() => setUploadMode(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.example.com/page"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/60 outline-none"
            />
            <Button onClick={handleUrlSubmit} disabled={!urlInput.trim() || isUploading} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </div>
        </div>
      )}

      {/* Text Entry */}
      {uploadMode === "text" && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-100">Enter Text</h3>
            <button onClick={() => setUploadMode(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
          <input
            type="text"
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder="Title (e.g. Company Info, Product Specs)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/60 outline-none"
          />
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Enter text content..."
            rows={6}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/60 outline-none resize-none"
          />
          <Button onClick={handleTextSubmit} disabled={!textContent.trim() || isUploading} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add
          </Button>
        </div>
      )}

      {/* FAQ Entry */}
      {uploadMode === "faq" && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-100">Add FAQ</h3>
            <button onClick={() => setUploadMode(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
          {faqPairs.map((pair, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-800/50 p-3">
              <input
                type="text"
                value={pair.question}
                onChange={(e) => {
                  const updated = [...faqPairs];
                  updated[i].question = e.target.value;
                  setFaqPairs(updated);
                }}
                placeholder="Question"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/60 outline-none"
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
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/60 outline-none resize-none"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setFaqPairs([...faqPairs, { question: "", answer: "" }])} className="border-zinc-700 text-zinc-300">
              + Add another
            </Button>
            <Button
              onClick={handleFaqSubmit}
              disabled={!faqPairs.some((p) => p.question.trim() && p.answer.trim()) || isUploading}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save FAQ
            </Button>
          </div>
        </div>
      )}

      {/* Document list */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-200">
            Workflow Knowledge Sources ({entries.length})
          </h3>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
                  {entry.type === "PDF" && <Upload className="h-4 w-4 text-zinc-400" />}
                  {entry.type === "URL" && <Globe className="h-4 w-4 text-zinc-400" />}
                  {entry.type === "TEXT" && <FileText className="h-4 w-4 text-zinc-400" />}
                  {entry.type === "FAQ" && <HelpCircle className="h-4 w-4 text-zinc-400" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200 truncate max-w-[300px]">
                    {entry.sourceName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{entry.type}</span>
                    {entry.chunkCount > 0 && <span>· {entry.chunkCount} chunks</span>}
                    <span className="flex items-center gap-1">
                      · {statusIcons[entry.embeddingStatus as keyof typeof statusIcons]}{" "}
                      {statusLabels[entry.embeddingStatus as keyof typeof statusLabels]}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(entry.id)}
                className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !uploadMode && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-12">
          <BookOpen className="mb-3 h-8 w-8 text-zinc-500" />
          <p className="text-sm text-zinc-500">No team knowledge added yet</p>
          <p className="text-xs text-zinc-500 mt-1">Upload documents to share knowledge across all team agents</p>
        </div>
      )}
    </div>
  );
}
