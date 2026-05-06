import { describe, expect, it } from "vitest";
import {
  extractSubWorkflowIdsFromConfig,
  extractSubWorkflowIdsFromNodes,
  hasCyclicSubWorkflowDependency,
} from "@/lib/workflow-subworkflows";

describe("sub-workflow graph helpers", () => {
  it("extracts sub-workflow ids from nodes", () => {
    expect(extractSubWorkflowIdsFromNodes([
      { type: "sub_workflow", config: { workflowId: "child-a" } },
      { type: "agent", config: { agentId: "agent-1" } },
      { type: "sub_workflow", config: { workflowId: "child-b" } },
    ])).toEqual(["child-a", "child-b"]);
  });

  it("deduplicates sub-workflow ids", () => {
    expect(extractSubWorkflowIdsFromNodes([
      { type: "sub_workflow", config: { workflowId: "child-a" } },
      { type: "sub_workflow", config: { workflowId: "child-a" } },
    ])).toEqual(["child-a"]);
  });

  it("extracts ids from team workflow config", () => {
    const config = { workflow: { nodes: [{ type: "sub_workflow", config: { workflowId: "sub-1" } }] } };
    expect(extractSubWorkflowIdsFromConfig(config)).toEqual(["sub-1"]);
  });

  it("returns empty ids for malformed config", () => {
    expect(extractSubWorkflowIdsFromConfig({ workflow: { nodes: "bad" } })).toEqual([]);
  });

  it("detects direct cycles", () => {
    expect(hasCyclicSubWorkflowDependency({ a: ["a"] }, "a")).toBe(true);
  });

  it("detects nested cycles", () => {
    expect(hasCyclicSubWorkflowDependency({ a: ["b"], b: ["c"], c: ["a"] }, "a")).toBe(true);
  });

  it("allows acyclic nested graphs", () => {
    expect(hasCyclicSubWorkflowDependency({ a: ["b"], b: ["c"], c: [] }, "a")).toBe(false);
  });
});
