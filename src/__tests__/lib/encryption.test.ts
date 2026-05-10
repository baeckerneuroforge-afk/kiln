import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  // Set a deterministic 32-byte hex key for the encryption helper.
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

describe("encryption helper", () => {
  it("roundtrip returns original plaintext", async () => {
    const { encrypt, decrypt } = await import("@/lib/encryption");
    const plaintext = "hello kiln world";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces a different ciphertext on each call (random IV)", async () => {
    const { encrypt } = await import("@/lib/encryption");
    const a = encrypt("payload");
    const b = encrypt("payload");
    expect(a).not.toBe(b);
  });

  it("ciphertext format is iv:tag:body (3 hex parts)", async () => {
    const { encrypt } = await import("@/lib/encryption");
    const ciphertext = encrypt("anything");
    const parts = ciphertext.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it("tampered ciphertext throws on decrypt (auth-tag verification)", async () => {
    const { encrypt, decrypt } = await import("@/lib/encryption");
    const ciphertext = encrypt("secret");
    const parts = ciphertext.split(":");
    const tamperedBody = parts[2].replace(/.$/, parts[2].endsWith("0") ? "1" : "0");
    const tampered = `${parts[0]}:${parts[1]}:${tamperedBody}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("empty string roundtrips", async () => {
    const { encrypt, decrypt } = await import("@/lib/encryption");
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("large 10 KB string roundtrips", async () => {
    const { encrypt, decrypt } = await import("@/lib/encryption");
    const big = "x".repeat(10_000);
    expect(decrypt(encrypt(big))).toBe(big);
  });

  it("invalid format throws on decrypt", async () => {
    const { decrypt } = await import("@/lib/encryption");
    expect(() => decrypt("not:a:valid:ciphertext:envelope")).toThrow();
    expect(() => decrypt("plaintext")).toThrow();
  });
});
