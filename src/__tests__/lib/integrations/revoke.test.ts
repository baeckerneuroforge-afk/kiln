import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

describe("revokeIntegrationToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls Google revoke endpoint for gmail with refresh token preferred", async () => {
    const { revokeIntegrationToken } = await import("@/lib/integrations/revoke");
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    const config = encryptConfigJson({ accessToken: "acc_a", refreshToken: "rt_a" });
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response("", { status: 200 }));
    const result = await revokeIntegrationToken({ provider: "gmail", config });
    expect(result.ok).toBe(true);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("oauth2.googleapis.com/revoke");
    expect(calledUrl).toContain("token=rt_a");
  });

  it("falls back to access token when refresh token is missing", async () => {
    const { revokeIntegrationToken } = await import("@/lib/integrations/revoke");
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    const config = encryptConfigJson({ accessToken: "acc_only", refreshToken: null });
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response("", { status: 200 }));
    await revokeIntegrationToken({ provider: "google_calendar", config });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("token=acc_only");
  });

  it("returns ok=false when Google responds with non-2xx", async () => {
    const { revokeIntegrationToken } = await import("@/lib/integrations/revoke");
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 400, headers: { "content-type": "application/json" } }),
    );
    const result = await revokeIntegrationToken({
      provider: "gmail",
      config: encryptConfigJson({ accessToken: "x" }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalid_token");
  });

  it("returns missing-token when neither token is present", async () => {
    const { revokeIntegrationToken } = await import("@/lib/integrations/revoke");
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    const result = await revokeIntegrationToken({
      provider: "gmail",
      config: encryptConfigJson({}),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing-token");
  });

  it("treats Slack and Notion as unsupported (no-op success)", async () => {
    const { revokeIntegrationToken } = await import("@/lib/integrations/revoke");
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    const slack = await revokeIntegrationToken({
      provider: "slack",
      config: encryptConfigJson({ accessToken: "xoxb" }),
    });
    expect(slack.ok).toBe(true);
    expect(slack.unsupported).toBe(true);
  });

  it("calls HubSpot DELETE refresh-tokens endpoint", async () => {
    const { revokeIntegrationToken } = await import("@/lib/integrations/revoke");
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await revokeIntegrationToken({
      provider: "hubspot",
      config: encryptConfigJson({ refreshToken: "hs_rt" }),
    });
    expect(result.ok).toBe(true);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(call[0]).toContain("/oauth/v1/refresh-tokens/hs_rt");
    expect(call[1]?.method).toBe("DELETE");
  });

  it("handles network errors gracefully", async () => {
    const { revokeIntegrationToken } = await import("@/lib/integrations/revoke");
    const { encryptConfigJson } = await import("@/lib/integrations/config-storage");
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await revokeIntegrationToken({
      provider: "gmail",
      config: encryptConfigJson({ refreshToken: "rt" }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("returns config-unreadable when config cannot be parsed", async () => {
    const { revokeIntegrationToken } = await import("@/lib/integrations/revoke");
    const result = await revokeIntegrationToken({ provider: "gmail", config: "garbage" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Config could not be parsed");
  });
});
