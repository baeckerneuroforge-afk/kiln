import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";
import { t } from "../i18n";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["sub-org-member-invited-new"];
}

export function SubOrgMemberInvitedNewEmail({ branding, data }: Props) {
  const roleLabel = t(data.locale, `role.${data.role}`);
  const permissionLabel = t(data.locale, `permission-set.${data.permissionSet}`);
  const preview = t(data.locale, "sub-org-invited.new.preview", {
    inviterName: data.inviterName,
    subOrgName: data.subOrgName,
  });

  return (
    <BrandedLayout branding={branding} preview={preview}>
      <Heading style={heading}>
        {t(data.locale, "sub-org-invited.new.heading")}
      </Heading>
      <Text style={paragraph}>
        {t(data.locale, "sub-org-invited.new.greeting")}
      </Text>
      <Text style={paragraph}>
        {t(data.locale, "sub-org-invited.new.body", {
          inviterName: data.inviterName,
          subOrgName: data.subOrgName,
          brandName: branding.brandName,
          roleLabel,
        })}
      </Text>
      <Text style={paragraph}>
        {t(data.locale, "sub-org-invited.new.permission", {
          permissionLabel,
        })}
      </Text>
      <Section style={ctaSection}>
        <BrandedButton href={data.learnMoreUrl} branding={branding}>
          {t(data.locale, "sub-org-invited.new.cta", {
            brandName: branding.brandName,
          })}
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function subOrgMemberInvitedNewSubject(
  branding: EmailBranding,
  data: EmailTemplateData["sub-org-member-invited-new"],
): string {
  return t(data.locale, "sub-org-invited.new.subject", {
    subOrgName: data.subOrgName,
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
