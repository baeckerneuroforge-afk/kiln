/**
 * Resolved branding used by every email render. All fields are non-null at
 * use time — `resolveEmailBranding` falls back to KILN defaults so callers
 * never have to handle missing values.
 */
export interface EmailBranding {
  brandName: string;
  logoUrl: string | null;
  brandColor: string;
  fromAddress: string;
  fromName: string;
  replyTo: string | null;
  footerHtml: string;
  supportLink: string | null;
  isDefaultBranding: boolean;
}

/**
 * Stored on OrgRelationship.emailBrandOverride. All fields optional —
 * unset fields fall through to the parent agency's OrgBranding.
 */
export interface EmailBrandOverride {
  brandName?: string;
  logoUrl?: string;
  brandColor?: string;
  fromAddress?: string;
  fromName?: string;
  replyTo?: string;
  footerHtml?: string;
  supportLink?: string;
}

export const KILN_DEFAULT_BRANDING: EmailBranding = {
  brandName: "KILN",
  logoUrl: null,
  brandColor: "#F97316",
  fromAddress: "noreply@kilnbase.com",
  fromName: "KILN",
  replyTo: null,
  footerHtml:
    "Sent by KILN — the AI Creation Platform. " +
    '<a href="https://kilnbase.com" style="color:inherit">kilnbase.com</a>',
  supportLink: "https://kilnbase.com/help",
  isDefaultBranding: true,
};

/**
 * Maps each template name to its required data shape. Adding a new template
 * means adding both an entry here AND a renderer in template-renderer.
 */
export interface EmailTemplateData {
  welcome: {
    customerName: string;
    loginUrl: string;
    productSummary?: string;
  };
  "password-reset": {
    customerName: string;
    resetUrl: string;
    expiresInMinutes?: number;
  };
  invoice: {
    customerName: string;
    invoiceNumber: string;
    amountFormatted: string;
    invoiceDate: string;
    invoicePdfUrl?: string | null;
    hostedInvoiceUrl?: string | null;
  };
  "approval-needed": {
    departmentName: string;
    channel: string;
    fromIdentity?: string | null;
    subject?: string | null;
    preview: string;
    approvalUrl: string;
  };
  "monthly-report": {
    customerName: string;
    monthLabel: string;
    totalConversations: number;
    totalLeads: number;
    totalApprovals: number;
    reportUrl: string;
  };
  "department-digest": {
    departmentName: string;
    items: Array<{
      itemUrl: string;
      channel: string;
      subject: string | null;
      from: string | null;
      createdAt: string;
    }>;
  };
}

export type EmailTemplateName = keyof EmailTemplateData;

export interface RenderedEmail {
  html: string;
  text: string;
  subject: string;
}
