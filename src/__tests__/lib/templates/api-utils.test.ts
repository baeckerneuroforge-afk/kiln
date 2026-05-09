import { describe, expect, it } from "vitest";
import { asBoolean, asJsonObject, asString } from "@/lib/templates/api-utils";

describe("template api utils", () => {
  it("parses trimmed strings", () => {
    expect(asString("  Support  ")).toBe("Support");
  });

  it("rejects blank strings", () => {
    expect(asString("   ")).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(asString(123)).toBeNull();
  });

  it("parses true booleans", () => {
    expect(asBoolean(true)).toBe(true);
  });

  it("parses false booleans", () => {
    expect(asBoolean(false)).toBe(false);
  });

  it("rejects non-booleans", () => {
    expect(asBoolean("true")).toBeNull();
  });

  it("accepts json objects", () => {
    expect(asJsonObject({ name: "Template" })).toEqual({ name: "Template" });
  });

  it("rejects json arrays for config roots", () => {
    expect(asJsonObject([])).toBeNull();
  });

  it("rejects null json objects", () => {
    expect(asJsonObject(null)).toBeNull();
  });
});
