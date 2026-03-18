"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Plus,
  Copy,
  Check,
  Trash2,
  Lock,
  Variable,
  Search,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WorkflowVariable } from "@/lib/workflow-node-types";

export type { WorkflowVariable };

interface VariablesPanelProps {
  open: boolean;
  onClose: () => void;
  variables: WorkflowVariable[];
  onChange: (variables: WorkflowVariable[]) => void;
  usageCounts?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_STYLES: Record<WorkflowVariable["type"], { bg: string; text: string }> = {
  string: { bg: "bg-violet-500/15", text: "text-violet-400" },
  number: { bg: "bg-blue-500/15", text: "text-blue-400" },
  boolean: { bg: "bg-green-500/15", text: "text-green-400" },
};

function generateId() {
  return `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const EMPTY_VARIABLE: Omit<WorkflowVariable, "id"> = {
  name: "",
  defaultValue: "",
  type: "string",
  description: "",
  isSecret: false,
};

// ---------------------------------------------------------------------------
// Variable Card
// ---------------------------------------------------------------------------

interface VariableCardProps {
  variable: WorkflowVariable;
  index: number;
  total: number;
  usageCount: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (updated: WorkflowVariable) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCopyRef: () => void;
  copied: boolean;
}

function VariableCard({
  variable,
  index,
  total,
  usageCount,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onCopyRef,
  copied,
}: VariableCardProps) {
  const [draft, setDraft] = useState<WorkflowVariable>(variable);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync draft when variable changes externally
  useEffect(() => {
    setDraft(variable);
  }, [variable]);

  // Reset confirm on close
  useEffect(() => {
    if (!isEditing) setConfirmDelete(false);
  }, [isEditing]);

  const typeStyle = TYPE_STYLES[variable.type];

  // ---- View mode ----
  if (!isEditing) {
    return (
      <div
        className="group rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900 transition-all duration-150 cursor-pointer"
        onClick={onStartEdit}
      >
        <div className="px-4 py-3 space-y-2">
          {/* Top row: grip, name, badges, actions */}
          <div className="flex items-center gap-2">
            {/* Reorder grip area */}
            <div className="flex flex-col -my-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp();
                }}
                disabled={index === 0}
                className="text-zinc-600 hover:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-0.5"
                title="Move up"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown();
                }}
                disabled={index === total - 1}
                className="text-zinc-600 hover:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-0.5"
                title="Move down"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            <GripVertical className="h-3.5 w-3.5 text-zinc-700 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* Variable name */}
            <span className="font-mono text-sm font-medium text-orange-300 truncate">
              {variable.name}
            </span>

            {/* Type badge */}
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                typeStyle.bg,
                typeStyle.text
              )}
            >
              {variable.type}
            </span>

            {/* Secret badge */}
            {variable.isSecret && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                <Lock className="h-2.5 w-2.5" />
                Secret
              </span>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Copy reference */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyRef();
              }}
              className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-zinc-800"
              title={`Copy {{ variables.${variable.name} }}`}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Description */}
          {variable.description && (
            <p className="text-xs text-zinc-500 leading-relaxed pl-[38px]">
              {variable.description}
            </p>
          )}

          {/* Bottom row: default value + usage */}
          <div className="flex items-center justify-between pl-[38px]">
            <span className="text-[11px] text-zinc-600">
              Default:{" "}
              <span className="text-zinc-400">
                {variable.isSecret
                  ? "\u2022\u2022\u2022\u2022\u2022"
                  : variable.defaultValue || "\u2014"}
              </span>
            </span>
            <span
              className={cn(
                "text-[11px]",
                usageCount > 0 ? "text-zinc-500" : "text-zinc-700"
              )}
            >
              {usageCount > 0
                ? `Used in ${usageCount} node${usageCount !== 1 ? "s" : ""}`
                : "Unused"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ---- Edit mode ----
  return (
    <div className="rounded-xl border border-orange-500/40 bg-zinc-900 shadow-lg shadow-orange-500/5 transition-all duration-150">
      <div className="px-4 py-4 space-y-3">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Name</label>
          <input
            value={draft.name}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                name: e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
              }))
            }
            placeholder="variable_name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-mono text-orange-300 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
          />
        </div>

        {/* Type + Secret row */}
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Type</label>
            <div className="flex gap-1.5">
              {(["string", "number", "boolean"] as const).map((t) => {
                const ts = TYPE_STYLES[t];
                const active = draft.type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setDraft((d) => ({ ...d, type: t }))}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 border",
                      active
                        ? cn(ts.bg, ts.text, "border-current")
                        : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => setDraft((d) => ({ ...d, isSecret: !d.isSecret }))}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all duration-150",
              draft.isSecret
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            )}
          >
            <Lock className="h-3 w-3" />
            Secret
          </button>
        </div>

        {/* Default value */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Default Value</label>
          <input
            value={draft.defaultValue}
            onChange={(e) => setDraft((d) => ({ ...d, defaultValue: e.target.value }))}
            type={draft.isSecret ? "password" : "text"}
            placeholder={
              draft.type === "boolean"
                ? "true / false"
                : draft.type === "number"
                  ? "0"
                  : "Enter default..."
            }
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Description</label>
          <input
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Describe this variable..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Delete variable?</span>
              <button
                onClick={onDelete}
                className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
              onClick={onCancelEdit}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!draft.name.trim()}
              onClick={() => onSaveEdit(draft)}
            >
              <Check className="mr-1 h-3 w-3" />
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Variable Form
// ---------------------------------------------------------------------------

interface AddVariableFormProps {
  onAdd: (variable: WorkflowVariable) => void;
  existingNames: string[];
}

function AddVariableForm({ onAdd, existingNames }: AddVariableFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Omit<WorkflowVariable, "id">>(EMPTY_VARIABLE);
  const [nameError, setNameError] = useState("");

  const handleAdd = () => {
    const trimmed = draft.name.trim();
    if (!trimmed) return;
    if (existingNames.includes(trimmed)) {
      setNameError("A variable with this name already exists.");
      return;
    }
    onAdd({ ...draft, name: trimmed, id: generateId() });
    setDraft(EMPTY_VARIABLE);
    setNameError("");
    setExpanded(false);
  };

  const handleCancel = () => {
    setDraft(EMPTY_VARIABLE);
    setNameError("");
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-900/60 text-zinc-500 hover:text-zinc-300 text-sm py-3 transition-all duration-150"
      >
        <Plus className="h-4 w-4" />
        Add Variable
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-orange-500/30 bg-zinc-900 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
        New Variable
      </p>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Name</label>
        <input
          value={draft.name}
          onChange={(e) => {
            setDraft((d) => ({
              ...d,
              name: e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
            }));
            setNameError("");
          }}
          placeholder="variable_name"
          className={cn(
            "w-full bg-zinc-800 border rounded-lg text-sm font-mono text-orange-300 px-3 py-2 outline-none transition-colors placeholder:text-zinc-600",
            nameError ? "border-red-500/60" : "border-zinc-700 focus:border-orange-500/60"
          )}
        />
        {nameError && (
          <p className="text-[11px] text-red-400">{nameError}</p>
        )}
      </div>

      {/* Type + Secret */}
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Type</label>
          <div className="flex gap-1.5">
            {(["string", "number", "boolean"] as const).map((t) => {
              const ts = TYPE_STYLES[t];
              const active = draft.type === t;
              return (
                <button
                  key={t}
                  onClick={() => setDraft((d) => ({ ...d, type: t }))}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 border",
                    active
                      ? cn(ts.bg, ts.text, "border-current")
                      : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => setDraft((d) => ({ ...d, isSecret: !d.isSecret }))}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all duration-150",
            draft.isSecret
              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
          )}
        >
          <Lock className="h-3 w-3" />
          Secret
        </button>
      </div>

      {/* Default value */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Default Value</label>
        <input
          value={draft.defaultValue}
          onChange={(e) => setDraft((d) => ({ ...d, defaultValue: e.target.value }))}
          type={draft.isSecret ? "password" : "text"}
          placeholder={
            draft.type === "boolean"
              ? "true / false"
              : draft.type === "number"
                ? "0"
                : "Enter default..."
          }
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Description</label>
        <input
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="Describe this variable..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
          onClick={handleCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!draft.name.trim()}
          onClick={handleAdd}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variables Panel (main export)
// ---------------------------------------------------------------------------

export function VariablesPanel({
  open,
  onClose,
  variables,
  onChange,
  usageCounts = {},
}: VariablesPanelProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Reset internal state when panel closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setEditingId(null);
      setCopiedId(null);
    }
  }, [open]);

  // Filtered variables
  const filtered = variables.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q)
    );
  });

  // Handlers
  const handleAdd = useCallback(
    (variable: WorkflowVariable) => {
      onChange([...variables, variable]);
    },
    [variables, onChange]
  );

  const handleSaveEdit = useCallback(
    (updated: WorkflowVariable) => {
      onChange(variables.map((v) => (v.id === updated.id ? updated : v)));
      setEditingId(null);
    },
    [variables, onChange]
  );

  const handleDelete = useCallback(
    (id: string) => {
      onChange(variables.filter((v) => v.id !== id));
      setEditingId(null);
    },
    [variables, onChange]
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const next = [...variables];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      onChange(next);
    },
    [variables, onChange]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= variables.length - 1) return;
      const next = [...variables];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      onChange(next);
    },
    [variables, onChange]
  );

  const handleCopyRef = useCallback((variable: WorkflowVariable) => {
    const ref = `{{ variables.${variable.name} }}`;
    navigator.clipboard.writeText(ref).then(() => {
      setCopiedId(variable.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[420px] z-30 bg-zinc-950 border-l border-zinc-800 shadow-2xl transform transition-transform duration-200 flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/15">
              <Variable className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Workflow Variables
              </h3>
              <p className="text-[11px] text-zinc-500">
                {variables.length} variable{variables.length !== 1 ? "s" : ""} defined
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg p-1 hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search bar */}
        {variables.length > 0 && (
          <div className="px-5 pt-4 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search variables..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-100 pl-9 pr-3 py-2 outline-none focus:border-orange-500/40 transition-colors placeholder:text-zinc-600"
              />
            </div>
          </div>
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Empty state */}
          {variables.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-12 space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
                <Variable className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400 font-medium">
                  No variables defined
                </p>
                <p className="text-xs text-zinc-600 mt-1 max-w-[260px]">
                  Add variables to use in expressions across your workflow nodes.
                </p>
              </div>
            </div>
          )}

          {/* Filtered empty */}
          {variables.length > 0 && filtered.length === 0 && search.trim() && (
            <div className="flex flex-col items-center justify-center text-center py-8 space-y-2">
              <Search className="h-5 w-5 text-zinc-700" />
              <p className="text-sm text-zinc-500">
                No variables matching &ldquo;{search}&rdquo;
              </p>
            </div>
          )}

          {/* Variable cards */}
          {filtered.map((variable) => {
            const realIndex = variables.findIndex((v) => v.id === variable.id);
            return (
              <VariableCard
                key={variable.id}
                variable={variable}
                index={realIndex}
                total={variables.length}
                usageCount={usageCounts[variable.name] ?? 0}
                isEditing={editingId === variable.id}
                onStartEdit={() => setEditingId(variable.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={handleSaveEdit}
                onDelete={() => handleDelete(variable.id)}
                onMoveUp={() => handleMoveUp(realIndex)}
                onMoveDown={() => handleMoveDown(realIndex)}
                onCopyRef={() => handleCopyRef(variable)}
                copied={copiedId === variable.id}
              />
            );
          })}

          {/* Add form */}
          <AddVariableForm
            onAdd={handleAdd}
            existingNames={variables.map((v) => v.name)}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-5 py-3 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-zinc-600">
            Reference: <span className="font-mono text-zinc-500">{"{{ variables.name }}"}</span>
          </p>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7 text-xs">
            Done
          </Button>
        </div>
      </div>
    </>
  );
}
