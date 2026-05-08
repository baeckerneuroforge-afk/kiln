import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["password-reset"];
}

export function PasswordResetEmail({ branding, data }: Props) {
  const expiresLabel = data.expiresInMinutes
    ? `This link expires in ${data.expiresInMinutes} minutes.`
    : "This link expires shortly for your security.";

  return (
    <BrandedLayout
      branding={branding}
      preview={`Reset your ${branding.brandName} password`}
    >
      <Heading style={heading}>Reset your password</Heading>
      <Text style={paragraph}>Hi {data.customerName},</Text>
      <Text style={paragraph}>
        We received a request to reset your password. Click the button below to
        choose a new one.
      </Text>
      <Section style={ctaSection}>
        <BrandedButton href={data.resetUrl} branding={branding}>
          Reset password
        </BrandedButton>
      </Section>
      <Text style={smallParagraph}>{expiresLabel}</Text>
      <Text style={smallParagraph}>
        If you didn&apos;t request this, you can safely ignore this email.
      </Text>
    </BrandedLayout>
  );
}

export function passwordResetSubject(branding: EmailBranding): string {
  return `Reset your ${branding.brandName} password`;
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
  margin: "8px 0 0",
};

const ctaSection: React.CSSProperties = {
  padding: "16px 0 8px",
};
