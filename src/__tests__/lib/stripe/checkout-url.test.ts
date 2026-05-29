/**
 * Sprint 20.2 — resolveSafeCheckoutUrl Open-Redirect-Schutz für
 * Stripe-Checkout-Return-URLs (White-Label-bewusst).
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

const mockListAgencyDomains = vi.hoisted(() => vi.fn());
vi.mock("@/lib/domains/agency-domain-manager", () => ({
  listAgencyDomains: mockListAgencyDomains,
}));

import { resolveSafeCheckoutUrl } from "@/lib/stripe/checkout-url";

const APP_URL = "https://app.kiln.test";
const ORG = "org_agency_1";
const FALLBACK = "https://app.kiln.test/onboarding/x/success";

beforeEach(() => {
  mockListAgencyDomains.mockReset();
  mockListAgencyDomains.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveSafeCheckoutUrl", () => {
  it("akzeptiert eine URL auf der App-Origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    const u = "https://app.kiln.test/onboarding/x/success";
    expect(await resolveSafeCheckoutUrl(u, ORG, FALLBACK)).toBe(u);
  });

  it("akzeptiert eine URL auf verifizierter (ACTIVE) Agency-Custom-Domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    mockListAgencyDomains.mockResolvedValue([
      { hostname: "billing.acme.com", status: "ACTIVE" },
    ]);
    const u = "https://billing.acme.com/danke";
    expect(await resolveSafeCheckoutUrl(u, ORG, FALLBACK)).toBe(u);
  });

  it("lehnt nicht-verifizierte (PENDING/FAILED) Custom-Domains ab", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    mockListAgencyDomains.mockResolvedValue([
      { hostname: "pending.acme.com", status: "PENDING" },
      { hostname: "failed.acme.com", status: "FAILED" },
    ]);
    expect(await resolveSafeCheckoutUrl("https://pending.acme.com/x", ORG, FALLBACK)).toBe(FALLBACK);
    expect(await resolveSafeCheckoutUrl("https://failed.acme.com/x", ORG, FALLBACK)).toBe(FALLBACK);
  });

  it("lehnt fremde Domains ab → Fallback", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    mockListAgencyDomains.mockResolvedValue([{ hostname: "billing.acme.com", status: "ACTIVE" }]);
    expect(await resolveSafeCheckoutUrl("https://evil.com/x", ORG, FALLBACK)).toBe(FALLBACK);
  });

  it("lehnt userinfo-Bypass (…@evil.com) ab", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(await resolveSafeCheckoutUrl("https://app.kiln.test@evil.com/x", ORG, FALLBACK)).toBe(FALLBACK);
  });

  it("lehnt javascript:-URLs ab", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(await resolveSafeCheckoutUrl("javascript:alert(1)", ORG, FALLBACK)).toBe(FALLBACK);
  });

  it("nutzt Fallback bei leerem/ungültigem Input", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(await resolveSafeCheckoutUrl("", ORG, FALLBACK)).toBe(FALLBACK);
    expect(await resolveSafeCheckoutUrl(undefined, ORG, FALLBACK)).toBe(FALLBACK);
    expect(await resolveSafeCheckoutUrl(null, ORG, FALLBACK)).toBe(FALLBACK);
    expect(await resolveSafeCheckoutUrl("not a url", ORG, FALLBACK)).toBe(FALLBACK);
  });

  it("fail-safe bei Domain-Lookup-Fehler: App-Origin bleibt erlaubt, Custom abgelehnt", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    mockListAgencyDomains.mockRejectedValue(new Error("db down"));
    expect(await resolveSafeCheckoutUrl("https://app.kiln.test/ok", ORG, FALLBACK)).toBe(
      "https://app.kiln.test/ok",
    );
    expect(await resolveSafeCheckoutUrl("https://billing.acme.com/x", ORG, FALLBACK)).toBe(FALLBACK);
  });

  it("lehnt localhost in Production ab", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    vi.stubEnv("NODE_ENV", "production");
    expect(await resolveSafeCheckoutUrl("http://localhost:3000/x", ORG, FALLBACK)).toBe(FALLBACK);
  });
});
