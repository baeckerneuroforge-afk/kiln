/**
 * Sprint 19.7.2 — auto-redirect logic in /dashboard/page.tsx.
 * Mocks auth + Prisma; asserts which path is redirected to (or that
 * we fall through to the existing dashboard render).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

class RedirectError extends Error {
  constructor(public destination: string) {
    super(`__redirect__ ${destination}`);
  }
}

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  orgRelationship: {
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  subOrgMembership: {
    findFirst: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));
const mockPickView = vi.hoisted(() => vi.fn(() => "onboarding" as const));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new RedirectError(path);
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/components/dashboard/onboarding-view", () => ({
  OnboardingDashboardView: () => null,
}));
vi.mock("@/components/dashboard/operations-view", () => ({
  OperationsDashboardView: () => null,
}));
vi.mock("@/lib/dashboard/view-resolver", () => ({
  daysSince: () => 0,
  pickDashboardView: mockPickView,
}));

import DashboardPage from "@/app/dashboard/page";

beforeEach(() => {
  mockAuth.mockReset();
  mockPrisma.orgRelationship.findUnique.mockReset();
  mockPrisma.orgRelationship.count.mockReset();
  mockPrisma.subOrgMembership.findFirst.mockReset();
  mockPrisma.user.findUnique.mockReset();
});

async function callAndCatchRedirect(): Promise<string | null> {
  try {
    await DashboardPage();
    return null;
  } catch (err) {
    if (err instanceof RedirectError) return err.destination;
    throw err;
  }
}

describe("DashboardPage auto-redirect", () => {
  it("renders normally for unauthenticated callers (no DB calls)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const result = await callAndCatchRedirect();
    expect(result).toBeNull();
    expect(mockPrisma.orgRelationship.findUnique).not.toHaveBeenCalled();
  });

  it("redirects when the active Clerk org is a sub-org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_clerk_subor" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ id: "sub_42" });
    const dest = await callAndCatchRedirect();
    expect(dest).toBe("/dashboard/sub-org/sub_42");
  });

  it("redirects sub-org-only users into their first SubOrgMembership", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_personal" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(null);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.subOrgMembership.findFirst.mockResolvedValueOnce({ subOrgId: "sub_first" });
    const dest = await callAndCatchRedirect();
    expect(dest).toBe("/dashboard/sub-org/sub_first");
  });

  it("does NOT redirect when the active Clerk org owns at least one sub-org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(null);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(2);
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      dashboardPreference: "auto",
      createdAt: new Date(),
    });
    const dest = await callAndCatchRedirect();
    expect(dest).toBeNull();
    expect(mockPrisma.subOrgMembership.findFirst).not.toHaveBeenCalled();
  });

  it("does NOT redirect when the user has no agencies and no sub-org memberships", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_personal" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(null);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.subOrgMembership.findFirst.mockResolvedValueOnce(null);
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      dashboardPreference: "auto",
      createdAt: new Date(),
    });
    const dest = await callAndCatchRedirect();
    expect(dest).toBeNull();
  });

  it("does NOT redirect when there's no active org (Clerk hasn't activated one yet)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: null });
    mockPrisma.subOrgMembership.findFirst.mockResolvedValueOnce(null);
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      dashboardPreference: "auto",
      createdAt: new Date(),
    });
    const dest = await callAndCatchRedirect();
    expect(dest).toBeNull();
    expect(mockPrisma.orgRelationship.findUnique).not.toHaveBeenCalled();
  });
});
