import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["welcome"];
}

export function WelcomeEmail({ branding, data }: Props) {
  const preview = `Welcome to ${branding.brandName}, ${data.customerName}`;

  return (
    <BrandedLayout branding={branding} preview={preview}>
      <Heading style={heading}>Welcome to {branding.brandName}!</Heading>
      <Text style={paragraph}>Hi {data.customerName},</Text>
      <Text style={paragraph}>
        We&apos;re glad you&apos;re here. Your account is ready and waiting.
        {data.productSummary ? ` ${data.productSummary}` : ""}
      </Text>
      <Section style={ctaSection}>
        <BrandedButton href={data.loginUrl} branding={branding}>
          Get started
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function welcomeSubject(branding: EmailBranding): string {
  return `Welcome to ${branding.brandName}`;
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

const ctaSection: React.CSSProperties = {
  padding: "16px 0 8px",
};
