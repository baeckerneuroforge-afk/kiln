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
    /** Optional richer payload populated by the reporting generator. */
    avgFirstResponseMinutes?: number | null;
    slaCompliancePercent?: number;
    costSavedEur?: number;
    llmCostSavedUsd?: number;
    llmSavingsPercent?: number;
    newCustomers?: number;
    returningCustomers?: number;
    highlights?: string[];
    topTopics?: Array<{ topic: string; count: number }>;
    customMessage?: string | null;
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
  /** Sprint 19.5.3 — billing notifications */
  "invoice-paid": {
    customerName: string;
    invoiceNumber: string;
    amountFormatted: string;
    invoiceDate: string;
    hostedInvoiceUrl?: string | null;
    invoicePdfUrl?: string | null;
  };
  "invoice-payment-failed": {
    customerName: string;
    invoiceNumber: string;
    amountFormatted: string;
    hostedInvoiceUrl?: string | null;
    graceUntilFormatted: string;
  };
  "modules-disabled-payment": {
    customerName: string;
    modulesDisabled: number;
    graceDays: number;
    billingUrl: string;
  };
  /**
   * Sprint 19.7.8 — sub-org / agency RBAC + onboarding notifications.
   *
   * All four templates accept a `locale` ("de"|"en") so the same template
   * file renders the German DACH default or English fallback. `recipientName`
   * is optional everywhere: the new-email path of sub-org invites has no
   * KILN user row yet, so we render an anonymous greeting.
   */
  "sub-org-member-invited-existing": {
    locale: "de" | "en";
    recipientName: string | null;
    inviterName: string;
    subOrgName: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    permissionSet:
      | "READ_ONLY"
      | "USE_AGENTS"
      | "USE_AGENTS_PLUS_KNOWLEDGE"
      | "FULL_ACCESS";
    workspaceUrl: string;
  };
  "sub-org-member-invited-new": {
    locale: "de" | "en";
    inviterName: string;
    subOrgName: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    permissionSet:
      | "READ_ONLY"
      | "USE_AGENTS"
      | "USE_AGENTS_PLUS_KNOWLEDGE"
      | "FULL_ACCESS";
    learnMoreUrl: string;
  };
  "agency-member-invited": {
    locale: "de" | "en";
    recipientName: string | null;
    inviterName: string;
    role: "OWNER" | "ADMIN" | "CONSULTANT" | "VIEWER";
    assignmentCount: number;
    teamUrl: string;
  };
  "sub-org-onboarding-completed": {
    locale: "de" | "en";
    recipientName: string | null;
    subOrgName: string;
    dashboardUrl: string;
  };
}

export type EmailTemplateName = keyof EmailTemplateData;

export interface RenderedEmail {
  html: string;
  text: string;
  subject: string;
}
