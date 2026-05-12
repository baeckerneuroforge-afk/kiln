// @vitest-environment jsdom

/**
 * Sprint 19.7.5 — TemplateUpdatesBanner.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TemplateUpdatesBanner } from "@/components/sub-org/template-updates-banner";

afterEach(() => cleanup());

describe("TemplateUpdatesBanner", () => {
  it("renders nothing when there are no available updates", () => {
    const { container } = render(<TemplateUpdatesBanner updates={[]} kind="agents" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a singular headline for one update", () => {
    render(
      <TemplateUpdatesBanner
        kind="agents"
        updates={[
          {
            templateType: "AGENT",
            templateId: "t1",
            templateName: "Greeter",
            currentVersion: 1,
            latestVersion: 2,
            instanceId: "a1",
            isCustomized: false,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("template-updates-banner-agents")).toBeTruthy();
    expect(screen.getByText(/1 Agent-Template-Update verfügbar/i)).toBeTruthy();
    expect(screen.getByText(/Greeter:\s*v1\s*→\s*v2/)).toBeTruthy();
  });

  it("renders a plural headline + customized chip on customized rows", () => {
    render(
      <TemplateUpdatesBanner
        kind="workflows"
        updates={[
          { templateType: "WORKFLOW", templateId: "w1", templateName: "Sales", currentVersion: 1, latestVersion: 2, instanceId: "team_1", isCustomized: true },
          { templateType: "WORKFLOW", templateId: "w2", templateName: "Support", currentVersion: 1, latestVersion: 4, instanceId: "team_2", isCustomized: false },
        ]}
      />,
    );
    expect(screen.getByText(/2 Workflow-Template-Updates verfügbar/i)).toBeTruthy();
    expect(screen.getByText(/angepasst – wird übersprungen/i)).toBeTruthy();
  });
});
