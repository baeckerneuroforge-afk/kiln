import { Heading, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";
import { BrandedButton } from "./shared/button";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["monthly-report"];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function MonthlyReportEmail({ branding, data }: Props) {
  const sla =
    typeof data.slaCompliancePercent === "number" ? `${data.slaCompliancePercent}%` : null;
  const avgResponse =
    typeof data.avgFirstResponseMinutes === "number" ? `${data.avgFirstResponseMinutes} Min` : null;
  const cost =
    typeof data.costSavedEur === "number" && data.costSavedEur > 0
      ? `${data.costSavedEur.toLocaleString("de-DE")} €`
      : null;
  const safeCustomMessage =
    typeof data.customMessage === "string" && data.customMessage.trim()
      ? escapeHtml(data.customMessage.trim())
      : null;

  return (
    <BrandedLayout
      branding={branding}
      preview={`${data.monthLabel} Report von ${branding.brandName}`}
    >
      <Heading style={heading}>{data.monthLabel} Report</Heading>
      <Text style={paragraph}>Hallo {data.customerName},</Text>
      <Text style={paragraph}>
        hier ist Ihre Monats-&Uuml;bersicht. Wir haben Ihnen die wichtigsten Kennzahlen
        zusammengestellt:
      </Text>

      <Section style={statsRow}>
        <StatCell
          label="Anfragen"
          value={data.totalConversations.toLocaleString("de-DE")}
          color={branding.brandColor}
        />
        {sla ? <StatCell label="SLA" value={sla} color={branding.brandColor} /> : null}
        {avgResponse ? <StatCell label="&Oslash; Reaktion" value={avgResponse} color={branding.brandColor} /> : null}
      </Section>

      {cost || typeof data.newCustomers === "number" ? (
        <Section style={statsRow}>
          {cost ? <StatCell label="Kosten gespart" value={cost} color={branding.brandColor} /> : null}
          {typeof data.newCustomers === "number" ? (
            <StatCell label="Neue Kunden" value={data.newCustomers} color={branding.brandColor} />
          ) : null}
          <StatCell
            label="Approvals"
            value={data.totalApprovals.toLocaleString("de-DE")}
            color={branding.brandColor}
          />
        </Section>
      ) : null}

      {Array.isArray(data.highlights) && data.highlights.length > 0 ? (
        <Section style={highlightsSection}>
          <Heading as="h2" style={subheading}>
            Highlights
          </Heading>
          {data.highlights.slice(0, 5).map((line, index) => (
            <Text key={index} style={bullet}>
              • {line}
            </Text>
          ))}
        </Section>
      ) : null}

      {Array.isArray(data.topTopics) && data.topTopics.length > 0 ? (
        <Section style={highlightsSection}>
          <Heading as="h2" style={subheading}>
            Top-Themen
          </Heading>
          {data.topTopics.slice(0, 5).map((entry, index) => (
            <Text key={index} style={bullet}>
              {entry.topic} ({entry.count}x)
            </Text>
          ))}
        </Section>
      ) : null}

      {safeCustomMessage ? (
        <Section style={highlightsSection}>
          <Text style={paragraph} dangerouslySetInnerHTML={{ __html: safeCustomMessage }} />
        </Section>
      ) : null}

      <Section style={ctaSection}>
        <BrandedButton href={data.reportUrl} branding={branding}>
          Vollst&auml;ndigen Report &ouml;ffnen
        </BrandedButton>
      </Section>
    </BrandedLayout>
  );
}

export function monthlyReportSubject(
  branding: EmailBranding,
  data: EmailTemplateData["monthly-report"]
): string {
  return `[${branding.brandName}] ${data.monthLabel} Report`;
}

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
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

const subheading: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#0c0a09",
  margin: "16px 0 8px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#1a1a1a",
  margin: "0 0 16px",
};

const bullet: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#1a1a1a",
  margin: "0 0 6px",
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
  fontSize: "26px",
  fontWeight: 700,
  lineHeight: "32px",
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  color: "#666666",
  marginTop: "4px",
};

const highlightsSection: React.CSSProperties = {
  padding: "8px 0",
};

const ctaSection: React.CSSProperties = {
  padding: "16px 0 8px",
};
