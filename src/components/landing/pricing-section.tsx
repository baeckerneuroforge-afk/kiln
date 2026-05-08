"use client";

/**
 * Pricing — four tiers (Free / Pro / Business / Agency). Agency is
 * the highlighted tier and reads as the recommended CTA for the
 * landing's primary audience.
 */
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedSection } from "./animated-section";

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
    <AnimatedSection
      id="pricing"
      aria-label="Pricing"
      className="relative isolate bg-white py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-kiln-orange">
            Pricing
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
            Simple pricing. No surprises.
          </h2>
          <p className="mt-4 text-base text-stone-600">
            Start free. Upgrade when you have your first client. Scale as you
            add more.
          </p>
        </div>

        <div
          className="mx-auto mt-14 grid max-w-6xl gap-4 lg:grid-cols-4"
          data-testid="pricing-grid"
        >
          {TIERS.map((tier, idx) => (
            <div
              key={tier.name}
              data-tier={tier.name.toLowerCase()}
              data-highlight={tier.highlight ? "true" : "false"}
              style={{
                animationDelay: `${idx * 80}ms`,
              }}
              className={cn(
                "kiln-pricing-card relative flex flex-col rounded-2xl border p-6",
                "transition-all duration-300 ease-out",
                tier.highlight
                  ? "lg:-translate-y-2 border-2 border-kiln-orange bg-white shadow-xl shadow-kiln-orange/10 hover:shadow-2xl hover:shadow-kiln-orange/20"
                  : "border-stone-200 bg-stone-50 hover:-translate-y-0.5 hover:border-stone-300 hover:bg-white hover:shadow-lg",
              )}
            >
              {tier.highlight && (
                <span
                  className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center rounded-full bg-kiln-orange px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white shadow-md kiln-pricing-badge-pulse"
                  data-testid="pricing-badge-popular"
                >
                  Most Popular for Agencies
                </span>
              )}
              <div>
                <h3 className="text-base font-semibold text-stone-900">
                  {tier.name}
                </h3>
                <p className="mt-1 text-xs text-stone-500">
                  {tier.audience}
                </p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="font-serif text-5xl font-bold text-stone-900">
                    {tier.price}
                  </span>
                  <span className="text-sm text-stone-500">
                    {tier.cadence}
                  </span>
                </p>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-stone-700">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        tier.highlight ? "text-kiln-orange" : "text-emerald-600",
                      )}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={tier.href}
                className={cn(
                  "mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200",
                  tier.highlight
                    ? "bg-kiln-orange text-white shadow-lg shadow-kiln-orange/30 hover:-translate-y-0.5 hover:bg-kiln-orange/95 hover:shadow-xl hover:shadow-kiln-orange/40"
                    : "bg-stone-900 text-white hover:-translate-y-0.5 hover:bg-stone-800 hover:shadow-md",
                )}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-stone-500">
          Need a custom setup or done-for-you service?{" "}
          <Link
            href="/services"
            className="font-medium text-kiln-orange transition-colors hover:underline"
          >
            Talk to us →
          </Link>
        </p>
      </div>

      <style jsx>{`
        @keyframes kiln-pricing-fade-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes kiln-pricing-badge-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(249,115,22,0); }
        }
        :global(.kiln-pricing-card) {
          animation: kiln-pricing-fade-in 600ms ease-out both;
        }
        :global(.kiln-pricing-badge-pulse) {
          animation: kiln-pricing-badge-pulse 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.kiln-pricing-card),
          :global(.kiln-pricing-badge-pulse) {
            animation: none !important;
          }
        }
      `}</style>
    </AnimatedSection>
  );
}
