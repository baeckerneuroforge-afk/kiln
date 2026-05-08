import { Img, Section, Text } from "@react-email/components";
import type { EmailBranding } from "../../types";

interface BrandedHeaderProps {
  branding: EmailBranding;
}

export function BrandedHeader({ branding }: BrandedHeaderProps) {
  return (
    <Section style={headerSection}>
      {branding.logoUrl ? (
        <Img
          src={branding.logoUrl}
          alt={branding.brandName}
          width={120}
          style={logoStyle}
        />
      ) : (
        <Text style={{ ...brandText, color: branding.brandColor }}>
          {branding.brandName}
        </Text>
      )}
    </Section>
  );
}

const headerSection: React.CSSProperties = {
  padding: "24px 0 16px",
};

const logoStyle: React.CSSProperties = {
  display: "block",
  height: "auto",
};

const brandText: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 600,
  margin: 0,
};
