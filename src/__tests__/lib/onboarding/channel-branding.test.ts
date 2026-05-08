import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  department: { updateMany: vi.fn() },
  orgRelationship: { update: vi.fn() },
  orgBranding: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { applySubOrgBranding } from "@/lib/onboarding/branding-applier";
import { setupOnboardingChannels } from "@/lib/onboarding/channel-setup";

describe("channel setup and branding applier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  });

  it("enables email on all generated departments", async () => {
    const result = await setupOnboardingChannels({
      departmentIds: ["dept_1", "dept_2"],
      basics: { customerName: "Acme", industry: "dental", customDomain: "acme.de" },
      channels: { email: { enabled: true, setupDnsLater: true } },
      branding: {},
    });
    expect(result.activated).toContain("email");
    expect(result.warnings).toContain("Email DNS setup was deferred.");
    expect(mockPrisma.department.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["dept_1", "dept_2"] } },
      data: expect.objectContaining({ emailEnabled: true, emailInboundAddr: "support@acme.de" }),
    });
  });

  it("warns when WhatsApp is selected before Meta setup", async () => {
    const result = await setupOnboardingChannels({
      departmentIds: ["dept_1"],
      basics: { customerName: "Acme", industry: "kfz" },
      channels: { whatsapp: { enabled: true } },
      branding: {},
    });
    expect(result.warnings.join(" ")).toContain("Meta Business");
  });

  it("writes branding to relationship and org branding", async () => {
    await applySubOrgBranding({
      relationshipId: "rel_1",
      childOrgId: "org_child",
      basics: { customerName: "Acme", industry: "fitness" },
      branding: { brandColor: "#123456", customSubdomain: "acme.agency.de", emailSignature: "Team Acme" },
    });
    expect(mockPrisma.orgRelationship.update).toHaveBeenCalledWith({
      where: { id: "rel_1" },
      data: expect.objectContaining({ brandColor: "#123456", customSubdomain: "acme.agency.de" }),
    });
    expect(mockPrisma.orgBranding.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: "org_child" },
    }));
  });
});
