/**
 * Workflow Expression Engine
 * Resolves {{ expression }} templates against the workflow execution context.
 * Supports dot-notation access, built-in functions, and fallback values.
 *
 * Examples:
 *   {{ lead.email }}
 *   {{ lead.score | default(0) }}
 *   {{ upper(lead.name) }}
 *   {{ now() }}
 *   {{ env.WEBHOOK_SECRET }}
 */

export type ExpressionContext = Record<string, unknown>;

const EXPRESSION_RE = /\{\{\s*(.+?)\s*\}\}/g;

/* ── Built-in Functions ── */

const BUILTIN_FUNCTIONS: Record<string, (...args: unknown[]) => unknown> = {
  upper: (v: unknown) => String(v ?? "").toUpperCase(),
  lower: (v: unknown) => String(v ?? "").toLowerCase(),
  trim: (v: unknown) => String(v ?? "").trim(),
  length: (v: unknown) => {
    if (Array.isArray(v)) return v.length;
    if (typeof v === "string") return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
    return 0;
  },
  json: (v: unknown) => JSON.stringify(v ?? null),
  number: (v: unknown) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  },
  bool: (v: unknown) => Boolean(v),
  now: () => new Date().toISOString(),
  timestamp: () => Date.now(),
  date: (v: unknown) => {
    try {
      return new Date(String(v)).toISOString().split("T")[0];
    } catch {
      return "";
    }
  },
  coalesce: (...args: unknown[]) => {
    for (const arg of args) {
      if (arg !== undefined && arg !== null && arg !== "") return arg;
    }
    return null;
  },
  concat: (...args: unknown[]) => args.map((a) => String(a ?? "")).join(""),
  split: (v: unknown, sep: unknown) => String(v ?? "").split(String(sep ?? ",")),
  join: (v: unknown, sep: unknown) => {
    if (Array.isArray(v)) return v.join(String(sep ?? ", "));
    return String(v ?? "");
  },
  includes: (v: unknown, search: unknown) => {
    if (Array.isArray(v)) return v.includes(search);
    return String(v ?? "").includes(String(search ?? ""));
  },
  replace: (v: unknown, search: unknown, replacement: unknown) =>
    String(v ?? "").replace(String(search ?? ""), String(replacement ?? "")),
  substring: (v: unknown, start: unknown, end: unknown) =>
    String(v ?? "").substring(Number(start) || 0, end !== undefined ? Number(end) : undefined),
  round: (v: unknown, decimals: unknown) => {
    const n = Number(v);
    if (isNaN(n)) return 0;
    const d = Number(decimals) || 0;
    return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  },
  abs: (v: unknown) => Math.abs(Number(v) || 0),
  min: (...args: unknown[]) => Math.min(...args.map((a) => Number(a) || 0)),
  max: (...args: unknown[]) => Math.max(...args.map((a) => Number(a) || 0)),
  keys: (v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.keys(v);
    return [];
  },
  values: (v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.values(v);
    return [];
  },
};

/* ── Dot-Notation Resolver ── */

function resolveProperty(context: ExpressionContext, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = context;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;

    // Array index: items[0]
    const bracketMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (bracketMatch) {
      const key = bracketMatch[1];
      const idx = parseInt(bracketMatch[2], 10);
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[idx];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/* ── Expression Parser ── */

/**
 * Parst eine einzelne Expression (ohne {{ }}).
 * Unterstützt:
 *   - property.path
 *   - func(arg1, arg2)
 *   - value | default(fallback)
 *   - value | func
 */
function evaluateSingleExpression(
  expr: string,
  context: ExpressionContext
): unknown {
  const trimmed = expr.trim();

  // Pipe-Filter: expression | filter(args)
  if (trimmed.includes("|")) {
    const pipeIndex = trimmed.indexOf("|");
    const left = trimmed.slice(0, pipeIndex).trim();
    const right = trimmed.slice(pipeIndex + 1).trim();

    const leftValue = evaluateSingleExpression(left, context);

    // default(value) — spezialbehandlung
    const defaultMatch = right.match(/^default\((.+)\)$/);
    if (defaultMatch) {
      if (leftValue === undefined || leftValue === null || leftValue === "") {
        return parseInlineValue(defaultMatch[1].trim());
      }
      return leftValue;
    }

    // Generischer Funktionsaufruf als Filter
    const funcMatch = right.match(/^(\w+)(?:\((.+)\))?$/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const func = BUILTIN_FUNCTIONS[funcName];
      if (func) {
        const extraArgs = funcMatch[2]
          ? funcMatch[2].split(",").map((a) => parseInlineValue(a.trim()))
          : [];
        return func(leftValue, ...extraArgs);
      }
    }

    return leftValue;
  }

  // Function call: func(arg1, arg2, ...)
  const funcCallMatch = trimmed.match(/^(\w+)\((.*)?\)$/);
  if (funcCallMatch) {
    const funcName = funcCallMatch[1];
    const func = BUILTIN_FUNCTIONS[funcName];
    if (func) {
      const argsStr = funcCallMatch[2] || "";
      const args = argsStr
        ? splitArgs(argsStr).map((a) => {
            const trimArg = a.trim();
            // Wenn das Argument ein Pfad ist, resolve from context
            if (!isLiteral(trimArg)) {
              return resolveProperty(context, trimArg);
            }
            return parseInlineValue(trimArg);
          })
        : [];
      return func(...args);
    }
  }

  // String literal
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;

  // Property path from context
  return resolveProperty(context, trimmed);
}

function isLiteral(s: string): boolean {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  )
    return true;
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  if (s === "true" || s === "false" || s === "null") return true;
  return false;
}

function parseInlineValue(s: string): unknown {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  )
    return t.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  return t;
}

