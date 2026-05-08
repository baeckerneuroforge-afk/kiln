import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  department: { findUnique: vi.fn() },
  knowledgeBase: { findUnique: vi.fn(), findFirst: vi.fn() },
}));
const searchMock = vi.hoisted(() => vi.fn());
const generateEmbeddingMock = vi.hoisted(() => vi.fn());
const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/rag", () => ({
  searchRelevantChunks: searchMock,
  generateEmbedding: generateEmbeddingMock,
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => supabaseMock,
}));

import { getRelevantKnowledgeForDepartment } from "@/lib/departments/rag/department-rag";

describe("getRelevantKnowledgeForDepartment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when department has useKnowledgeBase=false", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      useKnowledgeBase: false,
      knowledgeBaseId: null,
      orgId: "org_1",
      userId: "user_1",
    });

    const result = await getRelevantKnowledgeForDepartment({
      departmentId: "dept_1",
      query: "test",
      fallbackAgentId: "agent_1",
    });

    expect(result).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("falls back to agent KB when knowledgeBaseId is null", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      useKnowledgeBase: true,
      knowledgeBaseId: null,
      orgId: "org_1",
      userId: "user_1",
    });
    mockPrisma.knowledgeBase.findFirst.mockResolvedValue({
      id: "kb_agent_1",
      sourceName: "Agent FAQ",
    });
    searchMock.mockResolvedValue([
      { content: "Reset password steps", similarity: 0.85 },
    ]);

    const result = await getRelevantKnowledgeForDepartment({
      departmentId: "dept_1",
      query: "password reset",
      fallbackAgentId: "agent_1",
      orgId: "org_1",
    });

    expect(searchMock).toHaveBeenCalledWith("agent_1", "password reset", 5, "org_1");
    expect(result).toHaveLength(1);
    expect(result[0].sourceName).toBe("Agent FAQ");
    expect(result[0].content).toContain("Reset password");
  });

  it("uses specific knowledgeBaseId via agent-RPC + filter when set", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      useKnowledgeBase: true,
      knowledgeBaseId: "kb_special",
      orgId: "org_1",
      userId: "user_1",
    });
    mockPrisma.knowledgeBase.findUnique.mockResolvedValue({
      id: "kb_special",
      sourceName: "Special KB",
      orgId: "org_1",
      agentId: "agent_owner",
    });
    generateEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
    const rpcMock = vi.fn().mockResolvedValue({
      data: [
        { knowledge_base_id: "kb_special", content: "password reset link", similarity: 0.92 },
        { knowledge_base_id: "kb_other", content: "different KB chunk", similarity: 0.88 },
      ],
      error: null,
    });
    supabaseMock.rpc = rpcMock;

    const result = await getRelevantKnowledgeForDepartment({
      departmentId: "dept_1",
      query: "password reset",
      fallbackAgentId: "agent_1",
    });

    expect(searchMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("match_knowledge_chunks", expect.objectContaining({
      match_agent_id: "agent_owner",
    }));
    expect(result).toHaveLength(1);
    expect(result[0].knowledgeBaseId).toBe("kb_special");
    expect(result[0].sourceName).toBe("Special KB");
  });

  it("rejects cross-org KB references silently", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      useKnowledgeBase: true,
      knowledgeBaseId: "kb_otherorg",
      orgId: "org_1",
      userId: "user_1",
    });
    mockPrisma.knowledgeBase.findUnique.mockResolvedValue({
      id: "kb_otherorg",
      sourceName: "Other Org KB",
      orgId: "org_2",
    });

    const result = await getRelevantKnowledgeForDepartment({
      departmentId: "dept_1",
      query: "test",
      fallbackAgentId: "agent_1",
      orgId: "org_1",
    });

    expect(result).toEqual([]);
    expect(generateEmbeddingMock).not.toHaveBeenCalled();
  });

  it("returns empty when department not found", async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);
    const result = await getRelevantKnowledgeForDepartment({
      departmentId: "missing",
      query: "test",
      fallbackAgentId: "agent_1",
    });
    expect(result).toEqual([]);
  });
});
