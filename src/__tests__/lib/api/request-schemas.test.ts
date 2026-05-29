/**
 * Sprint 20.2 P2 — Zod request schemas + validateBody helper.
 *
 * Stellt sicher, dass (a) gültige Requests akzeptiert werden, (b) ungültige
 * Enums/fehlende Pflichtfelder als 400 enden und (c) `.passthrough()`
 * unbekannte Felder erhält (keine bestehenden Clients brechen).
 */
import { describe, expect, it } from "vitest";
import { validateBody } from "@/lib/api/validate-body";
import {
  agentCreateSchema,
  agentUpdateSchema,
  teamCreateSchema,
  integrationCreateSchema,
  customerIdentifySchema,
  knowledgeCreateSchema,
} from "@/lib/api/request-schemas";

describe("validateBody", () => {
  it("liefert ok=true + Daten bei gültigem Body", () => {
    const r = validateBody(integrationCreateSchema, { provider: "slack", name: "X" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.provider).toBe("slack");
  });

  it("liefert ok=false + 400-Response bei ungültigem Body", async () => {
    const r = validateBody(integrationCreateSchema, { name: "X" }); // provider fehlt
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const json = await r.response.json();
      expect(json.error).toBe("Validation failed");
      expect(json.details).toBeTruthy();
    }
  });
});

describe("agentCreateSchema", () => {
  const valid = { name: "Bot", slug: "bot", systemPrompt: "Be helpful" };

  it("akzeptiert gültige Pflichtfelder", () => {
    expect(agentCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("lehnt fehlende Pflichtfelder ab", () => {
    expect(agentCreateSchema.safeParse({ slug: "bot", systemPrompt: "x" }).success).toBe(false);
    expect(agentCreateSchema.safeParse({ name: "", slug: "bot", systemPrompt: "x" }).success).toBe(false);
  });

  it("lehnt ungültige Enum-Werte ab (vorher DB-500)", () => {
    expect(agentCreateSchema.safeParse({ ...valid, mode: "NOPE" }).success).toBe(false);
    expect(agentCreateSchema.safeParse({ ...valid, modelProvider: "FOO" }).success).toBe(false);
  });

  it("akzeptiert gültige Enums + Legacy-Aliase", () => {
    expect(agentCreateSchema.safeParse({ ...valid, mode: "TASK" }).success).toBe(true);
    expect(agentCreateSchema.safeParse({ ...valid, agentMode: "CHAT" }).success).toBe(true);
    expect(agentCreateSchema.safeParse({ ...valid, agentType: "INTERNAL" }).success).toBe(true);
  });

  it("erhält unbekannte Felder (passthrough)", () => {
    const parsed = agentCreateSchema.parse({
      ...valid,
      personality: { tone: "warm" },
      triggerConfig: { cron: "0 9 * * *" },
      suggestedQuestions: ["a", "b"],
      customFutureField: 123,
    });
    expect(parsed.personality).toEqual({ tone: "warm" });
    expect(parsed.triggerConfig).toEqual({ cron: "0 9 * * *" });
    expect((parsed as Record<string, unknown>).customFutureField).toBe(123);
  });
});

describe("agentUpdateSchema", () => {
  it("akzeptiert leeren Body (alle Felder optional)", () => {
    expect(agentUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("lehnt ungültigen status ab, akzeptiert gültigen", () => {
    expect(agentUpdateSchema.safeParse({ status: "GONE" }).success).toBe(false);
    expect(agentUpdateSchema.safeParse({ status: "LIVE" }).success).toBe(true);
  });

  it("erhält unbekannte Felder (passthrough, da PATCH ins Prisma spreaded)", () => {
    const parsed = agentUpdateSchema.parse({ whiteLabel: { customCss: ".x{}" }, foo: 1 });
    expect(parsed.whiteLabel).toEqual({ customCss: ".x{}" });
    expect((parsed as Record<string, unknown>).foo).toBe(1);
  });
});

describe("teamCreateSchema", () => {
  it("akzeptiert name-only oder template-only", () => {
    expect(teamCreateSchema.safeParse({ name: "Team" }).success).toBe(true);
    expect(teamCreateSchema.safeParse({ template: "support" }).success).toBe(true);
  });

  it("lehnt ab, wenn weder name noch template gesetzt ist", () => {
    expect(teamCreateSchema.safeParse({ description: "x" }).success).toBe(false);
  });
});

describe("integrationCreateSchema", () => {
  it("erhält das config-Objekt (passthrough)", () => {
    const parsed = integrationCreateSchema.parse({
      provider: "slack",
      name: "X",
      config: { token: "abc", nested: { a: 1 } },
    });
    expect(parsed.config).toEqual({ token: "abc", nested: { a: 1 } });
  });
});

describe("customerIdentifySchema", () => {
  it("akzeptiert leeren Body und Teilangaben", () => {
    expect(customerIdentifySchema.safeParse({}).success).toBe(true);
    expect(customerIdentifySchema.safeParse({ email: "a@b.de" }).success).toBe(true);
  });
});

describe("knowledgeCreateSchema", () => {
  it("akzeptiert gültigen type, lehnt ungültigen ab", () => {
    expect(knowledgeCreateSchema.safeParse({ type: "URL", url: "https://x.de" }).success).toBe(true);
    expect(knowledgeCreateSchema.safeParse({ type: "url" }).success).toBe(false); // lowercase
  });

  it("akzeptiert FAQ-pairs", () => {
    expect(
      knowledgeCreateSchema.safeParse({
        type: "FAQ",
        pairs: [{ question: "q", answer: "a" }],
      }).success,
    ).toBe(true);
  });
});
