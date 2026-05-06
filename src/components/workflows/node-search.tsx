"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CalendarPlus,
  CalendarSearch,
  Clock,
  Database,
  Eye,
  FileSearch,
  FileText,
  Filter,
  GitBranch,
  GitFork,
  Globe,
  Hash,
  Layers,
  Mail,
  Merge,
  MessageSquare,
  Monitor,
  Pause,
  Play,
  Plug,
  Radio,
  Search,
  Shield,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Table,
  TableProperties,
  Tags,
  Target,
  Terminal,
  Timer,
  UserPlus,
  Users,
  Variable,
  Zap,
  StickyNote,
} from "lucide-react";
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_NODE_DEFINITIONS,
  type WorkflowNodeDefinition,
} from "@/lib/workflow-node-types";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  CalendarPlus,
  CalendarSearch,
  Clock,
  Database,
  Eye,
  FileSearch,
  FileText,
  Filter,
  GitBranch,
  GitFork,
  Globe,
  Hash,
  Layers,
  Mail,
  Merge,
  MessageSquare,
  Monitor,
  Pause,
  Play,
  Plug,
  Radio,
  Search,
  Shield,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Table,
  TableProperties,
  Tags,
  Target,
  Terminal,
  Timer,
  UserPlus,
  Users,
  Variable,
  Zap,
  StickyNote,
};

interface NodeSearchProps {
  open: boolean;
  onClose: () => void;
  onSelectNode: (nodeType: string, position?: { x: number; y: number }) => void;
  position?: { x: number; y: number };
}

export function NodeSearch({ open, onClose, onSelectNode, position }: NodeSearchProps) {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightIndex(0);
      // Auto-focus after transition frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Filtered results
  const filtered = useMemo(() => {
    if (!query.trim()) return null; // null = show grouped view
    const q = query.toLowerCase();
    return WORKFLOW_NODE_DEFINITIONS.filter(
      (d) => d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q)
    );
  }, [query]);

  // Flat list for keyboard nav (both grouped and filtered)
  const flatList = useMemo<WorkflowNodeDefinition[]>(() => {
    if (filtered) return filtered;
    // Grouped order: follow WORKFLOW_CATEGORIES order
    const result: WorkflowNodeDefinition[] = [];
    for (const cat of WORKFLOW_CATEGORIES) {
      const nodes = WORKFLOW_NODE_DEFINITIONS.filter((d) => d.category === cat.id);
      result.push(...nodes);
    }
    return result;
  }, [filtered]);

  // Clamp highlight
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlightIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const handleSelect = useCallback(
    (def: WorkflowNodeDefinition) => {
      onSelectNode(def.type, position);
      onClose();
    },
    [onSelectNode, onClose, position]
  );

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((prev) => Math.min(prev + 1, flatList.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatList[highlightIndex]) {
            handleSelect(flatList[highlightIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatList, highlightIndex, handleSelect, onClose]
  );

  // Render a single node item
  const renderItem = (def: WorkflowNodeDefinition, globalIdx: number) => {
    const Icon = iconMap[def.icon];
    const isHighlighted = globalIdx === highlightIndex;

    return (
      <button
        key={def.type}
        data-idx={globalIdx}
        onClick={() => handleSelect(def)}
        onMouseEnter={() => setHighlightIndex(globalIdx)}
        className={`
          flex w-full items-center gap-3 px-3 py-2 text-left transition-colors
          ${
            isHighlighted
              ? "bg-muted border-l-2 border-l-orange-500"
              : "border-l-2 border-l-transparent hover:bg-muted/40"
          }
        `}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: def.color + "18" }}
        >
          <span style={{ color: def.color }}>
            {Icon ? <Icon className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-foreground">{def.label}</div>
          <div className="truncate text-xs text-muted-foreground">{def.description}</div>
        </div>
      </button>
    );
  };

  // Build grouped view
  const renderGrouped = () => {
    let globalIdx = 0;
    return WORKFLOW_CATEGORIES.map((cat) => {
      const nodes = WORKFLOW_NODE_DEFINITIONS.filter((d) => d.category === cat.id);
      if (nodes.length === 0) return null;

      const items = nodes.map((def) => {
        const el = renderItem(def, globalIdx);
        globalIdx++;
        return el;
      });

      return (
        <div key={cat.id}>
          <div className="sticky top-0 z-10 bg-card px-3 pb-1 pt-3">
            <span
              className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground"
              style={{ color: cat.color }}
            >
              {cat.label}
            </span>
          </div>
          {items}
        </div>
      );
    });
  };

  // Build flat filtered view
  const renderFiltered = () => {
    if (!filtered || filtered.length === 0) {
      return (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
          Keine Nodes gefunden
        </div>
      );
    }
    return filtered.map((def, idx) => renderItem(def, idx));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-50 flex items-start justify-center pt-[18vh]
          transition-all duration-200
          ${open ? "visible bg-black/40 backdrop-blur-sm" : "invisible bg-transparent"}
        `}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Dialog */}
        <div
          className={`
            w-[380px] overflow-hidden rounded-xl border border-foreground/20
            bg-card shadow-2xl
            transition-all duration-200 ease-out
            ${open ? "scale-100 opacity-100" : "scale-95 opacity-0"}
          `}
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 focus-within:border-orange-500/50 focus-within:ring-1 focus-within:ring-orange-500/30">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Node suchen..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>

          {/* Results list */}
          <div ref={listRef} className="max-h-[460px] overflow-y-auto overscroll-contain">
            {filtered === null ? renderGrouped() : renderFiltered()}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded bg-card px-1 py-0.5 font-mono text-muted-foreground">
                &uarr;&darr;
              </kbd>{" "}
              navigieren
            </span>
            <span>
              <kbd className="rounded bg-card px-1 py-0.5 font-mono text-muted-foreground">
                &crarr;
              </kbd>{" "}
              auswählen
            </span>
            <span>
              <kbd className="rounded bg-card px-1 py-0.5 font-mono text-muted-foreground">
                esc
              </kbd>{" "}
              schließen
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
