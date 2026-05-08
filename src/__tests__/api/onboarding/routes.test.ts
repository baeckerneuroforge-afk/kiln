import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireOnboardingAccess = vi.hoisted(() => vi.fn());
const mockLoadWizardForAgency = vi.hoisted(() => vi.fn());
const mockWizardToConfig = vi.hoisted(() => vi.fn());
const mockExecuteOnboardingWizard = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  industryTemplate: { findMany: vi.fn(), findUnique: vi.fn() },
  onboardingWizard: { create: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/onboarding/wizard-state", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onboarding/wizard-state")>("@/lib/onboarding/wizard-state");
  return {
    ...actual,
    requireOnboardingAccess: mockRequireOnboardingAccess,
    loadWizardForAgency: mockLoadWizardForAgency,
    wizardToConfig: mockWizardToConfig,
  };
});
vi.mock("@/lib/onboarding/wizard-orchestrator", () => ({
  executeOnboardingWizard: mockExecuteOnboardingWizard,
}));

import { GET as industriesGET } from "@/app/api/onboarding/industries/route";
import { GET as templateGET } from "@/app/api/onboarding/templates/[industry]/route";
import { POST as startPOST } from "@/app/api/onboarding/wizard/start/route";
import { POST as stepPOST } from "@/app/api/onboarding/wizard/[id]/step/[n]/route";
import { POST as activatePOST } from "@/app/api/onboarding/wizard/[id]/activate/route";

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("onboarding API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOnboardingAccess.mockResolvedValue({ userId: "user_1", agencyOrgId: "org_agency" });
    mockPrisma.industryTemplate.findMany.mockResolvedValue([]);
    mockPrisma.industryTemplate.findUnique.mockResolvedValue(null);
    mockPrisma.onboardingWizard.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingWizard.create.mockResolvedValue({ id: "wiz_1" });
    mockPrisma.onboardingWizard.update.mockResolvedValue({ id: "wiz_1" });
    mockLoadWizardForAgency.mockResolvedValue({
      id: "wiz_1",
      currentStep: 1,
      basics: { customerName: "Acme", industry: "dental" },
      selectedTemplates: [],
      knowledgeConfig: {},
      channelConfig: {},
      brandingConfig: {},
    });
    mockWizardToConfig.mockReturnValue({
      wizardId: "wiz_1",
      basics: { customerName: "Acme", industry: "dental" },
      selectedTemplates: [],
      knowledge: {},
      channels: {},
      branding: {},
    });
    mockExecuteOnboardingWizard.mockResolvedValue({ relationshipId: "rel_1" });
  });

  it("returns fallback industry templates when DB is empty", async () => {
    const body = await (await industriesGET()).json();
    expect(body.industries.length).toBeGreaterThan(6);
    expect(body.industries[0].industry).toBe("dental");
  });

  it("returns template details for an industry", async () => {
    const res = await templateGET(new Request("https://x.test"), { params: { industry: "kfz" } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.industry).toBe("kfz");
  });

  it("starts a wizard with default state", async () => {
    const res = await startPOST(jsonRequest("https://x.test/api/onboarding/wizard/start", { industry: "dental" }));
    expect(res.status).toBe(201);
    expect(mockPrisma.onboardingWizard.create).toHaveBeenCalled();
  });

  it("persists step data", async () => {
    const res = await stepPOST(jsonRequest("https://x.test", { customerName: "Acme", industry: "dental" }), {
      params: { id: "wiz_1", n: "1" },
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingWizard.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "wiz_1" } }));
  });

  it("activates via orchestrator", async () => {
    const res = await activatePOST(new Request("https://x.test", { method: "POST" }), { params: { id: "wiz_1" } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.result.relationshipId).toBe("rel_1");
    expect(mockExecuteOnboardingWizard).toHaveBeenCalled();
  });
});
