/**
 * Sprint 19.7.2 — /dashboard/sub-org/[subOrgId] layout access control.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

class NotFoundError extends Error {
  constructor() {
    super("__notFound__");
  }
}
class RedirectError extends Error {
  constructor(public destination: string) {
    super(`__redirect__ ${destination}`);
  }
}

const mockAuth = vi.hoisted(() => vi.fn());
const mockMembership = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findUnique: vi.fn() },
}));
const mockHeadersGet = vi.hoisted(() => vi.fn());
const mockCookiesGet = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  redirect: (path: string) => {
    throw new RedirectError(path);
  },
}));
vi.mock("next/headers", () => ({
  headers: () => ({ get: mockHeadersGet }),
  cookies: () => ({ get: mockCookiesGet }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/permissions/sub-org-permissions", () => ({
  getUserSubOrgMembership: mockMembership,
}));

import SubOrgLayout from "@/app/dashboard/sub-org/[subOrgId]/layout";

beforeEach(() => {
  mockAuth.mockReset();
  mockMembership.mockReset();
  mockPrisma.orgRelationship.findUnique.mockReset();
  // Default: no skip cookie, render against the sub-org dashboard path —
  // tests that exercise the onboarding redirect override these.
  mockHeadersGet.mockReset().mockReturnValue("/dashboard/sub-org/sub_1");
  mockCookiesGet.mockReset().mockReturnValue(undefined);
});

async function callLayout(subOrgId: string) {
  try {
    await SubOrgLayout({
      children: React.createElement("div", null, "child"),
      params: { subOrgId },
    });
    return { kind: "ok" as const };
  } catch (err) {
    if (err instanceof NotFoundError) return { kind: "notFound" as const };
    if (err instanceof RedirectError) return { kind: "redirect" as const, dest: err.destination };
    throw err;
  }
}

describe("SubOrgLayout access control", () => {
  it("redirects to sign-in when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const result = await callLayout("sub_1");
    expect(result).toEqual({ kind: "redirect", dest: "/sign-in" });
  });

  it("404s when the user has no membership for the sub-org (existence-hiding)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce(null);
    const result = await callLayout("sub_other_agency");
    expect(result.kind).toBe("notFound");
    expect(mockPrisma.orgRelationship.findUnique).not.toHaveBeenCalled();
  });

  it("404s when the OrgRelationship row no longer exists", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ id: "mem_1" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(null);
    const result = await callLayout("sub_deleted");
    expect(result.kind).toBe("notFound");
  });

  it("renders children when the caller has a valid membership + the sub-org exists", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ id: "mem_1", permissionSet: "READ_ONLY" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({
      id: "sub_1",
      subOrgName: "Acme",
      subOrgStatus: "ACTIVE",
      parentOrgId: "org_agency_1",
    });
    const result = await callLayout("sub_1");
    expect(result.kind).toBe("ok");
  });
});
