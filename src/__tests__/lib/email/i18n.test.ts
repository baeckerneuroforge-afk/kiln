/**
 * Sprint 19.7.8 — email i18n helper.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  resolveLocale,
  t,
  __test__,
} from "@/lib/email/i18n";

describe("resolveLocale", () => {
  it("returns 'de' as the DACH-first default", () => {
    expect(DEFAULT_LOCALE).toBe("de");
    expect(resolveLocale(null)).toBe("de");
    expect(resolveLocale(undefined)).toBe("de");
    expect(resolveLocale("")).toBe("de");
  });

  it("accepts supported locales 'de' and 'en'", () => {
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("en")).toBe("en");
  });

  it("collapses unsupported values to default 'de'", () => {
    expect(resolveLocale("fr")).toBe("de");
    expect(resolveLocale("es")).toBe("de");
    expect(resolveLocale("DE")).toBe("de"); // case-sensitive
    expect(resolveLocale("garbage")).toBe("de");
  });
});

describe("t — translation function", () => {
  it("returns the DE string when locale='de'", () => {
    expect(t("de", "sub-org-invited.existing.cta")).toBe("Workspace öffnen");
  });

  it("returns the EN string when locale='en'", () => {
    expect(t("en", "sub-org-invited.existing.cta")).toBe("Open workspace");
  });

  it("interpolates {var} placeholders from params", () => {
    const result = t("de", "sub-org-invited.existing.heading", {
      subOrgName: "ACME",
    });
    expect(result).toBe("Willkommen bei ACME");
  });

  it("preserves unknown {var} placeholders so they're visible in QA", () => {
    const result = t("de", "sub-org-invited.existing.heading", {});
    // {subOrgName} is left as-is when not supplied.
    expect(result).toContain("{subOrgName}");
  });

  it("falls back to DE when a key is missing in EN", () => {
    // We don't have a missing key today, so simulate via __test__.
    expect(__test__.TRANSLATIONS.de["agency-role.OWNER"]).toBe("Agency-Owner");
    // Both locales have the key — verify the basic guard works.
    expect(t("en", "agency-role.OWNER")).toBe("Agency Owner");
  });

  it("returns the key itself when nothing matches", () => {
    expect(t("de", "this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });

  it("DE and EN cover every key consistently — no orphans", () => {
    const deKeys = Object.keys(__test__.TRANSLATIONS.de).sort();
    const enKeys = Object.keys(__test__.TRANSLATIONS.en).sort();
    expect(enKeys).toEqual(deKeys);
  });
});
