import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  subAccountModuleConfig: { findUnique: vi.fn() },
  apiKey: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { encryptConfigJson } from "@/lib/integrations/config-storage";
import { resolveProviderApiKey } from "@/lib/llm/routing/fallback-chain";

describe("LLM fallback-chain wired to module config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("returns request-level BYOK key first, before any module lookup", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(null);
    mockPrisma.apiKey.findFirst.mockResolvedValueOnce(null);
    const result = await resolveProviderApiKey("anthropic", {
      orgId: "sub_a",
      userId: "user_a",
      modelId: "claude-sonnet-4-6",
      taskType: "test",
      messages: [],
      byokKey: { provider: "anthropic", key: "sk-ant-request-level" },
    } as never);
    expect(result?.key).toBe("sk-ant-request-level");
    expect(result?.source).toBe("request-byok");
  });

  it("returns SubAccountModuleConfig BYOK key when configured for the org", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      id: "smc_1",
      subAccountId: "sub_a",
      moduleName: "ai",
      mode: "byok_customer",
      isActive: true,
      encryptedCredentials: encryptConfigJson({ anthropicKey: "sk-ant-module" }),
      credentialsOwner: "customer@example.com",
      lastValidatedAt: null,
      validationError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.apiKey.findFirst.mockResolvedValueOnce(null);
    const result = await resolveProviderApiKey("anthropic", {
      orgId: "sub_a",
      userId: "user_a",
      modelId: "claude-sonnet-4-6",
      taskType: "test",
      messages: [],
    } as never);
    expect(result?.key).toBe("sk-ant-module");
    expect(result?.byokActive).toBe(true);
    expect(result?.source).toBe("stored-byok");
  });

  it("does not return module key for pool-mode rows", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      id: "smc_1",
      subAccountId: "sub_a",
      moduleName: "ai",
      mode: "pool",
      isActive: true,
      encryptedCredentials: null,
      credentialsOwner: null,
      lastValidatedAt: null,
      validationError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.apiKey.findFirst.mockResolvedValueOnce(null);
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform";
    const result = await resolveProviderApiKey("anthropic", {
      orgId: "sub_a",
      userId: "user_a",
      modelId: "claude-sonnet-4-6",
      taskType: "test",
      messages: [],
    } as never);
    expect(result?.key).toBe("sk-ant-platform");
    expect(result?.byokActive).toBe(false);
    expect(result?.source).toBe("platform");
  });

  it("falls back to ApiKey table when no module config exists", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(null);
    const encryptedKey = encryptConfigJson("sk-ant-stored").replace(/^/, "");
    // ApiKey table stores via lib/encryption.encrypt, not via config-storage —
    // re-use config-storage to mimic that for the test scope.
    const { encrypt } = await import("@/lib/encryption");
    mockPrisma.apiKey.findFirst.mockResolvedValueOnce({ encryptedKey: encrypt("sk-ant-stored") });
    const result = await resolveProviderApiKey("anthropic", {
      orgId: "sub_a",
      userId: "user_a",
      modelId: "claude-sonnet-4-6",
      taskType: "test",
      messages: [],
    } as never);
    expect(result?.key).toBe("sk-ant-stored");
    expect(result?.byokActive).toBe(true);
    void encryptedKey;
  });
});
