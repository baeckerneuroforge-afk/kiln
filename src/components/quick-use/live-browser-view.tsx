"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Eye,
  Globe2,
  Loader2,
  Monitor,
  MousePointer2,
  Navigation,
  ScrollText,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

export interface BrowserViewState {
  currentUrl: string;
  currentStep: number;
  maxSteps: number;
  liveScreenshot: string | null;
  actionLog: ActionLogEntry[];
  screenshotTimeline: ScreenshotThumb[];
  thinkingText: string | null;
  status: "running" | "completed" | "failed";
}

export interface ActionLogEntry {
  stepIndex: number;
  action: string;
  actionDetail: string;
  url: string;
  success?: boolean;
  durationMs?: number;
  timestamp: number;
}

export interface ScreenshotThumb {
  stepIndex: number;
  imageData: string;
  url: string;
  timestamp: number;
}

/* ── Action Metadata ── */

type ActionCategory = "navigation" | "interaction" | "analysis" | "data" | "error" | "complete";

function getActionMeta(action: string, success?: boolean): {
  icon: React.ReactNode;
  category: ActionCategory;
  label: string;
} {
  // Best-effort actions never show as errors
  const bestEffort = action === "scroll" || action === "hover" || action === "focus" || action === "analyze";

  if (success === false && !bestEffort) {
    return {
      icon: <X className="h-3 w-3" />,
      category: "error",
      label: action,
    };
  }
  switch (action) {
    case "navigate":
    case "click_link":
      return { icon: <Navigation className="h-3 w-3" />, category: "navigation", label: "Navigate" };
    case "click":
      return { icon: <MousePointer2 className="h-3 w-3" />, category: "interaction", label: "Click" };
    case "type":
      return { icon: <Type className="h-3 w-3" />, category: "interaction", label: "Type" };
    case "scroll":
      return { icon: <ScrollText className="h-3 w-3" />, category: "interaction", label: "Scroll" };
    case "extract_data":
    case "extract":
      return { icon: <Database className="h-3 w-3" />, category: "data", label: "Extract" };
    case "execute_code":
      return { icon: <Code2 className="h-3 w-3" />, category: "analysis", label: "Execute" };
    case "done":
      return { icon: <Check className="h-3 w-3" />, category: "complete", label: "Done" };
    case "analyze":
      return { icon: <Eye className="h-3 w-3" />, category: "analysis", label: "Analyze" };
    default:
      return { icon: <ArrowRight className="h-3 w-3" />, category: "analysis", label: action };
  }
}

const categoryColors: Record<ActionCategory, { bg: string; text: string; border: string }> = {
  navigation: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  interaction: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  analysis: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  data: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  error: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  complete: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
};

/** Best-effort actions should never appear as failures in the UI */
function isBestEffortAction(action: string): boolean {
  return action === "scroll" || action === "hover" || action === "focus" || action === "analyze";
}

