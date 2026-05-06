/**
 * Tests for the Phase 4 invoice-type inference. Pure function over
 * Stripe.Invoice line items; no mocks needed.
 */
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { inferInvoiceType } from "@/lib/stripe/connect-webhook";

function makeInvoice(
  lines: Array<{ recurring: boolean }>
): Stripe.Invoice {
  return {
    lines: {
      data: lines.map((l) => ({
        // Minimal subset Stripe.Invoice.LineItem shape — only the
        // `price.recurring` block is read by the helper.
        price: l.recurring
          ? { recurring: { interval: "month" } }
          : { recurring: null },
      })),
    },
  } as unknown as Stripe.Invoice;
}

describe("inferInvoiceType", () => {
  it("returns SETUP_FEE when every line is non-recurring", () => {
    const invoice = makeInvoice([{ recurring: false }]);
    expect(inferInvoiceType(invoice)).toBe("SETUP_FEE");
  });

  it("returns SUBSCRIPTION when at least one line is recurring", () => {
    const invoice = makeInvoice([{ recurring: true }]);
    expect(inferInvoiceType(invoice)).toBe("SUBSCRIPTION");
  });

  it("treats mixed setup + recurring as SUBSCRIPTION", () => {
    const invoice = makeInvoice([
      { recurring: false }, // setup-fee line item
      { recurring: true }, // first monthly
    ]);
    expect(inferInvoiceType(invoice)).toBe("SUBSCRIPTION");
  });

  it("defaults to SUBSCRIPTION on empty line set", () => {
    const invoice = makeInvoice([]);
    expect(inferInvoiceType(invoice)).toBe("SUBSCRIPTION");
  });

  it("handles missing lines.data gracefully", () => {
    const invoice = {} as Stripe.Invoice;
    expect(inferInvoiceType(invoice)).toBe("SUBSCRIPTION");
  });
});
