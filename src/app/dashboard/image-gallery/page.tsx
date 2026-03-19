"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageEntry {
  id: string;
  imageUrl: string;
  content: string;
  extractedData: {
    documentType: string;
    fields: Record<string, string | number | null>;
  } | null;
  agentName: string;
  agentId: string;
  conversationId: string;
  createdAt: string;
}

export default function ImageGalleryPage() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<ImageEntry | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterType, setFilterType] = useState<"all" | "documents" | "photos">("all");
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (filterAgent) params.set("agentId", filterAgent);
      if (filterType !== "all") params.set("type", filterType);

      const response = await fetch(`/api/images?${params}`);
      if (response.ok) {
        const data = await response.json();
        setImages(data.images || []);
        setHasMore(data.hasMore || false);
        if (data.agents) setAgents(data.agents);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, filterAgent, filterType]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const selectedIndex = selectedImage
    ? images.findIndex((img) => img.id === selectedImage.id)
    : -1;

  const navigateImage = (direction: -1 | 1) => {
    const newIndex = selectedIndex + direction;
    if (newIndex >= 0 && newIndex < images.length) {
      setSelectedImage(images[newIndex]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl text-foreground">Image Gallery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All images received across your agents
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterAgent}
          onChange={(e) => { setFilterAgent(e.target.value); setPage(1); }}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["all", "documents", "photos"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setFilterType(t); setPage(1); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                filterType === t
                  ? "bg-white/10 text-white"
                  : "text-muted-foreground hover:text-white"
              )}
            >
              {t === "all" ? "All" : t === "documents" ? "Documents" : "Photos"}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-zinc-300">No images yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Images from conversations will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => setSelectedImage(img)}
                className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-white/20 hover:shadow-lg"
              >
                {img.imageUrl && !img.imageUrl.includes("kiln-meta") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.imageUrl}
                    alt="User uploaded"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-zinc-900">
                    <ImageIcon className="h-8 w-8 text-zinc-700" />
                  </div>
                )}

                {/* Overlay */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex items-center gap-1">
                    <Bot className="h-3 w-3 text-kiln-orange" />
                    <span className="text-[10px] text-white truncate">{img.agentName}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {new Date(img.createdAt).toLocaleDateString("de-DE", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>

                {/* Document badge */}
                {img.extractedData && (
                  <div className="absolute top-2 right-2 rounded-full bg-blue-500/80 p-1">
                    <FileText className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-white disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={!hasMore}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-white disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative mx-4 flex max-h-[90vh] max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Navigation */}
            {selectedIndex > 0 && (
              <button
                onClick={() => navigateImage(-1)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {selectedIndex < images.length - 1 && (
              <button
                onClick={() => navigateImage(1)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}

            {/* Image */}
            <div className="flex items-center justify-center bg-black p-4" style={{ maxHeight: "60vh" }}>
              {selectedImage.imageUrl && !selectedImage.imageUrl.includes("kiln-meta") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedImage.imageUrl}
                  alt="Full preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex h-60 items-center justify-center">
                  <ImageIcon className="h-12 w-12 text-zinc-700" />
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="border-t border-border p-4 space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                  {selectedImage.agentName}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(selectedImage.createdAt).toLocaleString("de-DE")}
                </span>
              </div>

              {selectedImage.content && (
                <p className="text-sm text-zinc-400 line-clamp-3">{selectedImage.content}</p>
              )}

              {/* Extracted Document Data */}
              {selectedImage.extractedData && (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                    <FileText className="h-3.5 w-3.5" />
                    Extracted: {selectedImage.extractedData.documentType}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(selectedImage.extractedData.fields)
                      .filter(([, v]) => v !== null)
                      .map(([key, value]) => (
                        <div key={key} className="text-xs">
                          <span className="text-muted-foreground">{key}: </span>
                          <span className="text-zinc-300">{String(value)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <a
                href={`/dashboard/conversations?id=${selectedImage.conversationId}`}
                className="inline-flex items-center gap-1 text-xs text-kiln-orange hover:underline"
              >
                View conversation →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
