"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Loader2, Plus, Trash2, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

export interface LogicCondition {
  field: string;
  op: "equals" | "not_equals" | "contains" | "not_contains" | "gt" | "lt" | "gte" | "lte" | "exists" | "not_exists";
  value: string;
}

export interface OutputBranch {
  name: string;
  condition: string; // JS expression that returns boolean
  outputType: "EMAIL" | "HTTP_REQUEST" | "WEBHOOK" | "NEXT_AGENT" | "CUSTOM_CODE" | "NONE";
  outputConfig: Record<string, string>;
}

export interface PreProcessConfig {
  enabled: boolean;
  code: string;
  conditions: LogicCondition[];
}

export interface PostProcessConfig {
  enabled: boolean;
  code: string;
  conditions: LogicCondition[];
  branches: OutputBranch[];
}

const OP_LABELS: Record<string, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  exists: "exists",
  not_exists: "does not exist",
};

const PREPROCESS_PLACEHOLDER = `// Transform the trigger input before it reaches the AI.
// Available: input (string or object from trigger)
// Return: the transformed input (string or object)

// Example: extract specific fields from webhook JSON
// const data = typeof input === 'string' ? JSON.parse(input) : input;
// return { name: data.contact.name, score: data.lead_score };

return input;`;

const POSTPROCESS_PLACEHOLDER = `// Transform the AI response before it goes to the output.
// Available: output (string from AI), input (original input)
// Return: the transformed output (string or object)

// Example: extract JSON from AI text
// const match = output.match(/\\{[\\s\\S]*\\}/);
// return match ? JSON.parse(match[0]) : output;

return output;`;

/* ─── Mini CodeMirror Editor ─── */

