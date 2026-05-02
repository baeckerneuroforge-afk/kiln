import { afterEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

import {
  OrgContextError,
  getOptionalOrgId,
  getPersonalOrgId,
  requireOrgId,
} from "@/lib/auth/org-context";

describe("org-context helpers", () => {
  afterEach(() => {
    mockAuth.mockReset();
    mockUserFindUnique.mockReset();
  });

  describe("requireOrgId", () => {
    it("returns the active Clerk org when one is selected", async () => {
      mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_active" });
      const result = await requireOrgId();
      expect(result).toEqual({ userId: "user_1", orgId: "org_active" });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it("falls back to the user's personalOrgId when no active org", async () => {
      mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: null });
      mockUserFindUnique.mockResolvedValueOnce({ personalOrgId: "org_personal" });
      const result = await requireOrgId();
      expect(result).toEqual({ userId: "user_1", orgId: "org_personal" });
    });

    it("throws when there is no authenticated user", async () => {
      mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
      await expect(requireOrgId()).rejects.toThrow(/Unauthenticated/);
    });

    it("throws OrgContextError when user has neither active org nor personal org", async () => {
      mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: null });
      mockUserFindUnique.mockResolvedValueOnce({ personalOrgId: null });
      await expect(requireOrgId()).rejects.toBeInstanceOf(OrgContextError);
    });
  });

  describe("getOptionalOrgId", () => {
    it("returns userId+orgId when both present", async () => {
      mockAuth.mockResolvedValueOnce({ userId: "u", orgId: "o" });
      expect(await getOptionalOrgId()).toEqual({ userId: "u", orgId: "o" });
    });

    it("returns nulls cleanly when nothing is set", async () => {
      mockAuth.mockResolvedValueOnce({ userId: undefined, orgId: undefined });
      expect(await getOptionalOrgId()).toEqual({ userId: null, orgId: null });
    });

    it("does NOT resolve the personal org fallback", async () => {
      mockAuth.mockResolvedValueOnce({ userId: "u", orgId: null });
      const result = await getOptionalOrgId();
      expect(result.orgId).toBeNull();
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("getPersonalOrgId", () => {
    it("returns the personal org id from the local DB", async () => {
      mockUserFindUnique.mockResolvedValueOnce({ personalOrgId: "org_x" });
      expect(await getPersonalOrgId("u_1")).toBe("org_x");
    });

    it("returns null when user is missing", async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);
      expect(await getPersonalOrgId("u_1")).toBeNull();
    });

    it("returns null when called with empty userId without hitting the DB", async () => {
      expect(await getPersonalOrgId("")).toBeNull();
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });
  });
});
