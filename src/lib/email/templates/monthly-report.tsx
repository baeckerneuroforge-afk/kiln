import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["monthly-report"];
}

export function MonthlyReportEmail({ branding, data }: Props) {
  return (
    <BrandedLayout
      branding={branding}
      preview={`${data.monthLabel} report from ${branding.brandName}`}
    >
      <Heading style={heading}>{data.monthLabel} report</Heading>
      <Text style={paragraph}>Hi {data.customerName},</Text>
      <Text style={paragraph}>
        Here&apos;s a quick recap of what your AI workforce did last month.
      </Text>
      <Section style={statsRow}>
        <StatCell
          label="Conversations"
          value={data.totalConversations}
          color={branding.brandColor}
        />
        <StatCell
          label="Leads"
          value={data.totalLeads}
          color={branding.brandColor}
        />
        <StatCell
          label="Approvals"
          value={data.totalApprovals}
          color={branding.brandColor}
        />
      </Section>
      <Section style={ctaSection}>
        <BrandedButton href={data.reportUrl} branding={branding}>
          Open full report
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function monthlyReportSubject(
  branding: EmailBranding,
  data: EmailTemplateData["monthly-report"]
): string {
  return `[${branding.brandName}] ${data.monthLabel} report`;
}

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={cellStyle}>
      <div style={{ ...statValue, color }}>{value}</div>
      <div style={statLabel}>{label}</div>
    </div>
  );
}

const heading: React.CSSProperties = {
  fontSize: "22px",
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

const statsRow: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  margin: "16px 0",
};

const cellStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "#f5f5f5",
  borderRadius: "8px",
  padding: "16px",
  textAlign: "center",
};

const statValue: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
  lineHeight: "32px",
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  color: "#666666",
  marginTop: "4px",
};

const ctaSection: React.CSSProperties = {
  padding: "16px 0 8px",
};
