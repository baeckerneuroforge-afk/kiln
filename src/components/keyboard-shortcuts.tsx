"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Keyboard, Command } from "lucide-react";
import { cn } from "@/lib/utils";

function useIsMac() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(
      navigator.platform?.toLowerCase().includes("mac") ||
        navigator.userAgent?.toLowerCase().includes("mac")
    );
  }, []);

  return isMac;
}

function ShortcutsHelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const isMac = useIsMac();
  const mod = isMac ? "\u2318" : "Ctrl";

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sections = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: `${mod}+N`, description: "New Agent" },
        { keys: `${mod}+W`, description: "New Workflow" },
        { keys: `${mod}+T`, description: "Browse Templates" },
      ],
    },
    {
      title: "Actions",
      shortcuts: [
        { keys: `${mod}+E`, description: "Export (context-dependent)" },
        { keys: "?", description: "Show this help" },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl backdrop-blur"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-5 w-5 text-orange-500" />
            <h2 className="font-serif text-lg text-zinc-100">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sections */}
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5"
                  >
                    <span className="text-sm text-zinc-300">
                      {shortcut.description}
                    </span>
                    <KeyCombo keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-zinc-600">
          <Command className="h-3 w-3" />
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
}

function KeyCombo({ keys }: { keys: string }) {
  const parts = keys.split("+");

  return (
    <div className="flex items-center gap-1">
      {parts.map((part, i) => (
        <kbd
          key={i}
          className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-300"
        >
          {part}
        </kbd>
      ))}
    </div>
  );
}

export function KeyboardShortcutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();

  const toggleHelp = useCallback(() => {
    setHelpOpen((prev) => !prev);
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();

      // Ignoriere Eingabefelder
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // ? → Toggle help modal
      if (e.key === "?" && !mod) {
        toggleHelp();
        return;
      }

      // Ctrl/Cmd+N → New Agent
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        router.push("/dashboard/agents/new");
        return;
      }

      // Ctrl/Cmd+W → New Workflow (prevent tab close)
      if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        router.push("/dashboard/teams/new");
        return;
      }

      // Ctrl/Cmd+T → Browse Templates (prevent new tab)
      if (mod && e.key.toLowerCase() === "t") {
        e.preventDefault();
        router.push("/dashboard/workflows/templates");
        return;
      }

      // Ctrl/Cmd+E → No-op (handled by individual pages for Export)
      // Ctrl/Cmd+R → No-op (let browser handle refresh)
      // Ctrl/Cmd+K → Reserved for command palette
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, toggleHelp]);

  return (
    <>
      {children}
      <ShortcutsHelpModal open={helpOpen} onClose={closeHelp} />
    </>
  );
}
