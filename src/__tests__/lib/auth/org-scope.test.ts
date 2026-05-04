import { describe, expect, it } from "vitest";
import { orgOnlyFilter, orgScopeFilter } from "@/lib/auth/org-scope";

describe("org-scope helpers", () => {
  describe("orgScopeFilter", () => {
    it("returns the active-org branch alongside the legacy userId/orgId-null branch", () => {
      const f = orgScopeFilter({ userId: "u1", orgId: "o1" });
      expect(f).toEqual({
        OR: [{ orgId: "o1" }, { userId: "u1", orgId: null }],
      });
    });

    it("never returns a wildcard branch (no { orgId: undefined })", () => {
      const f = orgScopeFilter({ userId: "u1", orgId: "o1" });
      const branches = f.OR;
      expect(branches.every((b) => "orgId" in b)).toBe(true);
      // The legacy branch must explicitly require orgId === null so it
      // doesn't accidentally match every row.
      expect(branches[1]).toMatchObject({ orgId: null });
    });
  });

  describe("orgOnlyFilter", () => {
    it("scopes strictly by orgId without legacy fallback", () => {
      expect(orgOnlyFilter({ userId: "u1", orgId: "o1" })).toEqual({
        orgId: "o1",
      });
    });
  });
});
