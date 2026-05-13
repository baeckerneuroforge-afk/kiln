/**
 * Sprint 19.7.6 — POST /api/sub-orgs/[id]/onboarding.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockCookies = vi.hoisted(() => vi.fn(() => ({ set: mockSet })));
const mockPrisma = vi.hoisted(() => ({
  subOrgMembership: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST } from "@/app/api/sub-orgs/[id]/onboarding/route";

const USER = "user_1";
const SUB_ORG = "sub_1";

const MEMBERSHIP = {
  id: "mem_1",
  subOrgId: SUB_ORG,
  userId: USER,
  role: "MEMBER" as const,
  permissionSet: "READ_ONLY" as const,
  invitedById: null,
  invitedAt: null,
  acceptedAt: new Date(),
  onboardingStepCompleted: null,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(body: unknown) {
  return new Request(`http://localhost/api/sub-orgs/${SUB_ORG}/onboarding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockAuth.mockReset();
  mockSet.mockReset();
  mockPrisma.subOrgMembership.findUnique.mockReset();
  mockPrisma.subOrgMembership.update.mockReset();
});

describe("POST /api/sub-orgs/[id]/onboarding", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await POST(makeReq({ step: 1 }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(401);
  });

  it("404 when caller is not a member of the sub-org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ step: 1 }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(404);
  });

  it("400 for an empty payload", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(MEMBERSHIP);
    const res = await POST(makeReq({}), { params: { id: SUB_ORG } });
    expect(res.status).toBe(400);
  });

  it("records step completion", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(MEMBERSHIP);
    mockPrisma.subOrgMembership.update.mockResolvedValueOnce(MEMBERSHIP);

    const res = await POST(makeReq({ step: 2 }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgMembership.update).toHaveBeenCalledWith({
      where: { id: "mem_1" },
      data: { onboardingStepCompleted: 2 },
    });
  });

  it("marks the whole wizard as completed", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(MEMBERSHIP);
    mockPrisma.subOrgMembership.update.mockResolvedValueOnce(MEMBERSHIP);

    const res = await POST(makeReq({ completed: true }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(200);
    const call = mockPrisma.subOrgMembership.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { onboardingCompletedAt: Date; onboardingStepCompleted: number };
    };
    expect(call.where).toEqual({ id: "mem_1" });
    expect(call.data.onboardingStepCompleted).toBe(3);
    expect(call.data.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it("sets a skip-cookie without touching the DB on skip", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(MEMBERSHIP);

    const res = await POST(makeReq({ skip: true }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgMembership.update).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      "kiln_onboarding_skip",
      "1",
      expect.objectContaining({ maxAge: 86400, path: "/" }),
    );
  });

  it("invalid step values are rejected", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(MEMBERSHIP);

    const res = await POST(makeReq({ step: 99 }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(400);
    expect(mockPrisma.subOrgMembership.update).not.toHaveBeenCalled();
  });
});
