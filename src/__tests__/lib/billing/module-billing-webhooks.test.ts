import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  agencyPlatformSubscription: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  subAccountModuleConfig: { updateMany: vi.fn() },
  orgRelationship: { findMany: vi.fn() },
  user: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}));

const mockSendBranded = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ ok: boolean; error?: string }>>(async () => ({ ok: true })),
);

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/send-branded-email", () => ({ sendBrandedEmail: mockSendBranded }));

import {
  PAYMENT_GRACE_DAYS,
  PAYMENT_GRACE_MS,
  handleInvoiceCreated,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionUpdated,
  runPaymentGraceSweep,
} from "@/lib/billing/module-billing-webhooks";

const ORIGINAL_TIER_ENV = process.env.STRIPE_PRICE_TIER_STARTER;

function makeInvoiceEvent(overrides: Record<string, unknown> = {}, id = "evt_inv_1"): import("stripe").default.Event {
  return {
    id,
    type: "invoice.created",
    data: {
      object: {
        id: "in_1",
        customer: "cus_1",
        subscription: "sub_1",
        number: "INV-001",
        amount_due: 2900,
        amount_paid: 0,
        currency: "eur",
        created: Math.floor(Date.now() / 1000),
        hosted_invoice_url: "https://stripe/invoice/in_1",
        invoice_pdf: null,
        lines: { data: [] },
        ...overrides,
      },
    },
  } as unknown as import("stripe").default.Event;
}

function makeSubscriptionEvent(overrides: Record<string, unknown> = {}, id = "evt_sub_1") {
  return {
    id,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        trial_end: null,
        cancel_at_period_end: false,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
        items: { data: [{ id: "si_tier", price: { id: "price_starter" }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }] },
        ...overrides,
      },
    },
  } as unknown as import("stripe").default.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_TIER_STARTER = "price_starter";
  mockPrisma.agencyPlatformSubscription.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({
    id: where.id,
    ...data,
  }));
  mockPrisma.user.findFirst.mockResolvedValue({ email: "owner@example.com" });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockSendBranded.mockResolvedValue({ ok: true });
});

afterEach(() => {
  process.env.STRIPE_PRICE_TIER_STARTER = ORIGINAL_TIER_ENV;
  vi.restoreAllMocks();
});

describe("invoice.created handler", () => {
  it("no-ops with no_local_row when nothing matches", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValue(null);
    const result = await handleInvoiceCreated({ event: makeInvoiceEvent() });
    expect(result.handled).toBe(false);
    expect("reason" in result && result.reason).toBe("no_local_row");
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("records INVOICE_CREATED audit and stamps lastInvoiceEventId", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      lastInvoiceEventId: null,
    });
    const result = await handleInvoiceCreated({ event: makeInvoiceEvent() });
    expect(result.handled).toBe(true);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "INVOICE_CREATED" }) }),
    );
    expect(mockPrisma.agencyPlatformSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastInvoiceEventId: "evt_inv_1" }) }),
    );
  });

  it("dedupes when the event id matches the row's lastInvoiceEventId", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      lastInvoiceEventId: "evt_inv_1",
    });
    const result = await handleInvoiceCreated({ event: makeInvoiceEvent() });
    expect(result.handled).toBe(true);
    expect("deduplicated" in result && result.deduplicated).toBe(true);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.agencyPlatformSubscription.update).not.toHaveBeenCalled();
  });
});

describe("invoice.payment_succeeded handler", () => {
  it("clears invoiceFailedAt + audits INVOICE_PAID + emails owner", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      lastInvoiceEventId: null,
      invoiceFailedAt: new Date("2026-05-01"),
    });
    const event = makeInvoiceEvent({ amount_paid: 2900 }, "evt_inv_paid");
    const result = await handleInvoicePaymentSucceeded({ event });
    expect(result.handled).toBe(true);
    expect("emailSent" in result && result.emailSent).toBe(true);
    expect(mockPrisma.agencyPlatformSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceFailedAt: null, lastInvoiceEventId: "evt_inv_paid" }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "INVOICE_PAID" }) }),
    );
    expect(mockSendBranded).toHaveBeenCalledWith(
      expect.objectContaining({ template: "invoice-paid", to: "owner@example.com" }),
    );
  });

  it("skips email when no owner email can be resolved", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      lastInvoiceEventId: null,
      invoiceFailedAt: null,
    });
    const result = await handleInvoicePaymentSucceeded({ event: makeInvoiceEvent({}, "evt_paid_noemail") });
    expect(result.handled).toBe(true);
    expect("emailSent" in result && result.emailSent).toBe(false);
    expect(mockSendBranded).not.toHaveBeenCalled();
  });
});

describe("invoice.payment_failed handler", () => {
  it("opens grace by stamping invoiceFailedAt + CRITICAL audit + email", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      lastInvoiceEventId: null,
      invoiceFailedAt: null,
    });
    const result = await handleInvoicePaymentFailed({ event: makeInvoiceEvent({}, "evt_failed") });
    expect(result.handled).toBe(true);
    const updateCall = mockPrisma.agencyPlatformSubscription.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.invoiceFailedAt).toBeInstanceOf(Date);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "INVOICE_PAYMENT_FAILED", severity: "CRITICAL" }) }),
    );
    expect(mockSendBranded).toHaveBeenCalledWith(
      expect.objectContaining({ template: "invoice-payment-failed" }),
    );
  });

  it("does not reset invoiceFailedAt on subsequent failures (grace clock keeps running)", async () => {
    const originalFailure = new Date("2026-05-01T12:00:00.000Z");
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      lastInvoiceEventId: null,
      invoiceFailedAt: originalFailure,
    });
    await handleInvoicePaymentFailed({ event: makeInvoiceEvent({}, "evt_failed_retry") });
    const updateCall = mockPrisma.agencyPlatformSubscription.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.invoiceFailedAt).toEqual(originalFailure);
  });
});