/** Effective success — best-effort actions are always treated as successful */
function effectiveSuccess(action: string, success?: boolean): boolean | undefined {
  if (isBestEffortAction(action)) return success === undefined ? undefined : true;
  return success;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ── Thinking Bubble ── */

function ThinkingBubble({
  text,
  visible,
}: {
  text: string | null;
  visible: boolean;
}) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!text || !visible) {
      setDisplayText("");
      setIsTyping(false);
      return;
    }

    // Typewriter effect: type out text character by character
    setIsTyping(true);
    setDisplayText("");
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx >= text.length) {
        setDisplayText(text);
        setIsTyping(false);
        clearInterval(interval);
      } else {
        setDisplayText(text.slice(0, idx));
      }
    }, 15);

    return () => clearInterval(interval);
  }, [text, visible]);

  if (!visible || !text) return null;

  // Truncate display for overlay — max ~120 chars
  const truncated = displayText.length > 120;
  const shown = truncated ? displayText.slice(0, 120) + "..." : displayText;

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-4 left-3 right-3 z-10 transition-all duration-300",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <div className="inline-block max-w-[80%] rounded-xl border border-orange-500/15 bg-black/50 px-3 py-2 shadow-lg backdrop-blur-md">
        {isTyping && displayText.length === 0 ? (
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="lbv-thinking-dot" />
            <span className="lbv-thinking-dot" />
            <span className="lbv-thinking-dot" />
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-orange-200/90">
            {shown}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Progress Dots ── */

function ProgressDots({
  current,
  total,
  status,
  onDotClick,
}: {
  current: number;
  total: number;
  status: "running" | "completed" | "failed";
  onDotClick?: (step: number) => void;
}) {
  // Show max 12 dots, compress if more steps
  const maxDots = Math.min(total, 12);
  const ratio = total / maxDots;

  return (
    <div className="flex items-center justify-center gap-1 px-3 py-1.5">
      {Array.from({ length: maxDots }, (_, i) => {
        const stepNum = Math.round(i * ratio);
        const isCurrent = stepNum === current - 1;
        const isCompleted = stepNum < current - 1;
        const isFinal = status !== "running";

        return (
          <button
            key={i}
            type="button"
            onClick={() => onDotClick?.(stepNum)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              isCurrent && !isFinal
                ? "w-4 bg-orange-400"
                : isCompleted || (isFinal && status === "completed")
                  ? "w-1.5 bg-emerald-500/70"
                  : isFinal && status === "failed" && isCompleted
                    ? "w-1.5 bg-red-400/70"
                    : "w-1.5 bg-muted",
              isCurrent && status === "running" && "animate-pulse",
              onDotClick && "cursor-pointer hover:opacity-80"
            )}
          />
        );
      })}
    </div>
  );
}

/* ── Step Card ── */

function StepCard({
  entry,
  isLatest,
  screenshotForStep,
  thinkingForStep,
}: {
  entry: ActionLogEntry;
  isLatest: boolean;
  screenshotForStep?: string;
  thinkingForStep?: string;
}) {
  const [expanded, setExpanded] = useState(isLatest);
  const success = effectiveSuccess(entry.action, entry.success);
  const meta = getActionMeta(entry.action, success);
  const colors = categoryColors[meta.category];

  // Auto-expand latest, but don't collapse previously expanded
  useEffect(() => {
    if (isLatest) setExpanded(true);
  }, [isLatest]);

  const hasExpandContent = screenshotForStep || thinkingForStep || (entry.actionDetail && entry.actionDetail.length > 60);

  return (
    <div
      className={cn(
        "lbv-step-enter overflow-hidden rounded-xl border transition-all duration-200",
        isLatest && success !== false
          ? "border-orange-500/25 bg-card"
          : success === false
            ? "border-red-500/20 bg-red-500/[0.03]"
            : "border-border bg-card",
        "hover:-translate-y-px hover:border-foreground/20"
      )}
      style={{ animationDelay: `${Math.min(entry.stepIndex * 30, 150)}ms` }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => hasExpandContent && setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
          hasExpandContent && "cursor-pointer"
        )}
      >
        {/* Active indicator */}
        {isLatest && success !== false ? (
          <div className="w-0.5 self-stretch rounded-full bg-orange-500" />
        ) : null}

        {/* Icon */}
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
            colors.bg,
            colors.text,
            isLatest && success !== false && "animate-pulse"
          )}
        >
          {meta.icon}
        </div>

        {/* Title */}
        <div className="min-w-0 flex-1">
          <p className={cn(
            "truncate text-xs font-medium",
            success === false ? "text-red-300" : "text-foreground"
          )}>
            {entry.actionDetail || entry.action}
          </p>
        </div>

        {/* Duration */}
        {entry.durationMs != null ? (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatDuration(entry.durationMs)}
          </span>
        ) : null}

        {/* Status */}
        {success !== undefined ? (
          success ? (
            <Check className="h-3 w-3 shrink-0 text-emerald-500/70" />
          ) : (
            <X className="h-3 w-3 shrink-0 text-red-400" />
          )
        ) : isLatest ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-orange-400/70" />
        ) : null}

        {/* Chevron */}
        {hasExpandContent ? (
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        ) : null}
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
            {/* Thinking text */}
            {thinkingForStep ? (
              <div className="flex items-start gap-2 rounded-lg bg-orange-500/[0.04] px-2.5 py-2">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-orange-400/60" />
                <p className="text-[11px] leading-relaxed text-orange-200/70">
                  {thinkingForStep}
                </p>
              </div>
            ) : null}

            {/* Screenshot thumbnail */}
            {screenshotForStep ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <Image
                  src={`data:image/png;base64,${screenshotForStep}`}
                  alt={`Step ${entry.stepIndex + 1} screenshot`}
                  width={400}
                  height={250}
                  unoptimized
                  className="h-auto w-full object-cover"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── LiveBrowserView Component ── */

export function LiveBrowserView({
  state,
  onScreenshotClick,
}: {
  state: BrowserViewState;
  onScreenshotClick?: (imageData: string) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const [selectedThumb, setSelectedThumb] = useState<ScreenshotThumb | null>(null);
  const [thinkingVisible, setThinkingVisible] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [screenshotKey, setScreenshotKey] = useState(0);
  const prevUrlRef = useRef("");
  const [showSparkle, setShowSparkle] = useState(false);
  const [glowClass, setGlowClass] = useState("");

  // Track URL changes for navigation animation
  useEffect(() => {
    if (state.currentUrl && state.currentUrl !== prevUrlRef.current) {
      setIsNavigating(true);
      const timer = setTimeout(() => setIsNavigating(false), 800);
      prevUrlRef.current = state.currentUrl;
      return () => clearTimeout(timer);
    }
  }, [state.currentUrl]);

  // Screenshot transition key
  useEffect(() => {
    if (state.liveScreenshot) {
      setScreenshotKey((k) => k + 1);
    }
  }, [state.liveScreenshot]);

  // Auto-scroll timeline
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTo({
        left: timelineRef.current.scrollWidth,
        behavior: "smooth",
      });
    }
  }, [state.screenshotTimeline.length]);

  // Auto-scroll steps
  useEffect(() => {
    if (stepsRef.current) {
      stepsRef.current.scrollTo({
        top: stepsRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [state.actionLog.length]);

  // Thinking bubble lifecycle
  useEffect(() => {
    if (state.thinkingText) {
      setThinkingVisible(true);
      const timer = setTimeout(() => setThinkingVisible(false), 5000);
      return () => clearTimeout(timer);
    }
    setThinkingVisible(false);
  }, [state.thinkingText]);

  // Completion animations
  useEffect(() => {
    if (state.status === "completed") {
      setShowSparkle(true);
      setGlowClass("lbv-glow-success");
      const t = setTimeout(() => {
        setShowSparkle(false);
        setGlowClass("");
      }, 1200);
      return () => clearTimeout(t);
    }
    if (state.status === "failed") {
      setGlowClass("lbv-glow-fail");
      const t = setTimeout(() => setGlowClass(""), 1200);
      return () => clearTimeout(t);
    }
  }, [state.status]);

  // Build screenshot map for step cards
  const screenshotMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const thumb of state.screenshotTimeline) {
      map.set(thumb.stepIndex, thumb.imageData);
    }
    return map;
  }, [state.screenshotTimeline]);

  const displayedImage = selectedThumb
    ? `data:image/png;base64,${selectedThumb.imageData}`
    : state.liveScreenshot
      ? `data:image/png;base64,${state.liveScreenshot}`
      : null;

  // Jump to step's screenshot from progress dots
  const handleDotClick = useCallback((step: number) => {
    const thumb = state.screenshotTimeline.find((t) => t.stepIndex === step);
    if (thumb) setSelectedThumb(thumb);
  }, [state.screenshotTimeline]);

  // Timeline scroll helpers
  const scrollTimeline = useCallback((dir: "left" | "right") => {
    if (!timelineRef.current) return;
    const amount = dir === "left" ? -200 : 200;
    timelineRef.current.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-shadow duration-500",
        glowClass,
        state.status === "running"
          ? "border-border"
          : state.status === "completed"
            ? "border-emerald-500/20"
            : "border-red-500/20"
      )}
      style={{ background: "linear-gradient(180deg, #131110 0%, #0c0a09 100%)" }}
    >
      {/* ── Browser Chrome ── */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <div className="h-[9px] w-[9px] rounded-full bg-[#ff5f57] shadow-[0_0_4px_rgba(255,95,87,0.25)]" />
          <div className="h-[9px] w-[9px] rounded-full bg-[#febc2e] shadow-[0_0_4px_rgba(254,188,46,0.2)]" />
          <div className="h-[9px] w-[9px] rounded-full bg-[#28c840] shadow-[0_0_4px_rgba(40,200,64,0.2)]" />
        </div>

        {/* URL bar */}
        <div className="relative flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]">
          <Globe2 className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {state.currentUrl || "about:blank"}
          </span>
          {/* Navigation progress bar */}
          {isNavigating ? (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-md">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
                style={{
                  animation: "lbv-progress-bar 0.8s ease-out forwards",
                  transformOrigin: "left",
                }}
              />
            </div>
          ) : null}
        </div>

        {/* Status badge */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-300",
            state.status === "running"
              ? "bg-muted/60"
              : state.status === "completed"
                ? "bg-emerald-500/10"
                : "bg-red-500/10"
          )}
        >
          {state.status === "running" ? (
            <>
              <span className="relative flex h-[6px] w-[6px]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-red-500" />
              </span>
              <span className="text-[10px] font-semibold tracking-wider text-foreground">LIVE</span>
            </>
          ) : state.status === "completed" ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] font-semibold tracking-wider text-emerald-400">DONE</span>
            </>
          ) : (
            <>
              <X className="h-3 w-3 text-red-400" />
              <span className="text-[10px] font-semibold tracking-wider text-red-400">FAILED</span>
            </>
          )}
        </div>
      </div>

      {/* ── Progress Dots ── */}
      {state.maxSteps > 0 ? (
        <ProgressDots
          current={state.currentStep}
          total={state.maxSteps}
          status={state.status}
          onDotClick={handleDotClick}
        />
      ) : null}

      {/* ── Main Content: Screenshot + Sidebar ── */}
      <div className="flex flex-col lg:flex-row">
        {/* Screenshot area — 70% on desktop */}
        <div className="relative flex-1 lg:flex-[7]">
          {displayedImage ? (
            <button
              type="button"
              className="group relative block w-full cursor-zoom-in overflow-hidden"
              onClick={() => {
                const img = selectedThumb?.imageData || state.liveScreenshot;
                if (img) onScreenshotClick?.(`data:image/png;base64,${img}`);
              }}
            >
              <div key={screenshotKey} className="lbv-screenshot-enter">
                <Image
                  src={displayedImage}
                  alt="Live browser view"
                  width={1280}
                  height={800}
                  unoptimized
                  className="h-auto w-full object-contain transition-[filter] duration-200 group-hover:brightness-105"
                />
              </div>

              {/* Completion sparkle */}
              {showSparkle ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {[0, 60, 120, 180, 240, 300].map((deg) => (
                    <div
                      key={deg}
                      className="absolute h-2 w-2 rounded-full bg-emerald-400"
                      style={{
                        animation: "lbv-sparkle 0.8s ease-out forwards",
                        animationDelay: `${deg / 1000}s`,
                        transform: `rotate(${deg}deg) translateY(-30px)`,
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </button>
          ) : (
            <div className="flex aspect-video items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Monitor className="h-10 w-10" />
                <div className="space-y-1 text-center">
                  <div className="h-2 w-32 animate-pulse rounded-full bg-muted" />
                  <div className="h-2 w-20 animate-pulse rounded-full bg-muted/60" />
                </div>
              </div>
            </div>
          )}

          {/* Thinking bubble */}
          <ThinkingBubble text={state.thinkingText} visible={thinkingVisible} />

          {/* Step number badge when viewing historical screenshot */}
          {selectedThumb ? (
            <div className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 backdrop-blur-sm">
              <span className="text-[10px] font-semibold text-foreground">
                Step {selectedThumb.stepIndex + 1}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Actions Sidebar ── */}
        <div
          className={cn(
            "border-t border-border transition-all duration-300 lg:w-[260px] lg:border-l lg:border-t-0",
            !showSidebar && "hidden lg:block"
          )}
        >
          {/* Sidebar header */}
          <button
            type="button"
            onClick={() => setShowSidebar(!showSidebar)}
            className="flex w-full items-center justify-between border-b border-border px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b5f57]">
                Actions
              </span>
              {state.actionLog.length > 0 ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
                  {state.actionLog.length}
                </span>
              ) : null}
            </div>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-muted-foreground transition-transform duration-200 lg:hidden",
                showSidebar && "rotate-180"
              )}
            />
          </button>

          {/* Action entries */}
          <div
            className={cn(
              "overflow-y-auto lg:max-h-[420px]",
              showSidebar ? "max-h-[180px]" : "max-h-0 lg:max-h-[420px]"
            )}
          >
            {state.actionLog.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[11px]">Waiting for actions...</span>
              </div>
            ) : (
              <div className="space-y-px p-1.5">
                {state.actionLog.map((entry, idx) => {
                  const sidebarSuccess = effectiveSuccess(entry.action, entry.success);
                  const meta = getActionMeta(entry.action, sidebarSuccess);
                  const colors = categoryColors[meta.category];
                  const isLast = idx === state.actionLog.length - 1;

                  return (
                    <div
                      key={`${entry.stepIndex}-${idx}`}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150",
                        isLast && state.status === "running"
                          ? "bg-muted"
                          : "hover:bg-muted"
                      )}
                      style={{ animation: "lbv-fade-in 0.2s ease-out both", animationDelay: `${idx * 20}ms` }}
                    >
                      <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", colors.bg, colors.text)}>
                        {meta.icon}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground group-hover:text-foreground">
                        {entry.actionDetail || entry.action}
                      </p>
                      {entry.durationMs != null ? (
                        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                          {formatDuration(entry.durationMs)}
                        </span>
                      ) : null}
                      {sidebarSuccess !== undefined ? (
                        sidebarSuccess ? (
                          <Check className="h-2.5 w-2.5 shrink-0 text-emerald-600" />
                        ) : (
                          <X className="h-2.5 w-2.5 shrink-0 text-red-500" />
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Screenshot Timeline Strip ── */}
      {state.screenshotTimeline.length > 0 ? (
        <div className="relative border-t border-border bg-background">
          {/* Left scroll arrow */}
          {state.screenshotTimeline.length > 6 ? (
            <>
              <button
                type="button"
                onClick={() => scrollTimeline("left")}
                className="absolute left-0 top-0 z-10 flex h-full w-8 items-center justify-center bg-gradient-to-r from-[#0c0a09] to-transparent"
              >
                <ChevronLeft className="h-3 w-3 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => scrollTimeline("right")}
                className="absolute right-0 top-0 z-10 flex h-full w-8 items-center justify-center bg-gradient-to-l from-[#0c0a09] to-transparent"
              >
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </button>
            </>
          ) : null}

          <div
            ref={timelineRef}
            className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 py-2"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {state.screenshotTimeline.map((thumb, idx) => {
              const isSelected = selectedThumb?.timestamp === thumb.timestamp;
              const isCurrent = idx === state.screenshotTimeline.length - 1 && !selectedThumb;

              return (
                <button
                  key={`${thumb.stepIndex}-${thumb.timestamp}`}
                  type="button"
                  onClick={() =>
                    setSelectedThumb(isSelected ? null : thumb)
                  }
                  className={cn(
                    "lbv-thumb-enter relative shrink-0 overflow-hidden rounded-md border transition-all duration-200",
                    isSelected || isCurrent
                      ? "scale-105 border-orange-500/60 shadow-[0_0_8px_rgba(249,115,22,0.15)]"
                      : "border-border hover:-translate-y-0.5 hover:border-foreground/20"
                  )}
                  style={{
                    scrollSnapAlign: "center",
                    animationDelay: `${idx * 40}ms`,
                  }}
                >
                  <Image
                    src={`data:image/png;base64,${thumb.imageData}`}
                    alt={`Step ${thumb.stepIndex + 1}`}
                    width={120}
                    height={75}
                    unoptimized
                    className="h-[48px] w-[76px] object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5">
                    <span className="text-[8px] font-semibold tabular-nums text-foreground/80">
                      {thumb.stepIndex + 1}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Step Cards (below browser frame) ── */}
      {state.actionLog.length > 0 ? (
        <div className="border-t border-border bg-card px-3 py-3">
          <div ref={stepsRef} className="max-h-[300px] space-y-2 overflow-y-auto lg:max-h-[220px]">
            {state.actionLog.map((entry, idx) => (
              <StepCard
                key={`step-${entry.stepIndex}-${idx}`}
                entry={entry}
                isLatest={idx === state.actionLog.length - 1 && state.status === "running"}
                screenshotForStep={screenshotMap.get(entry.stepIndex)}
                thinkingForStep={
                  idx === state.actionLog.length - 1 && state.thinkingText
                    ? state.thinkingText
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
