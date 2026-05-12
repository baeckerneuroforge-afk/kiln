/**
 * Sprint 19.7.4 — /api/agents POST honours sub-org-scoped creates.
 *
 * Verifies the integration of resolveCreateTargetOrgId into the agents
 * POST handler; the resolver itself is tested separately.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireOrgId = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());
const mockCanCreate = vi.hoisted(() => vi.fn());
const mockUserEmail = vi.hoisted(() => vi.fn());
const mockValidateSchema = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agent: { create: vi.fn(), findUnique: vi.fn() },
  user: { upsert: vi.fn() },
}));

vi.mock("@/lib/auth/org-context", () => ({
  OrgContextError: class extends Error {},
  requireOrgId: mockRequireOrgId,
}));
vi.mock("@/lib/auth/org-scope", () => ({ orgScopeFilter: vi.fn() }));
vi.mock("@/lib/sub-org/resolve-create-target", () => ({
  resolveCreateTargetOrgId: mockResolve,
}));
vi.mock("@/lib/plan-limits", () => ({ canCreateAgent: mockCanCreate }));
vi.mock("@/lib/clerk-user-email", () => ({ getUserEmailOrPlaceholder: mockUserEmail }));
vi.mock("@/lib/agents/io-schema-validator", () => ({ validateSchema: mockValidateSchema }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST as agentsPOST } from "@/app/api/agents/route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof agentsPOST>[0];
}

beforeEach(() => {
  mockRequireOrgId.mockReset();
  mockResolve.mockReset();
  mockCanCreate.mockReset();
  mockUserEmail.mockReset();
  mockValidateSchema.mockReset();
  mockPrisma.agent.create.mockReset();
  mockPrisma.agent.findUnique.mockReset();
  mockPrisma.user.upsert.mockReset();
});

describe("POST /api/agents — sub-org scope", () => {
  it("calls resolveCreateTargetOrgId with the body subOrgId and uses returned orgId", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockResolve.mockResolvedValueOnce({ ok: true, orgId: "org_clerk_sub", usedSubOrg: { subOrgId: "sub_1", clerkOrgId: "org_clerk_sub" } });
    mockCanCreate.mockResolvedValueOnce({ allowed: true });
    mockUserEmail.mockResolvedValueOnce("a@b.c");
    mockPrisma.user.upsert.mockResolvedValueOnce({});
    mockPrisma.agent.findUnique.mockResolvedValueOnce(null);
    mockPrisma.agent.create.mockResolvedValueOnce({ id: "agent_new" });

    const res = await agentsPOST(
      postReq({
        name: "Bot",
        slug: "bot",
        systemPrompt: "You are…",
        mode: "CHAT",
        subOrgId: "sub_1",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        subOrgId: "sub_1",
        requiredPermission: "agents.write",
        defaultOrgId: "org_agency",
        userId: "user_1",
      }),
    );
    expect(mockPrisma.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org_clerk_sub" }),
      }),
    );
  });

  it("falls back to the agency orgId when subOrgId is absent", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockResolve.mockResolvedValueOnce({ ok: true, orgId: "org_agency", usedSubOrg: null });
    mockCanCreate.mockResolvedValueOnce({ allowed: true });
    mockUserEmail.mockResolvedValueOnce("a@b.c");
    mockPrisma.user.upsert.mockResolvedValueOnce({});
    mockPrisma.agent.findUnique.mockResolvedValueOnce(null);
    mockPrisma.agent.create.mockResolvedValueOnce({ id: "agent_new" });

    await agentsPOST(postReq({ name: "Bot", slug: "bot", systemPrompt: "x" }));
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({ subOrgId: null }),
    );
    expect(mockPrisma.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: "org_agency" }) }),
    );
  });

  it("propagates the resolver's 403/404/401 short-circuits", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockResolve.mockResolvedValueOnce({ ok: false, status: 403, error: "Missing permission: agents.write" });
    const res = await agentsPOST(postReq({ name: "Bot", slug: "bot", systemPrompt: "x", subOrgId: "sub_x" }));
    expect(res.status).toBe(403);
    expect(mockPrisma.agent.create).not.toHaveBeenCalled();
  });
});
