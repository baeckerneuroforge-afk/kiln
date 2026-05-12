/**
 * Sprint 19.7.5 — getAgencyUsage aggregates per-sub-org LlmUsage +
 * Conversation counts.
 */
import { describe, expect, it, vi } from "vitest";
import {
  getAgencyUsage,
  toCsv,
  type AgencyUsage,
} from "@/lib/agency/get-agency-usage";

function makePrisma(opts: {
  relationships?: Array<{ id: string; childOrgId: string; subOrgName: string; subOrgStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED" }>;
  usage?: Array<{
    orgId: string;
    _count: { _all: number };
    _sum: { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; costUsd: number | null };
  }>;
  conversations?: Array<{ orgId: string; _count: { _all: number } }>;
}) {
  return {
    orgRelationship: {
      findMany: vi.fn().mockResolvedValue(opts.relationships ?? []),
    },
    llmUsage: {
      groupBy: vi.fn().mockResolvedValue(opts.usage ?? []),
    },
    conversation: {
      groupBy: vi.fn().mockResolvedValue(opts.conversations ?? []),
    },
  } as unknown as Parameters<typeof getAgencyUsage>[1];
}

describe("getAgencyUsage", () => {
  it("returns zeroed totals when the agency has no sub-orgs", async () => {
    const out = await getAgencyUsage(
      { agencyOrgId: "org_agency", period: "month" },
      makePrisma({}),
    );
    expect(out.perSubOrg).toEqual([]);
    expect(out.totals.conversationCount).toBe(0);
    expect(out.totals.costUsd).toBe(0);
  });

  it("joins llmUsage rows + conversation counts onto each sub-org", async () => {
    const out = await getAgencyUsage(
      { agencyOrgId: "org_agency", period: "month" },
      makePrisma({
        relationships: [
          { id: "sub_1", childOrgId: "child_1", subOrgName: "Acme", subOrgStatus: "ACTIVE" },
          { id: "sub_2", childOrgId: "child_2", subOrgName: "Beta", subOrgStatus: "ACTIVE" },
        ],
        usage: [
          {
            orgId: "child_1",
            _count: { _all: 50 },
            _sum: { inputTokens: 1000, outputTokens: 200, cachedInputTokens: 80, costUsd: 0.42 },
          },
        ],
        conversations: [{ orgId: "child_1", _count: { _all: 7 } }],
      }),
    );

    expect(out.perSubOrg).toHaveLength(2);
    const acme = out.perSubOrg.find((r) => r.subOrgId === "sub_1")!;
    expect(acme.llmCalls).toBe(50);
    expect(acme.conversationCount).toBe(7);
    expect(acme.costUsd).toBeCloseTo(0.42);
    const beta = out.perSubOrg.find((r) => r.subOrgId === "sub_2")!;
    expect(beta.llmCalls).toBe(0);
    expect(beta.costUsd).toBe(0);

    expect(out.totals.llmCalls).toBe(50);
    expect(out.totals.conversationCount).toBe(7);
  });

  it("includes archived sub-orgs (historical spend stays visible)", async () => {
    const out = await getAgencyUsage(
      { agencyOrgId: "org_agency", period: "week" },
      makePrisma({
        relationships: [
          { id: "sub_dead", childOrgId: "child_dead", subOrgName: "Old", subOrgStatus: "ARCHIVED" },
        ],
      }),
    );
    expect(out.perSubOrg).toHaveLength(1);
    expect(out.perSubOrg[0].subOrgStatus).toBe("ARCHIVED");
  });

  it("honours an explicit custom since/until window", async () => {
    const since = new Date("2026-03-01T00:00:00Z");
    const until = new Date("2026-03-10T00:00:00Z");
    const out = await getAgencyUsage(
      { agencyOrgId: "org_agency", since, until },
      makePrisma({ relationships: [] }),
    );
    expect(out.period).toBe("custom");
    expect(out.since).toEqual(since);
    expect(out.until).toEqual(until);
  });

  it("treats a week period as a 7-day window", async () => {
    const out = await getAgencyUsage(
      { agencyOrgId: "org_agency", period: "week" },
      makePrisma({ relationships: [] }),
    );
    const diffDays = (out.until.getTime() - out.since.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(diffDays)).toBe(7);
  });
});

describe("toCsv", () => {
  it("renders a header row + one row per sub-org", () => {
    const usage: AgencyUsage = {
      period: "month",
      since: new Date(),
      until: new Date(),
      totals: {
        conversationCount: 0,
        llmCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costUsd: 0,
      },
      perSubOrg: [
        {
          subOrgId: "sub_1",
          clerkOrgId: "child_1",
          subOrgName: 'Acme "Test"',
          subOrgStatus: "ACTIVE",
          conversationCount: 3,
          llmCalls: 5,
          inputTokens: 100,
          outputTokens: 50,
          cachedInputTokens: 10,
          costUsd: 1.234567,
        },
      ],
    };
    const csv = toCsv(usage);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Sub-Org");
    expect(lines[0]).toContain("Kosten (USD)");
    // Quotes in the name get doubled per RFC 4180.
    expect(lines[1]).toContain('"Acme ""Test"""');
    expect(lines[1]).toContain("1.234567");
  });
});
