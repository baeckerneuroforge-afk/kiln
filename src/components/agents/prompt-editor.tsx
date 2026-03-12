"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Variable, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BranchesTab } from "@/components/agents/branches-tab";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import {
  HighlightStyle,
  syntaxHighlighting,
  StreamLanguage,
} from "@codemirror/language";
import { tags as defaultTags } from "@lezer/highlight";

// Verfügbare Variablen
const VARIABLES = [
  { name: "{{user.name}}", description: "Visitor name (if collected)" },
  { name: "{{user.email}}", description: "Visitor email (if collected)" },
  { name: "{{conversation.count}}", description: "Total conversations for this agent" },
  { name: "{{knowledge.context}}", description: "RAG context (auto-injected)" },
  { name: "{{current.time}}", description: "Current time (HH:MM)" },
  { name: "{{current.date}}", description: "Current date (DD.MM.YYYY)" },
  { name: "{{agent.name}}", description: "Name of this agent" },
];

// StreamLanguage für Variable-Highlighting
const promptLanguage = StreamLanguage.define({
  startState() {
    return { inVariable: false };
  },
  token(stream, state) {
    if (state.inVariable) {
      // Suche schließende }}
      while (!stream.eol()) {
        if (stream.match("}}")) {
          state.inVariable = false;
          return "variableName special";
        }
        stream.next();
      }
      return "variableName special";
    }

    // Suche öffnende {{
    while (!stream.eol()) {
      if (stream.match("{{")) {
        state.inVariable = true;
        return "variableName special";
      }
      stream.next();
    }
    return null;
  },
});

// Highlight-Style: Variablen in Orange
const variableHighlight = HighlightStyle.define([
  {
    tag: defaultTags.special(defaultTags.variableName),
    color: "#F97316",
    fontWeight: "bold",
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: "3px",
    padding: "0 2px",
  },
]);

// Dark Theme
const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#1C1917",
      color: "#FAFAF9",
      fontSize: "12px",
      fontFamily: "'DM Mono', monospace",
    },
    ".cm-content": {
      caretColor: "#F97316",
      padding: "12px",
      minHeight: "300px",
    },
    ".cm-cursor": {
      borderLeftColor: "#F97316",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgba(249, 115, 22, 0.2) !important",
    },
    ".cm-gutters": {
      backgroundColor: "#1C1917",
      color: "#78716C",
      border: "none",
      borderRight: "1px solid #292524",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#292524",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(41, 37, 36, 0.5)",
    },
    ".cm-tooltip": {
      backgroundColor: "#1C1917",
      border: "1px solid #292524",
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li": {
        padding: "4px 8px",
        fontSize: "12px",
        fontFamily: "'DM Mono', monospace",
      },
      "& > ul > li[aria-selected]": {
        backgroundColor: "rgba(249, 115, 22, 0.15)",
        color: "#FAFAF9",
      },
    },
    ".cm-completionLabel": {
      color: "#F97316",
      fontWeight: "bold",
    },
    ".cm-completionDetail": {
      color: "#78716C",
      fontStyle: "normal",
      marginLeft: "8px",
    },
    ".cm-placeholder": {
      color: "#78716C",
    },
  },
  { dark: true }
);

