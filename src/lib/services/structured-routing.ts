import { getClaudeClient } from "@/lib/ai";

// ── Types ──────────────────────────────────────────────────────────

export interface OutputSchemaField {
  field: string;
  type: "string" | "number" | "boolean";
  description: string;
}

export interface StructuredCondition {
  field: string;
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not_in" | "contains";
  value: string | number | boolean | (string | number)[];
}

export interface ConditionGroup {
  operator: "AND" | "OR";
  conditions: (StructuredCondition | ConditionGroup)[];
}

export type RoutingCondition = StructuredCondition | ConditionGroup;

// ── Structured Output Extraction ───────────────────────────────────

export async function extractStructuredOutput(
  agentOutput: string,
  schema: OutputSchemaField[]
): Promise<Record<string, unknown>> {
  if (schema.length === 0) return {};

  const schemaDescription = schema
    .map((f) => `- "${f.field}" (${f.type}): ${f.description}`)
    .join("\n");

  try {
    const client = getClaudeClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: `You extract structured data from agent responses. Return ONLY valid JSON, no other text.
If a field cannot be determined from the response, use null for optional fields or a sensible default.`,
      messages: [{
        role: "user",
        content: `Extract the following fields from this agent response:

Schema:
${schemaDescription}

Agent response:
${agentOutput.slice(0, 3000)}

Return a JSON object with exactly these fields.`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    // Coerce types based on schema
    const result: Record<string, unknown> = {};
    for (const field of schema) {
      const value = parsed[field.field];
      if (value === undefined || value === null) {
        result[field.field] = null;
        continue;
      }

      switch (field.type) {
        case "number":
          result[field.field] = typeof value === "number" ? value : Number(value) || null;
          break;
        case "boolean":
          result[field.field] = typeof value === "boolean" ? value : value === "true" || value === 1;
          break;
        default:
          result[field.field] = String(value);
      }
    }

    return result;
  } catch {
    return {};
  }
}

// ── Condition Evaluation ──────────────────────────────────────────

function isConditionGroup(cond: RoutingCondition): cond is ConditionGroup {
  return "conditions" in cond && "operator" in cond && (cond.operator === "AND" || cond.operator === "OR");
}

export function evaluateCondition(
  data: Record<string, unknown>,
  condition: RoutingCondition
): boolean {
  if (isConditionGroup(condition)) {
    return evaluateConditionGroup(data, condition);
  }
  return evaluateSingleCondition(data, condition);
}

function evaluateConditionGroup(
  data: Record<string, unknown>,
  group: ConditionGroup
): boolean {
  if (group.operator === "AND") {
    return group.conditions.every((c) => evaluateCondition(data, c));
  }
  // OR
  return group.conditions.some((c) => evaluateCondition(data, c));
}

function evaluateSingleCondition(
  data: Record<string, unknown>,
  cond: StructuredCondition
): boolean {
  const fieldValue = data[cond.field];

  // null/undefined checks
  if (fieldValue === null || fieldValue === undefined) {
    return false;
  }

  switch (cond.operator) {
    case "==":
      // eslint-disable-next-line eqeqeq
      return fieldValue == cond.value;
    case "!=":
      // eslint-disable-next-line eqeqeq
      return fieldValue != cond.value;
    case ">":
      return Number(fieldValue) > Number(cond.value);
    case "<":
      return Number(fieldValue) < Number(cond.value);
    case ">=":
      return Number(fieldValue) >= Number(cond.value);
    case "<=":
      return Number(fieldValue) <= Number(cond.value);
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(fieldValue as string | number);
    case "not_in":
      return Array.isArray(cond.value) && !cond.value.includes(fieldValue as string | number);
    case "contains":
      return typeof fieldValue === "string" && fieldValue.toLowerCase().includes(String(cond.value).toLowerCase());
    default:
      return false;
  }
}

// ── Schema Helpers ───────────────────────────────────────────────

export function generateSchemaExample(schema: OutputSchemaField[]): Record<string, unknown> {
  const example: Record<string, unknown> = {};
  for (const field of schema) {
    switch (field.type) {
      case "number":
        example[field.field] = 0;
        break;
      case "boolean":
        example[field.field] = false;
        break;
      default:
        example[field.field] = "";
    }
  }
  return example;
}

export function validateSchema(schema: unknown): schema is OutputSchemaField[] {
  if (!Array.isArray(schema)) return false;
  return schema.every(
    (f) =>
      typeof f === "object" &&
      f !== null &&
      typeof f.field === "string" &&
      ["string", "number", "boolean"].includes(f.type) &&
      typeof f.description === "string"
  );
}
