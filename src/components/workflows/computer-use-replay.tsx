"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Globe,
  Clock,
  MousePointerClick,
  FileSearch,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  ExternalLink,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types (mirrored from computer-use-node.ts) ── */

interface SessionStep {
  stepIndex: number;
  url: string;
  action: "navigate" | "click_link" | "extract_data" | "done" | "analyze";
  actionDetail: string;
  htmlSummary: string;
  screenshot: string | null;
  extractedData: Record<string, unknown> | null;
  timestamp: string;
  durationMs: number;
}

interface SessionData {
  task: string;
  startUrl: string;
  steps: SessionStep[];
  summary: string;
  extractedData: Record<string, unknown> | null;
  totalDurationMs: number;
  urlsVisited: string[];
  screenshotsAvailable: boolean;
  completionReason: "done" | "max_steps" | "no_next_url" | "error";
}

/* ── Props ── */

interface ComputerUseReplayProps {
  session: SessionData | null;
  open: boolean;
  onClose: () => void;
}

/* ── Helpers ── */

function getActionIcon(action: SessionStep["action"]) {
  switch (action) {
    case "navigate": return <Globe className="h-3.5 w-3.5" />;
    case "click_link": return <MousePointerClick className="h-3.5 w-3.5" />;
    case "extract_data": return <FileSearch className="h-3.5 w-3.5" />;
    case "done": return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "analyze": return <AlertCircle className="h-3.5 w-3.5" />;
    default: return <Globe className="h-3.5 w-3.5" />;
  }
}

function getActionLabel(action: SessionStep["action"]): string {
  switch (action) {
    case "navigate": return "Navigiert";
    case "click_link": return "Link geklickt";
    case "extract_data": return "Daten extrahiert";
    case "done": return "Fertig";
    case "analyze": return "Analysiert";
    default: return action;
  }
}

