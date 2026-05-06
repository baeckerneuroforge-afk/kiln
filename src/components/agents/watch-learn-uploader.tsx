"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Video, Upload, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Play, Trash2, Save,
  Eye, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface ExtractedStep {
  stepNumber: number;
  action: string;
  target: string;
  url?: string;
  typedText?: string;
  dataExtracted?: string[];
  reasoning: string;
}

interface SessionStatus {
  id: string;
  status: string;
  taskDescription?: string;
  frameCount: number;
  framesAnalyzed: number;
  extractedSteps?: ExtractedStep[];
  generatedProcedure?: unknown;
  proceduralMemoryId?: string;
  errorMessage?: string;
  progress: number;
}

interface WatchLearnUploaderProps {
  agentId: string;
}

/* ── Status Labels ── */

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  UPLOADING: { label: "Hochladen...", color: "text-blue-400", icon: Upload },
  EXTRACTING: { label: "Frames extrahieren...", color: "text-blue-400", icon: Video },
  ANALYZING: { label: "Workflow verstehen...", color: "text-purple-400", icon: Eye },
  GENERATING: { label: "Prozedur generieren...", color: "text-orange-400", icon: Loader2 },
  COMPLETED: { label: "Fertig!", color: "text-emerald-400", icon: CheckCircle2 },
  FAILED: { label: "Fehlgeschlagen", color: "text-red-400", icon: XCircle },
  processing: { label: "Verarbeitung...", color: "text-blue-400", icon: Loader2 },
  awaiting_frames: { label: "Warte auf Frames...", color: "text-amber-400", icon: AlertTriangle },
};

/* ── Component ── */

