import { describe, expect, it } from "vitest";
import { z } from "zod";

import { validateOutput } from "@/lib/llm/validation/schema-validator";
import { buildValidationRetryMessages, LlmValidationError } from "@/lib/llm/validation/retry-logic";

const schema = z.object({
  answer: z.string(),
  score: z.number().int().min(0),
});

describe("llm schema validation", () => {
  it("passes valid JSON output", async () => {
    const result = await validateOutput('{"answer":"ok","score":3}', schema);
    expect(result).toEqual({ success: true, data: { answer: "ok", score: 3 } });
  });

  it("extracts JSON from fenced blocks", async () => {
    const result = await validateOutput("```json\n{\"answer\":\"ok\",\"score\":1}\n```", schema);
    expect(result.success).toBe(true);
  });

  it("extracts the first JSON object from surrounding prose", async () => {
    const result = await validateOutput("Here is the result: {\"answer\":\"done\",\"score\":7}.", schema);
    expect(result).toEqual({ success: true, data: { answer: "done", score: 7 } });
  });

  it("supports JSON array schemas", async () => {
    const result = await validateOutput("[1,2,3]", z.array(z.number()));
    expect(result).toEqual({ success: true, data: [1, 2, 3] });
  });

  it("rejects invalid JSON with a structured error", async () => {
    const result = await validateOutput("not-json", schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Output is not valid JSON");
    }
  });

  it("rejects schema mismatches with path details", async () => {
    const result = await validateOutput('{"answer":42,"score":-1}', schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("answer");
      expect(result.error).toContain("score");
    }
  });

  it("adds validation feedback to retry messages", () => {
    const messages = buildValidationRetryMessages(
      [{ role: "user", content: "Return strict JSON." }],
      '{"answer":42}',
      "answer: Expected string",
    );

    expect(messages.at(-2)).toEqual({ role: "assistant", content: '{"answer":42}' });
    expect(messages.at(-1)?.content).toContain("Validation failed.");
    expect(messages.at(-1)?.content).toContain("Error: answer: Expected string");
  });

  it("stores retry attempt count in validation errors", () => {
    const error = new LlmValidationError("failed", 3);
    expect(error.name).toBe("LlmValidationError");
    expect(error.attempts).toBe(3);
  });
});