describe("customer.subscription.updated handler", () => {
  it("syncs tier, status, period end, trial_end and item id", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      tier: "starter",
      tierSubscriptionItemId: null,
      lastSubscriptionEventId: null,
      status: "incomplete",
      currentPeriodEnd: null,
    });
    const event = makeSubscriptionEvent({});
    await handleSubscriptionUpdated({ event });
    const update = mockPrisma.agencyPlatformSubscription.update.mock.calls[0]?.[0];
    expect(update?.data).toMatchObject({
      tier: "starter",
      status: "active",
      tierSubscriptionItemId: "si_tier",
      stripeSubscriptionId: "sub_1",
      lastSubscriptionEventId: "evt_sub_1",
    });
  });

  it("audits AGENCY_SUBSCRIPTION_TIER_DETECTED when tier changes via Stripe portal", async () => {
    process.env.STRIPE_PRICE_TIER_AGENCY_PRO = "price_agency_pro";
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      tier: "starter",
      tierSubscriptionItemId: null,
      lastSubscriptionEventId: null,
      status: "active",
    });
    const event = makeSubscriptionEvent({
      items: { data: [{ id: "si_pro", price: { id: "price_agency_pro" } }] },
    });
    await handleSubscriptionUpdated({ event });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "AGENCY_SUBSCRIPTION_TIER_DETECTED" }) }),
    );
  });

  it("dedupes by lastSubscriptionEventId", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      id: "aps_1",
      orgId: "org_a",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      lastSubscriptionEventId: "evt_sub_1",
      tier: "starter",
      tierSubscriptionItemId: "si_tier",
      status: "active",
    });
    const result = await handleSubscriptionUpdated({ event: makeSubscriptionEvent() });
    expect("deduplicated" in result && result.deduplicated).toBe(true);
    expect(mockPrisma.agencyPlatformSubscription.update).not.toHaveBeenCalled();
  });
});

describe("runPaymentGraceSweep", () => {
  it("disables pool-mode modules and audits CRITICAL when grace window elapses", async () => {
    const failedAt = new Date(Date.now() - (PAYMENT_GRACE_MS + 60_000)); // 7 days + 1 min ago
    mockPrisma.agencyPlatformSubscription.findMany.mockResolvedValueOnce([
      {
        id: "aps_1",
        orgId: "org_a",
        status: "past_due",
        invoiceFailedAt: failedAt,
      },
    ]);
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([{ childOrgId: "sub_a" }, { childOrgId: "sub_b" }]);
    mockPrisma.subAccountModuleConfig.updateMany.mockResolvedValueOnce({ count: 3 });

    const result = await runPaymentGraceSweep();
    expect(result.inspected).toBe(1);
    expect(result.disabledAgencies).toBe(1);
    expect(result.modulesDisabled).toBe(3);
    expect(mockPrisma.subAccountModuleConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subAccountId: { in: ["sub_a", "sub_b"] },
          mode: "pool",
          isActive: true,
        }),
        data: { isActive: false },
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MODULES_AUTO_DISABLED_PAYMENT_FAILURE", severity: "CRITICAL" }) }),
    );
    expect(mockPrisma.agencyPlatformSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { invoiceFailedAt: null } }),
    );
    expect(mockSendBranded).toHaveBeenCalledWith(
      expect.objectContaining({ template: "modules-disabled-payment" }),
    );
  });

  it("returns an empty result when no rows are past the grace window", async () => {
    mockPrisma.agencyPlatformSubscription.findMany.mockResolvedValueOnce([]);
    const result = await runPaymentGraceSweep();
    expect(result.inspected).toBe(0);
    expect(result.disabledAgencies).toBe(0);
    expect(result.modulesDisabled).toBe(0);
    expect(mockPrisma.subAccountModuleConfig.updateMany).not.toHaveBeenCalled();
  });

  it("isolates per-agency failures into result.errors without halting", async () => {
    mockPrisma.agencyPlatformSubscription.findMany.mockResolvedValueOnce([
      { id: "aps_1", orgId: "org_a", status: "past_due", invoiceFailedAt: new Date(Date.now() - PAYMENT_GRACE_MS - 1000) },
      { id: "aps_2", orgId: "org_b", status: "past_due", invoiceFailedAt: new Date(Date.now() - PAYMENT_GRACE_MS - 1000) },
    ]);
    mockPrisma.orgRelationship.findMany.mockRejectedValueOnce(new Error("DB down"));
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([{ childOrgId: "sub_x" }]);
    mockPrisma.subAccountModuleConfig.updateMany.mockResolvedValueOnce({ count: 2 });
    const result = await runPaymentGraceSweep();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("org_a");
    expect(result.modulesDisabled).toBe(2);
  });

  it("uses PAYMENT_GRACE_DAYS=7 constant per spec", () => {
    expect(PAYMENT_GRACE_DAYS).toBe(7);
  });
});
