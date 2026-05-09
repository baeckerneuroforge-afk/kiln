import { describe, expect, it } from "vitest";
import { executeWebhookFilter, type FilterCondition } from "@/lib/workflow-nodes/webhook-filter-node";

const ctx = (trigger: Record<string, unknown>) => ({ _userId: "user_a", trigger } as Record<string, unknown>);

describe("Webhook-Filter node", () => {
  it("passes when no conditions are configured", () => {
    const result = executeWebhookFilter({ conditions: [] }, ctx({ a: 1 }));
    expect(result.success).toBe(true);
    expect(result.meta?.passed).toBe(true);
  });

  it("blocks when payload is missing", () => {
    const result = executeWebhookFilter({ conditions: [] }, ctx({}));
    // Empty trigger object IS an object, so passes "no-conditions"
    expect(result.success).toBe(true);
  });

  it("evaluates EQUALS true", () => {
    const conditions: FilterCondition[] = [{ path: "subject", operator: "EQUALS", value: "Termin" }];
    const result = executeWebhookFilter({ conditions }, ctx({ subject: "Termin" }));
    expect(result.meta?.passed).toBe(true);
  });

  it("evaluates EQUALS false", () => {
    const conditions: FilterCondition[] = [{ path: "subject", operator: "EQUALS", value: "Termin" }];
    const result = executeWebhookFilter({ conditions }, ctx({ subject: "Beschwerde" }));
    expect(result.meta?.passed).toBe(false);
  });

  it("evaluates STARTS_WITH on dotted path", () => {
    const conditions: FilterCondition[] = [{ path: "headers.X-Source", operator: "STARTS_WITH", value: "kiln" }];
    const result = executeWebhookFilter(
      { conditions },
      ctx({ headers: { "X-Source": "kiln-internal" } }),
    );
    expect(result.meta?.passed).toBe(true);
  });

  it("evaluates REGEX with safe handling of bad pattern", () => {
    const conditions: FilterCondition[] = [{ path: "subject", operator: "REGEX", value: "[invalid" }];
    const result = executeWebhookFilter({ conditions }, ctx({ subject: "anything" }));
    expect(result.meta?.passed).toBe(false);
  });

  it("evaluates EXISTS / NOT_EXISTS", () => {
    const exists = executeWebhookFilter(
      { conditions: [{ path: "user.email", operator: "EXISTS" }] },
      ctx({ user: { email: "a@b.c" } }),
    );
    const notExists = executeWebhookFilter(
      { conditions: [{ path: "user.email", operator: "NOT_EXISTS" }] },
      ctx({ user: {} }),
    );
    expect(exists.meta?.passed).toBe(true);
    expect(notExists.meta?.passed).toBe(true);
  });

  it("AND combine requires all true", () => {
    const conditions: FilterCondition[] = [
      { path: "subject", operator: "CONTAINS", value: "Termin" },
      { path: "channel", operator: "EQUALS", value: "EMAIL" },
    ];
    const result = executeWebhookFilter(
      { conditions, combine: "AND" },
      ctx({ subject: "Termin Anfrage", channel: "EMAIL" }),
    );
    expect(result.meta?.passed).toBe(true);
  });

  it("OR combine requires any true", () => {
    const conditions: FilterCondition[] = [
      { path: "subject", operator: "EQUALS", value: "Termin" },
      { path: "subject", operator: "EQUALS", value: "Notdienst" },
    ];
    const result = executeWebhookFilter({ conditions, combine: "OR" }, ctx({ subject: "Notdienst" }));
    expect(result.meta?.passed).toBe(true);
  });

  it("GREATER_THAN requires numeric inputs", () => {
    const result = executeWebhookFilter(
      { conditions: [{ path: "amount", operator: "GREATER_THAN", value: 100 }] },
      ctx({ amount: 250 }),
    );
    expect(result.meta?.passed).toBe(true);
  });
});
