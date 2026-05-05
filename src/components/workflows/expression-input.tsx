"use client";

import { cn } from "@/lib/utils";
import { Code2, Variable, AlertTriangle } from "lucide-react";

/** Extract variable names referenced via {{ variables.X }} */
function extractVariableRefs(value: string): string[] {
  const refs: string[] = [];
  const re = /\{\{\s*variables\.(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

/**
 * Text input that supports {{ expression }} syntax.
 * Shows a subtle code icon when value contains expressions.
 * Highlights {{ variables.X }} references when availableVariables is provided.
 */
export function ExpressionInput({
  value,
  onChange,
  placeholder,
  label,
  hint,
  multiline,
  className,
  availableVariables,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  multiline?: boolean;
  className?: string;
  /** Names of defined workflow variables — enables missing-variable warnings */
  availableVariables?: string[];
}) {
  const hasExpression = value.includes("{{");
  const varRefs = extractVariableRefs(value);
  const hasVarRef = varRefs.length > 0;
  const missingVars = availableVariables
    ? varRefs.filter((v) => !availableVariables.includes(v))
    : [];

  const inputClass = cn(
    "w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground",
    hasExpression && "border-violet-500/40 bg-violet-500/5",
    missingVars.length > 0 && "border-amber-500/40 bg-amber-500/5",
    className
  );

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">{label}</label>
          {hasVarRef && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full">
              <Variable className="h-2.5 w-2.5" />
              {varRefs.length} var{varRefs.length > 1 ? "s" : ""}
            </span>
          )}
          {hasExpression && !hasVarRef && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full">
              <Code2 className="h-2.5 w-2.5" />
              expr
            </span>
          )}
        </div>
      )}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={inputClass}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
      {missingVars.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          Undefined variable{missingVars.length > 1 ? "s" : ""}: {missingVars.join(", ")}
        </div>
      )}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Key-value pair editor for headers, variables, etc.
 */
export function KeyValueEditor({
  pairs,
  onChange,
  label,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: {
  pairs: { key: string; value: string }[];
  onChange: (pairs: { key: string; value: string }[]) => void;
  label?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const update = (index: number, field: "key" | "value", val: string) => {
    const next = [...pairs];
    next[index] = { ...next[index], [field]: val };
    onChange(next);
  };

  const add = () => onChange([...pairs, { key: "", value: "" }]);
  const remove = (index: number) => onChange(pairs.filter((_, i) => i !== index));

  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <div className="space-y-1.5">
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={pair.key}
              onChange={(e) => update(i, "key", e.target.value)}
              placeholder={keyPlaceholder}
              className="flex-1 bg-muted border border-border rounded-lg text-xs text-foreground px-2.5 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
            />
            <input
              value={pair.value}
              onChange={(e) => update(i, "value", e.target.value)}
              placeholder={valuePlaceholder}
              className="flex-1 bg-muted border border-border rounded-lg text-xs text-foreground px-2.5 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
            />
            <button
              onClick={() => remove(i)}
              className="text-muted-foreground hover:text-red-400 transition-colors text-xs px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={add}
        className="text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
      >
        + Add
      </button>
    </div>
  );
}
