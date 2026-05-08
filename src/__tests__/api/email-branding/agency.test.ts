import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  orgBranding: { findUnique: vi.fn(), upsert: vi.fn() },
}));
const authMock = vi.hoisted(() => vi.fn());
const canManageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/agency/permissions", () => ({
  canManageSubOrgs: canManageMock,
}));

import { GET, PATCH } from "@/app/api/email-branding/agency/route";

describe("PATCH /api/email-branding/agency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_x" });
    canManageMock.mockResolvedValue(true);
    mockPrisma.orgBranding.upsert.mockResolvedValue({
      emailFromAddress: null,
      emailFromName: null,
      emailReplyTo: null,
      emailFooterHtml: null,
      emailSupportLink: null,
    });
  });

  it("rejects when not authenticated (401)", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/agency", {
        method: "PATCH",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-agency-tier callers with 403", async () => {
    canManageMock.mockResolvedValue(false);
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/agency", {
        method: "PATCH",
        body: JSON.stringify({ emailFromName: "Acme" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects invalid From-address with 400", async () => {
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/agency", {
        method: "PATCH",
        body: JSON.stringify({ emailFromAddress: "not-an-email" }),
      })
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.orgBranding.upsert).not.toHaveBeenCalled();
  });

  it("rejects non-https support link with 400", async () => {
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/agency", {
        method: "PATCH",
        body: JSON.stringify({ emailSupportLink: "http://insecure.com" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("upserts valid agency-level fields", async () => {
    mockPrisma.orgBranding.upsert.mockResolvedValue({
      emailFromAddress: "x@y.com",
      emailFromName: "Acme",
      emailReplyTo: null,
      emailFooterHtml: null,
      emailSupportLink: null,
    });
    const res = await PATCH(
      new Request("https://x.test/api/email-branding/agency", {
        method: "PATCH",
        body: JSON.stringify({
          emailFromAddress: "x@y.com",
          emailFromName: "Acme",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.orgBranding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org_x" },
        update: expect.objectContaining({
          emailFromAddress: "x@y.com",
          emailFromName: "Acme",
        }),
      })
    );
  });
});

describe("GET /api/email-branding/agency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_x" });
  });

  it("returns nulls when no row exists", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(body.emailFromAddress).toBeNull();
  });
});
