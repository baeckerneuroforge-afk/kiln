"use client";

import { useState, useEffect, useCallback, useRef } from "react";


import {
  X,
  ChevronRight,
  ChevronLeft,
  Bot,
  Zap,
  Plug,
  HelpCircle,
  Sparkles,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ── Tour Step Definition ── */

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  target?: string; // CSS selector of the element to highlight
  position?: "top" | "bottom" | "left" | "right" | "center";
}

const mainTourSteps: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to KILN!",
    description: "Your AI Creation Platform. Build agents, automate workflows, and connect your tools — all in one place. Let us show you around.",
    icon: Sparkles,
    position: "center",
  },
  {
    id: "agents",
    title: "Create AI Agents",
    description: "Build intelligent chat agents with custom knowledge bases. Deploy them on your website in minutes.",
    icon: Bot,
    target: "[data-tour='agents']",
    position: "right",
  },
  {
    id: "workflows",
    title: "Automate Workflows",
    description: "Build multi-agent pipelines with 18+ node types. Visual editor with drag-and-drop canvas.",
    icon: Zap,
    target: "[data-tour='workflows']",
    position: "right",
  },
  {
    id: "integrations",
    title: "Connect Your Tools",
    description: "Integrate Slack, Gmail, Calendar, Sheets, and 10+ more services. Extend your agents' capabilities.",
    icon: Plug,
    target: "[data-tour='integrations']",
    position: "right",
  },
  {
    id: "help",
    title: "Need Help?",
    description: "Access documentation, tutorials, and support anytime. Press '?' for keyboard shortcuts.",
    icon: HelpCircle,
    target: "[data-tour='help']",
    position: "right",
  },
];

/* ── Tooltip Position Calculator ── */

function getTooltipStyle(
  target: string | undefined,
  position: string
): React.CSSProperties {
  if (!target || position === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const el = document.querySelector(target);
  if (!el) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const rect = el.getBoundingClientRect();

  switch (position) {
    case "right":
      return {
        position: "fixed",
        top: rect.top + rect.height / 2,
        left: rect.right + 16,
        transform: "translateY(-50%)",
      };
    case "left":
      return {
        position: "fixed",
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left + 16,
        transform: "translateY(-50%)",
      };
    case "bottom":
      return {
        position: "fixed",
        top: rect.bottom + 12,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      };
    case "top":
      return {
        position: "fixed",
        bottom: window.innerHeight - rect.top + 12,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      };
    default:
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
  }
}

/* ── Spotlight Overlay ── */

function SpotlightOverlay({ target }: { target?: string }) {
  const [clipPath, setClipPath] = useState<string>("none");

  useEffect(() => {
    if (!target) {
      setClipPath("none");
      return;
    }

    const el = document.querySelector(target);
    if (!el) {
      setClipPath("none");
      return;
    }

    const rect = el.getBoundingClientRect();
    const pad = 8;
    const x = rect.left - pad;
    const y = rect.top - pad;
    const w = rect.width + pad * 2;
    const h = rect.height + pad * 2;
    const r = 12;

    // SVG polygon cutout — full viewport with rounded rect hole
    setClipPath(
      `polygon(0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y + r}px, ${x + r}px ${y}px, ${x + w - r}px ${y}px, ${x + w}px ${y + r}px, ${x + w}px ${y + h - r}px, ${x + w - r}px ${y + h}px, ${x + r}px ${y + h}px, ${x}px ${y + h - r}px, ${x}px 100%, 100% 100%, 100% 0%)`
    );
  }, [target]);

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 transition-all duration-300"
      style={clipPath !== "none" ? { clipPath } : undefined}
    />
  );
}

/* ── Main Tour Component ── */

export function ProductTour({
  steps = mainTourSteps,
  onComplete,
  onSkip,
}: {
  steps?: TourStep[];
  onComplete?: () => void;
  onSkip?: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

  const step = steps[currentStep];
  const Icon = step.icon;
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  // Calculate tooltip position
  useEffect(() => {
    const timer = setTimeout(() => {
      setTooltipStyle(getTooltipStyle(step.target, step.position || "center"));
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStep, step.target, step.position]);

  const handleNext = () => {
    if (isLast) {
      onComplete?.();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) setCurrentStep((prev) => prev - 1);
  };

  const handleSkip = () => {
    onSkip?.();
  };

  return (
    <>
      {/* Spotlight */}
      <SpotlightOverlay target={step.target} />

      {/* Tooltip */}
      <div
        className="fixed z-[95] w-80 rounded-2xl border border-border bg-card p-5 shadow-2xl"
        style={tooltipStyle}
      >
        {/* Step indicator */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === currentStep ? "w-4 bg-orange-500" : "w-1.5 bg-muted"
                )}
              />
            ))}
          </div>
          <button
            onClick={handleSkip}
            className="text-muted-foreground hover:text-muted-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
            <Icon className="h-4.5 w-4.5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
          >
            <SkipForward className="h-3 w-3" />
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button size="sm" variant="outline" onClick={handlePrev} className="h-7 text-xs">
                <ChevronLeft className="mr-1 h-3 w-3" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="h-7 text-xs bg-orange-600 hover:bg-orange-500">
              {isLast ? "Done" : "Next"}
              {!isLast && <ChevronRight className="ml-1 h-3 w-3" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Tour Trigger Hook ── */

export function useTourTrigger() {
  const [showTour, setShowTour] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((prefs) => {
        if (prefs.onboardingCompleted && !prefs.tourCompleted) {
          // Show tour for users who completed onboarding but haven't seen the tour
          setShowTour(true);
        }
      })
      .catch(() => {});
  }, []);

  const completeTour = useCallback(() => {
    setShowTour(false);
    fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourCompleted: true }),
    }).catch(() => {});
  }, []);

  const skipTour = useCallback(() => {
    setShowTour(false);
    fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourCompleted: true }),
    }).catch(() => {});
  }, []);

  const startTour = useCallback(() => {
    setShowTour(true);
  }, []);

  return { showTour, completeTour, skipTour, startTour };
}

/* ── Context-Specific Mini Tour ── */

export function MiniTour({
  steps,
  storageKey,
}: {
  steps: TourStep[];
  storageKey: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(`kiln_tour_${storageKey}`);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const handleComplete = () => {
    setVisible(false);
    localStorage.setItem(`kiln_tour_${storageKey}`, "true");
  };

  if (!visible) return null;

  return (
    <ProductTour
      steps={steps}
      onComplete={handleComplete}
      onSkip={handleComplete}
    />
  );
}
