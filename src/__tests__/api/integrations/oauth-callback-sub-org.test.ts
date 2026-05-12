/**
 * Sprint 19.7.5 — OAuth callbacks honour state.subOrgId.
 *
 * Slack stands in for the family — Gmail/Calendar/HubSpot/Notion route
 * through the same shared helpers (decodeOAuthState +
 * resolveOAuthTargetOrgId). One representative test plus targeted unit
 * coverage on the helpers keeps the matrix manageable.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
  process.env.SLACK_CLIENT_ID = "slack_test_client";
  process.env.SLACK_CLIENT_SECRET = "slack_test_secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://kilnbase.test";
});

const mockAuth = vi.hoisted(() => vi.fn());
const mockExchangeSlackCode = vi.hoisted(() => vi.fn());
const mockMembership = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  integrationConnection: {
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  orgRelationship: { findUnique: vi.fn() },
  subOrgMembership: { findUnique: vi.fn() },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/integrations/slack", () => ({
  exchangeSlackCode: mockExchangeSlackCode,
}));
vi.mock("@/lib/permissions/sub-org-permissions", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getUserSubOrgMembership: mockMembership };
});

import { encodeOAuthState } from "@/lib/integrations/oauth-state";
import { GET as slackCallback } from "@/app/api/integrations/slack/callback/route";

beforeEach(() => {
  mockAuth.mockReset();
  mockExchangeSlackCode.mockReset();
  mockMembership.mockReset();
  mockPrisma.integrationConnection.findFirst.mockReset();
  mockPrisma.integrationConnection.update.mockReset();
  mockPrisma.integrationConnection.create.mockReset();
  mockPrisma.orgRelationship.findUnique.mockReset();
});

function callbackUrl(stateRaw: string) {
  return new Request(
    `https://kilnbase.test/api/integrations/slack/callback?code=xyz&state=${encodeURIComponent(stateRaw)}`,
  );
}

describe("Slack OAuth callback — sub-org scoping", () => {
  it("persists the connection under the sub-org's clerk org when state has subOrgId", async () => {
    const state = encodeOAuthState({ userId: "user_1", subOrgId: "sub_1" });
    mockAuth.mockResolvedValueOnce({ orgId: "org_agency" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({
      childOrgId: "org_child",
      subOrgStatus: "ACTIVE",
    });
    mockExchangeSlackCode.mockResolvedValueOnce({
      accessToken: "tok",
      teamId: "T1",
      teamName: "Acme",
      botUserId: "B1",
      scope: "chat:write",
    });
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce(null);
    mockPrisma.integrationConnection.create.mockResolvedValueOnce({ id: "c1" });

    const res = await slackCallback(callbackUrl(state) as never);

    // Created with orgId = the sub-org's child orgId (NOT the agency).
    const createArgs = mockPrisma.integrationConnection.create.mock.calls[0][0];
    expect(createArgs.data.orgId).toBe("org_child");
    expect(createArgs.data.userId).toBe("user_1");
    expect(createArgs.data.provider).toBe("slack");
    // Bounce back into the sub-org integrations page.
    expect(res.headers.get("location")).toContain("/dashboard/sub-org/sub_1/integrations");
  });

  it("falls back to the agency Clerk org when state has no subOrgId", async () => {
    const state = encodeOAuthState({ userId: "user_1" });
    mockAuth.mockResolvedValueOnce({ orgId: "org_agency" });
    mockExchangeSlackCode.mockResolvedValueOnce({
      accessToken: "tok",
      teamId: "T1",
      teamName: "Acme",
      botUserId: "B1",
      scope: "chat:write",
    });
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce(null);
    mockPrisma.integrationConnection.create.mockResolvedValueOnce({ id: "c2" });

    await slackCallback(callbackUrl(state) as never);

    const createArgs = mockPrisma.integrationConnection.create.mock.calls[0][0];
    expect(createArgs.data.orgId).toBe("org_agency");
    // resolveOAuthTargetOrgId skips the membership lookup when subOrgId is missing.
    expect(mockMembership).not.toHaveBeenCalled();
  });

  it("redirects with sub_org_not_found when the caller is not a sub-org member", async () => {
    const state = encodeOAuthState({ userId: "user_1", subOrgId: "sub_x" });
    mockAuth.mockResolvedValueOnce({ orgId: "org_agency" });
    mockMembership.mockResolvedValueOnce(null);

    const res = await slackCallback(callbackUrl(state) as never);
    expect(res.headers.get("location")).toContain("slack_error=sub_org_not_found");
    expect(mockPrisma.integrationConnection.create).not.toHaveBeenCalled();
  });

  it("redirects with forbidden when membership lacks integrations.manage", async () => {
    const state = encodeOAuthState({ userId: "user_1", subOrgId: "sub_1" });
    mockAuth.mockResolvedValueOnce({ orgId: "org_agency" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "USE_AGENTS" });

    const res = await slackCallback(callbackUrl(state) as never);
    expect(res.headers.get("location")).toContain("slack_error=forbidden");
    expect(mockPrisma.integrationConnection.create).not.toHaveBeenCalled();
  });

  it("redirects with invalid_state when state can't be decoded", async () => {
    const res = await slackCallback(callbackUrl("!!!notbase64!!!") as never);
    expect(res.headers.get("location")).toContain("slack_error=invalid_state");
  });
});
