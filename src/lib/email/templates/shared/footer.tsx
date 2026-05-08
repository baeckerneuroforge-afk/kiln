import { Hr, Link, Section, Text } from "@react-email/components";
import type { EmailBranding } from "../../types";

interface BrandedFooterProps {
  branding: EmailBranding;
}

export function BrandedFooter({ branding }: BrandedFooterProps) {
  return (
    <Section style={footerSection}>
      <Hr style={hrStyle} />
      <Text
        style={footerText}
        // The footer can carry sender-supplied HTML (e.g. legal address);
        // we trust agency-controlled input but escape user-controlled vars.
        dangerouslySetInnerHTML={{ __html: branding.footerHtml }}
      />
      {branding.supportLink ? (
        <Text style={supportText}>
          Need help?{" "}
          <Link href={branding.supportLink} style={{ color: branding.brandColor }}>
            Contact support
          </Link>
        </Text>
      ) : null}
    </Section>
  );
}

const footerSection: React.CSSProperties = {
  marginTop: "32px",
};

const hrStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid #e5e5e5",
  margin: "24px 0 16px",
};

const footerText: React.CSSProperties = {
  fontSize: "12px",
  color: "#666666",
  margin: "0 0 8px",
  lineHeight: "18px",
};

const supportText: React.CSSProperties = {
  fontSize: "12px",
  color: "#666666",
  margin: 0,
};
