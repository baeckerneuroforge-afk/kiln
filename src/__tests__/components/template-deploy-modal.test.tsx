// @vitest-environment jsdom

/**
 * Sprint 19.7.5 — TemplateDeployModal client component.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TemplateDeployModal } from "@/components/templates/template-deploy-modal";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function routedMock(byUrl: Record<string, unknown>) {
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

beforeEach(() => {
  mockFetch.mockReset();
});
afterEach(() => cleanup());

describe("TemplateDeployModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <TemplateDeployModal
        open={false}
        onClose={() => {}}
        templateId="t1"
        templateKind="agents"
        templateName="Greeter"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("loads + renders active sub-orgs when opened", async () => {
    routedMock({
      "/api/agency/sub-orgs": {
        subOrgs: [
          { id: "sub_1", childOrgId: "child_1", subOrgName: "Acme", subOrgStatus: "ACTIVE" },
          { id: "sub_2", childOrgId: "child_2", subOrgName: "Beta", subOrgStatus: "ACTIVE" },
          { id: "sub_3", childOrgId: "child_3", subOrgName: "Stale", subOrgStatus: "ARCHIVED" },
        ],
      },
    });
    render(
      <TemplateDeployModal
        open
        onClose={() => {}}
        templateId="t1"
        templateKind="agents"
        templateName="Greeter"
      />,
    );
    expect(await screen.findByTestId("template-deploy-modal-list")).toBeTruthy();
    // ARCHIVED sub-orgs are filtered out client-side.
    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("Deploy button is disabled until something is selected", async () => {
    routedMock({
      "/api/agency/sub-orgs": {
        subOrgs: [{ id: "sub_1", childOrgId: "child_1", subOrgName: "Acme", subOrgStatus: "ACTIVE" }],
      },
    });
    render(
      <TemplateDeployModal
        open
        onClose={() => {}}
        templateId="t1"
        templateKind="agents"
        templateName="Greeter"
      />,
    );
    await screen.findByTestId("template-deploy-modal-list");
    const submit = screen.getByTestId("template-deploy-modal-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("template-deploy-modal-row-sub_1"));
    expect(submit.disabled).toBe(false);
  });

  it("toggles all on/off", async () => {
    routedMock({
      "/api/agency/sub-orgs": {
        subOrgs: [
          { id: "sub_1", childOrgId: "child_1", subOrgName: "Acme", subOrgStatus: "ACTIVE" },
          { id: "sub_2", childOrgId: "child_2", subOrgName: "Beta", subOrgStatus: "ACTIVE" },
        ],
      },
    });
    render(
      <TemplateDeployModal
        open
        onClose={() => {}}
        templateId="t1"
        templateKind="agents"
        templateName="Greeter"
      />,
    );
    await screen.findByTestId("template-deploy-modal-list");
    const toggleAll = screen.getByTestId("template-deploy-modal-toggle-all");
    fireEvent.click(toggleAll);
    // Both checkboxes should be checked now → submit button enabled with count 2.
    expect((screen.getByTestId("template-deploy-modal-submit") as HTMLButtonElement).textContent).toContain("(2)");
    fireEvent.click(toggleAll);
    expect((screen.getByTestId("template-deploy-modal-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends subOrgIds to the deploy endpoint on click", async () => {
    routedMock({
      "/api/agency/sub-orgs": {
        subOrgs: [{ id: "sub_1", childOrgId: "child_1", subOrgName: "Acme", subOrgStatus: "ACTIVE" }],
      },
      "/api/templates/agents/t1/deploy": { deployedTo: 1, created: 1, reused: 0 },
    });
    render(
      <TemplateDeployModal
        open
        onClose={() => {}}
        templateId="t1"
        templateKind="agents"
        templateName="Greeter"
      />,
    );
    await screen.findByTestId("template-deploy-modal-list");
    fireEvent.click(screen.getByTestId("template-deploy-modal-row-sub_1"));
    fireEvent.click(screen.getByTestId("template-deploy-modal-submit"));
    await waitFor(() => {
      const deployCall = mockFetch.mock.calls.find(([url]) =>
        String(url).includes("/api/templates/agents/t1/deploy"),
      );
      expect(deployCall).toBeTruthy();
      expect(JSON.parse(String(deployCall![1].body))).toEqual({ subOrgIds: ["sub_1"] });
    });
  });
});
