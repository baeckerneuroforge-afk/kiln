import { decrypt, encrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import type { WorkflowVariable } from "@/lib/workflow-node-types";

export type PersistedWorkflowVariableType = "STRING" | "NUMBER" | "SECRET" | "JSON";

export interface RuntimeWorkflowVariable {
  id?: string;
  name: string;
  value: string;
  type: PersistedWorkflowVariableType;
  isSecret?: boolean;
}

const LEGACY_TYPE_MAP: Record<string, PersistedWorkflowVariableType> = {
  string: "STRING",
  number: "NUMBER",
  boolean: "STRING",
  json: "JSON",
  secret: "SECRET",
  STRING: "STRING",
  NUMBER: "NUMBER",
  JSON: "JSON",
  SECRET: "SECRET",
};

export function normalizeWorkflowVariableType(type: unknown): PersistedWorkflowVariableType {
  return LEGACY_TYPE_MAP[String(type || "STRING")] || "STRING";
}

export function parseWorkflowVariableValue(
  type: PersistedWorkflowVariableType,
  value: string
): unknown {
  if (type === "NUMBER") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (type === "JSON") {
    if (!value.trim()) return null;
    return JSON.parse(value);
  }

  return value;
}

export function serializeWorkflowVariableValue(
  type: PersistedWorkflowVariableType,
  value: unknown
): string {
  if (type === "JSON") {
    return typeof value === "string" ? value : JSON.stringify(value ?? null);
  }

  if (type === "NUMBER") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : "0";
  }

  return String(value ?? "");
}

export function maskWorkflowSecret(value: string) {
  if (!value) return "";
  return "••••••••";
}

export function prepareWorkflowVariableForStorage(input: {
  name: string;
  value: unknown;
  type: unknown;
  isSecret?: boolean;
}): RuntimeWorkflowVariable {
  const type = normalizeWorkflowVariableType(input.isSecret ? "SECRET" : input.type);
  const serialized = serializeWorkflowVariableValue(type, input.value);

  return {
    name: input.name.trim(),
    value: type === "SECRET" ? encrypt(serialized) : serialized,
    type,
    isSecret: type === "SECRET" || input.isSecret === true,
  };
}

export function toClientWorkflowVariable(record: {
  id: string;
  name: string;
  value: string;
  type: string;
  isSecret: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: record.id,
    name: record.name,
    value: record.isSecret ? maskWorkflowSecret(record.value) : record.value,
    type: normalizeWorkflowVariableType(record.type),
    isSecret: record.isSecret,
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  };
}

export function parseLegacyWorkflowVariables(
  variables: WorkflowVariable[] | undefined
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!variables) return result;

  for (const variable of variables) {
    if (!variable.name) continue;
    const type = normalizeWorkflowVariableType(variable.type);
    const value = variable.defaultValue ?? "";
    try {
      result[variable.name] = parseWorkflowVariableValue(type, value);
    } catch {
      result[variable.name] = value;
    }
  }

  return result;
}

export async function loadWorkflowVariablesForExecution(
  agentTeamId: string,
  legacyVariables?: WorkflowVariable[]
): Promise<Record<string, unknown>> {
  const result = parseLegacyWorkflowVariables(legacyVariables);

  const records = await prisma.workflowVariable.findMany({
    where: { agentTeamId },
    orderBy: { createdAt: "asc" },
  });

  for (const record of records) {
    const type = normalizeWorkflowVariableType(record.type);
    const raw = record.isSecret ? decrypt(record.value) : record.value;
    try {
      result[record.name] = parseWorkflowVariableValue(type, raw);
    } catch {
      result[record.name] = raw;
    }
  }

  return result;
}
