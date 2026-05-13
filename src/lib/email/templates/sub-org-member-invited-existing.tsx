import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";
import { t } from "../i18n";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["sub-org-member-invited-existing"];
}

export function SubOrgMemberInvitedExistingEmail({ branding, data }: Props) {
  const recipientName = data.recipientName ?? "";
  const roleLabel = t(data.locale, `role.${data.role}`);
  const permissionLabel = t(data.locale, `permission-set.${data.permissionSet}`);
  const preview = t(data.locale, "sub-org-invited.existing.preview", {
    inviterName: data.inviterName,
    subOrgName: data.subOrgName,
  });

  return (
    <BrandedLayout branding={branding} preview={preview}>
      <Heading style={heading}>
        {t(data.locale, "sub-org-invited.existing.heading", {
          subOrgName: data.subOrgName,
        })}
      </Heading>
      <Text style={paragraph}>
        {t(data.locale, "sub-org-invited.existing.greeting", {
          recipientName,
        })}
      </Text>
      <Text style={paragraph}>
        {t(data.locale, "sub-org-invited.existing.body", {
          inviterName: data.inviterName,
          subOrgName: data.subOrgName,
          roleLabel,
        })}
      </Text>
      <Text style={paragraph}>
        {t(data.locale, "sub-org-invited.existing.permission", {
          permissionLabel,
        })}
      </Text>
      <Section style={ctaSection}>
        <BrandedButton href={data.workspaceUrl} branding={branding}>
          {t(data.locale, "sub-org-invited.existing.cta")}
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function subOrgMemberInvitedExistingSubject(
  _branding: EmailBranding,
  data: EmailTemplateData["sub-org-member-invited-existing"],
): string {
  return t(data.locale, "sub-org-invited.existing.subject", {
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

const ctaSection: React.CSSProperties = {
  padding: "16px 0 8px",
};