/** Split comma-separated args, respecting string literals */
function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  let depth = 0;

  for (const char of argsStr) {
    if (inQuote) {
      current += char;
      if (char === inQuote) inQuote = null;
    } else if (char === '"' || char === "'") {
      current += char;
      inQuote = char;
    } else if (char === "(") {
      current += char;
      depth++;
    } else if (char === ")") {
      current += char;
      depth--;
    } else if (char === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) args.push(current);
  return args;
}

/* ── Public API ── */

/**
 * Resolve alle {{ expression }} Platzhalter in einem String.
 * Gibt den aufgelösten String zurück.
 */
export function resolveExpression(
  template: string,
  context: ExpressionContext
): string {
  return template.replace(EXPRESSION_RE, (_match, expr: string) => {
    const result = evaluateSingleExpression(expr, context);
    if (result === undefined || result === null) return "";
    if (typeof result === "object") return JSON.stringify(result);
    return String(result);
  });
}

/**
 * Resolve eine Expression und gib den rohen Wert zurück (nicht als String).
 * Nützlich für Bedingungsauswertung in Logic-Nodes.
 */
export function resolveExpressionValue(
  expression: string,
  context: ExpressionContext
): unknown {
  return evaluateSingleExpression(expression.trim(), context);
}

/**
 * Resolve alle {{ }} Platzhalter in einem verschachtelten Objekt rekursiv.
 */
export function resolveExpressionDeep(
  value: unknown,
  context: ExpressionContext
): unknown {
  if (typeof value === "string") {
    // Wenn der gesamte String eine einzelne Expression ist, raw-Wert zurückgeben
    const singleMatch = value.match(/^\{\{\s*(.+?)\s*\}\}$/);
    if (singleMatch) {
      return evaluateSingleExpression(singleMatch[1], context);
    }
    return resolveExpression(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveExpressionDeep(item, context));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveExpressionDeep(v, context);
    }
    return result;
  }

  return value;
}

/**
 * Evaluiert eine Bedingung (Condition) gegen den Kontext.
 * Unterstützt Operatoren: equals, not_equals, contains, not_contains,
 * greater_than, less_than, exists, not_exists, matches, in
 */
export function evaluateCondition(
  config: {
    field: string;
    operator: string;
    value?: string | number | boolean;
  },
  context: ExpressionContext
): boolean {
  const fieldValue = resolveExpressionValue(config.field, context);
  const compareValue = typeof config.value === "string"
    ? resolveExpressionValue(config.value, context)
    : config.value;

  switch (config.operator) {
    case "equals":
    case "eq":
      return String(fieldValue) === String(compareValue);
    case "not_equals":
    case "neq":
      return String(fieldValue) !== String(compareValue);
    case "contains":
      return String(fieldValue ?? "").includes(String(compareValue ?? ""));
    case "not_contains":
      return !String(fieldValue ?? "").includes(String(compareValue ?? ""));
    case "greater_than":
    case "gt":
      return Number(fieldValue) > Number(compareValue);
    case "less_than":
    case "lt":
      return Number(fieldValue) < Number(compareValue);
    case "gte":
      return Number(fieldValue) >= Number(compareValue);
    case "lte":
      return Number(fieldValue) <= Number(compareValue);
    case "exists":
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
    case "not_exists":
      return fieldValue === undefined || fieldValue === null || fieldValue === "";
    case "matches": {
      try {
        const re = new RegExp(String(compareValue ?? ""));
        return re.test(String(fieldValue ?? ""));
      } catch {
        return false;
      }
    }
    case "in": {
      if (Array.isArray(compareValue)) {
        return compareValue.includes(fieldValue);
      }
      return String(compareValue ?? "").split(",").map((s) => s.trim()).includes(String(fieldValue));
    }
    case "truthy":
      return Boolean(fieldValue);
    case "falsy":
      return !fieldValue;
    default:
      return false;
  }
}
