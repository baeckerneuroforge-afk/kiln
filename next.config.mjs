/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;
