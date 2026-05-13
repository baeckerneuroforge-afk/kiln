import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";
import { t } from "../i18n";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["agency-member-invited"];
}

export function AgencyMemberInvitedEmail({ branding, data }: Props) {
  const recipientName = data.recipientName ?? "";
  const roleLabel = t(data.locale, `agency-role.${data.role}`);
  const preview = t(data.locale, "agency-member-invited.preview", {
    inviterName: data.inviterName,
    brandName: branding.brandName,
    roleLabel,
  });

  return (
    <BrandedLayout branding={branding} preview={preview}>
      <Heading style={heading}>
        {t(data.locale, "agency-member-invited.heading")}
      </Heading>
      <Text style={paragraph}>
        {t(data.locale, "agency-member-invited.greeting", { recipientName })}
      </Text>
      <Text style={paragraph}>
        {t(data.locale, "agency-member-invited.body", {
          inviterName: data.inviterName,
          brandName: branding.brandName,
          roleLabel,
        })}
      </Text>
      {data.assignmentCount > 0 && (
        <Text style={paragraph}>
          {t(data.locale, "agency-member-invited.assignments", {
            assignmentCount: data.assignmentCount,
          })}
        </Text>
      )}
      <Section style={ctaSection}>
        <BrandedButton href={data.teamUrl} branding={branding}>
          {t(data.locale, "agency-member-invited.cta")}
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function agencyMemberInvitedSubject(
  branding: EmailBranding,
  data: EmailTemplateData["agency-member-invited"],
): string {
  return t(data.locale, "agency-member-invited.subject", {
    brandName: branding.brandName,
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

const ctaSection: React.CSSProperties = {
  padding: "16px 0 8px",
};
