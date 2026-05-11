import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["modules-disabled-payment"];
}

export function ModulesDisabledPaymentEmail({ branding, data }: Props) {
  return (
    <BrandedLayout
      branding={branding}
      preview={`${data.modulesDisabled} Module deaktiviert wegen ausstehender Zahlung`}
    >
      <Heading style={heading}>Module wurden deaktiviert</Heading>
      <Text style={paragraph}>Hallo {data.customerName},</Text>
      <Text style={paragraph}>
        nach {data.graceDays} Tagen ohne erfolgreiche Zahlung haben wir die folgenden Module Ihrer Sub-Accounts
        vorübergehend deaktiviert: <strong>{data.modulesDisabled}</strong> Pool-Module.
      </Text>
      <Text style={paragraph}>
        BYOK-Module bleiben unverändert, da sie nicht über uns abgerechnet werden. Sobald Ihre Zahlungsmethode
        aktualisiert ist, k&ouml;nnen Sie die Module ohne weitere Schritte in den Sub-Account-Einstellungen wieder
        aktivieren.
      </Text>
      <Section style={ctaSection}>
        <BrandedButton href={data.billingUrl} branding={branding}>
          Zahlung aktualisieren
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function modulesDisabledPaymentSubject(
  branding: EmailBranding,
  data: EmailTemplateData["modules-disabled-payment"],
): string {
  return `[${branding.brandName}] Module deaktiviert — ${data.modulesDisabled} betroffen`;
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
