/**
 * Sprint 20.2 P2 — zentrale Env-Config (Getter + opt-in Validierung).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { env, validateEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  it("liest process.env zur Zugriffszeit (stub-kompatibel)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
  });

  it("normalisiert leere Strings zu undefined", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("reflektiert Änderungen zwischen Zugriffen (keine Import-Zeit-Erfassung)", () => {
    vi.stubEnv("E2B_API_KEY", "first");
    expect(env.E2B_API_KEY).toBe("first");
    vi.stubEnv("E2B_API_KEY", "second");
    expect(env.E2B_API_KEY).toBe("second");
  });
});

describe("validateEnv", () => {
  const setAllRequired = () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("DIRECT_URL", "postgres://x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  };

  it("ist leer, wenn alle Pflicht-Vars gesetzt sind", () => {
    setAllRequired();
    expect(validateEnv()).toEqual([]);
  });

  it("meldet fehlende Pflicht-Vars", () => {
    setAllRequired();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const missing = validateEnv();
    expect(missing).toContain("DATABASE_URL");
    expect(missing).toContain("CLERK_SECRET_KEY");
    expect(missing).not.toContain("DIRECT_URL");
  });
});
