import { describe, expect, it } from "vitest";
import { getIndustryOptions, getIndustryTemplate, INDUSTRY_TEMPLATES, toIndustryTemplateRow } from "@/lib/onboarding/industry-templates";

describe("industry templates", () => {
  it("defines the six requested industries plus custom", () => {
    expect(INDUSTRY_TEMPLATES.map((item) => item.industry)).toEqual([
      "dental",
      "kfz",
      "shk",
      "restaurant",
      "property",
      "fitness",
      "custom",
    ]);
  });

  it("sorts options by sortOrder", () => {
    expect(getIndustryOptions()[0].industry).toBe("dental");
    expect(getIndustryOptions().at(-1)?.industry).toBe("custom");
  });

  it("dental template includes required departments", () => {
    const dental = getIndustryTemplate("dental");
    expect(dental?.departmentTemplates.map((item) => item.name)).toContain("Termin-Anfrage Department");
    expect(dental?.departmentTemplates.map((item) => item.name)).toContain("Recall-Erinnerungs Department");
    expect(dental?.departmentTemplates.find((item) => item.id === "zahnzusatzversicherung")?.defaultSelected).toBe(false);
  });

  it("kfz template recommends WhatsApp and image intake", () => {
    const kfz = getIndustryTemplate("kfz");
    expect(kfz?.recommendedChannels).toContain("whatsapp");
    expect(kfz?.departmentTemplates.map((item) => item.name)).toContain("WhatsApp Inbound mit Bilder-Verarbeitung");
  });

  it("custom template starts empty", () => {
    const custom = getIndustryTemplate("custom");
    expect(custom?.departmentTemplates).toHaveLength(0);
    expect(custom?.knowledgeBaseSeeds).toHaveLength(0);
  });

  it("template rows are suitable for seeding", () => {
    const row = toIndustryTemplateRow(INDUSTRY_TEMPLATES[0]);
    expect(row).toMatchObject({
      industry: "dental",
      isActive: true,
      iconName: "Stethoscope",
    });
    expect(Array.isArray(row.departmentTemplates)).toBe(true);
  });
});
