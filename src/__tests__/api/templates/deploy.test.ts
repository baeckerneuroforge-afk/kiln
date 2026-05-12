/**
 * Sprint 19.7.5 — /api/templates/{agents|workflows}/[id]/deploy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireContext = vi.hoisted(() => vi.fn());
const mockInstall = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agentTemplate: { findFirst: vi.fn() },
  workflowTemplate: { findFirst: vi.fn() },
  orgRelationship: { findMany: vi.fn() },
}));

vi.mock("@/lib/templates/api-utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, requireTemplateRouteContext: mockRequireContext };
});
vi.mock("@/lib/templates/service", () => ({
  installSelectedTemplatesForSubOrg: mockInstall,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST as agentDeployPOST } from "@/app/api/templates/agents/[id]/deploy/route";
import { POST as workflowDeployPOST } from "@/app/api/templates/workflows/[id]/deploy/route";

function postReq(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockRequireContext.mockReset();
  mockInstall.mockReset();
  mockPrisma.agentTemplate.findFirst.mockReset();
  mockPrisma.workflowTemplate.findFirst.mockReset();
  mockPrisma.orgRelationship.findMany.mockReset();
});

describe("POST /api/templates/agents/[id]/deploy", () => {
  it("400 when subOrgIds is missing or empty", async () => {
    mockRequireContext.mockResolvedValueOnce({ userId: "u1", orgId: "org_agency" });
    const res = await agentDeployPOST(postReq({}), ctx("t1"));
    expect(res.status).toBe(400);
  });

  it("404 when the template is not owned by the agency", async () => {
    mockRequireContext.mockResolvedValueOnce({ userId: "u1", orgId: "org_agency" });
    mockPrisma.agentTemplate.findFirst.mockResolvedValueOnce(null);
    const res = await agentDeployPOST(postReq({ subOrgIds: ["sub_1"] }), ctx("t1"));
    expect(res.status).toBe(404);
  });

  it("404 when some sub-orgs don't belong to the agency", async () => {
    mockRequireContext.mockResolvedValueOnce({ userId: "u1", orgId: "org_agency" });
    mockPrisma.agentTemplate.findFirst.mockResolvedValueOnce({ id: "t1" });
    // Two requested, only one returned → cross-agency or inactive.
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      { id: "sub_1", childOrgId: "child_1", subOrgName: "Acme" },
    ]);
    const res = await agentDeployPOST(
      postReq({ subOrgIds: ["sub_1", "sub_x"] }),
      ctx("t1"),
    );
    expect(res.status).toBe(404);
    expect(mockInstall).not.toHaveBeenCalled();
  });

  it("calls installSelectedTemplatesForSubOrg once per sub-org and returns a summary", async () => {
    mockRequireContext.mockResolvedValueOnce({ userId: "u1", orgId: "org_agency" });
    mockPrisma.agentTemplate.findFirst.mockResolvedValueOnce({ id: "t1" });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      { id: "sub_1", childOrgId: "child_1", subOrgName: "Acme" },
      { id: "sub_2", childOrgId: "child_2", subOrgName: "Beta" },
    ]);
    mockInstall
      .mockResolvedValueOnce({ createdInstances: 1, reusedInstances: 0, agentInstanceIds: ["a1"], workflowInstanceIds: [] })
      .mockResolvedValueOnce({ createdInstances: 0, reusedInstances: 1, agentInstanceIds: ["a2"], workflowInstanceIds: [] });

    const res = await agentDeployPOST(
      postReq({ subOrgIds: ["sub_1", "sub_2"] }),
      ctx("t1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deployedTo).toBe(2);
    expect(body.created).toBe(1);
    expect(body.reused).toBe(1);
    expect(mockInstall).toHaveBeenCalledTimes(2);

    // Templates land in the SUB-ORG's clerk org id, not the agency.
    expect(mockInstall.mock.calls[0][0].subOrgId).toBe("child_1");
    expect(mockInstall.mock.calls[0][0].agentTemplateIds).toEqual(["t1"]);
  });
});

describe("POST /api/templates/workflows/[id]/deploy", () => {
  it("404 when the template is not owned by the agency", async () => {
    mockRequireContext.mockResolvedValueOnce({ userId: "u1", orgId: "org_agency" });
    mockPrisma.workflowTemplate.findFirst.mockResolvedValueOnce(null);
    const res = await workflowDeployPOST(postReq({ subOrgIds: ["sub_1"] }), ctx("w1"));
    expect(res.status).toBe(404);
  });

  it("calls installSelectedTemplatesForSubOrg with workflowTemplateIds", async () => {
    mockRequireContext.mockResolvedValueOnce({ userId: "u1", orgId: "org_agency" });
    mockPrisma.workflowTemplate.findFirst.mockResolvedValueOnce({ id: "w1" });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      { id: "sub_1", childOrgId: "child_1", subOrgName: "Acme" },
    ]);
    mockInstall.mockResolvedValueOnce({ createdInstances: 1, reusedInstances: 0, agentInstanceIds: [], workflowInstanceIds: ["t1"] });

    const res = await workflowDeployPOST(
      postReq({ subOrgIds: ["sub_1"] }),
      ctx("w1"),
    );
    expect(res.status).toBe(200);
    expect(mockInstall.mock.calls[0][0].workflowTemplateIds).toEqual(["w1"]);
    expect(mockInstall.mock.calls[0][0].agentTemplateIds).toEqual([]);
  });
});
