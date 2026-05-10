import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
});

const mockPrisma = vi.hoisted(() => ({
  integrationConnection: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  agent: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("Gmail OAuth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockPrisma.integrationConnection.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buildGmailAuthUrl includes the requested scopes and offline access", async () => {
    const { buildGmailAuthUrl } = await import("@/lib/integrations/gmail");
    const url = buildGmailAuthUrl("state-abc");
    expect(url).toContain("scope=");
    expect(url).toContain("gmail.send");
    expect(url).toContain("gmail.readonly");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("state=state-abc");
  });

  it("exchangeGmailCode returns parsed token bundle on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "acc_test",
          refresh_token: "rt_test",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.send",
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { exchangeGmailCode } = await import("@/lib/integrations/gmail");
    const tokens = await exchangeGmailCode("code-xyz");
    expect(tokens.accessToken).toBe("acc_test");
    expect(tokens.refreshToken).toBe("rt_test");
    expect(tokens.expiresAt).toBeTruthy();
  });

  it("exchangeGmailCode throws on Google error response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "Bad code" }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );
    const { exchangeGmailCode } = await import("@/lib/integrations/gmail");
    await expect(exchangeGmailCode("bad")).rejects.toThrow(/Bad code/);
  });

  it("getGmailIntegrationForUser returns null when no active connection exists", async () => {
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce(null);
    const { getGmailIntegrationForUser } = await import("@/lib/integrations/gmail");
    const result = await getGmailIntegrationForUser("user_a");
    expect(result).toBeNull();
  });

  it("getGmailIntegrationForUser returns null for inactive connections", async () => {
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: "ic_1",
      isActive: false,
      orgId: "org_a",
      userId: "user_a",
      config: encryptConfigJson({ accessToken: "x" }),
    });
    const { getGmailIntegrationForUser } = await import("@/lib/integrations/gmail");
    expect(await getGmailIntegrationForUser("user_a")).toBeNull();
  });

  it("getGmailIntegrationForUser decrypts config and returns integration", async () => {
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    const config = { accessToken: "acc_x", refreshToken: "rt_x", expiresAt: null, email: "u@x.test" };
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: "ic_1",
      isActive: true,
      orgId: "org_a",
      userId: "user_a",
      config: encryptConfigJson(config),
    });
    const { getGmailIntegrationForUser } = await import("@/lib/integrations/gmail");
    const result = await getGmailIntegrationForUser("user_a");
    expect(result?.config.email).toBe("u@x.test");
    expect(result?.integration).toBeTruthy();
  });

  it("getGmailIntegrationForUser reads legacy plaintext config (backward-compat)", async () => {
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: "ic_legacy",
      isActive: true,
      orgId: null,
      userId: "user_a",
      config: JSON.stringify({ accessToken: "acc_legacy", refreshToken: null, expiresAt: null }),
    });
    const { getGmailIntegrationForUser } = await import("@/lib/integrations/gmail");
    const result = await getGmailIntegrationForUser("user_a");
    expect(result?.config.accessToken).toBe("acc_legacy");
  });

  it("getGmailIntegrationForAgent requires the agent-integration link", async () => {
    mockPrisma.agent.findUnique.mockResolvedValueOnce({ id: "agent_a", userId: "user_a" });
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce(null);
    const { getGmailIntegrationForAgent } = await import("@/lib/integrations/gmail");
    expect(await getGmailIntegrationForAgent("agent_a")).toBeNull();
  });

  it("Gmail integration auto-refreshes expired access token via refresh_token", async () => {
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    const expired = new Date(Date.now() - 5_000).toISOString();
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce({
      id: "ic_1",
      isActive: true,
      orgId: "org_a",
      userId: "user_a",
      config: encryptConfigJson({
        accessToken: "expired",
        refreshToken: "rt_x",
        expiresAt: expired,
      }),
    });
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "fresh_acc",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ emailAddress: "u@x.test", messagesTotal: 1 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const { getGmailIntegrationForUser } = await import("@/lib/integrations/gmail");
    const result = await getGmailIntegrationForUser("user_a");
    const profile = await result!.integration.getProfile();
    expect(profile.emailAddress).toBe("u@x.test");
    // Token-refresh should have triggered a config update + audit log.
    expect(mockPrisma.integrationConnection.update).toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "INTEGRATION_TOKEN_REFRESHED" }),
      }),
    );
  });
});
