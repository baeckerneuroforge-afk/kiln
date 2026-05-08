import { describe, expect, it } from "vitest";
import {
  defaultTemplateSelection,
  isOnboardingIndustry,
  parseBasics,
  parseChannelConfig,
  parseKnowledgeConfig,
  parseTemplateSelection,
  wizardToConfig,
} from "@/lib/onboarding/wizard-state";

describe("wizard state parsing", () => {
  it("parses basics with custom fallback", () => {
    expect(parseBasics({ customerName: "  Acme  ", industry: "dental" })).toMatchObject({
      customerName: "Acme",
      industry: "dental",
    });
    expect(parseBasics({ customerName: "Acme", industry: "bad" }).industry).toBe("custom");
  });

  it("validates known industries", () => {
    expect(isOnboardingIndustry("shk")).toBe(true);
    expect(isOnboardingIndustry("law-firm")).toBe(false);
  });

  it("defaults template selection from industry", () => {
    const selected = defaultTemplateSelection("fitness");
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((item) => typeof item.selected === "boolean")).toBe(true);
  });

  it("parses template selections", () => {
    const selected = parseTemplateSelection([{ templateId: "a", departmentName: "A", selected: false }], "custom");
    expect(selected).toEqual([{ templateId: "a", departmentName: "A", selected: false }]);
  });

  it("parses knowledge config with files and urls", () => {
    const config = parseKnowledgeConfig({ urls: ["https://x.test"], files: [{ fileName: "faq.pdf", mimeType: "application/pdf" }] });
    expect(config.urls).toEqual(["https://x.test"]);
    expect(config.files?.[0].fileName).toBe("faq.pdf");
  });

  it("parses channel config defaults", () => {
    const config = parseChannelConfig({});
    expect(config.email?.enabled).toBe(true);
    expect(config.webchat?.enabled).toBe(true);
    expect(config.whatsapp?.enabled).toBe(false);
  });

  it("converts wizard rows to orchestrator config", () => {
    const config = wizardToConfig({
      id: "wiz_1",
      basics: { customerName: "Acme", industry: "restaurant" },
      selectedTemplates: [],
      knowledgeConfig: { urls: ["https://restaurant.test"] },
      channelConfig: { email: { enabled: true } },
      brandingConfig: { brandColor: "#ff6600" },
    });
    expect(config.wizardId).toBe("wiz_1");
    expect(config.basics.industry).toBe("restaurant");
  });
});
