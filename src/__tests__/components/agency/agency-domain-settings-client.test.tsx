// @vitest-environment jsdom

/**
 * Sprint 19.8.1 — AgencyDomainSettingsClient state machine.
 *
 * Pure rendering tests for each of the four states (none / setup /
 * active / failed) + permission-gating of the action buttons.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgencyDomainSettingsClient } from "@/components/agency/agency-domain-settings-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const base = {
  id: "agd_1",
  hostname: "ai.berlin-ai.de",
  status: "ACTIVE" as const,
  sslStatus: "ISSUED",
  sslIssuedAt: "2026-05-14T00:00:00.000Z",
  isPrimary: true,
  createdAt: "2026-05-14T00:00:00.000Z",
};

describe("AgencyDomainSettingsClient", () => {
  it("renders empty hero + setup CTA when canManage", () => {
    render(
      <AgencyDomainSettingsClient
        initialDomain={null}
        canManage
        canVerify
      />,
    );
    expect(screen.getByTestId("agency-domain-empty")).toBeTruthy();
    expect(screen.getByTestId("agency-domain-setup-cta")).toBeTruthy();
    expect(screen.getByTestId("agency-domain-before-after")).toBeTruthy();
  });

  it("hides the setup CTA when canManage=false", () => {
    render(
      <AgencyDomainSettingsClient
        initialDomain={null}
        canManage={false}
        canVerify={false}
      />,
    );
    expect(screen.queryByTestId("agency-domain-setup-cta")).toBeNull();
    expect(screen.getByTestId("agency-domain-empty")).toBeTruthy();
  });

  it("renders ACTIVE state with hostname + open + remove button", () => {
    render(
      <AgencyDomainSettingsClient
        initialDomain={base}
        canManage
        canVerify
      />,
    );
    expect(screen.getByTestId("agency-domain-active")).toBeTruthy();
    expect(screen.getByTestId("agency-domain-open")).toBeTruthy();
    expect(screen.getByTestId("agency-domain-remove")).toBeTruthy();
    expect(screen.getByText("ai.berlin-ai.de")).toBeTruthy();
  });

  it("hides remove on ACTIVE for ADMIN (canManage=false but canVerify=true)", () => {
    render(
      <AgencyDomainSettingsClient
        initialDomain={base}
        canManage={false}
        canVerify
      />,
    );
    expect(screen.queryByTestId("agency-domain-remove")).toBeNull();
    expect(screen.getByTestId("agency-domain-open")).toBeTruthy();
  });

  it("renders VERIFYING state with verify CTA + DNS instructions", () => {
    render(
      <AgencyDomainSettingsClient
        initialDomain={{ ...base, status: "VERIFYING" }}
        canManage
        canVerify
      />,
    );
    expect(screen.getByTestId("agency-domain-setup-in-progress")).toBeTruthy();
    expect(screen.getByTestId("agency-domain-verify")).toBeTruthy();
    expect(screen.getByTestId("dns-setup-instructions")).toBeTruthy();
  });

  it("hides verify button on VERIFYING when canVerify=false", () => {
    render(
      <AgencyDomainSettingsClient
        initialDomain={{ ...base, status: "VERIFYING" }}
        canManage={false}
        canVerify={false}
      />,
    );
    expect(screen.queryByTestId("agency-domain-verify")).toBeNull();
    expect(screen.queryByTestId("agency-domain-cancel")).toBeNull();
  });

  it("renders FAILED state with retry CTA", () => {
    render(
      <AgencyDomainSettingsClient
        initialDomain={{ ...base, status: "FAILED" }}
        canManage
        canVerify
      />,
    );
    expect(screen.getByTestId("agency-domain-failed")).toBeTruthy();
    expect(screen.getByTestId("agency-domain-retry")).toBeTruthy();
    expect(screen.getByTestId("agency-domain-remove-failed")).toBeTruthy();
  });
});
