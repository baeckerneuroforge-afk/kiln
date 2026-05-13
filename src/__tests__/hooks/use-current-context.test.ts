/**
 * Sprint 19.7.2 — parseContextFromPath (pure unit). The hook itself
 * relies on React state + fetch and is exercised in
 * components/context-switcher.test.tsx; here we keep the URL parser
 * alone in a node env so failures pinpoint the routing rule.
 */
import { describe, expect, it } from "vitest";
import { parseContextFromPath, resolveContext } from "@/hooks/useCurrentContext";

describe("parseContextFromPath", () => {
  it("returns agency context for null/undefined paths", () => {
    expect(parseContextFromPath(null)).toEqual({ type: "agency", id: null, name: null });
    expect(parseContextFromPath(undefined)).toEqual({ type: "agency", id: null, name: null });
  });

  it("returns agency context for / and /dashboard", () => {
    expect(parseContextFromPath("/")).toMatchObject({ type: "agency", id: null });
    expect(parseContextFromPath("/dashboard")).toMatchObject({ type: "agency", id: null });
  });

  it("extracts the sub-org id from /dashboard/sub-org/[id]", () => {
    expect(parseContextFromPath("/dashboard/sub-org/sub_abc")).toEqual({
      type: "sub_org",
      id: "sub_abc",
      name: null,
    });
  });

  it("extracts the id even when a nested route is appended", () => {
    expect(parseContextFromPath("/dashboard/sub-org/sub_abc/agents/new")).toMatchObject({
      type: "sub_org",
      id: "sub_abc",
    });
  });

  it("rejects /dashboard/sub-orgs (the agency listing) as a sub-org context", () => {
    expect(parseContextFromPath("/dashboard/agency/sub-orgs")).toMatchObject({
      type: "agency",
      id: null,
    });
  });

  it("treats /dashboard/sub-org without an id as agency context", () => {
    expect(parseContextFromPath("/dashboard/sub-org/")).toMatchObject({
      type: "agency",
      id: null,
    });
  });
});

describe("resolveContext (Sprint 19.7.5.1 subOrgId search-param override)", () => {
  it("uses the path-derived sub-org context when the URL is already inside a sub-org", () => {
    expect(resolveContext("/dashboard/sub-org/sub_a/workflows", null)).toMatchObject({
      type: "sub_org",
      id: "sub_a",
    });
  });

  it("path wins even when a stale ?subOrgId is on the URL", () => {
    expect(resolveContext("/dashboard/sub-org/sub_a/workflows", "sub_b")).toMatchObject({
      type: "sub_org",
      id: "sub_a",
    });
  });

  it("falls back to the search-param when the path is the agency-side create page", () => {
    expect(resolveContext("/dashboard/teams/new", "sub_a")).toEqual({
      type: "sub_org",
      id: "sub_a",
      name: null,
    });
    expect(resolveContext("/dashboard/agents/new", "sub_a")).toEqual({
      type: "sub_org",
      id: "sub_a",
      name: null,
    });
  });

  it("treats an empty/missing search-param as agency context outside sub-org paths", () => {
    expect(resolveContext("/dashboard/teams/new", null)).toMatchObject({ type: "agency", id: null });
    expect(resolveContext("/dashboard/teams/new", "")).toMatchObject({ type: "agency", id: null });
    expect(resolveContext("/dashboard/teams/new", undefined)).toMatchObject({ type: "agency", id: null });
  });
});
