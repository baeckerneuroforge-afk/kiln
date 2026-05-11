import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["invoice-paid"];
}

export function InvoicePaidEmail({ branding, data }: Props) {
  return (
    <BrandedLayout branding={branding} preview={`Rechnung ${data.invoiceNumber} bezahlt`}>
      <Heading style={heading}>Vielen Dank — Zahlung eingegangen</Heading>
      <Text style={paragraph}>Hallo {data.customerName},</Text>
      <Text style={paragraph}>
        wir haben Ihre Zahlung f&uuml;r Rechnung <strong>{data.invoiceNumber}</strong> ({data.amountFormatted}) am{" "}
        {data.invoiceDate} erhalten. Vielen Dank!
      </Text>
      {data.hostedInvoiceUrl ? (
        <Section style={ctaSection}>
          <BrandedButton href={data.hostedInvoiceUrl} branding={branding}>
            Rechnung &ouml;ffnen
          </BrandedButton>
        </Section>
      ) : null}
      {data.invoicePdfUrl ? (
        <Text style={paragraph}>
          PDF-Download: <a href={data.invoicePdfUrl}>{data.invoicePdfUrl}</a>
        </Text>
      ) : null}
    </BrandedLayout>
  );
}

export function invoicePaidSubject(
  branding: EmailBranding,
  data: EmailTemplateData["invoice-paid"],
): string {
  return `[${branding.brandName}] Rechnung ${data.invoiceNumber} bezahlt`;
}

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#0c0a09",
  margin: "0 0 12px",
};
const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#1a1a1a",
  margin: "0 0 16px",
};
const ctaSection: React.CSSProperties = { padding: "16px 0 8px" };
