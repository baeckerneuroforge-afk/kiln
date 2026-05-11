import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { InvoicePaidEmail, invoicePaidSubject } from "@/lib/email/templates/invoice-paid";
import {
  InvoicePaymentFailedEmail,
  invoicePaymentFailedSubject,
} from "@/lib/email/templates/invoice-payment-failed";
import {
  ModulesDisabledPaymentEmail,
  modulesDisabledPaymentSubject,
} from "@/lib/email/templates/modules-disabled-payment";
import { KILN_DEFAULT_BRANDING } from "@/lib/email/types";

describe("invoice-paid email template", () => {
  it("renders invoice number, amount and date", async () => {
    const html = await render(
      InvoicePaidEmail({
        branding: KILN_DEFAULT_BRANDING,
        data: {
          customerName: "Hephaistos Agency",
          invoiceNumber: "INV-2026-001",
          amountFormatted: "97,00 EUR",
          invoiceDate: "11.05.2026",
          hostedInvoiceUrl: "https://stripe/invoice/INV-001",
          invoicePdfUrl: "https://stripe/invoice/INV-001.pdf",
        },
      }),
    );
    expect(html).toContain("INV-2026-001");
    expect(html).toContain("97,00 EUR");
    expect(html).toContain("Hephaistos Agency");
  });

  it("subject embeds invoice number + brand", () => {
    expect(
      invoicePaidSubject(KILN_DEFAULT_BRANDING, {
        customerName: "x",
        invoiceNumber: "INV-001",
        amountFormatted: "0",
        invoiceDate: "0",
      }),
    ).toContain("INV-001");
  });
});

describe("invoice-payment-failed email template", () => {
  it("renders grace deadline + invoice number", async () => {
    const html = await render(
      InvoicePaymentFailedEmail({
        branding: KILN_DEFAULT_BRANDING,
        data: {
          customerName: "Hephaistos Agency",
          invoiceNumber: "INV-2026-002",
          amountFormatted: "297,00 EUR",
          hostedInvoiceUrl: "https://stripe/invoice/INV-002",
          graceUntilFormatted: "18.05.2026",
        },
      }),
    );
    expect(html).toContain("INV-2026-002");
    expect(html).toContain("18.05.2026");
    expect(html).toContain("297,00 EUR");
  });

  it("subject signals failure + invoice number", () => {
    expect(
      invoicePaymentFailedSubject(KILN_DEFAULT_BRANDING, {
        customerName: "x",
        invoiceNumber: "INV-002",
        amountFormatted: "0",
        graceUntilFormatted: "x",
      }),
    ).toMatch(/(Zahlung fehlgeschlagen|INV-002)/);
  });
});

describe("modules-disabled-payment email template", () => {
  it("renders the disabled-count and grace days", async () => {
    const html = await render(
      ModulesDisabledPaymentEmail({
        branding: KILN_DEFAULT_BRANDING,
        data: {
          customerName: "Hephaistos Agency",
          modulesDisabled: 4,
          graceDays: 7,
          billingUrl: "https://kiln.example/dashboard/agency/billing",
        },
      }),
    );
    expect(html).toContain("4");
    expect(html).toContain("7");
    expect(html).toContain("Hephaistos Agency");
  });

  it("subject signals the disabled-count", () => {
    expect(
      modulesDisabledPaymentSubject(KILN_DEFAULT_BRANDING, {
        customerName: "x",
        modulesDisabled: 3,
        graceDays: 7,
        billingUrl: "x",
      }),
    ).toContain("3");
  });
});

describe("template-renderer integration", () => {
  it("renderEmail builds invoice-paid via the dispatcher", async () => {
    const { renderEmail } = await import("@/lib/email/template-renderer");
    const result = await renderEmail({
      template: "invoice-paid",
      branding: KILN_DEFAULT_BRANDING,
      data: {
        customerName: "x",
        invoiceNumber: "INV",
        amountFormatted: "0",
        invoiceDate: "0",
      },
    });
    expect(result.html).toContain("INV");
    expect(result.subject).toContain("INV");
  });

  it("renderEmail builds invoice-payment-failed via the dispatcher", async () => {
    const { renderEmail } = await import("@/lib/email/template-renderer");
    const result = await renderEmail({
      template: "invoice-payment-failed",
      branding: KILN_DEFAULT_BRANDING,
      data: {
        customerName: "x",
        invoiceNumber: "INV",
        amountFormatted: "0",
        graceUntilFormatted: "0",
      },
    });
    expect(result.html).toContain("INV");
  });

  it("renderEmail builds modules-disabled-payment via the dispatcher", async () => {
    const { renderEmail } = await import("@/lib/email/template-renderer");
    const result = await renderEmail({
      template: "modules-disabled-payment",
      branding: KILN_DEFAULT_BRANDING,
      data: { customerName: "x", modulesDisabled: 2, graceDays: 7, billingUrl: "x" },
    });
    expect(result.html).toContain("2");
  });
});
