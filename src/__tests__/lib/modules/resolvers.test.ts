import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  subAccountModuleConfig: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { encryptConfigJson } from "@/lib/integrations/config-storage";
import {
  ModuleMissingCredentialsError,
  ModuleNotActiveError,
} from "@/lib/modules/types";
import {
  resolveAiCredentials,
  resolveAiKeyForProvider,
} from "@/lib/modules/module-resolver";
import { resolveTwilioCredentials } from "@/lib/modules/twilio-resolver";

function row(overrides: Partial<{
  moduleName: string;
  mode: string;
  isActive: boolean;
  encryptedCredentials: string | null;
  credentialsOwner: string | null;
}> = {}) {
  return {
    id: "smc_1",
    subAccountId: "sub_a",
    moduleName: overrides.moduleName ?? "ai",
    mode: overrides.mode ?? "pool",
    isActive: overrides.isActive ?? true,
    encryptedCredentials: overrides.encryptedCredentials ?? null,
    credentialsOwner: overrides.credentialsOwner ?? null,
    lastValidatedAt: null,
    validationError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("AI module resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pool sentinel when no row exists and requireActive=false", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(null);
    const result = await resolveAiCredentials({ subAccountId: "sub_a", requireActive: false });
    expect(result.mode).toBe("pool");
    expect(result.byokActive).toBe(false);
    expect(result.anthropicKey).toBeNull();
  });

  it("throws ModuleNotActiveError when no row and requireActive default", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(null);
    await expect(resolveAiCredentials({ subAccountId: "sub_a" })).rejects.toBeInstanceOf(ModuleNotActiveError);
  });

  it("throws ModuleNotActiveError when row exists but isActive=false", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(row({ isActive: false }));
    await expect(resolveAiCredentials({ subAccountId: "sub_a" })).rejects.toBeInstanceOf(ModuleNotActiveError);
  });

  it("returns pool sentinel when mode=pool and isActive=true", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(row({ mode: "pool", isActive: true }));
    const result = await resolveAiCredentials({ subAccountId: "sub_a" });
    expect(result.mode).toBe("pool");
    expect(result.byokActive).toBe(false);
  });

  it("decrypts BYOK agency credentials and returns them", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(
      row({
        mode: "byok_agency",
        isActive: true,
        encryptedCredentials: encryptConfigJson({ anthropicKey: "sk-ant-agency-x" }),
        credentialsOwner: "agency",
      }),
    );
    const result = await resolveAiCredentials({ subAccountId: "sub_a" });
    expect(result.byokActive).toBe(true);
    expect(result.mode).toBe("byok_agency");
    expect(result.anthropicKey).toBe("sk-ant-agency-x");
    expect(result.credentialsOwner).toBe("agency");
  });

  it("decrypts BYOK customer credentials and tags the owner email", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(
      row({
        mode: "byok_customer",
        isActive: true,
        encryptedCredentials: encryptConfigJson({ openaiKey: "sk-customer-key" }),
        credentialsOwner: "dr@schmidt.de",
      }),
    );
    const result = await resolveAiCredentials({ subAccountId: "sub_a" });
    expect(result.mode).toBe("byok_customer");
    expect(result.openaiKey).toBe("sk-customer-key");
    expect(result.anthropicKey).toBeNull();
    expect(result.credentialsOwner).toBe("dr@schmidt.de");
  });

  it("throws ModuleMissingCredentialsError when BYOK row has no credentials", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(
      row({ mode: "byok_agency", isActive: true, encryptedCredentials: null }),
    );
    await expect(resolveAiCredentials({ subAccountId: "sub_a" })).rejects.toBeInstanceOf(ModuleMissingCredentialsError);
  });

  it("resolveAiKeyForProvider returns null for pool mode", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(row({ mode: "pool", isActive: true }));
    const result = await resolveAiKeyForProvider({ subAccountId: "sub_a", provider: "anthropic" });
    expect(result).toBeNull();
  });

  it("resolveAiKeyForProvider returns the right key per provider", async () => {
    mockPrisma.subAccountModuleConfig.findUnique
      .mockResolvedValueOnce(
        row({
          mode: "byok_customer",
          isActive: true,
          encryptedCredentials: encryptConfigJson({ anthropicKey: "sk-ant-x", openaiKey: "sk-y" }),
          credentialsOwner: "x@x.test",
        }),
      )
      .mockResolvedValueOnce(
        row({
          mode: "byok_customer",
          isActive: true,
          encryptedCredentials: encryptConfigJson({ anthropicKey: "sk-ant-x", openaiKey: "sk-y" }),
          credentialsOwner: "x@x.test",
        }),
      );
    const anthropic = await resolveAiKeyForProvider({ subAccountId: "sub_a", provider: "anthropic" });
    const openai = await resolveAiKeyForProvider({ subAccountId: "sub_a", provider: "openai" });
    expect(anthropic?.key).toBe("sk-ant-x");
    expect(openai?.key).toBe("sk-y");
    expect(anthropic?.mode).toBe("byok_customer");
  });

  it("resolveAiKeyForProvider returns null when only the other provider has a key", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(
      row({
        mode: "byok_agency",
        isActive: true,
        encryptedCredentials: encryptConfigJson({ openaiKey: "sk-only" }),
        credentialsOwner: "agency",
      }),
    );
    const result = await resolveAiKeyForProvider({ subAccountId: "sub_a", provider: "anthropic" });
    expect(result).toBeNull();
  });
});

