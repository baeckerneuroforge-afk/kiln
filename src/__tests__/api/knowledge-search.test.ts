import { describe, expect, it, beforeEach, vi } from "vitest";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    knowledgeBase: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/knowledge/search/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(qs: string): Request {
  return new Request(`http://localhost/api/knowledge/search?${qs}`);
}

describe("GET /api/knowledge/search", () => {
  it("returns 401 for unauthenticated callers", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });
    const res = await GET(makeRequest("q=tax"));
    expect(res.status).toBe(401);
  });

  it("returns empty result for queries shorter than 2 chars", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: "org1" });
    const res = await GET(makeRequest("q=a"));
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.q).toBe("a");
    expect(prismaMock.knowledgeBase.findMany).not.toHaveBeenCalled();
  });

  it("hits Prisma with the trimmed query and maps rows to hits", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: "org1" });
    prismaMock.knowledgeBase.findMany.mockResolvedValue([
      {
        id: "kb1",
        type: "PDF",
        sourceName: "Tax Law 2024.pdf",
        content: "Long content about tax law and amendments…",
        createdAt: new Date("2026-04-01T00:00:00Z"),
        agentId: "ag1",
        agent: { id: "ag1", name: "Compliance Bot", slug: "compliance-bot" },
      },
    ]);

    const res = await GET(makeRequest("q=tax"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "kb1",
      type: "PDF",
      sourceName: "Tax Law 2024.pdf",
      agentId: "ag1",
      agentName: "Compliance Bot",
      href: "/dashboard/agents/ag1?tab=knowledge",
    });
    expect(body.items[0].snippet).toContain("tax");
  });

  it("clamps the limit query param within [1, 50]", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: "org1" });
    prismaMock.knowledgeBase.findMany.mockResolvedValue([]);

    await GET(makeRequest("q=foo&limit=999"));
    expect(prismaMock.knowledgeBase.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 50 }),
    );

    await GET(makeRequest("q=foo&limit=0"));
    expect(prismaMock.knowledgeBase.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1 }),
    );

    await GET(makeRequest("q=foo"));
    // Default
    expect(prismaMock.knowledgeBase.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it("scopes the query to the active org via OR filter", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: "org_active" });
    prismaMock.knowledgeBase.findMany.mockResolvedValue([]);
    await GET(makeRequest("q=foo"));

    const where = (prismaMock.knowledgeBase.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    }).where;
    expect(where.OR).toBeDefined();
    expect(where).toHaveProperty("agentId");
  });
});
