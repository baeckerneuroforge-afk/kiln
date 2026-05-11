import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  subAccountModuleConfig: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  agencyPlatformSubscription: {
    findUnique: vi.fn(async () => null),
  },
  auditLog: { create: vi.fn() },
}));

const mockStripe = vi.hoisted(() => ({
  subscriptionItems: {
    create: vi.fn<(args: { subscription: string; price: string; metadata?: Record<string, string> }) => Promise<{ id: string }>>(),
    del: vi.fn<(id: string) => Promise<void>>(),
  },
}));

const mockGetStripe = vi.hoisted(() => vi.fn(() => mockStripe));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/stripe", () => ({ getStripe: mockGetStripe }));

import {
  MODULE_PRICE_EUR,
  addModuleSubscriptionItem,
  calculateMonthlyModuleCost,
  getStripePriceIdForModule,
  isBillingActivated,
  reconcileModuleBilling,
  removeModuleSubscriptionItem,
} from "@/lib/billing/module-billing";

const ORIGINAL_ENV = {
  ai: process.env.STRIPE_PRICE_AI_MODULE,
  sms: process.env.STRIPE_PRICE_SMS_MODULE,
  voice: process.env.STRIPE_PRICE_VOICE_MODULE,
  whatsapp: process.env.STRIPE_PRICE_WHATSAPP_MODULE,
};

function clearAllPriceEnv() {
  delete process.env.STRIPE_PRICE_AI_MODULE;
  delete process.env.STRIPE_PRICE_SMS_MODULE;
  delete process.env.STRIPE_PRICE_VOICE_MODULE;
  delete process.env.STRIPE_PRICE_WHATSAPP_MODULE;
}

function setAllPriceEnv() {
  process.env.STRIPE_PRICE_AI_MODULE = "price_ai";
  process.env.STRIPE_PRICE_SMS_MODULE = "price_sms";
  process.env.STRIPE_PRICE_VOICE_MODULE = "price_voice";
  process.env.STRIPE_PRICE_WHATSAPP_MODULE = "price_whatsapp";
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAllPriceEnv();
  mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValue({ stripeSubscriptionItemId: null });
  mockPrisma.subAccountModuleConfig.findMany.mockResolvedValue([]);
  mockPrisma.subAccountModuleConfig.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

afterEach(() => {
  process.env.STRIPE_PRICE_AI_MODULE = ORIGINAL_ENV.ai;
  process.env.STRIPE_PRICE_SMS_MODULE = ORIGINAL_ENV.sms;
  process.env.STRIPE_PRICE_VOICE_MODULE = ORIGINAL_ENV.voice;
  process.env.STRIPE_PRICE_WHATSAPP_MODULE = ORIGINAL_ENV.whatsapp;
});

describe("getStripePriceIdForModule", () => {
  it("returns null when env var is missing", () => {
    expect(getStripePriceIdForModule("ai")).toBeNull();
  });

  it("returns the trimmed env value when set", () => {
    process.env.STRIPE_PRICE_AI_MODULE = "  price_abc  ";
    expect(getStripePriceIdForModule("ai")).toBe("price_abc");
  });

  it("returns null when env var is whitespace only", () => {
    process.env.STRIPE_PRICE_VOICE_MODULE = "   ";
    expect(getStripePriceIdForModule("voice")).toBeNull();
  });
});

describe("isBillingActivated", () => {
  it("returns false when any env var is missing", () => {
    process.env.STRIPE_PRICE_AI_MODULE = "price_x";
    process.env.STRIPE_PRICE_SMS_MODULE = "price_x";
    // voice + whatsapp left unset
    expect(isBillingActivated()).toBe(false);
  });

  it("returns true only when all four env vars are set", () => {
    setAllPriceEnv();
    expect(isBillingActivated()).toBe(true);
  });
});

describe("addModuleSubscriptionItem — skip paths", () => {
  it("skips with billing_disabled when enabled=false", async () => {
    setAllPriceEnv();
    const result = await addModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
      stripeSubscriptionId: "sub_existing",
      enabled: false,
    });
    expect(result).toEqual({ ok: true, skipped: true, reason: "billing_disabled" });
    expect(mockStripe.subscriptionItems.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MODULE_BILLING_SKIPPED" }) }),
    );
  });

  it("skips with missing_price_env when the module's price env is unset", async () => {
    // env vars deliberately not set
    const result = await addModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
      stripeSubscriptionId: "sub_existing",
    });
    expect(result).toEqual({ ok: true, skipped: true, reason: "missing_price_env" });
    expect(mockStripe.subscriptionItems.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MODULE_BILLING_SKIPPED", severity: "WARN" }),
      }),
    );
  });

  it("skips with no_agency_subscription when subscription id can't be resolved", async () => {
    setAllPriceEnv();
    const result = await addModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
      // no stripeSubscriptionId, and resolveAgencyStripeSubscriptionId stub returns null
    });
    expect(result).toEqual({ ok: true, skipped: true, reason: "no_agency_subscription" });
    expect(mockStripe.subscriptionItems.create).not.toHaveBeenCalled();
  });
});

