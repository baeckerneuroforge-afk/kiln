import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  workflowVariable: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  loadWorkflowVariablesForExecution,
  maskWorkflowSecret,
  parseLegacyWorkflowVariables,
  parseWorkflowVariableValue,
  prepareWorkflowVariableForStorage,
  serializeWorkflowVariableValue,
  toClientWorkflowVariable,
} from "@/lib/workflow-variables-runtime";

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("workflow variables runtime", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
    mockPrisma.workflowVariable.findMany.mockReset();
  });

  it("parses number variables", () => {
    expect(parseWorkflowVariableValue("NUMBER", "42.5")).toBe(42.5);
    expect(parseWorkflowVariableValue("NUMBER", "not-a-number")).toBe(0);
  });

  it("parses JSON variables", () => {
    expect(parseWorkflowVariableValue("JSON", "{\"lang\":\"de\"}")).toEqual({ lang: "de" });
    expect(parseWorkflowVariableValue("JSON", "")).toBeNull();
  });

  it("serializes JSON and number variables for storage", () => {
    expect(serializeWorkflowVariableValue("JSON", { nested: true })).toBe("{\"nested\":true}");
    expect(serializeWorkflowVariableValue("NUMBER", "7")).toBe("7");
    expect(serializeWorkflowVariableValue("NUMBER", "bad")).toBe("0");
  });

  it("encrypts secret variables before storage", () => {
    const stored = prepareWorkflowVariableForStorage({
      name: " api_key ",
      value: "super-secret",
      type: "STRING",
      isSecret: true,
    });

    expect(stored.name).toBe("api_key");
    expect(stored.type).toBe("SECRET");
    expect(stored.isSecret).toBe(true);
    expect(stored.value).not.toBe("super-secret");
    expect(stored.value.split(":")).toHaveLength(3);
  });

  it("masks secret values for API clients", () => {
    expect(maskWorkflowSecret("encrypted")).toBe("••••••••");
    expect(toClientWorkflowVariable({
      id: "var_1",
      name: "token",
      value: "encrypted",
      type: "SECRET",
      isSecret: true,
    })).toMatchObject({ value: "••••••••", isSecret: true });
  });

  it("parses legacy canvas variables", () => {
    expect(parseLegacyWorkflowVariables([
      {
        id: "legacy_1",
        name: "count",
        type: "number",
        defaultValue: "3",
        description: "",
        isSecret: false,
      },
      {
        id: "legacy_2",
        name: "label",
        type: "string",
        defaultValue: "production",
        description: "",
        isSecret: false,
      },
    ])).toEqual({ count: 3, label: "production" });
  });

  it("loads and decrypts persisted variables for execution", async () => {
    const encrypted = prepareWorkflowVariableForStorage({
      name: "secret_token",
      value: "token-value",
      type: "SECRET",
      isSecret: true,
    });
    mockPrisma.workflowVariable.findMany.mockResolvedValue([
      {
        id: "var_1",
        agentTeamId: "team_1",
        name: "secret_token",
        value: encrypted.value,
        type: "SECRET",
        isSecret: true,
        createdAt: new Date("2026-05-06T09:00:00Z"),
        updatedAt: new Date("2026-05-06T09:00:00Z"),
      },
      {
        id: "var_2",
        agentTeamId: "team_1",
        name: "limit",
        value: "10",
        type: "NUMBER",
        isSecret: false,
        createdAt: new Date("2026-05-06T09:01:00Z"),
        updatedAt: new Date("2026-05-06T09:01:00Z"),
      },
    ]);

    await expect(loadWorkflowVariablesForExecution("team_1")).resolves.toEqual({
      secret_token: "token-value",
      limit: 10,
    });
  });
});
