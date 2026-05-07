"use client";

/**
 * Pricing — four tiers (Free / Pro / Business / Agency). Agency is
 * the highlighted tier and reads as the recommended CTA for the
 * landing's primary audience.
 */
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tier {
  name: string;
  price: string;
  cadence: string;
  audience: string;
  features: string[];
  cta: string;
  href: string;
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "0€",
    cadence: "/mo",
    audience: "For testing",
    features: [
      "1 AI agent",
      "50 AI credits/month",
      "1 knowledge base (5MB)",
      "KILN branding",
    ],
    cta: "Start Free",
    href: "/sign-up",
  },
  {
    name: "Pro",
    price: "97€",
    cadence: "/mo",
    audience: "For solo builders",
    features: [
      "3 agents",
      "2,000 AI credits/month",
      "5 knowledge bases (50MB)",
      "Multi-channel deployment",
      "White-label widget",
      "Email support",
    ],
    cta: "Start Pro",
    href: "/sign-up?plan=pro",
  },
  {
    name: "Business",
    price: "297€",
    cadence: "/mo",
    audience: "For growing teams",
    features: [
      "10 agents",
      "5,000 AI credits/month",
      "Unlimited knowledge bases",
      "Full white-label",
      "Multi-channel including Voice",
      "Agent cloning",
      "Priority support",
    ],
    cta: "Start Business",
    href: "/sign-up?plan=business",
  },
  {
    name: "Agency",
    price: "497€",
    cadence: "/mo",
    audience: "For AI agencies",
    features: [
      "Unlimited agents",
      "15,000 AI credits/month",
      "Unlimited sub-orgs (white-label per client)",
      "Stripe Connect billing",
      "Custom domains per sub-org",
      "Multi-client management",
      "Dedicated support",
    ],
    cta: "Start Agency Trial",
    href: "/sign-up?plan=agency",
    highlight: true,
  },
];

export function PricingSection() {
  return (
    <section
      id="pricing"
      aria-label="Pricing"
      className="border-y border-border/40 bg-card/30 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Pricing
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Simple pricing. No surprises.
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Start free. Upgrade when you have your first client. Scale as you
            add more.
          </p>
        </div>

        <div
          className="mx-auto mt-12 grid max-w-6xl gap-4 lg:grid-cols-4"
          data-testid="pricing-grid"
        >
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              data-tier={tier.name.toLowerCase()}
              data-highlight={tier.highlight ? "true" : "false"}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 transition-colors",
                tier.highlight
                  ? "border-kiln-orange/60 shadow-xl shadow-kiln-orange/5"
                  : "border-border hover:border-foreground/20",
              )}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-kiln-orange px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white shadow-md">
                  Most Popular for Agencies
                </span>
              )}
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {tier.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tier.audience}
                </p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="font-serif text-4xl font-bold text-foreground">
                    {tier.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tier.cadence}
                  </span>
                </p>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted-foreground">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        tier.highlight ? "text-kiln-orange" : "text-kiln-green",
                      )}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={tier.href}
                className={cn(
                  "mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                  tier.highlight
                    ? "bg-kiln-orange text-white shadow shadow-kiln-orange/20 hover:bg-kiln-orange/90"
                    : "border border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Need a custom setup or done-for-you service?{" "}
          <Link
            href="/services"
            className="font-medium text-kiln-orange hover:underline"
          >
            Talk to us →
          </Link>
        </p>
      </div>
    </section>
  );
}
