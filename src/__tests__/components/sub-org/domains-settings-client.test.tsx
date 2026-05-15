// @vitest-environment jsdom

/**
 * Sprint 19.8 — DomainsSettingsClient component contract.
 *
 * Library-component pure rendering tests; we don't mount the full
 * page. Focus on:
 *   - canManage gates the add/verify/remove buttons
 *   - Empty-state copy when no domains
 *   - Status badges render per status
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DomainsSettingsClient } from "@/components/sub-org/domains-settings-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const baseDomain = {
  id: "dom_1",
  hostname: "ai.x.de",
  status: "ACTIVE" as const,
  sslStatus: "ISSUED",
  isPrimary: true,
  createdAt: new Date("2026-05-14").toISOString(),
};

describe("DomainsSettingsClient", () => {
  it("renders an empty state when no domains exist", () => {
    render(
      <DomainsSettingsClient subOrgId="sub_1" canManage initialDomains={[]} />,
    );
    expect(screen.getByTestId("domains-empty")).toBeTruthy();
    expect(screen.getByTestId("domains-add-button")).toBeTruthy();
  });

  it("hides the add button when canManage=false", () => {
    render(
      <DomainsSettingsClient
        subOrgId="sub_1"
        canManage={false}
        initialDomains={[]}
      />,
    );
    expect(screen.queryByTestId("domains-add-button")).toBeNull();
  });

  it("renders one row per domain with the right status badge", () => {
    render(
      <DomainsSettingsClient
        subOrgId="sub_1"
        canManage
        initialDomains={[
          baseDomain,
          { ...baseDomain, id: "dom_2", hostname: "shop.x.de", status: "PENDING" },
          { ...baseDomain, id: "dom_3", hostname: "fail.x.de", status: "FAILED" },
        ]}
      />,
    );
    expect(screen.getByTestId("domain-row-dom_1")).toBeTruthy();
    expect(screen.getByTestId("domain-status-ACTIVE")).toBeTruthy();
    expect(screen.getByTestId("domain-status-PENDING")).toBeTruthy();
    expect(screen.getByTestId("domain-status-FAILED")).toBeTruthy();
  });

  it("hides verify + remove buttons when canManage=false", () => {
    render(
      <DomainsSettingsClient
        subOrgId="sub_1"
        canManage={false}
        initialDomains={[
          { ...baseDomain, status: "PENDING" }, // would normally show verify
        ]}
      />,
    );
    expect(screen.queryByTestId("domain-verify-dom_1")).toBeNull();
    expect(screen.queryByTestId("domain-remove-dom_1")).toBeNull();
  });

  it("hides verify button on an already-ACTIVE domain", () => {
    render(
      <DomainsSettingsClient
        subOrgId="sub_1"
        canManage
        initialDomains={[baseDomain]}
      />,
    );
    // ACTIVE rows don't need re-verification; verify CTA suppressed.
    expect(screen.queryByTestId("domain-verify-dom_1")).toBeNull();
    expect(screen.getByTestId("domain-remove-dom_1")).toBeTruthy();
  });

  it("shows verify button on non-ACTIVE rows for managers", () => {
    render(
      <DomainsSettingsClient
        subOrgId="sub_1"
        canManage
        initialDomains={[{ ...baseDomain, status: "VERIFYING" }]}
      />,
    );
    expect(screen.getByTestId("domain-verify-dom_1")).toBeTruthy();
  });
});
