import { describe, expect, it, beforeEach } from "vitest";
import {
  getCachedSchemaFlow,
  computeSchemaFlow,
  __resetSchemaFlowCacheForTests,
  __schemaFlowCacheSize,
} from "@/lib/schema-flow-cache";

describe("computeSchemaFlow", () => {
  it("returns no mismatch when source or target type is missing", () => {
    expect(computeSchemaFlow(undefined, "agent", 0)).toEqual({
      schemaMismatch: false,
      dataLabel: undefined,
    });
    expect(computeSchemaFlow("trigger_webhook", undefined, 0)).toEqual({
      schemaMismatch: false,
      dataLabel: undefined,
    });
  });

  it("formats the mapped-fields label when mappings exist", () => {
    expect(computeSchemaFlow("agent", "send_email", 1)).toEqual({
      schemaMismatch: false,
      dataLabel: "1 field mapped",
    });
    expect(computeSchemaFlow("agent", "send_email", 5)).toEqual({
      schemaMismatch: false,
      dataLabel: "5 fields mapped",
    });
  });

  it("flags input-needing targets without mappings or passthrough source", () => {
    expect(computeSchemaFlow("http_request", "agent", 0)).toEqual({
      schemaMismatch: true,
      dataLabel: "no mapping",
    });
  });

  it("does not flag passthrough sources (triggers, delay, merge)", () => {
    expect(computeSchemaFlow("trigger_webhook", "agent", 0).schemaMismatch).toBe(false);
    expect(computeSchemaFlow("trigger_chat", "send_email", 0).schemaMismatch).toBe(false);
    expect(computeSchemaFlow("delay", "send_email", 0).schemaMismatch).toBe(false);
    expect(computeSchemaFlow("merge", "agent", 0).schemaMismatch).toBe(false);
  });

  it("does not flag targets that don't need structured input", () => {
    // delay only consumes time settings, not upstream data
    expect(computeSchemaFlow("agent", "delay", 0).schemaMismatch).toBe(false);
  });
});

describe("getCachedSchemaFlow caching", () => {
  beforeEach(() => {
    __resetSchemaFlowCacheForTests();
  });

  it("returns the same object reference for repeat lookups", () => {
    const a = getCachedSchemaFlow("http_request", "agent", 0);
    const b = getCachedSchemaFlow("http_request", "agent", 0);
    expect(a).toBe(b);
  });

  it("treats undefined sources/targets as their own cache key", () => {
    const a = getCachedSchemaFlow(undefined, "agent", 0);
    const b = getCachedSchemaFlow("trigger_webhook", "agent", 0);
    expect(a).not.toBe(b);
  });

  it("creates separate entries for different mapping counts", () => {
    getCachedSchemaFlow("agent", "send_email", 0);
    getCachedSchemaFlow("agent", "send_email", 1);
    getCachedSchemaFlow("agent", "send_email", 2);
    expect(__schemaFlowCacheSize()).toBe(3);
  });

  it("evicts the oldest entry when cache exceeds the bound", () => {
    // We don't expose MAX_ENTRIES, but the cache size should never grow
    // unbounded — fill with many distinct keys and check it's bounded.
    for (let i = 0; i < 300; i++) {
      getCachedSchemaFlow(`type_${i}`, "agent", 0);
    }
    expect(__schemaFlowCacheSize()).toBeLessThanOrEqual(256);
  });

  it("matches computeSchemaFlow output exactly", () => {
    const direct = computeSchemaFlow("http_request", "agent", 2);
    const cached = getCachedSchemaFlow("http_request", "agent", 2);
    expect(cached).toEqual(direct);
  });
});
