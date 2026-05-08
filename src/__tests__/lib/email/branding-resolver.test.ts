import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findUnique: vi.fn() },
  orgBranding: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  resolveEmailBranding,
  isValidEmailAddress,
  isValidHexColor,
  isValidHttpsUrl,
  parseOverride,
  formatFromHeader,
} from "@/lib/email/branding-resolver";
import { KILN_DEFAULT_BRANDING } from "@/lib/email/types";

describe("branding-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to KILN defaults when no orgId / no branding row", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValue(null);
    const result = await resolveEmailBranding({ orgId: "org_x" });
    expect(result).toEqual(KILN_DEFAULT_BRANDING);
    expect(result.isDefaultBranding).toBe(true);
    expect(result.brandName).toBe("KILN");
  });

  it("merges agency-level OrgBranding fields on top of defaults", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValue({
      agencyName: "Hephaistos Systems",
      logoUrl: "https://hephaistos.de/logo.png",
      primaryColor: "#FF6B35",
      emailFromAddress: "support@hephaistos.de",
      emailFromName: "Hephaistos Support",
      emailReplyTo: null,
      emailFooterHtml: "© Hephaistos 2026",
      emailSupportLink: "https://hephaistos.de/help",
    });

    const result = await resolveEmailBranding({ orgId: "org_x" });
    expect(result.brandName).toBe("Hephaistos Systems");
    expect(result.logoUrl).toBe("https://hephaistos.de/logo.png");
    expect(result.brandColor).toBe("#FF6B35");
    expect(result.fromAddress).toBe("support@hephaistos.de");
    expect(result.fromName).toBe("Hephaistos Support");
    expect(result.footerHtml).toBe("© Hephaistos 2026");
    expect(result.supportLink).toBe("https://hephaistos.de/help");
    expect(result.isDefaultBranding).toBe(false);
  });

  it("merges SubOrg override on top of agency branding", async () => {
    mockPrisma.orgRelationship.findUnique.mockResolvedValue({
      parentOrgId: "agency_org",
      subOrgName: "Customer X",
      brandColor: null,
      logoUrl: null,
      emailBrandOverride: {
        brandName: "Customer X Brand",
        fromAddress: "support@customer-x.com",
        brandColor: "#3B82F6",
      },
    });
    mockPrisma.orgBranding.findUnique.mockResolvedValue({
      agencyName: "Hephaistos Systems",
      logoUrl: "https://hephaistos.de/logo.png",
      primaryColor: "#FF6B35",
      emailFromAddress: "support@hephaistos.de",
      emailFromName: "Hephaistos",
      emailReplyTo: null,
      emailFooterHtml: "© Hephaistos",
      emailSupportLink: null,
    });

    const result = await resolveEmailBranding({
      orgId: "agency_org",
      subOrgId: "child_org",
    });
    // Override layer wins
    expect(result.brandName).toBe("Customer X Brand");
    expect(result.fromAddress).toBe("support@customer-x.com");
    expect(result.brandColor).toBe("#3B82F6");
    // Agency layer fills in unset override fields
    expect(result.logoUrl).toBe("https://hephaistos.de/logo.png");
    expect(result.fromName).toBe("Hephaistos");
    expect(result.footerHtml).toBe("© Hephaistos");
  });

  it("invalid hex color falls through to agency / default", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValue({
      agencyName: "Acme",
      logoUrl: null,
      primaryColor: "not-a-hex",
      emailFromAddress: null,
      emailFromName: null,
      emailReplyTo: null,
      emailFooterHtml: null,
      emailSupportLink: null,
    });
    const result = await resolveEmailBranding({ orgId: "org_x" });
    expect(result.brandColor).toBe(KILN_DEFAULT_BRANDING.brandColor);
  });

  it("non-https logoUrl falls through to default (no logo)", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValue({
      agencyName: "Acme",
      logoUrl: "http://insecure.example/logo.png",
      primaryColor: null,
      emailFromAddress: null,
      emailFromName: null,
      emailReplyTo: null,
      emailFooterHtml: null,
      emailSupportLink: null,
    });
    const result = await resolveEmailBranding({ orgId: "org_x" });
    expect(result.logoUrl).toBeNull();
  });

  it("invalid emailFromAddress on OrgBranding is ignored", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValue({
      agencyName: "Acme",
      logoUrl: null,
      primaryColor: null,
      emailFromAddress: "not-an-email",
      emailFromName: null,
      emailReplyTo: null,
      emailFooterHtml: null,
      emailSupportLink: null,
    });
    const result = await resolveEmailBranding({ orgId: "org_x" });
    expect(result.fromAddress).toBe(KILN_DEFAULT_BRANDING.fromAddress);
  });

  it("subOrgId without relationship falls back to org-only resolution", async () => {
    mockPrisma.orgRelationship.findUnique.mockResolvedValue(null);
    mockPrisma.orgBranding.findUnique.mockResolvedValue({
      agencyName: "Acme",
      logoUrl: null,
      primaryColor: "#000000",
      emailFromAddress: "x@acme.com",
      emailFromName: "Acme",
      emailReplyTo: null,
      emailFooterHtml: null,
      emailSupportLink: null,
    });
    const result = await resolveEmailBranding({
      orgId: "org_x",
      subOrgId: "missing_child",
    });
    expect(result.brandName).toBe("Acme");
  });

  it("validators behave as documented", () => {
    expect(isValidHexColor("#F97316")).toBe(true);
    expect(isValidHexColor("#fff")).toBe(true);
    expect(isValidHexColor("F97316")).toBe(false);
    expect(isValidHexColor("#zzzzzz")).toBe(false);

    expect(isValidEmailAddress("hello@example.com")).toBe(true);
    expect(isValidEmailAddress("not-an-email")).toBe(false);

    expect(isValidHttpsUrl("https://x.com/path")).toBe(true);
    expect(isValidHttpsUrl("http://x.com")).toBe(false);
    expect(isValidHttpsUrl("not-a-url")).toBe(false);
  });

  it("parseOverride accepts only known string fields", () => {
    const out = parseOverride({
      brandName: "X",
      brandColor: "#000",
      junk: 123,
      logoUrl: "https://x.com/l.png",
    });
    expect(out).toEqual({
      brandName: "X",
      brandColor: "#000",
      logoUrl: "https://x.com/l.png",
    });
  });

  it("parseOverride returns null for non-objects", () => {
    expect(parseOverride(null)).toBeNull();
    expect(parseOverride("string")).toBeNull();
    expect(parseOverride([1, 2, 3])).toBeNull();
  });

  it("formatFromHeader builds a quoted From header", () => {
    expect(
      formatFromHeader({
        ...KILN_DEFAULT_BRANDING,
        fromName: "Hephaistos",
        fromAddress: "x@hephaistos.de",
      })
    ).toBe("Hephaistos <x@hephaistos.de>");
  });
});