function getActionColor(action: SessionStep["action"]): string {
  switch (action) {
    case "navigate": return "text-blue-400";
    case "click_link": return "text-purple-400";
    case "extract_data": return "text-green-400";
    case "done": return "text-emerald-400";
    case "analyze": return "text-amber-400";
    default: return "text-muted-foreground";
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function getCompletionBadge(reason: SessionData["completionReason"]) {
  switch (reason) {
    case "done": return { label: "Erfolgreich", style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
    case "max_steps": return { label: "Max Steps", style: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
    case "no_next_url": return { label: "Kein nächster Link", style: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
    case "error": return { label: "Fehler", style: "bg-red-500/10 text-red-400 border-red-500/20" };
    default: return { label: reason, style: "bg-muted/10 text-muted-foreground border-border" };
  }
}

/* ── Component ── */

export function ComputerUseReplay({ session, open, onClose }: ComputerUseReplayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2000); // ms per step
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const steps = session?.steps || [];
  const totalSteps = steps.length;
  const step = steps[currentStep] || null;

  // Autoplay
  useEffect(() => {
    if (!playing || totalSteps === 0) return;

    timerRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= totalSteps - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, speed, totalSteps]);

  // Reset bei neuer Session
  useEffect(() => {
    setCurrentStep(0);
    setPlaying(false);
  }, [session]);

  const goToStep = useCallback((index: number) => {
    setCurrentStep(Math.max(0, Math.min(index, totalSteps - 1)));
  }, [totalSteps]);

  const togglePlay = useCallback(() => {
    if (currentStep >= totalSteps - 1) {
      setCurrentStep(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [currentStep, totalSteps]);

  if (!open || !session) return null;

  const completionBadge = getCompletionBadge(session.completionReason);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex h-[85vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-500/10">
              <Globe className="h-4.5 w-4.5 text-pink-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Computer Use Session</h2>
              <p className="text-xs text-muted-foreground max-w-md truncate">{session.task}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", completionBadge.style)}>
              {completionBadge.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDuration(session.totalDurationMs)}
            </span>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Step Thumbnails */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-border bg-background">
            <div className="p-3 space-y-1">
              {steps.map((s, i) => (
                <button
                  key={i}
                  onClick={() => goToStep(i)}
                  className={cn(
                    "w-full rounded-lg p-2.5 text-left transition-all",
                    currentStep === i
                      ? "bg-muted border border-pink-500/30"
                      : "hover:bg-muted border border-transparent"
                  )}
                >
                  {/* Thumbnail */}
                  {s.screenshot ? (
                    <div className="mb-2 overflow-hidden rounded-md border border-border bg-black">
                      <img
                        src={`data:image/png;base64,${s.screenshot}`}
                        alt={`Step ${i + 1}`}
                        className={cn(
                          "w-full h-auto object-cover transition-opacity",
                          currentStep === i ? "opacity-100" : "opacity-70"
                        )}
                      />
                    </div>
                  ) : (
                    <div className="mb-2 flex h-16 items-center justify-center rounded-md border border-border bg-card/50">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* Step info */}
                  <div className="flex items-center gap-1.5">
                    <span className={cn("shrink-0", getActionColor(s.action))}>
                      {getActionIcon(s.action)}
                    </span>
                    <span className="text-[10px] font-medium text-foreground truncate">
                      Step {i + 1}: {getActionLabel(s.action)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[9px] text-muted-foreground truncate">
                    {new URL(s.url).hostname}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Main Preview */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Screenshot / Preview */}
            <div className="flex-1 overflow-hidden bg-black flex items-center justify-center p-4">
              {step?.screenshot ? (
                <img
                  src={`data:image/png;base64,${step.screenshot}`}
                  alt={`Step ${currentStep + 1} Screenshot`}
                  className="max-h-full max-w-full rounded-lg border border-border shadow-2xl object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <ImageIcon className="h-12 w-12" />
                  <p className="text-sm">
                    {session.screenshotsAvailable
                      ? "Kein Screenshot für diesen Schritt"
                      : "Screenshots nicht verfügbar (SCREENSHOT_API_KEY nicht konfiguriert)"
                    }
                  </p>
                  {step && (
                    <div className="mt-4 max-w-lg rounded-lg border border-border bg-card p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1">HTML-Zusammenfassung:</p>
                      <p className="text-xs text-muted-foreground">{step.htmlSummary}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step Detail Bar */}
            {step && (
              <div className="border-t border-border bg-card px-5 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("shrink-0", getActionColor(step.action))}>
                        {getActionIcon(step.action)}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {getActionLabel(step.action)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(step.durationMs)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {step.actionDetail}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                      <a
                        href={step.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground hover:text-muted-foreground transition-colors truncate max-w-md"
                      >
                        {step.url}
                      </a>
                    </div>
                  </div>

                  {/* Extracted data preview */}
                  {step.extractedData && Object.keys(step.extractedData).length > 0 && (
                    <div className="shrink-0 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 max-w-xs">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-green-400 mb-1">Extrahiert</p>
                      <pre className="text-[10px] text-green-300/80 max-h-20 overflow-y-auto whitespace-pre-wrap">
                        {JSON.stringify(step.extractedData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 bg-background">
          {/* Left: Step counter */}
          <span className="text-xs text-muted-foreground tabular-nums w-24">
            Step {currentStep + 1} / {totalSteps}
          </span>

          {/* Center: Controls */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => goToStep(currentStep - 1)}
              disabled={currentStep <= 0}
              className="h-8 w-8 p-0 border-border"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              size="sm"
              onClick={togglePlay}
              className="h-8 w-20 bg-pink-600 hover:bg-pink-500 text-white text-xs"
            >
              {playing ? (
                <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pause</>
              ) : (
                <><Play className="mr-1.5 h-3.5 w-3.5" /> Play</>
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => goToStep(currentStep + 1)}
              disabled={currentStep >= totalSteps - 1}
              className="h-8 w-8 p-0 border-border"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Right: Speed controls */}
          <div className="flex items-center gap-2 w-24 justify-end">
            <Gauge className="h-3 w-3 text-muted-foreground" />
            {[1000, 2000, 4000].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  speed === s
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-muted-foreground"
                )}
              >
                {s === 1000 ? "2x" : s === 2000 ? "1x" : "0.5x"}
              </button>
            ))}
          </div>
        </div>

        {/* Session Summary Footer */}
        {session.summary && (
          <div className="border-t border-border px-5 py-2.5 bg-background">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-muted-foreground">Ergebnis:</span>{" "}
              {session.summary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
