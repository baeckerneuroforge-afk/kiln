import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

describe("integration config-storage helpers", () => {
  it("isEncryptedConfig matches the iv:tag:ciphertext envelope", async () => {
    const { isEncryptedConfig, encryptConfigJson } = await import("@/lib/integrations/config-storage");
    const encrypted = encryptConfigJson({ ok: true });
    expect(isEncryptedConfig(encrypted)).toBe(true);
    expect(isEncryptedConfig('{"plaintext":true}')).toBe(false);
    expect(isEncryptedConfig("")).toBe(false);
    expect(isEncryptedConfig(null)).toBe(false);
  });

  it("encryptConfigJson roundtrips through readConfigJson", async () => {
    const { encryptConfigJson, readConfigJson } = await import("@/lib/integrations/config-storage");
    const encrypted = encryptConfigJson({ accessToken: "tok_a", expiresAt: null });
    const result = readConfigJson<{ accessToken: string; expiresAt: null }>(encrypted);
    expect(result.wasLegacyPlaintext).toBe(false);
    expect(result.data).toEqual({ accessToken: "tok_a", expiresAt: null });
  });

  it("readConfigJson reads legacy plaintext JSON and flags it", async () => {
    const { readConfigJson } = await import("@/lib/integrations/config-storage");
    const result = readConfigJson<{ apiKey: string }>('{"apiKey":"plaintext"}');
    expect(result.wasLegacyPlaintext).toBe(true);
    expect(result.data.apiKey).toBe("plaintext");
  });

  it("readConfigJson throws when neither encrypted nor JSON parses", async () => {
    const { readConfigJson } = await import("@/lib/integrations/config-storage");
    expect(() => readConfigJson("garbage")).toThrow();
  });

  it("readAndUpgradeConfigJson re-encrypts legacy rows via writeBack", async () => {
    const { readAndUpgradeConfigJson } = await import("@/lib/integrations/config-storage");
    const writeBack = vi.fn(async () => undefined);
    const data = await readAndUpgradeConfigJson<{ apiKey: string }>({
      raw: '{"apiKey":"plaintext"}',
      connectionId: "ic_1",
      writeBack,
    });
    expect(data.apiKey).toBe("plaintext");
    expect(writeBack).toHaveBeenCalledTimes(1);
    const firstCall = writeBack.mock.calls[0] as unknown as [string];
    expect(firstCall[0]).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it("readAndUpgradeConfigJson does not write back already-encrypted rows", async () => {
    const { encryptConfigJson, readAndUpgradeConfigJson } = await import("@/lib/integrations/config-storage");
    const writeBack = vi.fn(async () => undefined);
    const encrypted = encryptConfigJson({ apiKey: "ok" });
    await readAndUpgradeConfigJson<{ apiKey: string }>({
      raw: encrypted,
      connectionId: "ic_1",
      writeBack,
    });
    expect(writeBack).not.toHaveBeenCalled();
  });

  it("readAndUpgradeConfigJson swallows writeBack failures", async () => {
    const { readAndUpgradeConfigJson } = await import("@/lib/integrations/config-storage");
    const writeBack = vi.fn(async () => {
      throw new Error("db down");
    });
    const data = await readAndUpgradeConfigJson<{ apiKey: string }>({
      raw: '{"apiKey":"plaintext"}',
      connectionId: "ic_1",
      writeBack,
    });
    expect(data.apiKey).toBe("plaintext");
  });
});
