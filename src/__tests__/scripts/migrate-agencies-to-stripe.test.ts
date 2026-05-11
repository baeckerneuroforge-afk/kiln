import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { groupBy: vi.fn() },
  agencyPlatformSubscription: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findFirst: vi.fn() },
}));

const mockStripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  subscriptions: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => mockStripe }));

const ORIGINAL_ENV = process.env.STRIPE_PRICE_TIER_STARTER;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_TIER_STARTER = "price_starter_test";
  mockPrisma.orgRelationship.groupBy.mockResolvedValue([
    { parentOrgId: "org_andre", _count: { id: 2 } },
    { parentOrgId: "org_kdnw", _count: { id: 1 } },
  ]);
  mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValue(null);
  mockPrisma.user.findFirst.mockResolvedValue({ email: "andre@example.com", companyName: "Hephaistos" });
  mockStripe.customers.create.mockResolvedValue({ id: "cus_new" });
  mockStripe.subscriptions.create.mockResolvedValue({
    id: "sub_new",
    status: "trialing",
    trial_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
    cancel_at_period_end: false,
    items: { data: [{ id: "si_tier", current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }] },
  });
  mockPrisma.agencyPlatformSubscription.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
    id: "aps_new",
    ...create,
  }));
});

afterEach(() => {
  process.env.STRIPE_PRICE_TIER_STARTER = ORIGINAL_ENV;
});

describe("parseCliOptions", () => {
  it("defaults to tier=starter, trialDays=30, no orgs restriction", async () => {
    const { parseCliOptions } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    expect(parseCliOptions([])).toEqual({ tier: "starter", dryRun: false, trialDays: 30, orgIds: null });
  });

  it("parses --tier, --dry-run, --trial-days, and --orgs", async () => {
    const { parseCliOptions } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const options = parseCliOptions([
      "--tier=agency_pro",
      "--dry-run",
      "--trial-days=14",
      "--orgs=org_a,org_b",
    ]);
    expect(options).toEqual({
      tier: "agency_pro",
      dryRun: true,
      trialDays: 14,
      orgIds: ["org_a", "org_b"],
    });
  });

  it("throws on invalid --tier", async () => {
    const { parseCliOptions } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    expect(() => parseCliOptions(["--tier=garbage"])).toThrow(/Invalid --tier/);
  });

  it("throws on negative --trial-days", async () => {
    const { parseCliOptions } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    expect(() => parseCliOptions(["--trial-days=-5"])).toThrow(/Invalid --trial-days/);
  });
});

describe("findAgencyOrgs", () => {
  it("returns orgs with at least one OrgRelationship", async () => {
    const { findAgencyOrgs } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const orgs = await findAgencyOrgs(null);
    expect(orgs.map((a) => a.orgId)).toEqual(["org_andre", "org_kdnw"]);
  });

  it("filters by passed-in orgIds when provided", async () => {
    const { findAgencyOrgs } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    mockPrisma.orgRelationship.groupBy.mockResolvedValueOnce([{ parentOrgId: "org_andre", _count: { id: 1 } }]);
    await findAgencyOrgs(["org_andre"]);
    expect(mockPrisma.orgRelationship.groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { parentOrgId: { in: ["org_andre"] } } }),
    );
  });
});

describe("migrateAgency", () => {
  it("returns skipped/missing_tier_price_env when env var is unset", async () => {
    delete process.env.STRIPE_PRICE_TIER_STARTER;
    const { migrateAgency } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const result = await migrateAgency({ orgId: "org_a", tier: "starter", trialDays: 30, dryRun: false });
    expect(result).toEqual({ orgId: "org_a", action: "skipped", reason: "missing_tier_price_env" });
  });

  it("dry-run does not call Stripe", async () => {
    const { migrateAgency } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const result = await migrateAgency({ orgId: "org_a", tier: "starter", trialDays: 30, dryRun: true });
    expect(result.action).toBe("created");
    expect(result.reason).toBe("dry-run");
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("happy path: creates customer + subscription + DB row", async () => {
    const { migrateAgency } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const result = await migrateAgency({ orgId: "org_andre", tier: "starter", trialDays: 30, dryRun: false });
    expect(result.action).toBe("created");
    expect(result.stripeCustomerId).toBe("cus_new");
    expect(result.stripeSubscriptionId).toBe("sub_new");
    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "andre@example.com",
        metadata: expect.objectContaining({ kiln_agency_org_id: "org_andre", kiln_created_by: "migration" }),
      }),
    );
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_new",
        items: [{ price: "price_starter_test" }],
        trial_end: expect.any(Number),
      }),
    );
    expect(mockPrisma.agencyPlatformSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org_andre" },
        create: expect.objectContaining({
          tier: "starter",
          stripeCustomerId: "cus_new",
          stripeSubscriptionId: "sub_new",
          createdSource: "migration",
        }),
      }),
    );
  });

  it("idempotent — skipped when row already has subscription id", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: "sub_existing",
      status: "active",
    });
    const { migrateAgency } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const result = await migrateAgency({ orgId: "org_andre", tier: "starter", trialDays: 30, dryRun: false });
    expect(result.action).toBe("skipped");
    expect(result.reason).toBe("already_has_subscription");
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("reuses an existing customer id when the row is partial (no subscription yet)", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeCustomerId: "cus_partial",
      stripeSubscriptionId: null,
      status: "incomplete",
    });
    const { migrateAgency } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    await migrateAgency({ orgId: "org_andre", tier: "starter", trialDays: 30, dryRun: false });
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_partial" }),
    );
  });

  it("skips trial_end when trialDays is zero", async () => {
    const { migrateAgency } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    await migrateAgency({ orgId: "org_andre", tier: "starter", trialDays: 0, dryRun: false });
    const args = mockStripe.subscriptions.create.mock.calls[0]?.[0];
    expect(args?.trial_end).toBeUndefined();
  });

  it("returns failed on Stripe error", async () => {
    mockStripe.customers.create.mockRejectedValueOnce(new Error("Stripe API outage"));
    const { migrateAgency } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const result = await migrateAgency({ orgId: "org_andre", tier: "starter", trialDays: 30, dryRun: false });
    expect(result.action).toBe("failed");
    expect(result.error).toContain("Stripe API outage");
  });
});

describe("runMigration end-to-end", () => {
  it("processes every discovered agency org once", async () => {
    const { runMigration } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const results = await runMigration({ tier: "starter", trialDays: 30, dryRun: false, orgIds: null });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.orgId)).toEqual(["org_andre", "org_kdnw"]);
  });

  it("one agency's failure does not stop the others", async () => {
    mockStripe.customers.create
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce({ id: "cus_kdnw" });
    const { runMigration } = await import("../../../scripts/migrate-existing-agencies-to-stripe");
    const results = await runMigration({ tier: "starter", trialDays: 30, dryRun: false, orgIds: null });
    expect(results[0].action).toBe("failed");
    expect(results[1].action).toBe("created");
  });
});
