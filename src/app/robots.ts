/**
 * Sprint 19.10 — robots.txt for crawlers.
 *
 * Allow public marketing surface, disallow the auth-walled dashboard
 * + internal API endpoints. The sitemap link points the crawler at
 * the canonical URL list.
 */
import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://kilnbase.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/api/",
          "/sign-in",
          "/sign-up",
          "/a/_custom-domain",
          "/a/_agency-entry",
          "/onboarding/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
