import { describe, expect, it } from "vitest";
import { asJsonRecord, deepMerge, toPrismaJson, truncateError } from "@/lib/departments/json";

describe("department json helpers", () => {
  it("keeps plain objects as records", () => {
    expect(asJsonRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it("converts arrays to empty records", () => {
    expect(asJsonRecord(["a"])).toEqual({});
  });

  it("converts null to empty records", () => {
    expect(asJsonRecord(null)).toEqual({});
  });

  it("deep merges nested objects", () => {
    expect(deepMerge({ a: { b: 1 }, keep: true }, { a: { c: 2 } })).toEqual({
      a: { b: 1, c: 2 },
      keep: true,
    });
  });

  it("replaces arrays during merge", () => {
    expect(deepMerge({ a: [1] }, { a: [2] })).toEqual({ a: [2] });
  });

  it("replaces scalars during merge", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("serializes undefined away for Prisma JSON", () => {
    expect(toPrismaJson({ a: undefined, b: 2 })).toEqual({ b: 2 });
  });

  it("truncates long errors", () => {
    expect(truncateError(new Error("x".repeat(5000)))).toHaveLength(4000);
  });
});
