/**
 * Sprint 19.7.5 — GET /api/agency/usage (JSON + CSV).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetAgencyUsage = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/agency/get-agency-usage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getAgencyUsage: mockGetAgencyUsage };
});

import { GET as usageGET } from "@/app/api/agency/usage/route";

beforeEach(() => {
  mockAuth.mockReset();
  mockGetAgencyUsage.mockReset();
});

function makeReq(qs: string = "") {
  return new Request(`http://localhost/api/agency/usage${qs}`);
}

describe("GET /api/agency/usage", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await usageGET(makeReq());
    expect(res.status).toBe(401);
  });

  it("400 when no active org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: null });
    const res = await usageGET(makeReq());
    expect(res.status).toBe(400);
  });

  it("returns JSON for the requested period", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockGetAgencyUsage.mockResolvedValueOnce({
      period: "week",
      since: new Date(),
      until: new Date(),
      totals: {
        conversationCount: 1,
        llmCalls: 2,
        inputTokens: 3,
        outputTokens: 4,
        cachedInputTokens: 5,
        costUsd: 0,
      },
      perSubOrg: [],
    });
    const res = await usageGET(makeReq("?period=week"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("week");
    expect(mockGetAgencyUsage.mock.calls[0][0].period).toBe("week");
  });

  it("falls back to month when the period token is unknown", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockGetAgencyUsage.mockResolvedValueOnce({
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
      perSubOrg: [],
    });
    await usageGET(makeReq("?period=year"));
    expect(mockGetAgencyUsage.mock.calls[0][0].period).toBe("month");
  });

  it("forwards a custom since/until window through to the helper", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockGetAgencyUsage.mockResolvedValueOnce({
      period: "custom",
      since: new Date("2026-03-01T00:00:00Z"),
      until: new Date("2026-03-10T00:00:00Z"),
      totals: {
        conversationCount: 0,
        llmCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costUsd: 0,
      },
      perSubOrg: [],
    });
    await usageGET(makeReq("?since=2026-03-01T00:00:00Z&until=2026-03-10T00:00:00Z"));
    expect(mockGetAgencyUsage.mock.calls[0][0]).toMatchObject({
      period: "custom",
      since: new Date("2026-03-01T00:00:00Z"),
      until: new Date("2026-03-10T00:00:00Z"),
    });
  });

  it("returns CSV when format=csv", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockGetAgencyUsage.mockResolvedValueOnce({
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
      perSubOrg: [],
    });
    const res = await usageGET(makeReq("?format=csv"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text.split("\n")[0]).toContain("Sub-Org");
  });
});
