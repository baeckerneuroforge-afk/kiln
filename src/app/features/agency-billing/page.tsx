import { Metadata } from "next";
import { Receipt } from "lucide-react";
import { FeaturePageTemplate } from "@/components/landing/feature-page-template";

export const metadata: Metadata = {
  title: "Agency Billing (Stripe Connect) — KILN",
  description:
    "Built-in agency billing. Charge sub-orgs monthly. One Stripe account, N client subscriptions. Auto-invoicing.",
};

export default function AgencyBillingPage() {
  return (
    <FeaturePageTemplate
      prePill="Feature · Stripe-Connect Billing"
      icon={Receipt}
      headline={
        <>
          One platform.{" "}
          <span className="text-kiln-orange">N recurring revenue streams.</span>
        </>
      }
      subhead="Connect your Stripe account once. Charge each sub-org monthly. Setup fees, trials, custom pricing per client — KILN handles the plumbing."
      whatBody={
        <>
          <p>
            The agency revenue pattern KILN unlocks is simple: build once,
            sell access N times, charge monthly. The pricing layer makes
            that possible without you writing billing code.
          </p>
          <p>
            Per sub-org, you pick a billing mode: <em>Free</em> (no charge,
            useful during onboarding), <em>Stripe Subscription</em> (recurring
            monthly + optional setup fee + optional trial), or{" "}
            <em>Custom invoice</em> (you bill the client outside KILN, useful
            for enterprise or non-card clients).
          </p>
          <p>
            All Stripe traffic goes through your connected account — KILN
            never sees the customer&apos;s money. Fees go straight to your
            balance. The agency-revenue dashboard splits MRR from one-time
            setup-fee revenue so you see what&apos;s recurring vs lumpy.
          </p>
        </>
      }
      howSteps={[
        {
          title: "Connect Stripe (one-time)",
          body:
            "Stripe Connect Express onboarding. KYC and payout setup happen on Stripe's hosted flow. Status mirrors back so the dashboard shows you when you're ready to charge.",
        },
        {
          title: "Set per-sub-org pricing",
          body:
            "Open a sub-org's Pricing tab. Pick a billing mode. Enter monthly + setup fee. Toggle trial days. Save — the Stripe Product + Prices auto-provision.",
        },
        {
          title: "Send the onboarding link",
          body:
            "Each sub-org has a public onboarding URL with the pricing pre-filled. Client signs up + pays. Invoices, dunning, and renewal all happen in your Stripe account.",
        },
      ]}
      useCases={[
        {
          title: "Standard agency tier",
          body:
            "Charge €497/mo per client + €1,500 setup fee, 14-day trial. Build one workflow template, deploy to 25 sub-orgs, collect €12,425/mo recurring + lumpy setup revenue.",
        },
        {
          title: "Enterprise custom invoice",
          body:
            "Big client wants quarterly billing via PO. Use Custom invoice mode — display the price on their onboarding page, bill them out-of-band, KILN access stays unblocked.",
        },
        {
          title: "Free pilots that convert",
          body:
            "Run a 30-day Free pilot. After it converts, switch the sub-org to Stripe Subscription mode without rebuilding the workspace.",
        },
      ]}
      techBullets={[
        "Stripe Connect Express integration with KYC + payout dashboards",
        "Per-sub-org SubOrgSubscription mirror so the dashboard works without round-tripping Stripe",
        "Webhook-driven sync — every Stripe event updates local state in real-time",
        "MRR / setup-revenue split in the agency revenue dashboard",
        "Trial periods, prorated upgrades, dunning, and cancellation all handled by Stripe",
        "12-month invoice mirror in KILN for the agency owner; live PDF + hosted-invoice URL",
      ]}
    />
  );
}
