"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Globe2,
  Loader2,
  Monitor,
  MousePointer2,
  Navigation,
  ScrollText,
  Type,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

export interface BrowserViewState {
  /** Current URL shown in URL bar */
  currentUrl: string;
  /** Current step index (1-based for display) */
  currentStep: number;
  /** Max steps for this session */
  maxSteps: number;
  /** Latest live screenshot (base64) */
  liveScreenshot: string | null;
  /** Action log entries */
  actionLog: ActionLogEntry[];
  /** Screenshot timeline thumbnails */
  screenshotTimeline: ScreenshotThumb[];
  /** Current thinking text (shown as overlay) */
  thinkingText: string | null;
  /** Overall status */
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

/* ── Action Icon Map ── */

function ActionIcon({ action }: { action: string }) {
  switch (action) {
    case "navigate":
    case "click_link":
      return <Navigation className="h-3 w-3" />;
    case "click":
      return <MousePointer2 className="h-3 w-3" />;
    case "type":
      return <Type className="h-3 w-3" />;
    case "scroll":
      return <ScrollText className="h-3 w-3" />;
    case "extract_data":
    case "extract":
      return <Eye className="h-3 w-3" />;
    case "done":
      return <Check className="h-3 w-3" />;
    default:
      return <ArrowRight className="h-3 w-3" />;
  }
}

/* ── LiveBrowserView Component ── */

export function LiveBrowserView({
  state,
  onScreenshotClick,
}: {
  state: BrowserViewState;
  onScreenshotClick?: (imageData: string) => void;
}) {
  const actionLogRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [showActionLog, setShowActionLog] = useState(true);
  const [selectedThumb, setSelectedThumb] = useState<ScreenshotThumb | null>(null);
  const [thinkingVisible, setThinkingVisible] = useState(false);

  // Auto-scroll action log
  useEffect(() => {
    if (actionLogRef.current) {
      actionLogRef.current.scrollTop = actionLogRef.current.scrollHeight;
    }
  }, [state.actionLog.length]);

  // Auto-scroll timeline
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollLeft = timelineRef.current.scrollWidth;
    }
  }, [state.screenshotTimeline.length]);

  // Thinking bubble animation
  useEffect(() => {
    if (state.thinkingText) {
      setThinkingVisible(true);
      const timer = setTimeout(() => setThinkingVisible(false), 4000);
      return () => clearTimeout(timer);
    }
    setThinkingVisible(false);
  }, [state.thinkingText]);

  const displayedImage = selectedThumb
    ? `data:image/png;base64,${selectedThumb.imageData}`
    : state.liveScreenshot
      ? `data:image/png;base64,${state.liveScreenshot}`
      : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#332f2b] bg-[#0f0d0b]">
      {/* URL Bar */}
      <div className="flex items-center gap-2 border-b border-[#2a2622] bg-[#1a1613] px-3 py-2">
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </div>

        {/* URL bar */}
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#332f2b] bg-[#0f0d0b] px-3 py-1.5">
          <Globe2 className="h-3 w-3 shrink-0 text-zinc-500" />
          <span className="truncate text-xs text-zinc-400">
            {state.currentUrl || "about:blank"}
          </span>
        </div>

        {/* Step counter */}
        <div className="flex shrink-0 items-center gap-1.5">
          {state.status === "running" ? (
            <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
          ) : state.status === "completed" ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <X className="h-3 w-3 text-red-400" />
          )}
          <span className="text-xs font-medium text-zinc-400">
            {state.currentStep}/{state.maxSteps}
          </span>
        </div>
      </div>

      {/* Main content: Screenshot + Action Log */}
      <div className="flex flex-col md:flex-row">
        {/* Screenshot area */}
        <div className="relative flex-1">
          {displayedImage ? (
            <button
              type="button"
              className="block w-full cursor-pointer"
              onClick={() => {
                const img = selectedThumb?.imageData || state.liveScreenshot;
                if (img) onScreenshotClick?.(`data:image/png;base64,${img}`);
              }}
            >
              <Image
                src={displayedImage}
                alt="Live browser view"
                width={1280}
                height={800}
                unoptimized
                className="h-auto w-full object-contain"
              />
            </button>
          ) : (
            <div className="flex aspect-video items-center justify-center bg-[#0a0908]">
              <div className="flex flex-col items-center gap-2 text-zinc-600">
                <Monitor className="h-8 w-8" />
                <span className="text-xs">Waiting for browser...</span>
              </div>
            </div>
          )}

          {/* Thinking bubble overlay */}
          {thinkingVisible && state.thinkingText ? (
            <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl border border-orange-500/20 bg-black/80 px-3 py-2 text-xs text-orange-200 backdrop-blur-sm">
                {state.thinkingText}
              </div>
            </div>
          ) : null}

          {/* Live indicator */}
          {state.status === "running" ? (
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="text-[10px] font-medium text-white">LIVE</span>
            </div>
          ) : null}
        </div>

        {/* Action log sidebar */}
        <div
          className={cn(
            "border-t border-[#2a2622] md:w-64 md:border-l md:border-t-0",
            !showActionLog && "hidden md:block"
          )}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between border-b border-[#2a2622] px-3 py-2 md:cursor-default"
            onClick={() => setShowActionLog(!showActionLog)}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7d6f66]">
              Actions
            </span>
            <span className="md:hidden">
              {showActionLog ? (
                <ChevronUp className="h-3 w-3 text-zinc-500" />
              ) : (
                <ChevronDown className="h-3 w-3 text-zinc-500" />
              )}
            </span>
          </button>

          <div
            ref={actionLogRef}
            className={cn(
              "max-h-[200px] overflow-y-auto md:max-h-[400px]",
              !showActionLog && "hidden md:block"
            )}
          >
            {state.actionLog.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-zinc-600">
                No actions yet...
              </div>
            ) : (
              <div className="divide-y divide-[#1e1b19]">
                {state.actionLog.map((entry, idx) => (
                  <div
                    key={`${entry.stepIndex}-${idx}`}
                    className="flex items-start gap-2 px-3 py-2"
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                        entry.success === false
                          ? "bg-red-500/15 text-red-400"
                          : entry.action === "done"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-orange-500/10 text-orange-400"
                      )}
                    >
                      <ActionIcon action={entry.action} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-zinc-300">
                        {entry.actionDetail || entry.action}
                      </p>
                      {entry.durationMs ? (
                        <p className="text-[10px] text-zinc-600">
                          {entry.durationMs}ms
                        </p>
                      ) : null}
                    </div>
                    {entry.success !== undefined ? (
                      <div className="mt-0.5">
                        {entry.success ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <X className="h-3 w-3 text-red-400" />
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Screenshot timeline */}
      {state.screenshotTimeline.length > 0 ? (
        <div className="border-t border-[#2a2622] bg-[#0f0d0b] px-3 py-2">
          <div
            ref={timelineRef}
            className="flex gap-2 overflow-x-auto"
          >
            {state.screenshotTimeline.map((thumb) => (
              <button
                key={`${thumb.stepIndex}-${thumb.timestamp}`}
                type="button"
                onClick={() =>
                  setSelectedThumb(
                    selectedThumb?.timestamp === thumb.timestamp ? null : thumb
                  )
                }
                className={cn(
                  "group relative shrink-0 overflow-hidden rounded-lg border transition-all",
                  selectedThumb?.timestamp === thumb.timestamp
                    ? "border-orange-500 ring-1 ring-orange-500/30"
                    : "border-[#332f2b] hover:border-[#4a423c]"
                )}
              >
                <Image
                  src={`data:image/png;base64,${thumb.imageData}`}
                  alt={`Step ${thumb.stepIndex + 1}`}
                  width={120}
                  height={75}
                  unoptimized
                  className="h-[52px] w-[84px] object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5">
                  <span className="text-[9px] font-medium text-white">
                    Step {thumb.stepIndex + 1}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
