import { Heading, Link, Section, Text } from "@react-email/components";
import type { EmailBranding, EmailTemplateData } from "../types";
import { BrandedLayout } from "./shared/layout";

interface Props {
  branding: EmailBranding;
  data: EmailTemplateData["department-digest"];
}

export function DepartmentDigestEmail({ branding, data }: Props) {
  return (
    <BrandedLayout
      branding={branding}
      preview={`${data.items.length} drafts await review`}
    >
      <Heading style={heading}>
        Daily digest — {data.departmentName}
      </Heading>
      <Text style={paragraph}>
        {data.items.length} drafts await your review.
      </Text>
      <Section style={listSection}>
        {data.items.map((item, index) => (
          <DigestItem
            key={`${item.itemUrl}-${index}`}
            item={item}
            color={branding.brandColor}
          />
        ))}
      </Section>
    </BrandedLayout>
  );
}

export function departmentDigestSubject(
  branding: EmailBranding,
  data: EmailTemplateData["department-digest"]
): string {
  return `[${branding.brandName}] Daily digest — ${data.departmentName} (${data.items.length} pending)`;
}

function DigestItem({
  item,
  color,
}: {
  item: EmailTemplateData["department-digest"]["items"][number];
  color: string;
}) {
  return (
    <Section style={itemBox}>
      <Text style={itemRow}>
        <strong>{item.channel}</strong>
        {" — "}
        {item.subject || "(no subject)"}
      </Text>
      {item.from ? <Text style={itemMeta}>From: {item.from}</Text> : null}
      <Text style={itemMeta}>
        Created: {item.createdAt}
        {" · "}
        <Link href={item.itemUrl} style={{ color }}>
          View draft
        </Link>
      </Text>
    </Section>
  );
}

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#0c0a09",
  margin: "0 0 8px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#666666",
  margin: "0 0 16px",
};

const listSection: React.CSSProperties = {
  margin: "0 0 16px",
};

const itemBox: React.CSSProperties = {
  backgroundColor: "#f5f5f5",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "0 0 8px",
};

const itemRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "20px",
  color: "#1a1a1a",
  margin: "0 0 4px",
};

const itemMeta: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#666666",
  margin: "0",
};
