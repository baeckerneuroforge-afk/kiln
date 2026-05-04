import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockCanCreateAgent = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  user: {
    upsert: vi.fn(),
    // requireOrgId() falls back to User.personalOrgId when auth() has no
    // active org. Mocked here so the route consistently resolves a scope.
    findUnique: vi.fn(),
  },
  agent: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/plan-limits", () => ({
  canCreateAgent: mockCanCreateAgent,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { POST } from "@/app/api/agents/route";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/agents", () => {
  beforeEach(() => {
    // Phase 2.2: routes resolve scope via requireOrgId(). Provide an active
    // org directly so the route doesn't need to fall back through
    // user.personalOrgId — keeps the mock surface minimal.
    mockAuth.mockResolvedValue({ userId: "user_123", orgId: "org_123" });
    mockCanCreateAgent.mockResolvedValue({ allowed: true, current: 0, limit: 1 });
    mockPrisma.user.upsert.mockResolvedValue({ id: "user_123" });
    mockPrisma.user.findUnique.mockResolvedValue({ personalOrgId: "org_123" });
    mockPrisma.agent.findUnique.mockResolvedValue(null);
    mockPrisma.agent.create.mockResolvedValue({
      id: "agent_123",
      userId: "user_123",
      orgId: "org_123",
      name: "Support Agent",
      slug: "support-agent",
      systemPrompt: "You are helpful.",
      status: "DRAFT",
    });
  });

  it("returns 201 and the created agent for valid data", async () => {
    const response = await POST(
      makeRequest({
        name: "Support Agent",
        slug: "support-agent",
        systemPrompt: "You are helpful.",
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "agent_123",
      name: "Support Agent",
      slug: "support-agent",
    });
    expect(mockPrisma.agent.create).toHaveBeenCalledOnce();
  });

  it("returns 400 when name is missing", async () => {
    const response = await POST(
      makeRequest({
        slug: "support-agent",
        systemPrompt: "You are helpful.",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Name, slug, and system prompt are required.",
    });
    expect(mockPrisma.agent.create).not.toHaveBeenCalled();
  });
});
