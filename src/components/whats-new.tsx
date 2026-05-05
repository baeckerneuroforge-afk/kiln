"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  Sparkles,
  Wrench,
  Bug,
  Check,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Changelog entries (synced with /changelog page) ── */

type Category = "Feature" | "Improvement" | "Fix";

interface WhatsNewEntry {
  id: string;
  date: string;
  title: string;
  category: Category;
}

const recentEntries: WhatsNewEntry[] = [
  { id: "workflow-version-control", date: "2026-03-19", title: "Workflow Version Control & Collaboration", category: "Feature" },
  { id: "workflow-templates-gallery", date: "2026-03-18", title: "Workflow Templates Gallery", category: "Feature" },
  { id: "workflow-engine", date: "2026-03-15", title: "Workflow Engine with 18+ Node Types", category: "Feature" },
  { id: "visual-workflow-editor", date: "2026-03-14", title: "Visual Workflow Editor", category: "Feature" },
  { id: "agent-memory", date: "2026-03-10", title: "Agent Conversation Memory", category: "Feature" },
  { id: "ab-test-lab", date: "2026-03-08", title: "A/B Test Lab", category: "Feature" },
  { id: "guided-wizard", date: "2026-03-05", title: "Guided Agent Creation Wizard", category: "Feature" },
  { id: "industry-templates", date: "2026-03-03", title: "Industry Templates", category: "Feature" },
];

const categoryColors: Record<Category, string> = {
  Feature: "text-green-400",
  Improvement: "text-blue-400",
  Fix: "text-amber-400",
};

const categoryIcons: Record<Category, React.ElementType> = {
  Feature: Sparkles,
  Improvement: Wrench,
  Fix: Bug,
};

/* ── Relative Time ── */

function relativeDate(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Main Component ── */

export function WhatsNewBell() {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch last seen date
  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((prefs) => {
        setLastSeen(prefs.lastSeenChangelog || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const unseenCount = lastSeen
    ? recentEntries.filter((e) => e.date > lastSeen).length
    : loading ? 0 : recentEntries.length;

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString().split("T")[0];
    setLastSeen(now);
    fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastSeenChangelog: now }),
    }).catch(() => {});
  }, []);

  const handleOpen = () => {
    setOpen(!open);
    if (!open && unseenCount > 0) {
      // Mark as read when opening
      markAllRead();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          open ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <Bell className="h-4 w-4" />
        {unseenCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white shadow-lg shadow-orange-500/30">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-card shadow-2xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium text-foreground">What&apos;s New</h3>
            {unseenCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Entries */}
          <div className="max-h-80 overflow-y-auto">
            {recentEntries.map((entry) => {
              const isNew = lastSeen ? entry.date > lastSeen : true;
              const CatIcon = categoryIcons[entry.category];

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60",
                    isNew && "bg-orange-500/[0.03]"
                  )}
                >
                  <div className={cn("mt-0.5 flex-shrink-0", categoryColors[entry.category])}>
                    <CatIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-xs", isNew ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {entry.title}
                      </p>
                      {isNew && (
                        <span className="flex-shrink-0 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[8px] font-bold text-orange-400">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{relativeDate(entry.date)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href="/changelog"
              className="flex items-center justify-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
              onClick={() => setOpen(false)}
            >
              View full changelog
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
