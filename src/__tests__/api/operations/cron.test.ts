import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAgencyOpsSnapshot = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/operations/aggregation", () => ({
  createAgencyOpsSnapshot: mockCreateAgencyOpsSnapshot,
}));

import { POST as refreshSnapshots } from "@/app/api/cron/refresh-ops-snapshot/route";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
});

describe("POST /api/cron/refresh-ops-snapshot", () => {
  it("rejects invalid cron secret when configured", async () => {
    process.env.CRON_SECRET = "secret";
    const res = await refreshSnapshots(new Request("https://x.test/api/cron/refresh-ops-snapshot", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("creates one snapshot per agency", async () => {
    process.env.CRON_SECRET = "secret";
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      { parentOrgId: "org_agency_1" },
      { parentOrgId: "org_agency_2" },
    ]);

    const res = await refreshSnapshots(
      new Request("https://x.test/api/cron/refresh-ops-snapshot", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.refreshed).toBe(2);
    expect(mockCreateAgencyOpsSnapshot).toHaveBeenCalledWith("org_agency_1");
    expect(mockCreateAgencyOpsSnapshot).toHaveBeenCalledWith("org_agency_2");
  });
});
