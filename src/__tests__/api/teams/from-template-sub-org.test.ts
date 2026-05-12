/**
 * Sprint 19.7.5 — /api/teams/from-template threads subOrgId through
 * resolveCreateTargetOrgId and into deployTeamTemplate's targetOrgId.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockDeploy = vi.hoisted(() => vi.fn());
const mockGetTemplate = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/team-templates", () => ({
  deployTeamTemplate: mockDeploy,
  getTeamTemplate: mockGetTemplate,
}));
vi.mock("@/lib/sub-org/resolve-create-target", () => ({
  resolveCreateTargetOrgId: mockResolve,
}));

import { POST as fromTemplatePOST } from "@/app/api/teams/from-template/route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/teams/from-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof fromTemplatePOST>[0];
}

beforeEach(() => {
  mockAuth.mockReset();
  mockDeploy.mockReset();
  mockGetTemplate.mockReset();
  mockResolve.mockReset();
});

describe("POST /api/teams/from-template — sub-org scope", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await fromTemplatePOST(postReq({ templateId: "sales-pipeline" }));
    expect(res.status).toBe(401);
  });

  it("400 when templateId is missing", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    const res = await fromTemplatePOST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("404 when templateId is unknown", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockGetTemplate.mockReturnValueOnce(undefined);
    const res = await fromTemplatePOST(postReq({ templateId: "made-up" }));
    expect(res.status).toBe(404);
  });

  it("forwards resolveCreateTargetOrgId failures (sub-org 403)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockGetTemplate.mockReturnValueOnce({ id: "sales-pipeline" });
    mockResolve.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Missing permission: workflows.write",
    });
    const res = await fromTemplatePOST(
      postReq({ templateId: "sales-pipeline", subOrgId: "sub_1" }),
    );
    expect(res.status).toBe(403);
    expect(mockDeploy).not.toHaveBeenCalled();
  });

  it("passes resolved sub-org orgId into deployTeamTemplate", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockGetTemplate.mockReturnValueOnce({ id: "sales-pipeline" });
    mockResolve.mockResolvedValueOnce({
      ok: true,
      orgId: "org_clerk_sub",
      usedSubOrg: { subOrgId: "sub_1", clerkOrgId: "org_clerk_sub" },
    });
    mockDeploy.mockResolvedValueOnce({
      templateId: "sales-pipeline",
      teamId: "team_1",
      teamName: "Sales",
      detailUrl: "/dashboard/teams/team_1",
      agentIds: ["a1"],
    });

    const res = await fromTemplatePOST(
      postReq({ templateId: "sales-pipeline", subOrgId: "sub_1" }),
    );
    expect(res.status).toBe(201);
    expect(mockDeploy.mock.calls[0][3]).toBe("org_clerk_sub");
    const body = await res.json();
    expect(body.subOrgId).toBe("sub_1");
  });

  it("falls back to the agency Clerk org when subOrgId is absent", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockGetTemplate.mockReturnValueOnce({ id: "sales-pipeline" });
    mockResolve.mockResolvedValueOnce({
      ok: true,
      orgId: "org_agency",
      usedSubOrg: null,
    });
    mockDeploy.mockResolvedValueOnce({
      templateId: "sales-pipeline",
      teamId: "team_1",
      teamName: "Sales",
      detailUrl: "/dashboard/teams/team_1",
      agentIds: ["a1"],
    });

    const res = await fromTemplatePOST(postReq({ templateId: "sales-pipeline" }));
    expect(res.status).toBe(201);
    expect(mockDeploy.mock.calls[0][3]).toBe("org_agency");
    const body = await res.json();
    expect(body.subOrgId).toBeNull();
  });
});
