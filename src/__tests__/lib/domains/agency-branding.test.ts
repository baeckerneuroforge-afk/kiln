/**
 * Sprint 19.8.1 — loadAgencyBranding.
 *
 * Wires OrgBranding row → AgencyBranding shape, with fallback values
 * when fields are missing.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  orgBranding: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { loadAgencyBranding } from "@/lib/domains/agency-branding";

beforeEach(() => {
  mockPrisma.orgBranding.findUnique.mockReset();
});

describe("loadAgencyBranding", () => {
  it("returns fully-populated branding when OrgBranding row exists", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValueOnce({
      agencyName: "Berlin AI Consulting",
      logoUrl: "https://cdn.example/logo.png",
      primaryColor: "#10B981",
    });
    const b = await loadAgencyBranding({
      agencyOrgId: "org_a",
      hostname: "ai.berlin-ai.de",
    });
    expect(b).toEqual({
      agencyOrgId: "org_a",
      agencyName: "Berlin AI Consulting",
      logoUrl: "https://cdn.example/logo.png",
      primaryColor: "#10B981",
      hostname: "ai.berlin-ai.de",
    });
  });

  it("falls back to hostname for agencyName + default color when no OrgBranding row", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValueOnce(null);
    const b = await loadAgencyBranding({
      agencyOrgId: "org_a",
      hostname: "ai.berlin-ai.de",
    });
    expect(b.agencyName).toBe("ai.berlin-ai.de");
    expect(b.logoUrl).toBeNull();
    expect(b.primaryColor).toBe("#F97316"); // KILN default
  });

  it("uses default color when row exists but primaryColor is null", async () => {
    mockPrisma.orgBranding.findUnique.mockResolvedValueOnce({
      agencyName: "Whatever GmbH",
      logoUrl: null,
      primaryColor: null,
    });
    const b = await loadAgencyBranding({
      agencyOrgId: "org_a",
      hostname: "x.de",
    });
    expect(b.primaryColor).toBe("#F97316");
    expect(b.agencyName).toBe("Whatever GmbH");
  });
});
