import { Heading, Link, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["invoice"];
}

export function InvoiceEmail({ branding, data }: Props) {
  const ctaUrl = data.hostedInvoiceUrl || data.invoicePdfUrl;
  return (
    <BrandedLayout
      branding={branding}
      preview={`Invoice ${data.invoiceNumber} from ${branding.brandName}`}
    >
      <Heading style={heading}>Invoice {data.invoiceNumber}</Heading>
      <Text style={paragraph}>Hi {data.customerName},</Text>
      <Text style={paragraph}>
        A new invoice has been issued for your account.
      </Text>
      <Section style={metaBox}>
        <Text style={metaRow}>
          <strong>Amount:</strong> {data.amountFormatted}
        </Text>
        <Text style={metaRow}>
          <strong>Date:</strong> {data.invoiceDate}
        </Text>
        <Text style={metaRow}>
          <strong>Number:</strong> {data.invoiceNumber}
        </Text>
      </Section>
      {ctaUrl ? (
        <Section style={ctaSection}>
          <BrandedButton href={ctaUrl} branding={branding}>
            View invoice
          </BrandedButton>
        </Section>
      ) : null}
      {data.invoicePdfUrl && data.hostedInvoiceUrl ? (
        <Text style={smallParagraph}>
          Or download the PDF directly:{" "}
          <Link href={data.invoicePdfUrl} style={{ color: branding.brandColor }}>
            {data.invoiceNumber}.pdf
          </Link>
        </Text>
      ) : null}
    </BrandedLayout>
  );
}

export function invoiceSubject(
  branding: EmailBranding,
  data: EmailTemplateData["invoice"]
): string {
  return `Invoice ${data.invoiceNumber} — ${branding.brandName}`;
}

const heading: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 600,
  color: "#0c0a09",
  margin: "0 0 16px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#1a1a1a",
  margin: "0 0 12px",
};

const smallParagraph: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#666666",
  margin: "12px 0 0",
};

const metaBox: React.CSSProperties = {
  backgroundColor: "#f5f5f5",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};

const metaRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#1a1a1a",
  margin: "0",
};

const ctaSection: React.CSSProperties = {
  padding: "8px 0 8px",
};
