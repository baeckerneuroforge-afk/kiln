import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["invoice-payment-failed"];
}

export function InvoicePaymentFailedEmail({ branding, data }: Props) {
  return (
    <BrandedLayout
      branding={branding}
      preview={`Zahlung f&uuml;r Rechnung ${data.invoiceNumber} fehlgeschlagen`}
    >
      <Heading style={heading}>Zahlung fehlgeschlagen</Heading>
      <Text style={paragraph}>Hallo {data.customerName},</Text>
      <Text style={paragraph}>
        die Zahlung der Rechnung <strong>{data.invoiceNumber}</strong> ({data.amountFormatted}) konnte nicht
        eingezogen werden. Bitte aktualisieren Sie Ihre Zahlungsmethode bis zum <strong>{data.graceUntilFormatted}</strong>,
        sonst werden die aktiven Pool-Module Ihrer Sub-Accounts vorübergehend deaktiviert.
      </Text>
      {data.hostedInvoiceUrl ? (
        <Section style={ctaSection}>
          <BrandedButton href={data.hostedInvoiceUrl} branding={branding}>
            Jetzt bezahlen
          </BrandedButton>
        </Section>
      ) : null}
      <Text style={paragraph}>
        Falls Sie Hilfe ben&ouml;tigen, antworten Sie einfach auf diese E-Mail.
      </Text>
    </BrandedLayout>
  );
}

export function invoicePaymentFailedSubject(
  branding: EmailBranding,
  data: EmailTemplateData["invoice-payment-failed"],
): string {
  return `[${branding.brandName}] Zahlung fehlgeschlagen — Rechnung ${data.invoiceNumber}`;
}

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#b91c1c",
  margin: "0 0 12px",
};
const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#1a1a1a",
  margin: "0 0 16px",
};
const ctaSection: React.CSSProperties = { padding: "16px 0 8px" };
