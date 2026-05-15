/**
 * Sprint 19.9 — locale config + resolver.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  resolveLocaleFromSignals,
} from "@/i18n/config";

describe("config constants", () => {
  it("supports de and en, defaults to de (DACH-Sales-Start)", () => {
    expect(SUPPORTED_LOCALES).toEqual(["de", "en"]);
    expect(DEFAULT_LOCALE).toBe("de");
  });

  it("uses 'kiln_locale' as the cookie name", () => {
    expect(LOCALE_COOKIE).toBe("kiln_locale");
  });

  it("cookie max-age is 1 year (60 * 60 * 24 * 365)", () => {
    expect(LOCALE_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });
});

describe("isSupportedLocale", () => {
  it("accepts de and en", () => {
    expect(isSupportedLocale("de")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
  });
  it("rejects unsupported locales", () => {
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("zh-CN")).toBe(false);
    expect(isSupportedLocale("DE")).toBe(false); // case-sensitive
  });
  it("rejects non-strings", () => {
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale(42)).toBe(false);
  });
});

describe("resolveLocaleFromSignals", () => {
  it("falls back to de when nothing matches", () => {
    expect(resolveLocaleFromSignals({})).toBe("de");
  });

  it("respects explicit override", () => {
    expect(resolveLocaleFromSignals({ override: "en" })).toBe("en");
    // Invalid override is ignored.
    expect(resolveLocaleFromSignals({ override: "fr" })).toBe("de");
  });

  it("user preference beats cookie + header", () => {
    expect(
      resolveLocaleFromSignals({
        userPreferredLanguage: "en",
        cookieValue: "de",
        acceptLanguage: "de-DE,de;q=0.9",
      }),
    ).toBe("en");
  });

  it("cookie beats Accept-Language when user is anonymous", () => {
    expect(
      resolveLocaleFromSignals({
        cookieValue: "en",
        acceptLanguage: "de-DE,de;q=0.9",
      }),
    ).toBe("en");
  });

  it("Accept-Language as last resort", () => {
    expect(
      resolveLocaleFromSignals({
        acceptLanguage: "en-US,en;q=0.9,de;q=0.8",
      }),
    ).toBe("en");
  });

  it("Accept-Language with unsupported primary falls through", () => {
    expect(
      resolveLocaleFromSignals({
        acceptLanguage: "fr-FR,fr;q=0.9,de;q=0.7",
      }),
    ).toBe("de"); // skips fr, finds de
  });

  it("Accept-Language with no supported tags returns default", () => {
    expect(
      resolveLocaleFromSignals({
        acceptLanguage: "fr-FR,it;q=0.9",
      }),
    ).toBe("de");
  });

  it("invalid signals are skipped, doesn't crash", () => {
    expect(
      resolveLocaleFromSignals({
        userPreferredLanguage: "fr",
        cookieValue: "es",
        acceptLanguage: "ja-JP",
      }),
    ).toBe("de");
  });
});
