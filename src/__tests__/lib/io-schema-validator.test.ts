import { describe, expect, it } from "vitest";
import {
  validateAgentInput,
  validateAgentOutput,
  validateSchema,
} from "@/lib/agents/io-schema-validator";

describe("io-schema-validator", () => {
  describe("validateSchema", () => {
    it("accepts null/undefined as valid (no schema)", () => {
      expect(validateSchema(null)).toEqual({ valid: true });
      expect(validateSchema(undefined)).toEqual({ valid: true });
    });

    it("accepts a structurally valid JSON Schema", () => {
      const schema = {
        type: "object",
        properties: { email: { type: "string", format: "email" } },
        required: ["email"],
      };
      expect(validateSchema(schema)).toEqual({ valid: true });
    });

    it("rejects non-object schemas", () => {
      expect(validateSchema("not a schema").valid).toBe(false);
      expect(validateSchema(42).valid).toBe(false);
      expect(validateSchema([]).valid).toBe(false);
    });

    it("rejects structurally broken schemas", () => {
      const broken = { type: "object", required: "not-an-array" };
      const result = validateSchema(broken);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });

  describe("validateAgentInput", () => {
    it("passes through when agent has no inputSchema", () => {
      const result = validateAgentInput({}, { anything: "goes" });
      expect(result.valid).toBe(true);
    });

    it("validates against the agent inputSchema", () => {
      const agent = {
        inputSchema: {
          type: "object",
          properties: { email: { type: "string", format: "email" } },
          required: ["email"],
        },
      };
      expect(validateAgentInput(agent, { email: "a@b.com" }).valid).toBe(true);
      const bad = validateAgentInput(agent, { email: "not-an-email" });
      expect(bad.valid).toBe(false);
      expect(bad.errors?.[0]).toMatch(/email/);
    });

    it("reports missing required fields", () => {
      const agent = {
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      };
      const result = validateAgentInput(agent, {});
      expect(result.valid).toBe(false);
      expect(result.errors?.join(" ")).toMatch(/name/);
    });
  });

  describe("validateAgentOutput", () => {
    it("passes through when agent has no outputSchema", () => {
      const result = validateAgentOutput({}, { anything: 1 });
      expect(result.valid).toBe(true);
    });

    it("validates against the agent outputSchema", () => {
      const agent = {
        outputSchema: {
          type: "object",
          properties: { score: { type: "number", minimum: 0, maximum: 1 } },
          required: ["score"],
        },
      };
      expect(validateAgentOutput(agent, { score: 0.7 }).valid).toBe(true);
      expect(validateAgentOutput(agent, { score: 2 }).valid).toBe(false);
      expect(validateAgentOutput(agent, {}).valid).toBe(false);
    });
  });
});
