import { Metadata } from "next";
import { Building2 } from "lucide-react";
import { FeaturePageTemplate } from "@/components/landing/feature-page-template";

export const metadata: Metadata = {
  title: "White-Label Sub-Orgs — KILN",
  description:
    "Per-client workspaces. Custom domain. Custom branding. Full data isolation. Your client sees ai.theirbrand.com — never KILN.",
};

export default function WhiteLabelSubOrgsPage() {
  return (
    <FeaturePageTemplate
      prePill="Feature · White-Label Sub-Orgs"
      icon={Building2}
      headline={
        <>
          One platform.{" "}
          <span className="text-kiln-orange">Every client</span> gets their own.
        </>
      }
      subhead="Each client gets a dedicated workspace with their own domain, branding, and login URL. They see 'their' AI platform. You manage everything from one master dashboard."
      whatBody={
        <>
          <p>
            White-labeling in most platforms means &ldquo;we&apos;ll hide our
            logo and let you upload yours&rdquo;. KILN goes deeper. Each
            sub-org is a fully isolated tenant: its own custom domain (e.g.,
            <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">ai.acme-corp.com</code>),
            its own branding (logo, color palette, favicon), its own login
            URL, its own data perimeter.
          </p>
          <p>
            From the agency&apos;s master dashboard, you see all your
            sub-orgs in a list. Click into any one to inspect KPIs, login
            as the client (with full audit trail), invite their team, or
            archive them. The client never sees the master dashboard.
          </p>
          <p>
            Data isolation is enforced at the database layer with
            org-scoped queries — there is no path for one client&apos;s data
            to leak into another&apos;s view, even with engineering bugs.
            Every row in every table carries an <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">orgId</code>{" "}
            and queries filter on it.
          </p>
        </>
      }
      howSteps={[
        {
          title: "Create the sub-org",
          body:
            "One click in your master dashboard creates a new Clerk organization, a fresh KILN workspace, and an empty branding row.",
        },
        {
          title: "Configure the brand",
          body:
            "Upload logo, set primary color, optional custom domain via DNS CNAME. Vercel auto-provisions the SSL certificate. Your client&apos;s login URL goes live in minutes.",
        },
        {
          title: "Hand the client the keys",
          body:
            "Send them a one-click onboarding link. They sign up, see only their workspace, and never know KILN is the underlying platform unless you want them to.",
        },
      ]}
      useCases={[
        {
          title: "Boutique AI Agency",
          body:
            "Manage 25 clients each on their own domain (ai.client.com). Charge each one €497/mo. One Stripe Connect setup, 25 recurring revenue streams.",
        },
        {
          title: "Marketing Reseller",
          body:
            "White-label KILN under your studio brand. Sell subscriptions to retainer clients without revealing the underlying platform.",
        },
        {
          title: "Vertical SaaS",
          body:
            "Bundle pre-built agents for a specific industry (legal, real estate, e-commerce) and ship under your own brand. KILN becomes invisible infrastructure.",
        },
      ]}
      techBullets={[
        "OrgRelationship model maps parent agency → child sub-orgs in Clerk",
        "Org-scoped Prisma queries (orgScopeFilter helper) — no cross-tenant leaks",
        "Custom domains via Vercel platform-domains API with auto-SSL",
        "Per-sub-org OrgBranding row: logoUrl, primaryColor, customDomain, showAgencyLogo",
        "Full audit trail when an agency owner uses 'Login as client' to support sub-orgs",
        "GDPR-compliant data export per sub-org — clients own their data, agency owns the relationship",
      ]}
    />
  );
}
