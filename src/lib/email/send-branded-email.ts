import { Resend } from "resend";
import { resolveEmailBranding, formatFromHeader } from "./branding-resolver";
import { renderEmail } from "./template-renderer";
import type { EmailTemplateData, EmailTemplateName, RenderedEmail } from "./types";

export interface SendBrandedEmailArgs<T extends EmailTemplateName> {
  template: T;
  data: EmailTemplateData[T];
  to: string | string[];
  orgId: string | null;
  subOrgId?: string | null;
}

export interface SendBrandedEmailResult {
  ok: boolean;
  externalId?: string;
  error?: string;
  fromAddress: string;
  brandName: string;
}

/**
 * One call site for sending branded transactional email.
 *   1. Resolve branding for { orgId, subOrgId? } via branding-resolver
 *   2. Render the template (HTML + text + subject) with that branding
 *   3. Send via Resend with the branded From header
 *
 * Callers don't construct Resend payloads themselves — they pick a
 * template, supply data, and we handle branding + transport. This keeps
 * the From-address, color, footer and reply-to behaviour consistent
 * across every system email.
 */
export async function sendBrandedEmail<T extends EmailTemplateName>(
  args: SendBrandedEmailArgs<T>
): Promise<SendBrandedEmailResult> {
  const branding = await resolveEmailBranding({
    orgId: args.orgId,
    subOrgId: args.subOrgId ?? null,
  });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "missing_resend_api_key",
      fromAddress: branding.fromAddress,
      brandName: branding.brandName,
    };
  }

  let rendered: RenderedEmail;
  try {
    rendered = await renderEmail({
      template: args.template,
      branding,
      data: args.data,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "render_failed",
      fromAddress: branding.fromAddress,
      brandName: branding.brandName,
    };
  }

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: formatFromHeader(branding),
      to: args.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: branding.replyTo || undefined,
    });
    return {
      ok: true,
      externalId: response.data?.id,
      fromAddress: branding.fromAddress,
      brandName: branding.brandName,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
      fromAddress: branding.fromAddress,
      brandName: branding.brandName,
    };
  }
}
