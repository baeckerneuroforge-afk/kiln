import { beforeEach, describe, expect, it, vi } from "vitest";

const getKnowledgeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/departments/rag/department-rag", () => ({
  getRelevantKnowledgeForDepartment: getKnowledgeMock,
}));

import {
  buildWorkerContext,
  formatKnowledgeContext,
  isKnowledgeBaseRole,
} from "@/lib/departments/rag/worker-context-builder";

describe("worker-context-builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identifies L1_SUPPORT and L2_SUPPORT as KB-aware roles", () => {
    expect(isKnowledgeBaseRole("L1_SUPPORT")).toBe(true);
    expect(isKnowledgeBaseRole("L2_SUPPORT")).toBe(true);
    expect(isKnowledgeBaseRole("TRIAGE")).toBe(false);
    expect(isKnowledgeBaseRole("ESCALATOR")).toBe(false);
  });

  it("returns base prompt unchanged for non-KB roles", async () => {
    const result = await buildWorkerContext({
      departmentId: "dept_1",
      workerRole: "TRIAGE",
      fallbackAgentId: "agent_1",
      ticketContent: "I need help",
      orgId: "org_1",
      userId: "user_1",
      baseSystemPrompt: "You are a triage worker",
    });

    expect(result.systemPrompt).toBe("You are a triage worker");
    expect(result.knowledgeSources).toEqual([]);
    expect(result.used).toBe(false);
    expect(getKnowledgeMock).not.toHaveBeenCalled();
  });

  it("augments L1_SUPPORT system prompt with KB content", async () => {
    getKnowledgeMock.mockResolvedValue([
      {
        knowledgeBaseId: "kb_1",
        sourceName: "FAQ",
        content: "Reset password by clicking 'Forgot Password' on login.",
        similarity: 0.85,
      },
    ]);

    const result = await buildWorkerContext({
      departmentId: "dept_1",
      workerRole: "L1_SUPPORT",
      fallbackAgentId: "agent_1",
      ticketContent: "How do I reset my password?",
      orgId: "org_1",
      userId: "user_1",
      baseSystemPrompt: "You are an L1 support worker",
    });

    expect(result.systemPrompt).toContain("L1 support worker");
    expect(result.systemPrompt).toContain("Reset password by clicking");
    expect(result.systemPrompt).toContain("[Entry 1: FAQ]");
    expect(result.knowledgeSources).toHaveLength(1);
    expect(result.used).toBe(true);
  });

  it("augments L2_SUPPORT system prompt with multiple KB entries", async () => {
    getKnowledgeMock.mockResolvedValue([
      {
        knowledgeBaseId: "kb_1",
        sourceName: "Tech Notes",
        content: "Use diagnostic mode.",
        similarity: 0.9,
      },
      {
        knowledgeBaseId: "kb_2",
        sourceName: "Runbook",
        content: "Restart the gateway.",
        similarity: 0.78,
      },
    ]);

    const result = await buildWorkerContext({
      departmentId: "dept_1",
      workerRole: "L2_SUPPORT",
      fallbackAgentId: "agent_1",
      ticketContent: "API requests are timing out",
      orgId: "org_1",
      userId: "user_1",
      baseSystemPrompt: "You are an L2 support worker",
    });

    expect(result.knowledgeSources).toHaveLength(2);
    expect(result.systemPrompt).toContain("[Entry 1: Tech Notes]");
    expect(result.systemPrompt).toContain("[Entry 2: Runbook]");
  });

  it("returns base prompt with empty sources when KB empty", async () => {
    getKnowledgeMock.mockResolvedValue([]);

    const result = await buildWorkerContext({
      departmentId: "dept_1",
      workerRole: "L1_SUPPORT",
      fallbackAgentId: "agent_1",
      ticketContent: "Random query",
      orgId: "org_1",
      userId: "user_1",
      baseSystemPrompt: "You are an L1 worker",
    });

    expect(result.systemPrompt).toBe("You are an L1 worker");
    expect(result.knowledgeSources).toEqual([]);
    expect(result.used).toBe(true);
  });

  it("survives KB query failure and returns base prompt", async () => {
    getKnowledgeMock.mockRejectedValue(new Error("supabase down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await buildWorkerContext({
      departmentId: "dept_1",
      workerRole: "L1_SUPPORT",
      fallbackAgentId: "agent_1",
      ticketContent: "Help!",
      orgId: "org_1",
      userId: "user_1",
      baseSystemPrompt: "You are an L1 worker",
    });

    expect(result.systemPrompt).toBe("You are an L1 worker");
    expect(result.knowledgeSources).toEqual([]);
    expect(result.used).toBe(false);
    consoleSpy.mockRestore();
  });

  it("formats knowledge context with numbered entries and source names", () => {
    const formatted = formatKnowledgeContext([
      {
        knowledgeBaseId: "kb_1",
        sourceName: "FAQ",
        content: "Password reset works via email link.",
        similarity: 0.8,
      },
    ]);
    expect(formatted).toContain("Based on the following knowledge base entries:");
    expect(formatted).toContain("[Entry 1: FAQ]");
    expect(formatted).toContain("Password reset works via email link.");
  });
});
