import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

// Sprint 19.9 — i18n via next-intl. We point the plugin at our custom
// request-config under src/i18n/request.ts. No URL-prefix routing in
// this sprint — see src/i18n/config.ts for the rationale.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDFKit benötigt .afm Fontdateien zur Laufzeit — Vercel bundled sie nicht automatisch
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      {
        // Embed-Seiten dürfen in iframes geladen werden
        source: "/embed/:slug*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        // Alle anderen Seiten: iframe-Embedding blockieren
        source: "/((?!embed).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

// Only wrap with Sentry if DSN is configured
const hasSentry = !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN;

const withI18n = withNextIntl(nextConfig);

export default hasSentry
  ? withSentryConfig(withI18n, {
      silent: true,
      hideSourceMaps: true,
      disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
      disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
    })
  : withI18n;
