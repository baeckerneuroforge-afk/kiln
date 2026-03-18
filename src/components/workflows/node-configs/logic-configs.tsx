"use client";

import { GitBranch, GitFork, Filter, Shuffle, Trash2, Plus } from "lucide-react";
import { ExpressionInput } from "../expression-input";
import { cn } from "@/lib/utils";

/* ========== Shared ========== */
const OPERATORS = [
  { value: "equals", label: "equals (==)" },
  { value: "not_equals", label: "not equals (!=)" },
  { value: "greater_than", label: "greater than (>)" },
  { value: "less_than", label: "less than (<)" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "exists", label: "exists" },
  { value: "not_exists", label: "not exists" },
  { value: "is_empty", label: "is empty" },
  { value: "matches", label: "matches (regex)" },
];

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

interface ConditionGroup {
  logic: "AND" | "OR";
  conditions: ConditionRow[];
}

function ConditionBuilder({
  groups,
  onChange,
}: {
  groups: ConditionGroup[];
  onChange: (groups: ConditionGroup[]) => void;
}) {
  const updateGroup = (gi: number, patch: Partial<ConditionGroup>) => {
    const next = [...groups];
    next[gi] = { ...next[gi], ...patch };
    onChange(next);
  };

  const updateCondition = (gi: number, ci: number, patch: Partial<ConditionRow>) => {
    const next = [...groups];
    const conds = [...next[gi].conditions];
    conds[ci] = { ...conds[ci], ...patch };
    next[gi] = { ...next[gi], conditions: conds };
    onChange(next);
  };

  const addCondition = (gi: number) => {
    const next = [...groups];
    next[gi] = { ...next[gi], conditions: [...next[gi].conditions, { field: "", operator: "equals", value: "" }] };
    onChange(next);
  };

  const removeCondition = (gi: number, ci: number) => {
    const next = [...groups];
    next[gi] = { ...next[gi], conditions: next[gi].conditions.filter((_, i) => i !== ci) };
    if (next[gi].conditions.length === 0) {
      onChange(next.filter((_, i) => i !== gi));
    } else {
      onChange(next);
    }
  };

  const addGroup = () => {
    onChange([...groups, { logic: "AND", conditions: [{ field: "", operator: "equals", value: "" }] }]);
  };

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => (
        <div key={gi} className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 p-3 space-y-2">
          {gi > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">OR</span>
              <div className="flex-1 h-px bg-zinc-700/50" />
            </div>
          )}

          {/* Logic toggle for within-group */}
          {group.conditions.length > 1 && (
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-zinc-500">Match:</span>
              {(["AND", "OR"] as const).map((logic) => (
                <button
                  key={logic}
                  onClick={() => updateGroup(gi, { logic })}
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all",
                    group.logic === logic
                      ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                      : "border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {logic}
                </button>
              ))}
            </div>
          )}

          {group.conditions.map((cond, ci) => (
            <div key={ci} className="flex items-center gap-1.5">
              <input
                value={cond.field}
                onChange={(e) => updateCondition(gi, ci, { field: e.target.value })}
                placeholder="field"
                className="w-[30%] bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-mono text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-zinc-600"
              />
              <select
                value={cond.operator}
                onChange={(e) => updateCondition(gi, ci, { operator: e.target.value })}
                className="w-[35%] bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60"
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
              {!["exists", "not_exists", "is_empty"].includes(cond.operator) && (
                <input
                  value={cond.value}
                  onChange={(e) => updateCondition(gi, ci, { value: e.target.value })}
                  placeholder="value"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-mono text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-zinc-600"
                />
              )}
              <button
                onClick={() => removeCondition(gi, ci)}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}

          <button
            onClick={() => addCondition(gi)}
            className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
          >
            + Add condition
          </button>
        </div>
      ))}

      <button
        onClick={addGroup}
        className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
      >
        + Add OR group
      </button>
    </div>
  );
}

