/**
 * Sprint 19.10 — sitemap.xml for SEO crawlers.
 *
 * Lists the public marketing pages + the legal pages. Dashboard
 * routes stay out (auth-walled, not crawl-targets). Add new public
 * pages here as the marketing surface grows.
 */
import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://kilnbase.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    { path: "/", priority: 1.0, changeFreq: "weekly" as const },
    { path: "/pricing", priority: 0.9, changeFreq: "weekly" as const },
    { path: "/faq", priority: 0.8, changeFreq: "monthly" as const },
    { path: "/agencies", priority: 0.7, changeFreq: "monthly" as const },
    { path: "/enterprise", priority: 0.7, changeFreq: "monthly" as const },
    { path: "/services", priority: 0.6, changeFreq: "monthly" as const },
    { path: "/changelog", priority: 0.5, changeFreq: "weekly" as const },
    { path: "/docs", priority: 0.5, changeFreq: "monthly" as const },
    { path: "/developers", priority: 0.5, changeFreq: "monthly" as const },
    { path: "/marketplace", priority: 0.5, changeFreq: "monthly" as const },
    { path: "/features/multi-agent-workflows", priority: 0.4, changeFreq: "monthly" as const },
    { path: "/features/agency-billing", priority: 0.4, changeFreq: "monthly" as const },
    { path: "/features/white-label-sub-orgs", priority: 0.4, changeFreq: "monthly" as const },
    { path: "/features/byok-mcp-a2a", priority: 0.4, changeFreq: "monthly" as const },
    { path: "/features/self-learning-rag", priority: 0.4, changeFreq: "monthly" as const },
    { path: "/features/multi-channel", priority: 0.4, changeFreq: "monthly" as const },
    { path: "/privacy", priority: 0.3, changeFreq: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFreq: "yearly" as const },
    { path: "/dpa", priority: 0.3, changeFreq: "yearly" as const },
    { path: "/impressum", priority: 0.3, changeFreq: "yearly" as const },
    { path: "/help", priority: 0.3, changeFreq: "monthly" as const },
  ];

  return routes.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFreq,
    priority: r.priority,
  }));
}
