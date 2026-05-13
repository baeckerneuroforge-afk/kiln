import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";
import { t } from "../i18n";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["sub-org-onboarding-completed"];
}

export function SubOrgOnboardingCompletedEmail({ branding, data }: Props) {
  const recipientName = data.recipientName ?? "";
  const preview = t(data.locale, "onboarding-completed.preview", {
    subOrgName: data.subOrgName,
  });

  return (
    <BrandedLayout branding={branding} preview={preview}>
      <Heading style={heading}>
        {t(data.locale, "onboarding-completed.heading")}
      </Heading>
      <Text style={paragraph}>
        {t(data.locale, "onboarding-completed.greeting", { recipientName })}
      </Text>
      <Text style={paragraph}>
        {t(data.locale, "onboarding-completed.body", {
          subOrgName: data.subOrgName,
        })}
      </Text>
      <Text style={tipParagraph}>
        {t(data.locale, "onboarding-completed.tip")}
      </Text>
      <Section style={ctaSection}>
        <BrandedButton href={data.dashboardUrl} branding={branding}>
          {t(data.locale, "onboarding-completed.cta")}
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function subOrgOnboardingCompletedSubject(
  _branding: EmailBranding,
  data: EmailTemplateData["sub-org-onboarding-completed"],
): string {
  return t(data.locale, "onboarding-completed.subject", {
    subOrgName: data.subOrgName,
  });
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

const tipParagraph: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#525252",
  margin: "0 0 16px",
  fontStyle: "italic",
};

const ctaSection: React.CSSProperties = {
  padding: "16px 0 8px",
};