function MiniCodeEditor({
  code,
  onChange,
  placeholderText,
  height = "120px",
}: {
  code: string;
  onChange: (code: string) => void;
  placeholderText: string;
  height?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: code,
      extensions: [
        javascript(),
        oneDark,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        placeholderExt(placeholderText),
        EditorView.lineWrapping,
        EditorView.theme({ "&": { maxHeight: height, fontSize: "11px" }, ".cm-scroller": { overflow: "auto" } }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={editorRef} className="overflow-hidden rounded-lg border border-border" />
  );
}

/* ─── Condition Row ─── */

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: LogicCondition;
  onChange: (c: LogicCondition) => void;
  onRemove: () => void;
}) {
  const needsValue = !["exists", "not_exists"].includes(condition.op);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground shrink-0">If</span>
      <input
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        placeholder="input.score"
        className="w-24 rounded border border-border bg-card px-1.5 py-1 text-[10px] text-foreground font-mono"
      />
      <select
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value as LogicCondition["op"] })}
        className="rounded border border-border bg-card px-1 py-1 text-[10px] text-foreground"
      >
        {Object.entries(OP_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      {needsValue && (
        <input
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="7"
          className="w-16 rounded border border-border bg-card px-1.5 py-1 text-[10px] text-foreground font-mono"
        />
      )}
      <button onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ─── Output Branch Editor ─── */

function BranchEditor({
  branch,
  index,
  onChange,
  onRemove,
  agents,
}: {
  branch: OutputBranch;
  index: number;
  onChange: (b: OutputBranch) => void;
  onRemove: () => void;
  agents: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const letters = ["A", "B", "C"];
  const letter = letters[index] || String(index + 1);

  return (
    <div className="rounded-lg border border-border bg-card/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-[11px]"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-kiln-green/20 text-[9px] font-bold text-kiln-green">{letter}</span>
        <span className="font-medium text-foreground flex-1 text-left truncate">{branch.name || `Branch ${letter}`}</span>
        <span className="text-[10px] text-muted-foreground">{branch.outputType}</span>
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border px-2.5 py-2 space-y-2">
          <input
            value={branch.name}
            onChange={(e) => onChange({ ...branch, name: e.target.value })}
            placeholder="Branch name"
            className="w-full rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground"
          />
          <div>
            <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Condition (JS expression)</label>
            <input
              value={branch.condition}
              onChange={(e) => onChange({ ...branch, condition: e.target.value })}
              placeholder="output.includes('qualified') && score > 7"
              className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground font-mono"
            />
          </div>
          <div>
            <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Output Type</label>
            <select
              value={branch.outputType}
              onChange={(e) => onChange({ ...branch, outputType: e.target.value as OutputBranch["outputType"] })}
              className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground"
            >
              <option value="NONE">None (log only)</option>
              <option value="EMAIL">Send Email</option>
              <option value="HTTP_REQUEST">HTTP Request</option>
              <option value="WEBHOOK">Webhook</option>
              <option value="NEXT_AGENT">Next Agent</option>
            </select>
          </div>
          {branch.outputType === "EMAIL" && (
            <div className="space-y-1">
              <input
                value={branch.outputConfig.email || ""}
                onChange={(e) => onChange({ ...branch, outputConfig: { ...branch.outputConfig, email: e.target.value } })}
                placeholder="recipient@example.com"
                className="w-full rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground"
              />
              <input
                value={branch.outputConfig.subject || ""}
                onChange={(e) => onChange({ ...branch, outputConfig: { ...branch.outputConfig, subject: e.target.value } })}
                placeholder="Email subject"
                className="w-full rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground"
              />
            </div>
          )}
          {(branch.outputType === "HTTP_REQUEST" || branch.outputType === "WEBHOOK") && (
            <input
              value={branch.outputConfig.url || ""}
              onChange={(e) => onChange({ ...branch, outputConfig: { ...branch.outputConfig, url: e.target.value } })}
              placeholder="https://..."
              className="w-full rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground"
            />
          )}
          {branch.outputType === "NEXT_AGENT" && (
            <select
              value={branch.outputConfig.targetAgentId || ""}
              onChange={(e) => onChange({ ...branch, outputConfig: { ...branch.outputConfig, targetAgentId: e.target.value } })}
              className="w-full rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground"
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <button onClick={onRemove} className="text-[10px] text-destructive hover:underline">
            Remove branch
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Pre-Process Block ─── */

export function PreProcessBlock({
  config,
  onChange,
}: {
  config: PreProcessConfig;
  onChange: (c: PreProcessConfig) => void;
}) {
  const [testInput, setTestInput] = useState('{"name":"John","score":8}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  function testCode() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      let input: unknown;
      try { input = JSON.parse(testInput); } catch { input = testInput; }

      // Test conditions first
      for (const cond of config.conditions) {
        const passes = evaluateCondition(cond, input);
        if (!passes) {
          setTestResult("SKIPPED — condition failed: " + cond.field + " " + OP_LABELS[cond.op] + " " + cond.value);
          setTesting(false);
          return;
        }
      }

      // Test transform code
      if (config.code.trim()) {
        const fn = new Function("input", `"use strict";\n${config.code}`);
        const result = fn(input);
        setTestResult(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      } else {
        setTestResult(typeof input === "string" ? input : JSON.stringify(input, null, 2));
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Conditions */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conditions</label>
          <button
            onClick={() => onChange({ ...config, conditions: [...config.conditions, { field: "input.score", op: "gt", value: "7" }] })}
            className="flex items-center gap-1 text-[10px] text-kiln-orange hover:underline"
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </button>
        </div>
        {config.conditions.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">No conditions — agent always runs.</p>
        )}
        <div className="space-y-1.5">
          {config.conditions.map((cond, i) => (
            <ConditionRow
              key={i}
              condition={cond}
              onChange={(c) => {
                const next = [...config.conditions];
                next[i] = c;
                onChange({ ...config, conditions: next });
              }}
              onRemove={() => onChange({ ...config, conditions: config.conditions.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      </div>

      {/* Transform Code */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
          Transform Input (JavaScript)
        </label>
        <MiniCodeEditor
          code={config.code}
          onChange={(code) => onChange({ ...config, code })}
          placeholderText={PREPROCESS_PLACEHOLDER}
        />
      </div>

      {/* Test / Preview */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-3 w-3" /> {showPreview ? "Hide" : "Test"} Preview
        </button>
      </div>

      {showPreview && (
        <div className="space-y-2 rounded-lg border border-border bg-card/30 p-2.5">
          <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Test Input</label>
          <textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            rows={2}
            className="w-full rounded border border-border bg-card px-2 py-1 font-mono text-[10px] text-foreground resize-none"
          />
          <Button size="sm" variant="outline" onClick={testCode} disabled={testing} className="h-6 text-[10px]">
            {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
            Run Test
          </Button>
          {testResult && (
            <pre className={cn("rounded bg-muted p-2 text-[10px] whitespace-pre-wrap max-h-24 overflow-auto", testResult.startsWith("SKIPPED") ? "text-amber-400" : "text-kiln-green")}>
              {testResult}
            </pre>
          )}
          {testError && (
            <pre className="rounded bg-destructive/10 p-2 text-[10px] text-destructive whitespace-pre-wrap">{testError}</pre>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Post-Process Block ─── */

export function PostProcessBlock({
  config,
  onChange,
  agents,
}: {
  config: PostProcessConfig;
  onChange: (c: PostProcessConfig) => void;
  agents: { id: string; name: string }[];
}) {
  const [testOutput, setTestOutput] = useState("The lead scored 8/10 and is qualified for follow-up.");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  function testCode() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      let output: unknown = testOutput;

      // Test transform code
      if (config.code.trim()) {
        const fn = new Function("output", "input", `"use strict";\n${config.code}`);
        output = fn(testOutput, "{}");
      }

      // Test branch conditions
      const matchedBranches: string[] = [];
      for (const branch of config.branches) {
        if (branch.condition.trim()) {
          try {
            const condFn = new Function("output", "input", `"use strict";\nreturn (${branch.condition});`);
            if (condFn(typeof output === "string" ? output : JSON.stringify(output), "{}")) {
              matchedBranches.push(branch.name || branch.outputType);
            }
          } catch { /* skip */ }
        }
      }

      const resultParts = [
        "Transformed output:",
        typeof output === "string" ? output : JSON.stringify(output, null, 2),
      ];
      if (matchedBranches.length > 0) {
        resultParts.push("\nMatched branches: " + matchedBranches.join(", "));
      } else if (config.branches.length > 0) {
        resultParts.push("\nNo branches matched.");
      }
      setTestResult(resultParts.join("\n"));
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Transform Code */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
          Transform Output (JavaScript)
        </label>
        <MiniCodeEditor
          code={config.code}
          onChange={(code) => onChange({ ...config, code })}
          placeholderText={POSTPROCESS_PLACEHOLDER}
        />
      </div>

      {/* Conditions */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conditions</label>
          <button
            onClick={() => onChange({ ...config, conditions: [...config.conditions, { field: "output", op: "contains", value: "qualified" }] })}
            className="flex items-center gap-1 text-[10px] text-kiln-orange hover:underline"
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </button>
        </div>
        {config.conditions.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">No conditions — output always sent.</p>
        )}
        <div className="space-y-1.5">
          {config.conditions.map((cond, i) => (
            <ConditionRow
              key={i}
              condition={cond}
              onChange={(c) => {
                const next = [...config.conditions];
                next[i] = c;
                onChange({ ...config, conditions: next });
              }}
              onRemove={() => onChange({ ...config, conditions: config.conditions.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      </div>

      {/* Output Branches */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Output Branches</label>
          {config.branches.length < 3 && (
            <button
              onClick={() =>
                onChange({
                  ...config,
                  branches: [
                    ...config.branches,
                    { name: `Branch ${["A", "B", "C"][config.branches.length] || config.branches.length + 1}`, condition: "", outputType: "NONE", outputConfig: {} },
                  ],
                })
              }
              className="flex items-center gap-1 text-[10px] text-kiln-orange hover:underline"
            >
              <Plus className="h-2.5 w-2.5" /> Add Branch
            </button>
          )}
        </div>
        {config.branches.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">No branches — uses default output block above.</p>
        )}
        <div className="space-y-2">
          {config.branches.map((branch, i) => (
            <BranchEditor
              key={i}
              branch={branch}
              index={i}
              agents={agents}
              onChange={(b) => {
                const next = [...config.branches];
                next[i] = b;
                onChange({ ...config, branches: next });
              }}
              onRemove={() => onChange({ ...config, branches: config.branches.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      </div>

      {/* Test / Preview */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-3 w-3" /> {showPreview ? "Hide" : "Test"} Preview
        </button>
      </div>

      {showPreview && (
        <div className="space-y-2 rounded-lg border border-border bg-card/30 p-2.5">
          <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Test AI Output</label>
          <textarea
            value={testOutput}
            onChange={(e) => setTestOutput(e.target.value)}
            rows={2}
            className="w-full rounded border border-border bg-card px-2 py-1 font-mono text-[10px] text-foreground resize-none"
          />
          <Button size="sm" variant="outline" onClick={testCode} disabled={testing} className="h-6 text-[10px]">
            {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
            Run Test
          </Button>
          {testResult && (
            <pre className="rounded bg-muted p-2 text-[10px] text-kiln-green whitespace-pre-wrap max-h-32 overflow-auto">{testResult}</pre>
          )}
          {testError && (
            <pre className="rounded bg-destructive/10 p-2 text-[10px] text-destructive whitespace-pre-wrap">{testError}</pre>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Condition Evaluator (shared between client preview and server execution) ─── */

export function evaluateCondition(cond: LogicCondition, data: unknown): boolean {
  // Resolve field path like "input.score"
  const fieldPath = cond.field.replace(/^(input|output)\.?/, "");
  let fieldValue: unknown = data;

  if (fieldPath) {
    const parts = fieldPath.split(".");
    for (const part of parts) {
      if (fieldValue == null || typeof fieldValue !== "object") { fieldValue = undefined; break; }
      fieldValue = (fieldValue as Record<string, unknown>)[part];
    }
  }

  switch (cond.op) {
    case "exists": return fieldValue != null && fieldValue !== "";
    case "not_exists": return fieldValue == null || fieldValue === "";
    case "equals": return String(fieldValue) === cond.value;
    case "not_equals": return String(fieldValue) !== cond.value;
    case "contains": return String(fieldValue ?? "").includes(cond.value);
    case "not_contains": return !String(fieldValue ?? "").includes(cond.value);
    case "gt": return Number(fieldValue) > Number(cond.value);
    case "lt": return Number(fieldValue) < Number(cond.value);
    case "gte": return Number(fieldValue) >= Number(cond.value);
    case "lte": return Number(fieldValue) <= Number(cond.value);
    default: return true;
  }
}