describe("Twilio module resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = "AC_pool_sid";
    process.env.TWILIO_AUTH_TOKEN = "pool_token";
    process.env.TWILIO_SMS_PHONE_NUMBER = "+491234";
    process.env.TWILIO_VOICE_PHONE_NUMBER = "+491235";
    process.env.TWILIO_WHATSAPP_PHONE_NUMBER = "+491236";
  });

  it("returns pool credentials from env when mode=pool", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(row({ moduleName: "sms", mode: "pool", isActive: true }));
    const result = await resolveTwilioCredentials({ subAccountId: "sub_a", moduleName: "sms" });
    expect(result.mode).toBe("pool");
    expect(result.accountSid).toBe("AC_pool_sid");
    expect(result.phoneNumber).toBe("+491234");
    expect(result.byokActive).toBe(false);
  });

  it("returns BYOK credentials when configured", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(
      row({
        moduleName: "voice",
        mode: "byok_agency",
        isActive: true,
        encryptedCredentials: encryptConfigJson({
          accountSid: "AC_agency_sid",
          authToken: "agency_token",
          phoneNumber: "+499998",
        }),
        credentialsOwner: "agency",
      }),
    );
    const result = await resolveTwilioCredentials({ subAccountId: "sub_a", moduleName: "voice" });
    expect(result.mode).toBe("byok_agency");
    expect(result.accountSid).toBe("AC_agency_sid");
    expect(result.phoneNumber).toBe("+499998");
    expect(result.byokActive).toBe(true);
  });

  it("rejects non-Twilio module names", async () => {
    await expect(
      resolveTwilioCredentials({ subAccountId: "sub_a", moduleName: "ai" as never }),
    ).rejects.toThrow(/does not support/);
  });

  it("throws ModuleNotActiveError when row missing with default requireActive", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(null);
    await expect(
      resolveTwilioCredentials({ subAccountId: "sub_a", moduleName: "sms" }),
    ).rejects.toBeInstanceOf(ModuleNotActiveError);
  });

  it("falls through to pool defaults when no row and requireActive=false", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(null);
    const result = await resolveTwilioCredentials({
      subAccountId: "sub_a",
      moduleName: "whatsapp",
      requireActive: false,
    });
    expect(result.byokActive).toBe(false);
    expect(result.phoneNumber).toBe("+491236");
  });

  it("throws ModuleMissingCredentialsError when BYOK row has incomplete config", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(
      row({
        moduleName: "sms",
        mode: "byok_customer",
        isActive: true,
        encryptedCredentials: encryptConfigJson({ accountSid: "AC_x" }),
        credentialsOwner: "customer@x.test",
      }),
    );
    await expect(
      resolveTwilioCredentials({ subAccountId: "sub_a", moduleName: "sms" }),
    ).rejects.toBeInstanceOf(ModuleMissingCredentialsError);
  });
});
