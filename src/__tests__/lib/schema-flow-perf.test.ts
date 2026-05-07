import { describe, expect, it, beforeEach } from "vitest";
import {
  getCachedSchemaFlow,
  __resetSchemaFlowCacheForTests,
} from "@/lib/schema-flow-cache";

/**
 * The cache's primary value isn't raw speed (the underlying
 * computation is cheap). It's stable object references, so React's
 * referential equality optimisations (React.memo, useMemo) can skip
 * downstream re-renders when the same logical edge gets recomputed.
 *
 * This test pins that contract: the cache returns the SAME object for
 * repeat lookups, not a structurally-equal-but-fresh one.
 */
describe("schema-flow-cache referential equality", () => {
  beforeEach(() => {
    __resetSchemaFlowCacheForTests();
  });

  it("returns identical references across many repeat lookups", () => {
    const first = getCachedSchemaFlow("http_request", "agent", 0);
    const refs: unknown[] = [];
    for (let i = 0; i < 1000; i++) {
      refs.push(getCachedSchemaFlow("http_request", "agent", 0));
    }
    expect(refs.every((r) => r === first)).toBe(true);
  });

  it("returns different references for different keys", () => {
    const a = getCachedSchemaFlow("http_request", "agent", 0);
    const b = getCachedSchemaFlow("http_request", "agent", 1);
    const c = getCachedSchemaFlow("http_request", "send_email", 0);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });
});
