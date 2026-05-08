import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCanCreateSubOrg = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockApplyBranding = vi.hoisted(() => vi.fn());
const mockSetupChannels = vi.hoisted(() => vi.fn());
const mockImportKnowledge = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  onboardingWizard: { update: vi.fn() },
  orgRelationship: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mockClerkClient }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/agency/permissions", () => ({ canCreateSubOrg: mockCanCreateSubOrg }));
vi.mock("@/lib/onboarding/branding-applier", () => ({ applySubOrgBranding: mockApplyBranding }));
vi.mock("@/lib/onboarding/channel-setup", () => ({ setupOnboardingChannels: mockSetupChannels }));
vi.mock("@/lib/onboarding/kb-bulk-import", () => ({ importKnowledgeForSubOrg: mockImportKnowledge }));

import { executeOnboardingWizard } from "@/lib/onboarding/wizard-orchestrator";

describe("wizard orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanCreateSubOrg.mockResolvedValue({ allowed: true, max: 10, current: 1 });
    mockClerkClient.mockResolvedValue({ organizations: { createOrganization: vi.fn().mockResolvedValue({ id: "org_child" }) } });
    mockPrisma.orgRelationship.findMany.mockResolvedValue([]);
    mockPrisma.orgRelationship.create.mockResolvedValue({ id: "rel_1" });
    mockPrisma.orgRelationship.update.mockResolvedValue({});
    mockPrisma.onboardingWizard.update.mockResolvedValue({});
    mockApplyBranding.mockResolvedValue(undefined);
    mockSetupChannels.mockResolvedValue({ activated: ["email"], warnings: [] });
    mockImportKnowledge.mockResolvedValue({ indexed: 3, warnings: [] });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: {
      department: { create: (args: unknown) => Promise<{ id: string }> };
      agent: { create: (args: unknown) => Promise<{ id: string }> };
      departmentWorker: { create: (args: unknown) => Promise<unknown> };
    }) => Promise<void>) => callback({
      department: { create: vi.fn().mockResolvedValue({ id: "dept_1" }) },
      agent: { create: vi.fn().mockResolvedValue({ id: "agent_1" }) },
      departmentWorker: { create: vi.fn().mockResolvedValue({}) },
    }));
  });

  it("creates a sub-org, departments, KB, branding, and channels", async () => {
    const result = await executeOnboardingWizard({
      agencyOrgId: "org_agency",
      userId: "user_1",
      config: {
        basics: { customerName: "Praxis Test", industry: "dental" },
        selectedTemplates: [{ templateId: "termin-anfrage", departmentName: "Termin-Anfrage Department", selected: true }],
        knowledge: {},
        channels: { email: { enabled: true } },
        branding: { brandColor: "#f97316" },
      },
    });
    expect(result).toMatchObject({ subOrgId: "org_child", departmentsCreated: 3, kbEntriesIndexed: 3 });
    expect(mockApplyBranding).toHaveBeenCalled();
    expect(mockSetupChannels).toHaveBeenCalled();
  });

  it("rejects users without sub-org creation permissions", async () => {
    mockCanCreateSubOrg.mockResolvedValueOnce({ allowed: false, reason: "wrong_tier", max: 0, current: 0 });
    await expect(executeOnboardingWizard({
      agencyOrgId: "org_agency",
      userId: "user_1",
      config: {
        basics: { customerName: "Acme", industry: "custom" },
        selectedTemplates: [],
        knowledge: {},
        channels: {},
        branding: {},
      },
    })).rejects.toThrow("cannot create");
  });
});