describe("addModuleSubscriptionItem — happy path", () => {
  beforeEach(() => {
    setAllPriceEnv();
    mockStripe.subscriptionItems.create.mockResolvedValue({ id: "si_new" });
  });

  it("creates a Stripe subscription item and writes the id to the DB row", async () => {
    const result = await addModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
      stripeSubscriptionId: "sub_existing",
    });
    expect(result).toEqual({ ok: true, subscriptionItemId: "si_new" });
    expect(mockStripe.subscriptionItems.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: "sub_existing",
        price: "price_ai",
        metadata: expect.objectContaining({
          kiln_sub_account_id: "sub_a",
          kiln_module: "ai",
          kiln_agency_org_id: "org_a",
        }),
      }),
    );
    expect(mockPrisma.subAccountModuleConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stripeSubscriptionItemId: "si_new" },
      }),
    );
  });

  it("is idempotent — returns existing id without re-calling Stripe", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      stripeSubscriptionItemId: "si_existing",
    });
    const result = await addModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
      stripeSubscriptionId: "sub_existing",
    });
    expect(result).toEqual({ ok: true, subscriptionItemId: "si_existing" });
    expect(mockStripe.subscriptionItems.create).not.toHaveBeenCalled();
  });

  it("records MODULE_BILLING_SYNC_FAILED when Stripe SDK throws", async () => {
    mockStripe.subscriptionItems.create.mockRejectedValueOnce(new Error("Stripe down"));
    const result = await addModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
      stripeSubscriptionId: "sub_existing",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Stripe down");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MODULE_BILLING_SYNC_FAILED", severity: "CRITICAL" }),
      }),
    );
  });

  it("records sync failure if getStripe() throws (missing STRIPE_SECRET_KEY)", async () => {
    mockGetStripe.mockImplementationOnce(() => {
      throw new Error("STRIPE_SECRET_KEY fehlt in .env.local");
    });
    const result = await addModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
      stripeSubscriptionId: "sub_existing",
    });
    expect(result.ok).toBe(false);
  });
});

describe("removeModuleSubscriptionItem", () => {
  it("no-ops when the DB row has no subscription item", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({ stripeSubscriptionItemId: null });
    const result = await removeModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
    });
    expect(result).toEqual({ ok: true, skipped: true, reason: "no_agency_subscription" });
    expect(mockStripe.subscriptionItems.del).not.toHaveBeenCalled();
  });

  it("deletes the item and clears the DB pointer when present", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({ stripeSubscriptionItemId: "si_x" });
    mockStripe.subscriptionItems.del.mockResolvedValueOnce(undefined as never);
    const result = await removeModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
    });
    expect(result).toEqual({ ok: true, subscriptionItemId: "si_x" });
    expect(mockStripe.subscriptionItems.del).toHaveBeenCalledWith("si_x");
    expect(mockPrisma.subAccountModuleConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeSubscriptionItemId: null } }),
    );
  });

  it("clears the DB pointer even if Stripe deletion fails (audits SYNC_FAILED)", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({ stripeSubscriptionItemId: "si_x" });
    mockStripe.subscriptionItems.del.mockRejectedValueOnce(new Error("Stripe error"));
    await removeModuleSubscriptionItem({
      agencyOrgId: "org_a",
      subAccountId: "sub_a",
      moduleName: "ai",
    });
    expect(mockPrisma.subAccountModuleConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeSubscriptionItemId: null } }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MODULE_BILLING_SYNC_FAILED" }) }),
    );
  });
});

