import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findUnique: vi.fn(), update: vi.fn() },
}));
const requireSubOrgAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/agency/sub-org-auth", () => ({
  requireSubOrgAccess: requireSubOrgAccessMock,
}));

import { PATCH } from "@/app/api/email-branding/sub-org/[id]/route";

describe("PATCH /api/email-branding/sub-org/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSubOrgAccessMock.mockResolvedValue({
      ok: true,
      relationship: { id: "rel_1", parentOrgId: "agency_x" },
      userId: "user_1",
      agencyOrgId: "agency_x",
    });
    mockPrisma.orgRelationship.findUnique.mockResolvedValue({
      emailBrandOverride: null,
    });
    mockPrisma.orgRelationship.update.mockResolvedValue({
      emailBrandOverride: { brandName: "Customer X" },
    });
  });

  it("rejects unauthorized callers with the auth helper's response", async () => {
    requireSubOrgAccessMock.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Sub-org not found" }, { status: 404 }),
    });
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/sub-org/x", {
        method: "PATCH",
        body: JSON.stringify({ brandName: "X" }),
      }),
      { params: { id: "x" } }
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.orgRelationship.update).not.toHaveBeenCalled();
  });

  it("clears the override when enabled=false", async () => {
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/sub-org/rel_1", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
      { params: { id: "rel_1" } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(mockPrisma.orgRelationship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailBrandOverride: expect.anything(),
        }),
      })
    );
  });

  it("rejects invalid brandColor with 400", async () => {
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/sub-org/rel_1", {
        method: "PATCH",
        body: JSON.stringify({ brandColor: "not-a-hex" }),
      }),
      { params: { id: "rel_1" } }
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.orgRelationship.update).not.toHaveBeenCalled();
  });

  it("merges valid fields into existing override", async () => {
    mockPrisma.orgRelationship.findUnique.mockResolvedValue({
      emailBrandOverride: { brandName: "Old", brandColor: "#000000" },
    });
    mockPrisma.orgRelationship.update.mockResolvedValue({
      emailBrandOverride: {
        brandName: "Old",
        brandColor: "#000000",
        fromAddress: "x@y.com",
      },
    });
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/sub-org/rel_1", {
        method: "PATCH",
        body: JSON.stringify({ fromAddress: "x@y.com" }),
      }),
      { params: { id: "rel_1" } }
    );
    expect(res.status).toBe(200);
    const updateCall = mockPrisma.orgRelationship.update.mock.calls[0][0];
    expect(updateCall.data.emailBrandOverride).toMatchObject({
      brandName: "Old",
      brandColor: "#000000",
      fromAddress: "x@y.com",
    });
  });
});
