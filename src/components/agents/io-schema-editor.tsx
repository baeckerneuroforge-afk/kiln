"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileJson, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { validateSchema } from "@/lib/agents/io-schema-validator";

type JsonObject = Record<string, unknown>;

interface Props {
  inputSchema: JsonObject | null;
  outputSchema: JsonObject | null;
  strictOutputValidation: boolean;
  onChange: (next: {
    inputSchema: JsonObject | null;
    outputSchema: JsonObject | null;
    strictOutputValidation: boolean;
  }) => void;
}

type ValidationStatus =
  | { kind: "idle" }
  | { kind: "valid" }
  | { kind: "invalid"; errors: string[] };

function stringify(schema: JsonObject | null): string {
  if (!schema) return "";
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return "";
  }
}

// Cheap heuristic: turn a concrete example value into a JSON Schema sketch.
// Users get a starting point they can refine, no LLM call required.
function inferSchemaFromExample(value: unknown): JsonObject {
  if (Array.isArray(value)) {
    const sample = value.length > 0 ? value[0] : null;
    return {
      type: "array",
      items: sample !== null ? inferSchemaFromExample(sample) : {},
    };
  }
  if (value !== null && typeof value === "object") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(value as JsonObject)) {
      properties[k] = inferSchemaFromExample(v);
      if (v !== null && v !== undefined) required.push(k);
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "number") {
    return { type: Number.isInteger(value) ? "integer" : "number" };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  if (value === null) return { type: "null" };
  return {};
}

interface SchemaPaneProps {
  label: string;
  description: string;
  value: JsonObject | null;
  onChange: (next: JsonObject | null) => void;
}

function SchemaPane({ label, description, value, onChange }: SchemaPaneProps) {
  const [draft, setDraft] = useState(() => stringify(value));
  const [status, setStatus] = useState<ValidationStatus>({ kind: "idle" });
  const [parseError, setParseError] = useState<string | null>(null);
  const [showInferInput, setShowInferInput] = useState(false);
  const [inferDraft, setInferDraft] = useState("");

  function commit(next: string) {
    setDraft(next);
    if (next.trim() === "") {
      setParseError(null);
      setStatus({ kind: "idle" });
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      setParseError(null);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        onChange(parsed as JsonObject);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  function handleValidate() {
    if (draft.trim() === "") {
      setStatus({ kind: "valid" });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (err) {
      setStatus({
        kind: "invalid",
        errors: [err instanceof Error ? err.message : "Invalid JSON"],
      });
      return;
    }
    const result = validateSchema(parsed);
    if (result.valid) {
      setStatus({ kind: "valid" });
    } else {
      setStatus({ kind: "invalid", errors: result.errors ?? ["unknown error"] });
    }
  }

  function handleInfer() {
    try {
      const example = JSON.parse(inferDraft);
      const inferred = inferSchemaFromExample(example);
      const next = JSON.stringify(inferred, null, 2);
      setDraft(next);
      onChange(inferred);
      setShowInferInput(false);
      setInferDraft("");
      setStatus({ kind: "idle" });
      setParseError(null);
    } catch (err) {
      setParseError(
        err instanceof Error ? `Example is not valid JSON: ${err.message}` : "Invalid JSON"
      );
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      </div>

      <textarea
        value={draft}
        onChange={(e) => commit(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={`{\n  "type": "object",\n  "properties": {\n    "email": { "type": "string", "format": "email" }\n  },\n  "required": ["email"]\n}`}
        className="w-full rounded-lg border border-border bg-card/50 px-3 py-2.5 text-xs font-mono text-foreground resize-y focus:border-kiln-orange/50 focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleValidate}>
          Validate
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowInferInput((v) => !v)}
        >
          <Wand2 className="mr-1 h-3 w-3" />
          Generate from Example
        </Button>
      </div>

      {parseError && (
        <p className="flex items-start gap-1.5 text-xs text-red-400">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{parseError}</span>
        </p>
      )}

      {status.kind === "valid" && (
        <p className="flex items-center gap-1.5 text-xs text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          Valid JSON Schema.
        </p>
      )}
      {status.kind === "invalid" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-400">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-3 w-3" />
            Invalid:
          </div>
          <ul className="mt-1 space-y-0.5 pl-4 list-disc">
            {status.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {showInferInput && (
        <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            Paste an example payload — we&apos;ll generate a starter schema you can edit.
          </p>
          <textarea
            value={inferDraft}
            onChange={(e) => setInferDraft(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={`{ "email": "alice@example.com", "score": 0.9 }`}
            className="w-full rounded border border-border bg-card/50 px-2 py-1.5 text-[11px] font-mono text-foreground resize-y focus:border-kiln-orange/50 focus:outline-none"
          />
          <Button size="sm" onClick={handleInfer}>
            Generate Schema
          </Button>
        </div>
      )}
    </div>
  );
}

export function IoSchemaEditor({
  inputSchema,
  outputSchema,
  strictOutputValidation,
  onChange,
}: Props) {
  const heading = useMemo(
    () => (inputSchema || outputSchema ? "I/O Schema" : "I/O Schema (optional)"),
    [inputSchema, outputSchema]
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <FileJson className="h-3.5 w-3.5 text-kiln-orange" />
          {heading}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          JSON Schema describing input/output. Workflows use this for typed
          connections; the run endpoint validates against it.
        </p>
      </div>

      <SchemaPane
        label="Input Schema"
        description="Validated before execution. Bad input fails fast with a 400."
        value={inputSchema}
        onChange={(next) =>
          onChange({ inputSchema: next, outputSchema, strictOutputValidation })
        }
      />

      <SchemaPane
        label="Output Schema"
        description="Validated after execution. Strict mode rejects mismatches; otherwise warnings are returned alongside the output."
        value={outputSchema}
        onChange={(next) =>
          onChange({ inputSchema, outputSchema: next, strictOutputValidation })
        }
      />

      <label className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
        <span className="text-xs text-foreground">
          Strict output validation
          <span className="ml-1.5 text-muted-foreground">
            (fail the run on schema mismatch)
          </span>
        </span>
        <button
          onClick={() =>
            onChange({
              inputSchema,
              outputSchema,
              strictOutputValidation: !strictOutputValidation,
            })
          }
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors",
            strictOutputValidation ? "bg-kiln-orange" : "bg-muted"
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              strictOutputValidation ? "left-[18px]" : "left-0.5"
            )}
          />
        </button>
      </label>
    </div>
  );
}
