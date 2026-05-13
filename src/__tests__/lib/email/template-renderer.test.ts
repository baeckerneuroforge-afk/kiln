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

// Sprint 19.7.8 — sub-org + agency RBAC + onboarding templates.
describe("template-renderer — Sprint 19.7.8 templates", () => {
  it("renders sub-org-member-invited-existing in DE with role + permission labels", async () => {
    const out = await renderEmail({
      template: "sub-org-member-invited-existing",
      branding: sampleBranding,
      data: {
        locale: "de",
        recipientName: "Lena Müller",
        inviterName: "André Bäcker",
        subOrgName: "ACME Sub",
        role: "ADMIN",
        permissionSet: "FULL_ACCESS",
        workspaceUrl: "https://x.test/dashboard/sub-org/rel_1",
      },
    });
    expect(out.html).toContain("Lena Müller");
    expect(out.html).toContain("André Bäcker");
    expect(out.html).toContain("ACME Sub");
    // DE role label
    expect(out.html).toContain("Admin");
    // DE permission label
    expect(out.html).toContain("Vollzugriff");
    expect(out.html).toContain("https://x.test/dashboard/sub-org/rel_1");
    expect(out.subject).toContain("ACME Sub");
    // DE subject
    expect(out.subject).toMatch(/Du wurdest zu/);
  });

  it("renders sub-org-member-invited-existing in EN with role + permission labels", async () => {
    const out = await renderEmail({
      template: "sub-org-member-invited-existing",
      branding: sampleBranding,
      data: {
        locale: "en",
        recipientName: "Sarah",
        inviterName: "Alex",
        subOrgName: "ACME Sub",
        role: "MEMBER",
        permissionSet: "READ_ONLY",
        workspaceUrl: "https://x.test",
      },
    });
    expect(out.html).toContain("Sarah");
    expect(out.html).toContain("read-only");
    expect(out.subject).toMatch(/You.{0,3}ve been added/);
  });

  it("renders sub-org-member-invited-new without recipient name (no User row yet)", async () => {
    const out = await renderEmail({
      template: "sub-org-member-invited-new",
      branding: sampleBranding,
      data: {
        locale: "de",
        inviterName: "André Bäcker",
        subOrgName: "ACME Sub",
        role: "VIEWER",
        permissionSet: "USE_AGENTS",
        learnMoreUrl: "https://x.test",
      },
    });
    expect(out.html).toContain("André Bäcker");
    expect(out.html).toContain("ACME Sub");
    expect(out.html).toContain("Hephaistos Systems"); // brandName from branding
    expect(out.html).toContain("Viewer");
    expect(out.html).toContain("Agenten nutzen");
    expect(out.subject).toContain("ACME Sub");
    expect(out.subject).toContain("Hephaistos Systems");
  });

  it("renders agency-member-invited with assignment count when > 0", async () => {
    const out = await renderEmail({
      template: "agency-member-invited",
      branding: sampleBranding,
      data: {
        locale: "de",
        recipientName: "Lena",
        inviterName: "André",
        role: "CONSULTANT",
        assignmentCount: 3,
        teamUrl: "https://x.test/team",
      },
    });
    expect(out.html).toContain("Lena");
    expect(out.html).toContain("André");
    expect(out.html).toContain("Consultant");
    expect(out.html).toContain("3");
    expect(out.html).toContain("https://x.test/team");
    expect(out.subject).toContain("Hephaistos Systems");
  });

  it("agency-member-invited omits assignment line when count is 0", async () => {
    const out = await renderEmail({
      template: "agency-member-invited",
      branding: sampleBranding,
      data: {
        locale: "de",
        recipientName: null,
        inviterName: "André",
        role: "OWNER",
        assignmentCount: 0,
        teamUrl: "https://x.test/team",
      },
    });
    // The "Zugriff auf X Sub-Org(s)" phrasing must not appear when count=0.
    expect(out.html).not.toMatch(/Zugriff auf 0 Sub-Org/);
    expect(out.html).toContain("Agency-Owner");
  });

  it("renders sub-org-onboarding-completed in DE with tip + cta", async () => {
    const out = await renderEmail({
      template: "sub-org-onboarding-completed",
      branding: sampleBranding,
      data: {
        locale: "de",
        recipientName: "Lena",
        subOrgName: "ACME Sub",
        dashboardUrl: "https://x.test/dashboard/sub-org/rel_1",
      },
    });
    expect(out.html).toContain("Lena");
    expect(out.html).toContain("ACME Sub");
    expect(out.html).toContain("Tipp:"); // DE tip prefix
    expect(out.html).toContain("https://x.test/dashboard/sub-org/rel_1");
    expect(out.subject).toContain("ACME Sub");
  });

  it("renders sub-org-onboarding-completed in EN", async () => {
    const out = await renderEmail({
      template: "sub-org-onboarding-completed",
      branding: sampleBranding,
      data: {
        locale: "en",
        recipientName: null,
        subOrgName: "ACME Sub",
        dashboardUrl: "https://x.test",
      },
    });
    expect(out.html).toContain("Tip:"); // EN tip prefix
    expect(out.subject).toMatch(/You.{0,3}re all set/);
  });
});
