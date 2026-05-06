import { describe, expect, it } from "vitest";
import {
  boundingTopLeft,
  pickInternalEdges,
  shouldConfirmBulkDelete,
  PASTE_OFFSET_PX,
} from "@/lib/canvas-clipboard";

describe("boundingTopLeft", () => {
  it("returns origin for empty group", () => {
    expect(boundingTopLeft([])).toEqual({ x: 0, y: 0 });
  });

  it("picks the smallest x and y across nodes", () => {
    const nodes = [
      { id: "a", position: { x: 100, y: 200 } },
      { id: "b", position: { x: 50, y: 300 } },
      { id: "c", position: { x: 80, y: 150 } },
    ];
    expect(boundingTopLeft(nodes)).toEqual({ x: 50, y: 150 });
  });

  it("handles negative coordinates", () => {
    const nodes = [
      { id: "a", position: { x: -40, y: 10 } },
      { id: "b", position: { x: 5, y: -25 } },
    ];
    expect(boundingTopLeft(nodes)).toEqual({ x: -40, y: -25 });
  });
});

describe("pickInternalEdges", () => {
  it("keeps edges where both endpoints are in the set", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];
    const result = pickInternalEdges(edges, new Set(["a", "b", "c"]));
    expect(result).toHaveLength(2);
  });

  it("drops edges with a target outside the set", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "outside" },
    ];
    const result = pickInternalEdges(edges, new Set(["a", "b"]));
    expect(result).toEqual([{ source: "a", target: "b" }]);
  });

  it("drops edges with a source outside the set", () => {
    const edges = [{ source: "outside", target: "a" }];
    const result = pickInternalEdges(edges, new Set(["a"]));
    expect(result).toEqual([]);
  });

  it("preserves sourceHandle for branching edges", () => {
    const edges = [{ source: "a", target: "b", sourceHandle: "true" }];
    const result = pickInternalEdges(edges, new Set(["a", "b"]));
    expect(result[0].sourceHandle).toBe("true");
  });
});

describe("shouldConfirmBulkDelete", () => {
  it("does not confirm for small selections", () => {
    expect(shouldConfirmBulkDelete(1)).toBe(false);
    expect(shouldConfirmBulkDelete(4)).toBe(false);
  });

  it("confirms at the 5-node threshold", () => {
    expect(shouldConfirmBulkDelete(5)).toBe(true);
    expect(shouldConfirmBulkDelete(20)).toBe(true);
  });
});

describe("PASTE_OFFSET_PX", () => {
  it("uses a positive offset that's visible but not disruptive", () => {
    expect(PASTE_OFFSET_PX).toBeGreaterThan(0);
    expect(PASTE_OFFSET_PX).toBeLessThan(200);
  });
});
