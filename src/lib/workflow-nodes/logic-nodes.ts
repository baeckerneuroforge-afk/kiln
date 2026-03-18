/**
 * Logic Node Executors
 * Evaluieren Bedingungen und bestimmen den nächsten Pfad.
 */

import {
  evaluateCondition,
  resolveExpressionValue,
  type ExpressionContext,
} from "@/lib/workflow-expressions";

export interface LogicNodeResult {
  /** Der gewählte Ausgang ("true"/"false" für IF, case-Label für Switch, "pass"/"drop" für Filter) */
  outputHandle: string;
  /** Optionale Metadaten für das Execution-Log */
  meta?: Record<string, unknown>;
}

/* ── IF / Condition ── */

export function executeIfCondition(
  config: Record<string, unknown>,
  context: ExpressionContext
): LogicNodeResult {
  const field = String(config.field || "");
  const operator = String(config.operator || "equals");
  const value = config.value;

  const passed = evaluateCondition(
    { field, operator, value: value as string | number | boolean },
    context
  );

  return {
    outputHandle: passed ? "true" : "false",
    meta: {
      field,
      operator,
      value,
      fieldResolved: resolveExpressionValue(field, context),
      result: passed,
    },
  };
}

/* ── Switch ── */

interface SwitchCase {
  label: string;
  condition: string; // Expression die truthy/falsy ergibt
  field?: string;
  operator?: string;
  value?: string | number | boolean;
}

export function executeSwitchNode(
  config: Record<string, unknown>,
  context: ExpressionContext
): LogicNodeResult {
  const cases = (config.cases || []) as SwitchCase[];

  for (const c of cases) {
    let matched = false;

    if (c.field && c.operator) {
      // Strukturierte Bedingung
      matched = evaluateCondition(
        { field: c.field, operator: c.operator, value: c.value },
        context
      );
    } else if (c.condition) {
      // Expression-basiert
      const result = resolveExpressionValue(c.condition, context);
      matched = Boolean(result);
    }

    if (matched) {
      return {
        outputHandle: c.label,
        meta: { matchedCase: c.label, cases: cases.map((cs) => cs.label) },
      };
    }
  }

  // Kein Case passt → "default" Ausgang
  return {
    outputHandle: "default",
    meta: { matchedCase: "default", cases: cases.map((cs) => cs.label) },
  };
}

/* ── Filter ── */

export function executeFilterNode(
  config: Record<string, unknown>,
  context: ExpressionContext
): LogicNodeResult {
  const field = String(config.field || "");
  const operator = String(config.operator || "exists");
  const value = config.value;

  const passed = evaluateCondition(
    { field, operator, value: value as string | number | boolean },
    context
  );

  return {
    outputHandle: passed ? "pass" : "drop",
    meta: {
      field,
      operator,
      value,
      fieldResolved: resolveExpressionValue(field, context),
      result: passed,
    },
  };
}

/* ── Transform ── */

interface Transformation {
  outputField: string;
  expression: string;
}

export function executeTransformNode(
  config: Record<string, unknown>,
  context: ExpressionContext
): LogicNodeResult {
  const transformations = (config.transformations || []) as Transformation[];
  const result: Record<string, unknown> = {};

  for (const t of transformations) {
    if (!t.outputField || !t.expression) continue;
    result[t.outputField] = resolveExpressionValue(t.expression, context);
  }

  return {
    outputHandle: "output",
    meta: {
      transformedFields: Object.keys(result),
      result,
    },
  };
}

/* ── Dispatcher ── */

export function executeLogicNode(
  nodeType: string,
  config: Record<string, unknown>,
  context: ExpressionContext
): LogicNodeResult {
  switch (nodeType) {
    case "if_condition":
      return executeIfCondition(config, context);
    case "switch":
      return executeSwitchNode(config, context);
    case "filter":
      return executeFilterNode(config, context);
    case "transform":
      return executeTransformNode(config, context);
    default:
      throw new Error(`Unbekannter Logic-Node-Typ: ${nodeType}`);
  }
}