describe("calculateMonthlyModuleCost", () => {
  it("returns zero totals when no active pool rows exist", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([]);
    const result = await calculateMonthlyModuleCost();
    expect(result).toEqual({ ai: 0, sms: 0, voice: 0, whatsapp: 0, total: 0, activePoolModuleCount: 0 });
  });

  it("sums one of each module at the canonical prices", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([
      { moduleName: "ai" },
      { moduleName: "sms" },
      { moduleName: "voice" },
      { moduleName: "whatsapp" },
    ]);
    const result = await calculateMonthlyModuleCost();
    expect(result.ai).toBe(MODULE_PRICE_EUR.ai);
    expect(result.sms).toBe(MODULE_PRICE_EUR.sms);
    expect(result.voice).toBe(MODULE_PRICE_EUR.voice);
    expect(result.whatsapp).toBe(MODULE_PRICE_EUR.whatsapp);
    expect(result.total).toBeCloseTo(29 + 9 + 19 + 14, 5);
    expect(result.activePoolModuleCount).toBe(4);
  });

  it("filters by subAccountIds when provided", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([{ moduleName: "ai" }]);
    await calculateMonthlyModuleCost({ subAccountIds: ["sub_a", "sub_b"] });
    const where = mockPrisma.subAccountModuleConfig.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ mode: "pool", isActive: true, subAccountId: { in: ["sub_a", "sub_b"] } });
  });

  it("counts multiple sub-accounts on the same module", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([
      { moduleName: "ai" },
      { moduleName: "ai" },
      { moduleName: "ai" },
    ]);
    const result = await calculateMonthlyModuleCost();
    expect(result.ai).toBe(MODULE_PRICE_EUR.ai * 3);
    expect(result.total).toBeCloseTo(MODULE_PRICE_EUR.ai * 3, 5);
  });
});

describe("reconcileModuleBilling", () => {
  beforeEach(() => {
    setAllPriceEnv();
    mockStripe.subscriptionItems.create.mockResolvedValue({ id: "si_new" });
    mockStripe.subscriptionItems.del.mockResolvedValue(undefined as never);
  });

  it("returns skipped when no subscription id is provided", async () => {
    const result = await reconcileModuleBilling({
      stripeSubscriptionId: "",
      agencyOrgId: "org_a",
    });
    expect(result.skipped).toBe("no_agency_subscription");
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
  });

  it("adds an item for a pool/active row that's missing one", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([
      {
        subAccountId: "sub_a",
        moduleName: "ai",
        mode: "pool",
        isActive: true,
        stripeSubscriptionItemId: null,
      },
    ]);
    const result = await reconcileModuleBilling({
      stripeSubscriptionId: "sub_existing",
      agencyOrgId: "org_a",
    });
    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
    expect(mockStripe.subscriptionItems.create).toHaveBeenCalledTimes(1);
  });

  it("removes an item for a row that's no longer pool/active", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([
      {
        subAccountId: "sub_a",
        moduleName: "ai",
        mode: "byok_agency",
        isActive: true,
        stripeSubscriptionItemId: "si_orphan",
      },
    ]);
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({ stripeSubscriptionItemId: "si_orphan" });
    const result = await reconcileModuleBilling({
      stripeSubscriptionId: "sub_existing",
      agencyOrgId: "org_a",
    });
    expect(result.removed).toBe(1);
    expect(result.added).toBe(0);
    expect(mockStripe.subscriptionItems.del).toHaveBeenCalledWith("si_orphan");
  });

  it("makes no changes when everything is already in sync", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([
      {
        subAccountId: "sub_a",
        moduleName: "ai",
        mode: "pool",
        isActive: true,
        stripeSubscriptionItemId: "si_ok",
      },
      {
        subAccountId: "sub_b",
        moduleName: "sms",
        mode: "byok_agency",
        isActive: true,
        stripeSubscriptionItemId: null,
      },
    ]);
    const result = await reconcileModuleBilling({
      stripeSubscriptionId: "sub_existing",
      agencyOrgId: "org_a",
    });
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(mockStripe.subscriptionItems.create).not.toHaveBeenCalled();
    expect(mockStripe.subscriptionItems.del).not.toHaveBeenCalled();
  });
});
