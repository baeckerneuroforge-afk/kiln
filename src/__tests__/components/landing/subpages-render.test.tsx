// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Sub-pages all use the shared template so we can drive them via
// imported props rather than rendering the full page (which pulls
// in nav + footer + StarField). This keeps the test fast while
// proving every sub-page actually composes.

import MultiAgentWorkflowsPage from "@/app/features/multi-agent-workflows/page";
import WhiteLabelSubOrgsPage from "@/app/features/white-label-sub-orgs/page";
import MultiChannelPage from "@/app/features/multi-channel/page";
import ByokMcpA2APage from "@/app/features/byok-mcp-a2a/page";
import SelfLearningRagPage from "@/app/features/self-learning-rag/page";
import AgencyBillingPage from "@/app/features/agency-billing/page";

afterEach(() => {
  cleanup();
});

describe("Feature sub-pages render", () => {
  const cases: { name: string; Page: React.ComponentType }[] = [
    { name: "multi-agent-workflows", Page: MultiAgentWorkflowsPage },
    { name: "white-label-sub-orgs", Page: WhiteLabelSubOrgsPage },
    { name: "multi-channel", Page: MultiChannelPage },
    { name: "byok-mcp-a2a", Page: ByokMcpA2APage },
    { name: "self-learning-rag", Page: SelfLearningRagPage },
    { name: "agency-billing", Page: AgencyBillingPage },
  ];

  for (const { name, Page } of cases) {
    it(`/${"features/" + name} mounts and renders the Start Free + founder CTAs`, () => {
      render(<Page />);
      // Each page has at least one Start Free CTA → /sign-up and at least
      // one founder mailto. We use getAllBy because the template adds
      // CTAs in both the hero and the final-CTA block.
      const starts = screen
        .getAllByRole("link", { name: /start free/i })
        .map((a) => a.getAttribute("href"));
      expect(starts).toContain("/sign-up");

      const founderLinks = screen
        .getAllByRole("link", { name: /talk to founder/i })
        .map((a) => a.getAttribute("href") || "");
      expect(
        founderLinks.some((h) => h.startsWith("mailto:andre@hephaistos-systems.de")),
      ).toBe(true);
    });
  }
});
