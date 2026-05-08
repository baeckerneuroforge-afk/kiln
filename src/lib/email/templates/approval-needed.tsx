import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["approval-needed"];
}

export function ApprovalNeededEmail({ branding, data }: Props) {
  return (
    <BrandedLayout
      branding={branding}
      preview={`${data.departmentName}: 1 draft needs your review`}
    >
      <Heading style={heading}>
        Approval needed — {data.departmentName}
      </Heading>
      <Text style={paragraph}>A new draft is awaiting your review.</Text>
      <Section style={metaBox}>
        <Text style={metaRow}>
          <strong>Channel:</strong> {data.channel}
        </Text>
        {data.fromIdentity ? (
          <Text style={metaRow}>
            <strong>From:</strong> {data.fromIdentity}
          </Text>
        ) : null}
        {data.subject ? (
          <Text style={metaRow}>
            <strong>Subject:</strong> {data.subject}
          </Text>
        ) : null}
      </Section>
      <Section style={previewBox}>
        <Text
          style={{
            ...metaRow,
            borderLeft: `3px solid ${branding.brandColor}`,
            paddingLeft: "12px",
            whiteSpace: "pre-wrap",
            color: "#333333",
          }}
        >
          {data.preview}
        </Text>
      </Section>
      <Section style={ctaSection}>
        <BrandedButton href={data.approvalUrl} branding={branding}>
          View draft
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function approvalNeededSubject(
  branding: EmailBranding,
  data: EmailTemplateData["approval-needed"]
): string {
  return `[${branding.brandName}] Approval needed — ${data.departmentName}`;
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
  margin: "0 0 12px",
};

const metaBox: React.CSSProperties = {
  backgroundColor: "#f5f5f5",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "12px 0",
};

const previewBox: React.CSSProperties = {
  margin: "12px 0",
};

const metaRow: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#1a1a1a",
  margin: 0,
};

const ctaSection: React.CSSProperties = {
  padding: "16px 0 8px",
};
