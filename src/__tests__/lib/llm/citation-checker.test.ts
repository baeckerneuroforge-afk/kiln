import { describe, expect, it } from "vitest";

import { checkCitations, validateCitationsIfRequired } from "@/lib/llm/validation/citation-checker";

describe("llm citation checker", () => {
  const chunks = [
    "Kiln reduces support workload by routing requests to department workers and tracking SLA outcomes.",
    "The installation guide says each answer should cite source chunks when citation checking is enabled.",
  ];

  it("passes supported cited claims", async () => {
    const result = await checkCitations(
      "Kiln reduces support workload by routing requests to department workers [1].",
      chunks,
    );
    expect(result.hasCitations).toBe(true);
    expect(result.hallucinations).toEqual([]);
  });

  it("detects missing citations", async () => {
    const result = await checkCitations(
      "Kiln reduces support workload by routing requests to department workers.",
      chunks,
    );
    expect(result.hasCitations).toBe(false);
  });

  it("flags unsupported long claims", async () => {
    const result = await checkCitations(
      "Kiln guarantees seven second refunds for every account in all countries [1].",
      chunks,
    );
    expect(result.hallucinations.length).toBeGreaterThan(0);
  });

  it("returns hallucinations when no knowledge chunks are available", async () => {
    const result = await checkCitations(
      "Kiln provides department workers with precise source-aware answers [1].",
      [],
    );
    expect(result.hasCitations).toBe(false);
    expect(result.hallucinations.length).toBe(1);
  });

  it("skips all checks when citations are not required", async () => {
    const result = await validateCitationsIfRequired({
      output: "Unsupported but citation mode is disabled.",
      requireCitations: false,
      knowledgeBaseChunks: [],
    });
    expect(result).toEqual({ hasCitations: true, hallucinations: [] });
  });

  it("runs citation checks when citations are required", async () => {
    const result = await validateCitationsIfRequired({
      output: "Kiln reduces support workload by routing requests to department workers [1].",
      requireCitations: true,
      knowledgeBaseChunks: chunks,
    });
    expect(result.hasCitations).toBe(true);
    expect(result.hallucinations).toEqual([]);
  });
});
