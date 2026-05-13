/**
 * Sprint 19.7.6 — GET /api/agency/role.
 *
 * Verifies the role+permissions surface that the sidebar consumes,
 * including the auto-bootstrap of OWNER for Clerk org-admins.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    agencyMembership: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  },
}));

import { GET } from "@/app/api/agency/role/route";

beforeEach(() => {
  mockAuth.mockReset();
  mockFindUnique.mockReset();
  mockCreate.mockReset();
});

describe("GET /api/agency/role", () => {
  it("returns null role when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null, orgRole: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { role: string | null; permissions: string[] };
    expect(data.role).toBeNull();
    expect(data.permissions).toEqual([]);
  });

  it("returns null role when no active org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: null, orgRole: "org:admin" });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { role: string | null };
    expect(data.role).toBeNull();
  });

  it("returns role + permissions from existing AgencyMembership", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user_1",
      orgId: "org_a",
      orgRole: "org:member",
    });
    mockFindUnique.mockResolvedValueOnce({
      id: "am_1",
      agencyClerkOrgId: "org_a",
      userId: "user_1",
      role: "CONSULTANT",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { role: string; permissions: string[] };
    expect(data.role).toBe("CONSULTANT");
    expect(data.permissions).toContain("sub-orgs.read");
    expect(data.permissions).not.toContain("all-sub-orgs.access");
  });

  it("bootstraps OWNER row for Clerk org-admin with no AgencyMembership", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user_owner",
      orgId: "org_a",
      orgRole: "org:admin",
    });
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
      id: "am_new",
      agencyClerkOrgId: "org_a",
      userId: "user_owner",
      role: "OWNER",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { role: string; permissions: string[] };
    expect(data.role).toBe("OWNER");
    expect(data.permissions).toContain("billing.manage");
    expect(mockCreate).toHaveBeenCalled();
  });

  it("does not bootstrap for Clerk org-member with no AgencyMembership", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user_unrelated",
      orgId: "org_a",
      orgRole: "org:member",
    });
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { role: string | null };
    expect(data.role).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
