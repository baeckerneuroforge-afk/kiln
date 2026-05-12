// @vitest-environment jsdom

/**
 * Sprint 19.7.4 — IntegrationsTabs client component.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { IntegrationsTabs } from "@/components/sub-org/integrations-tabs";

function routedMock(byUrl: Record<string, unknown>) {
  // Both tabs fetch lazily on mount; the test routes by URL substring so
  // each tab's panel can be exercised independently.
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    for (const [needle, body] of Object.entries(byUrl)) {
      if (url.includes(needle)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

function mockApiKeysResponse(keys: Array<Record<string, unknown>>) {
  routedMock({ "/api-keys": { keys }, "/oauth": { connections: [] } });
}

beforeEach(() => {
  mockFetch.mockReset();
});
afterEach(() => cleanup());

describe("IntegrationsTabs", () => {
  it("renders three tabs (API Keys, OAuth, Module Settings)", async () => {
    mockApiKeysResponse([]);
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/dashboard/agency/sub-orgs/sub_1/modules" canManage={false} />);
    expect(screen.getByTestId("integrations-tab-api-keys")).toBeTruthy();
    expect(screen.getByTestId("integrations-tab-oauth")).toBeTruthy();
    expect(screen.getByTestId("integrations-tab-modules")).toBeTruthy();
  });

  it("API Keys tab shows the empty state when no keys exist", async () => {
    mockApiKeysResponse([]);
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/x" canManage={false} />);
    expect(await screen.findByTestId("integrations-api-keys-empty")).toBeTruthy();
  });

  it("API Keys tab lists keys returned by the API", async () => {
    mockApiKeysResponse([
      { id: "k1", provider: "ANTHROPIC", label: "prod", preview: "••••abcd", createdAt: new Date().toISOString() },
    ]);
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/x" canManage={false} />);
    expect(await screen.findByTestId("integrations-api-keys-list")).toBeTruthy();
    expect(screen.getByText(/Anthropic · prod/)).toBeTruthy();
  });

  it("hides the Add button + delete buttons when canManage=false", async () => {
    mockApiKeysResponse([
      { id: "k1", provider: "ANTHROPIC", label: "prod", preview: "••••abcd", createdAt: new Date().toISOString() },
    ]);
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/x" canManage={false} />);
    await screen.findByTestId("integrations-api-keys-list");
    expect(screen.queryByRole("button", { name: /API Key hinzufügen/i })).toBeNull();
    expect(screen.queryByLabelText(/Delete prod/i)).toBeNull();
  });

  it("shows the Add button when canManage=true and opens the form on click", async () => {
    mockApiKeysResponse([]);
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/x" canManage={true} />);
    const addBtn = await screen.findByRole("button", { name: /API Key hinzufügen/i });
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(screen.getByTestId("integrations-api-keys-form")).toBeTruthy();
    });
    expect(screen.getByTestId("integrations-api-keys-input-key")).toBeTruthy();
  });

  it("OAuth tab lists the planned providers", async () => {
    mockApiKeysResponse([]);
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/x" canManage={true} />);
    fireEvent.click(screen.getByTestId("integrations-tab-oauth"));
    for (const id of ["gmail", "google-calendar", "slack", "hubspot", "notion"]) {
      expect(await screen.findByTestId(`integrations-oauth-row-${id}`)).toBeTruthy();
    }
  });

  it("OAuth tab shows a Connect button (linked with subOrgId) when not connected", async () => {
    mockApiKeysResponse([]);
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/x" canManage={true} />);
    fireEvent.click(screen.getByTestId("integrations-tab-oauth"));
    const slackConnect = await screen.findByTestId("integrations-oauth-connect-slack");
    expect((slackConnect as HTMLAnchorElement).getAttribute("href")).toContain(
      "/api/integrations/slack/auth?subOrgId=sub_1",
    );
  });

  it("OAuth tab shows Connected status + Disconnect when a connection exists", async () => {
    routedMock({
      "/api-keys": { keys: [] },
      "/oauth": {
        connections: [
          { id: "c1", provider: "slack", identifier: "Slack — Acme", connectedAt: new Date().toISOString() },
        ],
      },
    });
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/x" canManage={true} />);
    fireEvent.click(screen.getByTestId("integrations-tab-oauth"));
    expect(await screen.findByTestId("integrations-oauth-status-slack")).toBeTruthy();
    expect(screen.getByTestId("integrations-oauth-disconnect-slack")).toBeTruthy();
    // The non-connected providers keep showing a Connect link.
    expect(screen.getByTestId("integrations-oauth-connect-gmail")).toBeTruthy();
  });

  it("OAuth tab hides Connect + Disconnect when canManage=false", async () => {
    routedMock({
      "/api-keys": { keys: [] },
      "/oauth": {
        connections: [
          { id: "c1", provider: "slack", identifier: "Slack — Acme", connectedAt: new Date().toISOString() },
        ],
      },
    });
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/x" canManage={false} />);
    fireEvent.click(screen.getByTestId("integrations-tab-oauth"));
    await screen.findByTestId("integrations-oauth-status-slack");
    expect(screen.queryByTestId("integrations-oauth-disconnect-slack")).toBeNull();
    expect(screen.queryByTestId("integrations-oauth-connect-gmail")).toBeNull();
  });

  it("Module Settings tab links to the agency-side editor", async () => {
    mockApiKeysResponse([]);
    render(<IntegrationsTabs subOrgId="sub_1" agencyOrgPath="/dashboard/agency/sub-orgs/sub_1/modules" canManage={true} />);
    fireEvent.click(screen.getByTestId("integrations-tab-modules"));
    const link = await screen.findByTestId("integrations-modules-link");
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe("/dashboard/agency/sub-orgs/sub_1/modules");
  });
});
