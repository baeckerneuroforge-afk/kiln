import { describe, expect, it } from "vitest";
import { renderEmail } from "@/lib/email/template-renderer";
import { KILN_DEFAULT_BRANDING, type EmailBranding } from "@/lib/email/types";

const sampleBranding: EmailBranding = {
  ...KILN_DEFAULT_BRANDING,
  brandName: "Hephaistos Systems",
  brandColor: "#FF6B35",
  fromAddress: "support@hephaistos.de",
  fromName: "Hephaistos Support",
  isDefaultBranding: false,
};

describe("template-renderer", () => {
  it("renders welcome email with brand name + color", async () => {
    const out = await renderEmail({
      template: "welcome",
      branding: sampleBranding,
      data: { customerName: "Alex", loginUrl: "https://x.test/login" },
    });
    expect(out.html).toContain("Hephaistos Systems");
    expect(out.html).toContain("Alex");
    expect(out.html).toContain("https://x.test/login");
    expect(out.html).toContain("#FF6B35");
    expect(out.subject).toBe("Welcome to Hephaistos Systems");
  });

  it("renders password-reset email with branded button", async () => {
    const out = await renderEmail({
      template: "password-reset",
      branding: sampleBranding,
      data: {
        customerName: "Alex",
        resetUrl: "https://x.test/reset",
        expiresInMinutes: 15,
      },
    });
    expect(out.html).toContain("https://x.test/reset");
    expect(out.html).toContain("15 minutes");
    expect(out.subject).toContain("Hephaistos Systems");
  });

  it("renders invoice email with amount + invoice number", async () => {
    const out = await renderEmail({
      template: "invoice",
      branding: sampleBranding,
      data: {
        customerName: "Alex",
        invoiceNumber: "INV-001",
        amountFormatted: "€49.00",
        invoiceDate: "2026-05-08",
        invoicePdfUrl: null,
        hostedInvoiceUrl: "https://invoice.example",
      },
    });
    expect(out.html).toContain("INV-001");
    expect(out.html).toContain("€49.00");
    expect(out.html).toContain("https://invoice.example");
    expect(out.subject).toContain("INV-001");
  });

  it("renders approval-needed email with department + preview", async () => {
    const out = await renderEmail({
      template: "approval-needed",
      branding: sampleBranding,
      data: {
        departmentName: "Customer Support",
        channel: "EMAIL",
        fromIdentity: "user@example.com",
        subject: "Help",
        preview: "I need help",
        approvalUrl: "https://x.test/approve",
      },
    });
    expect(out.html).toContain("Customer Support");
    expect(out.html).toContain("I need help");
    expect(out.html).toContain("https://x.test/approve");
    expect(out.subject).toContain("Hephaistos Systems");
    expect(out.subject).toContain("Customer Support");
  });

  it("renders monthly-report email with stat cells", async () => {
    const out = await renderEmail({
      template: "monthly-report",
      branding: sampleBranding,
      data: {
        customerName: "Alex",
        monthLabel: "April 2026",
        totalConversations: 482,
        totalLeads: 24,
        totalApprovals: 17,
        reportUrl: "https://x.test/report",
      },
    });
    expect(out.html).toContain("482");
    expect(out.html).toContain("April 2026");
    expect(out.subject).toContain("April 2026");
  });

  it("renders department-digest email with item list", async () => {
    const out = await renderEmail({
      template: "department-digest",
      branding: sampleBranding,
      data: {
        departmentName: "Support",
        items: [
          {
            itemUrl: "https://x.test/i1",
            channel: "EMAIL",
            subject: "Q1",
            from: "a@b.com",
            createdAt: "2026-05-08",
          },
          {
            itemUrl: "https://x.test/i2",
            channel: "WHATSAPP",
            subject: null,
            from: "+49170",
            createdAt: "2026-05-08",
          },
        ],
      },
    });
    expect(out.html).toContain("Q1");
    expect(out.html).toContain("(no subject)");
    expect(out.html).toContain("https://x.test/i1");
    expect(out.subject).toContain("2 pending");
  });

  it("renders KILN-default branding when no agency override", async () => {
    const out = await renderEmail({
      template: "welcome",
      branding: KILN_DEFAULT_BRANDING,
      data: { customerName: "Alex", loginUrl: "https://x.test" },
    });
    expect(out.html).toContain("KILN");
    expect(out.subject).toBe("Welcome to KILN");
  });
});
