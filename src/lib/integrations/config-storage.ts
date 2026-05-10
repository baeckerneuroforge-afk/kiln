import { decrypt, encrypt } from "@/lib/encryption";

/**
 * Storage helpers for IntegrationConnection.config — a single column that
 * may hold either the new AES-256-GCM encrypted format `iv:tag:ciphertext`
 * (all hex) or, for legacy rows written before Sprint 18, raw JSON.
 *
 * The write path always encrypts. The read path tries decrypt-first then
 * falls back to plaintext JSON for one release so existing connections
 * keep working without a backfill migration.
 */

const ENCRYPTED_FORMAT = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

/**
 * Returns true when the given string looks like our encryption envelope.
 * Used by callers that want to detect-and-rewrite legacy rows.
 */
export function isEncryptedConfig(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return ENCRYPTED_FORMAT.test(raw);
}

/**
 * Encrypt a config object for persistence. Always returns the encrypted
 * envelope — callers should not write plaintext.
 */
export function encryptConfigJson(config: unknown): string {
  return encrypt(JSON.stringify(config ?? {}));
}

export interface ReadConfigResult<T = unknown> {
  data: T;
  /** True when the row was stored as raw JSON (pre-Sprint-18). */
  wasLegacyPlaintext: boolean;
}

/**
 * Read an integration config column. Tries the encrypted envelope first
 * and falls back to plain JSON parse. Throws only when neither parse
 * succeeds.
 */
export function readConfigJson<T = Record<string, unknown>>(raw: string): ReadConfigResult<T> {
  if (isEncryptedConfig(raw)) {
    try {
      return { data: JSON.parse(decrypt(raw)) as T, wasLegacyPlaintext: false };
    } catch (err) {
      throw new Error(`Encrypted config could not be decrypted: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
  try {
    return { data: JSON.parse(raw) as T, wasLegacyPlaintext: true };
  } catch (err) {
    throw new Error(`Config could not be parsed: ${err instanceof Error ? err.message : "unknown"}`);
  }
}

/**
 * Convenience: read the config and immediately re-encrypt if it was a
 * plaintext legacy row. The returned data is identical either way.
 *
 * Pass a writeBack callback that persists the encrypted string for the
 * given connection id; the helper invokes it once per detected legacy row.
 */
export async function readAndUpgradeConfigJson<T = Record<string, unknown>>(args: {
  raw: string;
  connectionId: string;
  writeBack: (encrypted: string) => Promise<void>;
}): Promise<T> {
  const { data, wasLegacyPlaintext } = readConfigJson<T>(args.raw);
  if (wasLegacyPlaintext) {
    try {
      await args.writeBack(encryptConfigJson(data));
    } catch (err) {
      console.warn("[integration-config] lazy upgrade write-back failed", { connectionId: args.connectionId, err });
    }
  }
  return data;
}
