/**
 * JSON Schema validation for Action Agent input/output.
 *
 * Agents (mode=TASK) can declare an inputSchema and outputSchema as JSON Schema
 * documents. When present, the run endpoint validates inputs before execution
 * and outputs after execution. Agents without schemas pass through unvalidated
 * (backward compatible).
 *
 * Built on AJV (draft 2020-12) with format support (date-time, email, uri, ...).
 */
import Ajv, { type ErrorObject, type Schema } from "ajv";
import addFormats from "ajv-formats";

// Minimal Agent shape — caller can pass the full Prisma Agent or any object
// with these fields; we only read what we need.
type AgentLike = {
  inputSchema?: unknown;
  outputSchema?: unknown;
  strictOutputValidation?: boolean | null;
};

export type ValidationResult = {
  valid: boolean;
  errors?: string[];
  data?: unknown;
};

let _ajv: Ajv | null = null;

function getAjv(): Ajv {
  if (!_ajv) {
    _ajv = new Ajv({
      allErrors: true,
      strict: false,
      // Coerce types where harmless ("123" → 123 if schema says number).
      coerceTypes: false,
      useDefaults: true,
    });
    addFormats(_ajv);
  }
  return _ajv;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((e) => {
    const path = e.instancePath || "(root)";
    return `${path} ${e.message ?? "is invalid"}`.trim();
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates that a value is itself a structurally valid JSON Schema.
 * Used before persisting an agent's inputSchema / outputSchema.
 */
export function validateSchema(schema: unknown): ValidationResult {
  if (schema === null || schema === undefined) {
    return { valid: true };
  }
  if (!isPlainObject(schema)) {
    return { valid: false, errors: ["schema must be a JSON object"] };
  }
  try {
    // ajv.compile throws on structurally invalid schemas — that's our signal.
    getAjv().compile(schema as Schema);
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid JSON Schema";
    return { valid: false, errors: [message] };
  }
}

function compileOrNull(schema: unknown) {
  if (!schema || !isPlainObject(schema)) return null;
  try {
    return getAjv().compile(schema as Schema);
  } catch {
    return null;
  }
}

/**
 * Validates input against the agent's inputSchema.
 * Returns valid=true (passthrough) when the agent has no inputSchema.
 */
export function validateAgentInput(
  agent: AgentLike,
  input: unknown
): ValidationResult {
  const validate = compileOrNull(agent.inputSchema);
  if (!validate) {
    return { valid: true, data: input };
  }
  // ajv mutates the data when useDefaults is on; clone to keep callers safe.
  const data = isPlainObject(input) ? { ...input } : input;
  const ok = validate(data);
  if (ok) {
    return { valid: true, data };
  }
  return { valid: false, errors: formatErrors(validate.errors), data };
}

/**
 * Validates output against the agent's outputSchema.
 * Returns valid=true (passthrough) when the agent has no outputSchema.
 */
export function validateAgentOutput(
  agent: AgentLike,
  output: unknown
): ValidationResult {
  const validate = compileOrNull(agent.outputSchema);
  if (!validate) {
    return { valid: true, data: output };
  }
  const data = isPlainObject(output) ? { ...output } : output;
  const ok = validate(data);
  if (ok) {
    return { valid: true, data };
  }
  return { valid: false, errors: formatErrors(validate.errors), data };
}
