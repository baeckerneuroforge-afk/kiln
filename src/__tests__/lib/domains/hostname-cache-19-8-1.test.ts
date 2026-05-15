/**
 * Sprint 19.8.1 — hostname-cache extended with agencyOrgId + type fields.
 *
 * Smoke-tests for the new fields. Backwards-compat with the Sprint 19.8
 * test file is covered by its own (unchanged) test suite.
 */
import { describe, expect, it } from "vitest";
import { createHostnameCache } from "@/lib/domains/hostname-cache";

describe("hostname-cache — 19.8.1 fields", () => {
  it("stores type=sub-org with subOrgId", () => {
    const cache = createHostnameCache();
    cache.set("sub.de", { subOrgId: "sub_1", agencyOrgId: null, type: "sub-org", status: "ACTIVE" });
    const out = cache.get("sub.de");
    expect(out?.type).toBe("sub-org");
    expect(out?.subOrgId).toBe("sub_1");
    expect(out?.agencyOrgId).toBeNull();
  });

  it("stores type=agency with agencyOrgId", () => {
    const cache = createHostnameCache();
    cache.set("agency.de", {
      subOrgId: null,
      agencyOrgId: "org_a",
      type: "agency",
      status: "ACTIVE",
    });
    const out = cache.get("agency.de");
    expect(out?.type).toBe("agency");
    expect(out?.agencyOrgId).toBe("org_a");
    expect(out?.subOrgId).toBeNull();
  });

  it("stores negative result (type=null, no ids)", () => {
    const cache = createHostnameCache();
    cache.set("typo.de", { subOrgId: null, agencyOrgId: null, type: null, status: null });
    const out = cache.get("typo.de");
    expect(out).not.toBeNull();
    expect(out?.type).toBeNull();
    expect(out?.subOrgId).toBeNull();
    expect(out?.agencyOrgId).toBeNull();
  });

});
