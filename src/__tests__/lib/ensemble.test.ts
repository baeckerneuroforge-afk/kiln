import { describe, expect, it } from "vitest";
import {
  resolveAverageScore,
  resolveBestOf,
  resolveEnsemble,
  resolveMajorityVote,
} from "@/lib/workflow-ensemble";

describe("workflow ensemble resolution", () => {
  it("selects the weighted majority output", () => {
    expect(resolveMajorityVote([
      { agentId: "a", output: "approve", weight: 1 },
      { agentId: "b", output: "Approve", weight: 2 },
      { agentId: "c", output: "reject", weight: 5 },
    ])).toMatchObject({
      output: "reject",
      winningAgentId: "c",
      strategy: "majority_vote",
    });
  });

  it("normalizes whitespace and case for majority buckets", () => {
    const result = resolveMajorityVote([
      { agentId: "a", output: "Need more data" },
      { agentId: "b", output: " need   more DATA " },
      { agentId: "c", output: "Ship it" },
    ]);

    expect(result.output).toBe("Need more data");
    expect(result.scores["need more data"]).toBe(2);
  });

  it("selects the best scored candidate", () => {
    expect(resolveBestOf([
      { agentId: "a", output: "short", score: 0.2 },
      { agentId: "b", output: "better", score: 0.9 },
    ])).toMatchObject({
      output: "better",
      winningAgentId: "b",
      strategy: "best_of",
    });
  });

  it("uses weight and output length as best-of tie breakers", () => {
    expect(resolveBestOf([
      { agentId: "a", output: "short", score: 1, weight: 1 },
      { agentId: "b", output: "longer answer", score: 1, weight: 1 },
      { agentId: "c", output: "weighted", score: 1, weight: 2 },
    ])).toMatchObject({
      output: "weighted",
      winningAgentId: "c",
    });
  });

  it("selects the candidate closest to the weighted average score", () => {
    expect(resolveAverageScore([
      { agentId: "low", output: "low", score: 1 },
      { agentId: "mid", output: "middle", score: 5 },
      { agentId: "high", output: "high", score: 9 },
    ])).toMatchObject({
      output: "middle",
      winningAgentId: "mid",
      strategy: "average_score",
    });
  });

  it("returns an empty average result for no candidates", () => {
    expect(resolveAverageScore([])).toEqual({
      output: "",
      winningAgentId: null,
      scores: {},
      strategy: "average_score",
    });
  });

  it("dispatches by ensemble strategy", () => {
    expect(resolveEnsemble([
      { agentId: "a", output: "A", score: 0.8 },
      { agentId: "b", output: "B", score: 0.1 },
    ], "best_of")).toMatchObject({
      output: "A",
      strategy: "best_of",
    });
  });
});
