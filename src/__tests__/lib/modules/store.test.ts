import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  subAccountModuleConfig: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  decryptModuleCredentials,
  ensureDefaultModuleConfigs,
  listModuleConfigs,
  toggleModuleActive,
  upsertModuleConfig,
} from "@/lib/modules/store";
import { encryptConfigJson } from "@/lib/integrations/config-storage";

describe("module-config store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.subAccountModuleConfig.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: "smc_new",
      ...create,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it("upsertModuleConfig encrypts credentials for BYOK modes", async () => {
    await upsertModuleConfig({
      subAccountId: "sub_a",
      moduleName: "ai",
      mode: "byok_agency",
      credentials: { anthropicKey: "sk-ant-test" },
      credentialsOwner: "agency",
    });
    const create = mockPrisma.subAccountModuleConfig.upsert.mock.calls[0]?.[0]?.create as Record<string, unknown>;
    expect(create?.mode).toBe("byok_agency");
    expect(create?.encryptedCredentials).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(create?.encryptedCredentials).not.toContain("sk-ant-test");
    expect(create?.credentialsOwner).toBe("agency");
  });

  it("upsertModuleConfig nullifies credentials when switching to pool mode", async () => {
    await upsertModuleConfig({
      subAccountId: "sub_a",
      moduleName: "ai",
      mode: "pool",
    });
    const create = mockPrisma.subAccountModuleConfig.upsert.mock.calls[0]?.[0]?.create as Record<string, unknown>;
    expect(create?.encryptedCredentials).toBeNull();
    expect(create?.credentialsOwner).toBeNull();
  });

  it("upsertModuleConfig rejects byok with credentials but no owner", async () => {
    await expect(
      upsertModuleConfig({
        subAccountId: "sub_a",
        moduleName: "ai",
        mode: "byok_customer",
        credentials: { anthropicKey: "sk-ant-test" },
        // credentialsOwner intentionally missing
      }),
    ).rejects.toThrow(/credentialsOwner/);
  });

  it("upsertModuleConfig rejects invalid mode", async () => {
    await expect(
      upsertModuleConfig({
        subAccountId: "sub_a",
        moduleName: "ai",
        mode: "bogus" as never,
      }),
    ).rejects.toThrow(/Invalid module mode/);
  });

  it("toggleModuleActive creates a pool row when nothing exists", async () => {
    await toggleModuleActive({ subAccountId: "sub_a", moduleName: "sms", isActive: true });
    const upsertArgs = mockPrisma.subAccountModuleConfig.upsert.mock.calls[0]?.[0];
    expect(upsertArgs?.create?.mode).toBe("pool");
    expect(upsertArgs?.create?.isActive).toBe(true);
    expect(upsertArgs?.update?.isActive).toBe(true);
  });

  it("decryptModuleCredentials returns null for missing config", () => {
    expect(decryptModuleCredentials({ encryptedCredentials: null })).toBeNull();
  });

  it("decryptModuleCredentials roundtrips encrypted JSON", () => {
    const encrypted = encryptConfigJson({ anthropicKey: "sk-ant-x" });
    const result = decryptModuleCredentials<{ anthropicKey: string }>({ encryptedCredentials: encrypted });
    expect(result?.anthropicKey).toBe("sk-ant-x");
  });

  it("decryptModuleCredentials swallows tampered ciphertext as null", () => {
    expect(decryptModuleCredentials({ encryptedCredentials: "not-an-envelope" })).toBeNull();
  });

  it("listModuleConfigs returns rows ordered by moduleName", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([
      { id: "1", moduleName: "ai", subAccountId: "sub_a", mode: "pool", isActive: true, encryptedCredentials: null, credentialsOwner: null, lastValidatedAt: null, validationError: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "2", moduleName: "sms", subAccountId: "sub_a", mode: "pool", isActive: false, encryptedCredentials: null, credentialsOwner: null, lastValidatedAt: null, validationError: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const list = await listModuleConfigs("sub_a");
    expect(list).toHaveLength(2);
  });

  it("ensureDefaultModuleConfigs upserts one row per module name", async () => {
    mockPrisma.subAccountModuleConfig.upsert.mockImplementation(async () => ({
      id: `smc_${Math.random()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await ensureDefaultModuleConfigs("sub_new");
    expect(mockPrisma.subAccountModuleConfig.upsert).toHaveBeenCalledTimes(4);
    const seenModules = mockPrisma.subAccountModuleConfig.upsert.mock.calls.map((c) => (c[0] as { where: { subAccountId_moduleName: { moduleName: string } } }).where.subAccountId_moduleName.moduleName);
    expect(seenModules.sort()).toEqual(["ai", "sms", "voice", "whatsapp"]);
  });

  it("ensureDefaultModuleConfigs never touches existing rows on update", async () => {
    mockPrisma.subAccountModuleConfig.upsert.mockImplementation(async () => ({
      id: "x",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await ensureDefaultModuleConfigs("sub_a");
    for (const call of mockPrisma.subAccountModuleConfig.upsert.mock.calls) {
      expect(call[0]?.update).toEqual({});
    }
  });
});
