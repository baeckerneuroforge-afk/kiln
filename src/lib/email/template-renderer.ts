import { render } from "@react-email/render";
import type { ReactElement } from "react";
import {
  KILN_DEFAULT_BRANDING,
  type EmailBranding,
  type EmailTemplateData,
  type EmailTemplateName,
  type RenderedEmail,
} from "./types";
import { WelcomeEmail, welcomeSubject } from "./templates/welcome";
import {
  PasswordResetEmail,
  passwordResetSubject,
} from "./templates/password-reset";
import { InvoiceEmail, invoiceSubject } from "./templates/invoice";
import {
  ApprovalNeededEmail,
  approvalNeededSubject,
} from "./templates/approval-needed";
import {
  MonthlyReportEmail,
  monthlyReportSubject,
} from "./templates/monthly-report";
import {
  DepartmentDigestEmail,
  departmentDigestSubject,
} from "./templates/department-digest";
import {
  InvoicePaidEmail,
  invoicePaidSubject,
} from "./templates/invoice-paid";
import {
  InvoicePaymentFailedEmail,
  invoicePaymentFailedSubject,
} from "./templates/invoice-payment-failed";
import {
  ModulesDisabledPaymentEmail,
  modulesDisabledPaymentSubject,
} from "./templates/modules-disabled-payment";

export interface RenderEmailArgs<T extends EmailTemplateName> {
  template: T;
  branding: EmailBranding;
  data: EmailTemplateData[T];
}

/**
 * Render a branded email to { html, text, subject }. Each template owns
 * its subject so brand interpolation stays close to the body content.
 *
 * Falls back to a minimal HTML/text rendering if React-Email throws —
 * branding still applied so the agency identity isn't lost on errors.
 */
export async function renderEmail<T extends EmailTemplateName>(
  args: RenderEmailArgs<T>
): Promise<RenderedEmail> {
  const subject = buildSubject(args);
  try {
    const element = buildElement(args);
    const html = await render(element);
    const text = await render(element, { plainText: true });
    return { html, text, subject };
  } catch (err) {
    console.error("[email-template] render failed, using fallback", err);
    return {
      ...renderFallback(args),
      subject,
    };
  }
}

function buildSubject<T extends EmailTemplateName>(
  args: RenderEmailArgs<T>
): string {
  switch (args.template) {
    case "welcome":
      return welcomeSubject(args.branding);
    case "password-reset":
      return passwordResetSubject(args.branding);
    case "invoice":
      return invoiceSubject(
        args.branding,
        args.data as EmailTemplateData["invoice"]
      );
    case "approval-needed":
      return approvalNeededSubject(
        args.branding,
        args.data as EmailTemplateData["approval-needed"]
      );
    case "monthly-report":
      return monthlyReportSubject(
        args.branding,
        args.data as EmailTemplateData["monthly-report"]
      );
    case "department-digest":
      return departmentDigestSubject(
        args.branding,
        args.data as EmailTemplateData["department-digest"]
      );
    case "invoice-paid":
      return invoicePaidSubject(
        args.branding,
        args.data as EmailTemplateData["invoice-paid"]
      );
    case "invoice-payment-failed":
      return invoicePaymentFailedSubject(
        args.branding,
        args.data as EmailTemplateData["invoice-payment-failed"]
      );
    case "modules-disabled-payment":
      return modulesDisabledPaymentSubject(
        args.branding,
        args.data as EmailTemplateData["modules-disabled-payment"]
      );
    default:
      return `Message from ${args.branding.brandName}`;
  }
}

function buildElement<T extends EmailTemplateName>(
  args: RenderEmailArgs<T>
): ReactElement {
  switch (args.template) {
    case "welcome":
      return WelcomeEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["welcome"],
      });
    case "password-reset":
      return PasswordResetEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["password-reset"],
      });
    case "invoice":
      return InvoiceEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["invoice"],
      });
    case "approval-needed":
      return ApprovalNeededEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["approval-needed"],
      });
    case "monthly-report":
      return MonthlyReportEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["monthly-report"],
      });
    case "department-digest":
      return DepartmentDigestEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["department-digest"],
      });
    case "invoice-paid":
      return InvoicePaidEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["invoice-paid"],
      });
    case "invoice-payment-failed":
      return InvoicePaymentFailedEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["invoice-payment-failed"],
      });
    case "modules-disabled-payment":
      return ModulesDisabledPaymentEmail({
        branding: args.branding,
        data: args.data as EmailTemplateData["modules-disabled-payment"],
      });
    default:
      throw new Error(`Unknown template: ${String(args.template)}`);
  }
}

/**
 * Minimal HTML fallback for when React-Email render throws. Keeps the
 * brand visible so even error paths don't accidentally leak KILN identity.
 */
function renderFallback<T extends EmailTemplateName>(
  args: RenderEmailArgs<T>
): { html: string; text: string } {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const summary = describeTemplate(args);
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0c0a09">
  <h2 style="color:${escape(args.branding.brandColor)};margin:0 0 16px">${escape(args.branding.brandName)}</h2>
  <p>${escape(summary)}</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px"/>
  <p style="font-size:12px;color:#666">${args.branding.footerHtml}</p>
</body></html>`;
  const text = `${args.branding.brandName}\n\n${summary}\n\n${stripHtml(args.branding.footerHtml)}`;
  return { html, text };
}

function describeTemplate<T extends EmailTemplateName>(
  args: RenderEmailArgs<T>
): string {
  switch (args.template) {
    case "welcome":
      return `Welcome to ${args.branding.brandName}.`;
    case "password-reset":
      return "We received a request to reset your password.";
    case "invoice": {
      const data = args.data as EmailTemplateData["invoice"];
      return `Invoice ${data.invoiceNumber}: ${data.amountFormatted}`;
    }
    case "approval-needed": {
      const data = args.data as EmailTemplateData["approval-needed"];
      return `${data.departmentName}: a draft awaits your review.`;
    }
    case "monthly-report": {
      const data = args.data as EmailTemplateData["monthly-report"];
      return `${data.monthLabel} report from ${args.branding.brandName}.`;
    }
    case "department-digest": {
      const data = args.data as EmailTemplateData["department-digest"];
      return `${data.departmentName}: ${data.items.length} drafts await review.`;
    }
    default:
      return `A message from ${args.branding.brandName}.`;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export const __test__ = { buildSubject, buildElement, renderFallback };
export { KILN_DEFAULT_BRANDING };