// Autocomplete für Variablen
function variableCompletion(context: CompletionContext): CompletionResult | null {
  // Trigger bei {{ oder wenn wir bereits in einer Variable sind
  const before = context.matchBefore(/\{\{[\w.]*$/);
  if (!before) return null;

  return {
    from: before.from,
    options: VARIABLES.map((v) => ({
      label: v.name,
      detail: v.description,
      type: "variable",
      apply: v.name,
    })),
    validFor: /^\{\{[\w.]*\}?\}?$/,
  };
}

interface PromptBranch {
  name: string;
  keywords: string[];
  promptSnippet: string;
  enabled: boolean;
}

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  advancedMode?: boolean;
  branches?: PromptBranch[];
  onBranchesChange?: (branches: PromptBranch[]) => void;
}

export function PromptEditor({ value, onChange, onClose, advancedMode, branches, onBranchesChange }: PromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [variableCount, setVariableCount] = useState(0);
  const [activeEditorTab, setActiveEditorTab] = useState<"editor" | "branches">("editor");

  // Variable-Count aktualisieren
  const updateVariableCount = useCallback((text: string) => {
    const matches = text.match(/\{\{[\w.]+\}\}/g);
    setVariableCount(matches ? matches.length : 0);
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        darkTheme,
        promptLanguage,
        syntaxHighlighting(variableHighlight),
        history(),
        autocompletion({
          override: [variableCompletion],
          activateOnTyping: true,
        }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...searchKeymap,
        ]),
        placeholderExt("You are a helpful assistant..."),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            onChange(text);
            updateVariableCount(text);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    updateVariableCount(value);

    return () => {
      view.destroy();
    };
    // Nur einmal initialisieren
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Variable an Cursor-Position einfügen
  function insertVariable(varName: string) {
    const view = viewRef.current;
    if (!view) return;

    const cursor = view.state.selection.main.head;
    view.dispatch({
      changes: { from: cursor, insert: varName },
      selection: { anchor: cursor + varName.length },
    });
    view.focus();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 flex h-[80vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-[#0C0A09] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <Variable className="h-4 w-4 text-kiln-orange" />
            <h2 className="text-sm font-semibold text-foreground">
              Advanced Prompt Editor
            </h2>
            <span className="rounded bg-kiln-orange/10 px-2 py-0.5 text-[10px] font-medium text-kiln-orange">
              {variableCount} variable{variableCount !== 1 ? "s" : ""}
            </span>
            {advancedMode && (
              <div className="ml-4 flex rounded-lg border border-border bg-muted/30 p-0.5">
                <button
                  onClick={() => setActiveEditorTab("editor")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    activeEditorTab === "editor"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Variable className="mr-1.5 inline h-3 w-3" />
                  Editor
                </button>
                <button
                  onClick={() => setActiveEditorTab("branches")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    activeEditorTab === "branches"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <GitBranch className="mr-1.5 inline h-3 w-3" />
                  Branches
                  {branches && branches.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-kiln-orange/10 px-1.5 text-[10px] text-kiln-orange">
                      {branches.length}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Close
            </Button>
          </div>
        </div>

        {/* Body */}
        {activeEditorTab === "editor" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Editor */}
          <div className="flex-1 overflow-auto">
            <div ref={editorRef} className="h-full" />
          </div>

          {/* Variable Palette */}
          <div className="w-64 shrink-0 overflow-y-auto border-l border-border bg-[#0C0A09] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Variables
            </h3>
            <p className="mb-4 text-[10px] text-muted-foreground">
              Click to insert at cursor. Type <code className="text-kiln-orange">{"{{"}</code> in the editor for autocomplete.
            </p>
            <div className="space-y-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v.name}
                  onClick={() => insertVariable(v.name)}
                  className="group w-full rounded-lg border border-border/50 bg-card/30 p-2.5 text-left transition-all hover:border-kiln-orange/30 hover:bg-kiln-orange/5"
                >
                  <code className="text-xs font-bold text-kiln-orange">
                    {v.name}
                  </code>
                  <p className="mt-0.5 text-[10px] text-muted-foreground group-hover:text-foreground/70">
                    {v.description}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-lg border border-dashed border-border p-3">
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tips
              </h4>
              <ul className="space-y-1 text-[10px] text-muted-foreground">
                <li>Variables are replaced at runtime</li>
                <li><code className="text-kiln-orange">{"{{knowledge.context}}"}</code> is auto-injected by RAG</li>
                <li><code className="text-kiln-orange">{"{{user.name}}"}</code> requires email collection</li>
                <li>Undo/Redo: Cmd+Z / Cmd+Shift+Z</li>
              </ul>
            </div>
          </div>
        </div>
        ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {onBranchesChange && (
            <BranchesTab
              branches={branches || []}
              onChange={onBranchesChange}
            />
          )}
        </div>
        )}
      </div>
    </div>
  );
}
