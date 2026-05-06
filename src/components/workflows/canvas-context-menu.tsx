"use client";

import { useEffect, useRef } from "react";
import {
  Copy,
  Trash2,
  Power,
  StickyNote,
  Play,
  Eye,
  Plus,
  ClipboardPaste,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface CanvasContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: "copy" | "delete" | "disable" | "comment" | "test" | "logs" | "paste" | "add";
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const iconMap = {
  copy: Copy,
  delete: Trash2,
  disable: Power,
  comment: StickyNote,
  test: Play,
  logs: Eye,
  paste: ClipboardPaste,
  add: Plus,
};

interface CanvasContextMenuProps {
  x: number;
  y: number;
  items: CanvasContextMenuItem[];
  onClose: () => void;
}

/**
 * Lightweight right-click context menu for the canvas. Renders at a
 * client-coordinate position; items are passed in by the caller.
 *
 * Closes on outside-click or Escape. Stays inside the viewport via a
 * basic clamp on the coords (best-effort — no portal/floating-ui).
 */
export function CanvasContextMenu({ x, y, items, onClose }: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Best-effort viewport clamping — keeps the menu inside the window
  const safeX = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 220);
  const safeY = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 240);

  return (
    <div
      ref={ref}
      style={{ top: safeY, left: safeX }}
      className="fixed z-50 w-[200px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="py-1">
        {items.map((item, idx) => {
          if (item.id === "__divider__") {
            return <div key={`d-${idx}`} className="mx-2 my-1 h-px bg-border" />;
          }
          const Icon = item.icon ? iconMap[item.icon] : null;
          return (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                item.destructive
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-foreground hover:bg-muted"
              )}
            >
              {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <span className="w-3.5" />}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <kbd className="rounded bg-muted/50 px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
                  {item.shortcut}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
