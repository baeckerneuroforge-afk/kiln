/**
 * Sprint 19.7.2 — sub-org nested-route navigation config.
 */
import { describe, expect, it } from "vitest";
import {
  extractNestedSubOrgIdFromPath,
  getNestedSubOrgNavSections,
} from "@/components/sidebar";

describe("extractNestedSubOrgIdFromPath", () => {
  it("returns null for paths outside /dashboard/sub-org/[id]", () => {
    expect(extractNestedSubOrgIdFromPath("/dashboard")).toBeNull();
    expect(extractNestedSubOrgIdFromPath("/dashboard/agents")).toBeNull();
    expect(extractNestedSubOrgIdFromPath("/dashboard/agency/sub-orgs")).toBeNull();
  });

  it("extracts the id from /dashboard/sub-org/[id]", () => {
    expect(extractNestedSubOrgIdFromPath("/dashboard/sub-org/sub_xyz")).toBe("sub_xyz");
  });

  it("extracts the id from /dashboard/sub-org/[id]/nested/path", () => {
    expect(extractNestedSubOrgIdFromPath("/dashboard/sub-org/sub_xyz/agents/new")).toBe("sub_xyz");
  });

  it("returns null when no id segment is present", () => {
    expect(extractNestedSubOrgIdFromPath("/dashboard/sub-org/")).toBeNull();
  });
});

describe("getNestedSubOrgNavSections", () => {
  const sections = getNestedSubOrgNavSections("sub_42");

  it("ships exactly 5 sections in the spec order", () => {
    expect(sections.map((s) => s.id)).toEqual([
      "primary",
      "agents",
      "engagement",
      "insights",
      "settings",
    ]);
  });

  it("ships exactly 10 nav items across all sections", () => {
    const flat = sections.flatMap((s) => s.items);
    expect(flat).toHaveLength(10);
  });

  it("prefixes every href with /dashboard/sub-org/[id]", () => {
    const flat = sections.flatMap((s) => s.items);
    for (const item of flat) {
      expect(item.href.startsWith("/dashboard/sub-org/sub_42")).toBe(true);
    }
  });

  it("includes the Memberships entry in the Settings group", () => {
    const settings = sections.find((s) => s.id === "settings");
    expect(settings?.items.map((i) => i.name)).toContain("Memberships");
  });

  it("places Dashboard alone in the unlabeled primary section", () => {
    const primary = sections[0];
    expect(primary.label).toBeNull();
    expect(primary.items).toHaveLength(1);
    expect(primary.items[0].name).toBe("Dashboard");
  });
});