export function WatchLearnUploader({ agentId }: WatchLearnUploaderProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [taskDescription, setTaskDescription] = useState("");
  const [editableSteps, setEditableSteps] = useState<ExtractedStep[]>([]);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling für Session-Status
  useEffect(() => {
    if (!sessionId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/watch-learn/${sessionId}`);
        if (res.ok) {
          const data = await res.json() as SessionStatus;
          setSession(data);
          if (data.extractedSteps) {
            setEditableSteps(data.extractedSteps);
          }
          if (data.status === "COMPLETED" || data.status === "FAILED") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {
        // Weiter pollen
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, agentId]);

  // Frame-Extraktion im Browser
  const extractFramesFromVideo = useCallback(async (file: File): Promise<Array<{ index: number; timestampMs: number; imageBase64: string }>> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) { resolve([]); return; }

      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadedmetadata = () => {
        const duration = video.duration * 1000; // ms
        const interval = 2000; // Alle 2 Sekunden
        const maxFrames = 30;
        const frameCount = Math.min(maxFrames, Math.ceil(duration / interval));
        const frames: Array<{ index: number; timestampMs: number; imageBase64: string }> = [];
        let currentFrame = 0;

        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");

        const captureFrame = () => {
          if (currentFrame >= frameCount || !ctx) {
            URL.revokeObjectURL(url);
            resolve(frames);
            return;
          }

          const time = currentFrame * (interval / 1000);
          video.currentTime = Math.min(time, video.duration - 0.1);
        };

        video.onseeked = () => {
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/png", 0.8);
          const base64 = dataUrl.split(",")[1];

          frames.push({
            index: currentFrame,
            timestampMs: currentFrame * interval,
            imageBase64: base64,
          });

          currentFrame++;
          captureFrame();
        };

        captureFrame();
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve([]);
      };
    });
  }, []);

  // Upload + Frame-Extraktion + Senden
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);

    try {
      // Frames im Browser extrahieren
      const frames = await extractFramesFromVideo(file);

      if (frames.length === 0) {
        // Fallback: Video direkt hochladen
        const formData = new FormData();
        formData.append("video", file);
        if (taskDescription) formData.append("taskDescription", taskDescription);

        const res = await fetch(`/api/agents/${agentId}/watch-learn`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.sessionId) setSessionId(data.sessionId);
        return;
      }

      // Frames direkt senden
      const res = await fetch(`/api/agents/${agentId}/watch-learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames,
          taskDescription: taskDescription || `Aufgabe aus Video: ${file.name}`,
        }),
      });

      const data = await res.json();
      if (data.sessionId) setSessionId(data.sessionId);
    } catch {
      // Error handling
    } finally {
      setUploading(false);
    }
  }, [agentId, taskDescription, extractFramesFromVideo]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("video/") || file.name.match(/\.(mp4|webm|mov)$/i))) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const removeStep = (index: number) => {
    setEditableSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!session?.proceduralMemoryId) return;
    setSaving(true);
    // Die editierten Steps könnten an den Server gesendet werden
    // Für jetzt reicht die automatisch generierte Prozedur
    setTimeout(() => setSaving(false), 1000);
  };

  const statusConfig = session ? STATUS_CONFIG[session.status] || STATUS_CONFIG.processing : null;

  return (
    <div className="space-y-6">
      {/* Hidden Video + Canvas für Frame-Extraktion */}
      <video ref={videoRef} className="hidden" muted preload="metadata" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Video className="h-4 w-4 text-pink-400" />
          Watch & Learn
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Nimm dich auf, wie du eine Aufgabe erledigst. Der Agent lernt es und kann es danach selbst.
        </p>
      </div>

      {/* Task Description */}
      {!sessionId && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Was machst du im Video? (optional)
          </label>
          <input
            type="text"
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="z.B. Preise auf competitor.com vergleichen"
            className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-pink-500/60 transition-colors placeholder:text-muted-foreground"
          />
        </div>
      )}

      {/* Upload Zone */}
      {!sessionId && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
            dragOver
              ? "border-pink-500/50 bg-pink-500/5"
              : "border-border hover:border-pink-500/30 hover:bg-card",
            uploading && "pointer-events-none opacity-50"
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            onChange={handleFileSelect}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-pink-400 animate-spin" />
              <p className="text-sm text-muted-foreground">Frames werden extrahiert...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-500/10">
                <Upload className="h-6 w-6 text-pink-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Screen-Recording hochladen</p>
                <p className="text-xs text-muted-foreground mt-1">MP4, WebM oder MOV · max 100MB</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing Status */}
      {session && statusConfig && session.status !== "COMPLETED" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <statusConfig.icon className={cn("h-5 w-5", statusConfig.color, session.status !== "FAILED" && "animate-spin")} />
            <div className="flex-1">
              <p className={cn("text-sm font-medium", statusConfig.color)}>{statusConfig.label}</p>
              {session.frameCount > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Frame {session.framesAnalyzed} von {session.frameCount}
                </p>
              )}
              {session.errorMessage && (
                <p className="text-xs text-red-400 mt-1">{session.errorMessage}</p>
              )}
            </div>
            {session.progress > 0 && session.status !== "FAILED" && (
              <span className="text-xs font-medium text-muted-foreground">{session.progress}%</span>
            )}
          </div>
          {session.progress > 0 && session.status !== "FAILED" && (
            <div className="mt-3 h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-pink-500 transition-all"
                style={{ width: `${session.progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Results — Extracted Steps */}
      {session?.status === "COMPLETED" && editableSteps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Erkannter Workflow ({editableSteps.length} Schritte)
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSave}
                disabled={saving}
                className="h-7 text-xs text-emerald-400 hover:text-emerald-300"
              >
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Save & Activate
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            {editableSteps.map((step, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                <button
                  onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-left"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-pink-500/10 text-[10px] font-bold text-pink-400 shrink-0">
                    {step.stepNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase mr-2">
                      {step.action}
                    </span>
                    <span className="text-xs text-foreground truncate">{step.target}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStep(i); }}
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  {expandedStep === i ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {expandedStep === i && (
                  <div className="border-t border-border px-3 py-2.5 space-y-1.5">
                    {step.url && (
                      <p className="text-[10px] text-muted-foreground">
                        URL: <span className="text-muted-foreground font-mono">{step.url}</span>
                      </p>
                    )}
                    {step.typedText && (
                      <p className="text-[10px] text-muted-foreground">
                        Text: <span className="text-muted-foreground">&quot;{step.typedText}&quot;</span>
                      </p>
                    )}
                    {step.dataExtracted && step.dataExtracted.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Felder: <span className="text-muted-foreground">{step.dataExtracted.join(", ")}</span>
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground italic">{step.reasoning}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Test Run Button */}
          {session.proceduralMemoryId && (
            <Button
              size="sm"
              className="w-full bg-pink-600 hover:bg-pink-500 text-white text-xs h-9"
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Test-Lauf starten
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
