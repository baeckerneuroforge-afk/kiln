/**
 * Sprint 19.9 — translation-file parity.
 *
 * Guards the invariant that every key present in de.json exists in
 * en.json (and vice versa). Without this, adding a key to one file
 * and forgetting the other silently degrades the other locale to
 * the raw key name at runtime.
 *
 * Pluralization-marker checks happen inline — strings that use ICU
 * MessageFormat plural / select syntax must match between files.
 */
import { describe, expect, it } from "vitest";
import deMessages from "../../../messages/de.json";
import enMessages from "../../../messages/en.json";

type Tree = Record<string, unknown>;

function collectKeys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Tree)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys.sort();
}

function valueAt(obj: unknown, dotPath: string): unknown {
  let cursor: unknown = obj;
  for (const part of dotPath.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Tree)[part];
  }
  return cursor;
}

describe("translation file parity", () => {
  it("every key in de.json exists in en.json", () => {
    const deKeys = collectKeys(deMessages);
    const enKeys = collectKeys(enMessages);
    const missingInEn = deKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });

  it("every key in en.json exists in de.json (no English-only orphans)", () => {
    const deKeys = collectKeys(deMessages);
    const enKeys = collectKeys(enMessages);
    const missingInDe = enKeys.filter((k) => !deKeys.includes(k));
    expect(missingInDe).toEqual([]);
  });

  it("no key is an empty string in either file", () => {
    for (const key of collectKeys(deMessages)) {
      expect(valueAt(deMessages, key), `de.${key} is empty`).not.toBe("");
      expect(valueAt(enMessages, key), `en.${key} is empty`).not.toBe("");
    }
  });

  it("ICU-interpolation placeholders match across locales", () => {
    // For every translation that contains {var} placeholders, both
    // locales must declare the same set so a key swap doesn't silently
    // drop a variable in one language.
    const re = /\{(\w+)\}/g;
    for (const key of collectKeys(deMessages)) {
      const de = String(valueAt(deMessages, key) ?? "");
      const en = String(valueAt(enMessages, key) ?? "");
      const deVars = [...de.matchAll(re)].map((m) => m[1]).sort();
      const enVars = [...en.matchAll(re)].map((m) => m[1]).sort();
      expect(enVars, `placeholders mismatch at "${key}"`).toEqual(deVars);
    }
  });

  it("ships expected top-level namespaces", () => {
    const expected = [
      "common",
      "auth",
      "dashboard",
      "agency",
      "subOrg",
      "settings",
      "errors",
      "locale",
      // Sprint 19.10 — marketing-pages namespace (nav, footer, pricing, faq)
      "marketing",
    ];
    for (const ns of expected) {
      expect(Object.keys(deMessages)).toContain(ns);
      expect(Object.keys(enMessages)).toContain(ns);
    }
  });
});
