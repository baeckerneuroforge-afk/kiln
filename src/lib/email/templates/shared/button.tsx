import { Button } from "@react-email/components";
import type { EmailBranding } from "../../types";

interface BrandedButtonProps {
  href: string;
  branding: EmailBranding;
  children: React.ReactNode;
}

export function BrandedButton({ href, branding, children }: BrandedButtonProps) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: branding.brandColor,
        color: "#ffffff",
        padding: "12px 22px",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: 500,
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}
