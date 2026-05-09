import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { MonthlyReportEmail, monthlyReportSubject } from "@/lib/email/templates/monthly-report";
import { KILN_DEFAULT_BRANDING } from "@/lib/email/types";

describe("monthly-report email template", () => {
  it("renders with the default branding without throwing", async () => {
    const html = await render(
      MonthlyReportEmail({
        branding: KILN_DEFAULT_BRANDING,
        data: {
          customerName: "Praxis Meyer",
          monthLabel: "Oktober 2026",
          totalConversations: 247,
          totalLeads: 14,
          totalApprovals: 60,
          reportUrl: "https://example.com/r/abc",
          slaCompliancePercent: 92,
          avgFirstResponseMinutes: 8,
          costSavedEur: 4800,
          newCustomers: 14,
          highlights: ["247 Anfragen bearbeitet", "92% innerhalb SLA"],
          topTopics: [{ topic: "termin anfrage", count: 100 }],
          customMessage: "Vielen Dank fuer Ihre Treue!",
        },
      }),
    );
    expect(html).toContain("Oktober 2026 Report");
    expect(html).toContain("Praxis Meyer");
    expect(html).toContain("247");
    expect(html).toContain("4.800");
    expect(html).toContain("Vielen Dank fuer Ihre Treue!");
  });

  it("escapes HTML in customMessage to prevent injection", async () => {
    const html = await render(
      MonthlyReportEmail({
        branding: KILN_DEFAULT_BRANDING,
        data: {
          customerName: "Test",
          monthLabel: "Mai 2026",
          totalConversations: 0,
          totalLeads: 0,
          totalApprovals: 0,
          reportUrl: "https://example.com",
          customMessage: "<script>alert('x')</script>",
        },
      }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("subject line includes brand and month", () => {
    const subject = monthlyReportSubject(KILN_DEFAULT_BRANDING, {
      customerName: "Test",
      monthLabel: "Oktober 2026",
      totalConversations: 0,
      totalLeads: 0,
      totalApprovals: 0,
      reportUrl: "https://example.com",
    });
    expect(subject).toContain("KILN");
    expect(subject).toContain("Oktober 2026");
  });

  it("renders without optional fields (legacy callers)", async () => {
    const html = await render(
      MonthlyReportEmail({
        branding: KILN_DEFAULT_BRANDING,
        data: {
          customerName: "Test",
          monthLabel: "Mai 2026",
          totalConversations: 5,
          totalLeads: 1,
          totalApprovals: 2,
          reportUrl: "https://example.com",
        },
      }),
    );
    expect(html).toContain("Mai 2026 Report");
    expect(html).not.toContain("Highlights");
  });
});