/* ========== IF / Condition ========== */
export function IfConditionConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const groups = (config.groups as ConditionGroup[]) || [
    { logic: "AND", conditions: [{ field: (config.field as string) || "", operator: (config.operator as string) || "equals", value: (config.value as string) || "" }] },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
        <GitBranch className="h-4 w-4 text-violet-400" />
        <p className="text-xs text-zinc-300">Splits the flow into True and False paths</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Conditions</label>
        <ConditionBuilder
          groups={groups}
          onChange={(g) => onChange({ ...config, groups: g })}
        />
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Preview</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="text-[11px] text-green-400">True path</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-[11px] text-red-400">False path</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== Switch ========== */
interface SwitchCase {
  label: string;
  condition: string;
}

export function SwitchConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const cases = (config.cases as SwitchCase[]) || [{ label: "Case 1", condition: "" }];
  const defaultLabel = (config.defaultLabel as string) || "Default";

  const updateCase = (i: number, patch: Partial<SwitchCase>) => {
    const next = [...cases];
    next[i] = { ...next[i], ...patch };
    onChange({ ...config, cases: next });
  };

  const addCase = () => {
    onChange({ ...config, cases: [...cases, { label: `Case ${cases.length + 1}`, condition: "" }] });
  };

  const removeCase = (i: number) => {
    onChange({ ...config, cases: cases.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
        <GitFork className="h-4 w-4 text-violet-400" />
        <p className="text-xs text-zinc-300">Routes to different paths based on conditions</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Cases</label>
        <div className="space-y-2">
          {cases.map((c, i) => (
            <div key={i} className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  value={c.label}
                  onChange={(e) => updateCase(i, { label: e.target.value })}
                  placeholder="Case label"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 px-2.5 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-zinc-600"
                />
                <button onClick={() => removeCase(i)} className="text-zinc-600 hover:text-red-400 transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <input
                value={c.condition}
                onChange={(e) => updateCase(i, { condition: e.target.value })}
                placeholder="{{ field }} == 'value'"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-mono text-zinc-100 px-2.5 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-zinc-600"
              />
            </div>
          ))}
        </div>
        <button onClick={addCase} className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors">
          + Add case
        </button>
      </div>

      {/* Default */}
      <ExpressionInput
        label="Default Path Label"
        value={defaultLabel}
        onChange={(v) => onChange({ ...config, defaultLabel: v })}
        placeholder="Default"
      />
    </div>
  );
}

/* ========== Filter ========== */
export function FilterConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const groups = (config.groups as ConditionGroup[]) || [
    { logic: "AND", conditions: [{ field: (config.field as string) || "", operator: (config.operator as string) || "exists", value: (config.value as string) || "" }] },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
        <Filter className="h-4 w-4 text-violet-400" />
        <p className="text-xs text-zinc-300">Passes data through only if conditions are met</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Pass-through Conditions</label>
        <ConditionBuilder
          groups={groups}
          onChange={(g) => onChange({ ...config, groups: g })}
        />
      </div>

      <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-3">
        <p className="text-[10px] text-zinc-500">
          Data that doesn&apos;t match the conditions will be dropped. Matching data continues to the next node.
        </p>
      </div>
    </div>
  );
}

/* ========== Transform ========== */
interface TransformRow {
  outputField: string;
  expression: string;
}

export function TransformConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const transformations = (config.transformations as TransformRow[]) || [{ outputField: "", expression: "" }];

  const update = (i: number, patch: Partial<TransformRow>) => {
    const next = [...transformations];
    next[i] = { ...next[i], ...patch };
    onChange({ ...config, transformations: next });
  };

  const add = () => {
    onChange({ ...config, transformations: [...transformations, { outputField: "", expression: "" }] });
  };

  const remove = (i: number) => {
    onChange({ ...config, transformations: transformations.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
        <Shuffle className="h-4 w-4 text-violet-400" />
        <p className="text-xs text-zinc-300">Transform and reshape data using expressions</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Transformations</label>
        <div className="space-y-2">
          {transformations.map((t, i) => (
            <div key={i} className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  value={t.outputField}
                  onChange={(e) => update(i, { outputField: e.target.value })}
                  placeholder="outputField"
                  className="w-[40%] bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-mono text-zinc-100 px-2.5 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-zinc-600"
                />
                <span className="text-[10px] text-zinc-500">=</span>
                <input
                  value={t.expression}
                  onChange={(e) => update(i, { expression: e.target.value })}
                  placeholder="{{ source.output | upper }}"
                  className="flex-1 bg-zinc-800 border border-violet-500/30 rounded-lg text-[11px] font-mono text-zinc-100 px-2.5 py-1.5 outline-none focus:border-violet-500/60 placeholder:text-zinc-600"
                />
                <button onClick={() => remove(i)} className="text-zinc-600 hover:text-red-400 transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={add} className="inline-flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors">
          <Plus className="h-3 w-3" />
          Add transformation
        </button>
      </div>

      <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-3">
        <p className="text-[10px] text-zinc-500">
          Each transformation creates an output field from an expression. Use {`{{ }}`} syntax to reference upstream data.
          Example: <code className="text-violet-400">{`{{ source.output | upper }}`}</code>
        </p>
      </div>
    </div>
  );
}
