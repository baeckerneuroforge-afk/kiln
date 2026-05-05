"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X, Bot, Zap, Mic, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Quick Actions ───────────────────────────────────────────

const ACTIONS = [
  { id: "new-agent", label: "Neuer Agent", icon: Bot, href: "/dashboard/agents?create=true" },
  { id: "workflow", label: "Workflow starten", icon: Zap, href: "/dashboard/teams" },
  { id: "voice", label: "Sprachbefehl", icon: Mic, action: "voice" },
  { id: "chat", label: "Quick Chat", icon: Sparkles, action: "chat" },
] as const;

export function MobileQuickActions() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!isMobile) return null;

  const handleAction = (action: (typeof ACTIONS)[number]) => {
    setOpen(false);

    if ("href" in action && action.href) {
      window.location.href = action.href;
      return;
    }

    if (action.action === "chat") {
      window.dispatchEvent(new CustomEvent("kiln:open-meta-agent"));
      return;
    }

    if (action.action === "voice") {
      // Open voice interface via meta-agent
      window.dispatchEvent(new CustomEvent("kiln:open-meta-agent"));
      return;
    }
  };

  return (
    <div ref={ref} className="fixed bottom-20 right-4 z-50">
      {/* Expanded Actions */}
      {open && (
        <div className="mb-3 space-y-2 animate-in slide-in-from-bottom-4 fade-in duration-200">
          {ACTIONS.map((action, i) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              className="flex items-center gap-3 rounded-full bg-card border border-border pl-4 pr-5 py-2.5 shadow-lg active:scale-95 transition-transform w-full"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-kiln-orange/10">
                <action.icon className="h-4 w-4 text-kiln-orange" />
              </div>
              <span className="text-sm font-medium text-foreground">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          open
            ? "bg-muted rotate-45"
            : "bg-gradient-to-br from-kiln-orange to-kiln-ember shadow-kiln-orange/30"
        )}
      >
        {open ? (
          <X className="h-6 w-6 text-foreground" />
        ) : (
          <Plus className="h-6 w-6 text-white" />
        )}
      </button>
    </div>
  );
}
