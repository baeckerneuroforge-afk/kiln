import { describe, expect, it } from "vitest";
import {
  SCHEMA_TEMPLATES,
  getSchemaTemplate,
} from "@/lib/agents/schema-templates";
import {
  validateAgentInput,
  validateAgentOutput,
  validateSchema,
} from "@/lib/agents/io-schema-validator";

describe("schema templates", () => {
  it("provides exactly 3 templates", () => {
    expect(SCHEMA_TEMPLATES).toHaveLength(3);
    const ids = SCHEMA_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(["lead_enrichment", "document_auditor", "data_extractor"])
    );
  });

  it("every template ships structurally valid input + output schemas", () => {
    for (const tpl of SCHEMA_TEMPLATES) {
      const inp = validateSchema(tpl.inputSchema);
      const out = validateSchema(tpl.outputSchema);
      expect(inp).toEqual({ valid: true });
      expect(out).toEqual({ valid: true });
    }
  });

  it("getSchemaTemplate returns by id", () => {
    expect(getSchemaTemplate("lead_enrichment")?.name).toBe("Lead Enrichment");
    expect(getSchemaTemplate("nope")).toBeUndefined();
  });

  it("lead_enrichment input accepts a valid email", () => {
    const tpl = getSchemaTemplate("lead_enrichment")!;
    expect(
      validateAgentInput({ inputSchema: tpl.inputSchema }, { email: "a@b.com" })
        .valid
    ).toBe(true);
    expect(
      validateAgentInput({ inputSchema: tpl.inputSchema }, { email: "bad" }).valid
    ).toBe(false);
  });

  it("document_auditor output requires score 0..1", () => {
    const tpl = getSchemaTemplate("document_auditor")!;
    expect(
      validateAgentOutput(
        { outputSchema: tpl.outputSchema },
        { score: 0.7, issues: [] }
      ).valid
    ).toBe(true);
    expect(
      validateAgentOutput(
        { outputSchema: tpl.outputSchema },
        { score: 2, issues: [] }
      ).valid
    ).toBe(false);
  });
});
