/**
 * Sprint 19.7.4.1 — /api/orgs/hierarchy route.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetHierarchy = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));
vi.mock("@/lib/org/get-user-org-hierarchy", () => ({
  getUserOrgHierarchy: mockGetHierarchy,
}));

import { GET as hierarchyGET } from "@/app/api/orgs/hierarchy/route";

beforeEach(() => {
  mockAuth.mockReset();
  mockGetHierarchy.mockReset();
});

describe("GET /api/orgs/hierarchy", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await hierarchyGET();
    expect(res.status).toBe(401);
    expect(mockGetHierarchy).not.toHaveBeenCalled();
  });

  it("returns the hierarchy with Cache-Control set", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockGetHierarchy.mockResolvedValueOnce({
      personal: { clerkOrgId: "p", name: "P", imageUrl: null },
      agencies: [],
      standaloneOrgs: [],
    });
    const res = await hierarchyGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
    const body = await res.json();
    expect(body.personal.clerkOrgId).toBe("p");
  });
});
