import { Body, Container, Head, Html, Preview } from "@react-email/components";
import type { EmailBranding } from "../../types";
import { BrandedHeader } from "./header";
import { BrandedFooter } from "./footer";

interface BrandedLayoutProps {
  branding: EmailBranding;
  preview: string;
  children: React.ReactNode;
}

export function BrandedLayout({ branding, preview, children }: BrandedLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <BrandedHeader branding={branding} />
          {children}
          <BrandedFooter branding={branding} />
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#fafafa",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
  margin: 0,
  padding: 0,
};

const containerStyle: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "24px",
  backgroundColor: "#ffffff",
};
