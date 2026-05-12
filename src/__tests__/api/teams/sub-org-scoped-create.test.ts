/**
 * Sprint 19.7.4 — /api/teams POST honours sub-org-scoped creates
 * (template-free path).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireOrgId = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());
const mockUserEmail = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  user: { upsert: vi.fn() },
  agentTeam: { create: vi.fn(), findUnique: vi.fn() },
}));

vi.mock("@/lib/auth/org-context", () => ({
  OrgContextError: class extends Error {},
  requireOrgId: mockRequireOrgId,
}));
vi.mock("@/lib/auth/org-scope", () => ({ orgScopeFilter: vi.fn() }));
vi.mock("@/lib/sub-org/resolve-create-target", () => ({
  resolveCreateTargetOrgId: mockResolve,
}));
vi.mock("@/lib/clerk-user-email", () => ({ getUserEmailOrPlaceholder: mockUserEmail }));
vi.mock("@/lib/team-templates", () => ({ deployTeamTemplate: vi.fn() }));
vi.mock("@/lib/team-schedule", () => ({
  describeTeamSchedule: vi.fn(),
  normalizeTeamScheduleConfig: vi.fn(),
}));
vi.mock("@/lib/team-permissions", () => ({ getAccessibleTeamIds: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST as teamsPOST } from "@/app/api/teams/route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof teamsPOST>[0];
}

beforeEach(() => {
  mockRequireOrgId.mockReset();
  mockResolve.mockReset();
  mockUserEmail.mockReset();
  mockPrisma.user.upsert.mockReset();
  mockPrisma.agentTeam.create.mockReset();
  mockPrisma.agentTeam.findUnique.mockReset();
});

describe("POST /api/teams — sub-org scope", () => {
  it("uses sub-org orgId when subOrgId is provided + allowed", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockResolve.mockResolvedValueOnce({ ok: true, orgId: "org_clerk_sub", usedSubOrg: { subOrgId: "sub_1", clerkOrgId: "org_clerk_sub" } });
    mockUserEmail.mockResolvedValueOnce("a@b.c");
    mockPrisma.user.upsert.mockResolvedValueOnce({});
    mockPrisma.agentTeam.create.mockResolvedValueOnce({ id: "team_1" });
    mockPrisma.agentTeam.findUnique.mockResolvedValueOnce({ id: "team_1" });

    const res = await teamsPOST(postReq({ name: "Sales", subOrgId: "sub_1" }));
    expect(res.status).toBe(201);
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        subOrgId: "sub_1",
        requiredPermission: "workflows.write",
      }),
    );
    expect(mockPrisma.agentTeam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: "org_clerk_sub" }) }),
    );
  });

  it("falls back to agency orgId when subOrgId is absent", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockResolve.mockResolvedValueOnce({ ok: true, orgId: "org_agency", usedSubOrg: null });
    mockUserEmail.mockResolvedValueOnce("a@b.c");
    mockPrisma.user.upsert.mockResolvedValueOnce({});
    mockPrisma.agentTeam.create.mockResolvedValueOnce({ id: "team_1" });
    mockPrisma.agentTeam.findUnique.mockResolvedValueOnce({ id: "team_1" });

    await teamsPOST(postReq({ name: "Sales" }));
    expect(mockPrisma.agentTeam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: "org_agency" }) }),
    );
  });

  it("returns the resolver's 403 without calling Prisma", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockResolve.mockResolvedValueOnce({ ok: false, status: 403, error: "Missing permission: workflows.write" });
    const res = await teamsPOST(postReq({ name: "Sales", subOrgId: "sub_x" }));
    expect(res.status).toBe(403);
    expect(mockPrisma.agentTeam.create).not.toHaveBeenCalled();
  });
});
