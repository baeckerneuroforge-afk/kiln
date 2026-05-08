/**
 * POST /api/email-branding/preview
 *
 * Renders a single transactional template with the merged branding for
 * the active org (optionally a sub-org override) and returns
 * { html, text, subject }. The settings UI uses this to show a live
 * preview without having to actually send an email.
 *
 * Body: { template: EmailTemplateName, subOrgId?: string, sample?: object }
 *
 * If `sample` is omitted we use a representative payload per template so
 * the preview always renders something even before the user has invoices
 * or pending approvals in their account.
 */
import { auth } from "@clerk/nextjs/server";
import { resolveEmailBranding } from "@/lib/email/branding-resolver";
import { renderEmail } from "@/lib/email/template-renderer";
import type {
  EmailTemplateData,
  EmailTemplateName,
} from "@/lib/email/types";

export const dynamic = "force-dynamic";

const VALID_TEMPLATES: EmailTemplateName[] = [
  "welcome",
  "password-reset",
  "invoice",
  "approval-needed",
  "monthly-report",
  "department-digest",
];

export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    template?: unknown;
    subOrgId?: unknown;
    sample?: unknown;
  };

  if (
    typeof body.template !== "string" ||
    !VALID_TEMPLATES.includes(body.template as EmailTemplateName)
  ) {
    return Response.json(
      {
        error: `template must be one of: ${VALID_TEMPLATES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const template = body.template as EmailTemplateName;
  const subOrgId =
    typeof body.subOrgId === "string" && body.subOrgId.length > 0
      ? body.subOrgId
      : null;

  const branding = await resolveEmailBranding({
    orgId: orgId ?? null,
    subOrgId,
  });

  const data =
    body.sample && typeof body.sample === "object"
      ? (body.sample as never)
      : (sampleData(template) as never);

  const rendered = await renderEmail({ template, branding, data });

  return Response.json({
    branding,
    rendered,
  });
}

function sampleData<T extends EmailTemplateName>(
  template: T
): EmailTemplateData[T] {
  switch (template) {
    case "welcome":
      return {
        customerName: "Alex",
        loginUrl: "https://kilnbase.com/dashboard",
        productSummary: "Your AI workforce is ready.",
      } as EmailTemplateData[T];
    case "password-reset":
      return {
        customerName: "Alex",
        resetUrl: "https://kilnbase.com/reset?token=preview",
        expiresInMinutes: 30,
      } as EmailTemplateData[T];
    case "invoice":
      return {
        customerName: "Alex",
        invoiceNumber: "INV-2026-0001",
        amountFormatted: "€49.00",
        invoiceDate: "2026-05-08",
        invoicePdfUrl: "https://kilnbase.com/invoices/INV-2026-0001.pdf",
        hostedInvoiceUrl: null,
      } as EmailTemplateData[T];
    case "approval-needed":
      return {
        departmentName: "Customer Support",
        channel: "EMAIL",
        fromIdentity: "customer@example.com",
        subject: "Help with my account",
        preview:
          "Hi! I'm having trouble logging in — could you help me reset my password?",
        approvalUrl:
          "https://kilnbase.com/dashboard/departments/preview/approvals?item=preview",
      } as EmailTemplateData[T];
    case "monthly-report":
      return {
        customerName: "Alex",
        monthLabel: "April 2026",
        totalConversations: 482,
        totalLeads: 24,
        totalApprovals: 17,
        reportUrl: "https://kilnbase.com/dashboard/reports/2026-04",
      } as EmailTemplateData[T];
    case "department-digest":
      return {
        departmentName: "Customer Support",
        items: [
          {
            itemUrl: "https://kilnbase.com/dashboard/departments/x/approvals",
            channel: "EMAIL",
            subject: "Refund request",
            from: "customer@example.com",
            createdAt: "2026-05-07T08:30:00Z",
          },
          {
            itemUrl: "https://kilnbase.com/dashboard/departments/x/approvals",
            channel: "WHATSAPP",
            subject: null,
            from: "+491701234567",
            createdAt: "2026-05-07T11:15:00Z",
          },
        ],
      } as EmailTemplateData[T];
    default:
      throw new Error(`No sample data for template ${String(template)}`);
  }
}
