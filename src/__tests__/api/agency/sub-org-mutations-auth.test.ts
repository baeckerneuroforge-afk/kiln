import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgencyRole } from "@prisma/client";

const { authMock, clerkClientMock, installIndustryPackMock, isOnboardingIndustryMock, prismaMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    clerkClientMock: vi.fn(),
    installIndustryPackMock: vi.fn(),
    isOnboardingIndustryMock: vi.fn(),
    prismaMock: {
      orgRelationship: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      agencyMembership: { findUnique: vi.fn() },
      orgBranding: { upsert: vi.fn() },
    },
  }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/industries/shared/industry-installer", () => ({
  installIndustryPack: installIndustryPackMock,
}));
vi.mock("@/lib/onboarding/wizard-state", () => ({
  isOnboardingIndustry: isOnboardingIndustryMock,
}));
vi.mock("@/lib/modules/store", () => ({
  findModuleConfig: vi.fn(),
  toggleModuleActive: vi.fn(),
  upsertModuleConfig: vi.fn(),
}));
vi.mock("@/lib/audit/logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/billing/module-billing", () => ({
  addModuleSubscriptionItem: vi.fn(),
  removeModuleSubscriptionItem: vi.fn(),
}));

import { DELETE as archiveDELETE } from "@/app/api/agency/sub-orgs/[id]/route";
import { PATCH as brandingPATCH } from "@/app/api/agency/sub-orgs/[id]/branding/route";
import { DELETE as memberDELETE } from "@/app/api/agency/sub-orgs/[id]/members/[membershipId]/route";
import { POST as refreshPOST } from "@/app/api/agency/sub-orgs/[id]/industry-pack/refresh/route";
import { POST as togglePOST } from "@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/toggle/route";
import { POST as configurePOST } from "@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route";

const REL_ID = "rel_1";
const AGENCY_ORG_ID = "org_agency";
const CHILD_ORG_ID = "org_child";
const USER_ID = "user_1";

const MUTATION_ROUTES = [
  {
    name: "DELETE /api/agency/sub-orgs/[id]",
    call: () => archiveDELETE(new Request("https://x.test/archive"), { params: { id: REL_ID } }),
  },
  {
    name: "PATCH /api/agency/sub-orgs/[id]/branding",
    call: () =>
      brandingPATCH(makeJsonRequest({ primaryColor: "#123456" }), {
        params: { id: REL_ID },
      }),
  },
  {
    name: "DELETE /api/agency/sub-orgs/[id]/members/[membershipId]",
    call: () =>
      memberDELETE(new Request("https://x.test/member"), {
        params: { id: REL_ID, membershipId: "orgmem_1" },
      }),
  },
  {
    name: "POST /api/agency/sub-orgs/[id]/industry-pack/refresh",
    call: () => refreshPOST(new Request("https://x.test/refresh"), { params: { id: REL_ID } }),
  },
  {
    name: "POST /api/agency/sub-orgs/[id]/modules/[moduleName]/toggle",
    call: () =>
      togglePOST(makeJsonRequest({ isActive: true }), {
        params: { id: REL_ID, moduleName: "ai" },
      }),
  },
  {
    name: "POST /api/agency/sub-orgs/[id]/modules/[moduleName]/configure",
    call: () =>
      configurePOST(makeJsonRequest({ mode: "pool" }), {
        params: { id: REL_ID, moduleName: "ai" },
      }),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
  mockRelationship();
  mockAgencyRole("OWNER");
});

function makeJsonRequest(body: unknown) {
  return new Request("https://x.test/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockRelationship() {
  prismaMock.orgRelationship.findFirst.mockResolvedValue({
    id: REL_ID,
    parentOrgId: AGENCY_ORG_ID,
    childOrgId: CHILD_ORG_ID,
    subOrgName: "Customer X",
    industry: "healthcare",
  });
}

function mockAgencyRole(role: AgencyRole) {
  prismaMock.agencyMembership.findUnique.mockResolvedValue({
    id: `mem_${role}`,
    agencyClerkOrgId: AGENCY_ORG_ID,
    userId: USER_ID,
    role,
  });
}

describe("Sprint 20.2 C-4 mutating sub-org route auth", () => {
  it.each(MUTATION_ROUTES)("$name returns 401 when unauthenticated", async ({ call }) => {
    authMock.mockResolvedValue({ userId: null, orgId: null });

    const res = await call();

    expect(res.status).toBe(401);
    expect(prismaMock.orgRelationship.findFirst).not.toHaveBeenCalled();
  });

  it.each(MUTATION_ROUTES)("$name hides relationships from other agencies", async ({ call }) => {
    prismaMock.orgRelationship.findFirst.mockResolvedValue(null);

    const res = await call();

    expect(res.status).toBe(404);
    expect(prismaMock.agencyMembership.findUnique).not.toHaveBeenCalled();
  });

  it.each(MUTATION_ROUTES)("$name hides missing AgencyMembership", async ({ call }) => {
    prismaMock.agencyMembership.findUnique.mockResolvedValue(null);

    const res = await call();

    expect(res.status).toBe(404);
  });

  it.each(MUTATION_ROUTES)("$name returns 403 for CONSULTANT", async ({ call }) => {
    mockAgencyRole("CONSULTANT");

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
  });

  it.each(MUTATION_ROUTES)("$name returns 403 for VIEWER", async ({ call }) => {
    mockAgencyRole("VIEWER");

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
  });
});
