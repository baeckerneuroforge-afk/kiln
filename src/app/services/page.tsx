import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Professional Setup — KILN",
  description: "Let our team build your AI agents, knowledge base, and integrations — ready to go in 24 hours.",
};

const packages = [
  {
    name: "Quick Start",
    price: "Starting from €490",
    subtitle: "Perfect for freelancers and small businesses.",
    features: [
      "1 AI Agent fully configured",
      "Knowledge Base setup (PDF, FAQ, or URL)",
      "Actions configured (Booking, Lead Capture, etc.)",
      "Embed widget on your website",
      "Onboarding Wizard walkthrough",
      "30 days email support",
    ],
  },
  {
    name: "Business Setup",
    price: "Starting from €1,490",
    subtitle: "For established businesses ready to automate.",
    popular: true,
    features: [
      "3 AI Agents with distinct roles",
      "Full Knowledge Base with all your docs",
      "Custom Actions & integrations",
      "White-Label branding (your logo, colors)",
      "Analytics & ROI dashboard setup",
      "Webhook V2 integration",
      "Embeddable component setup",
      "1h Training Call (recorded)",
      "30 days email support",
    ],
  },
  {
    name: "Agency Launch",
    price: "Starting from €3,990",
    subtitle: "For agencies deploying at scale.",
    features: [
      "10+ AI Agents across clients",
      "Full Platform Setup & configuration",
      "Agent Orchestration workflows",
      "Multi-Tenant Dashboard configuration",
      "Agent SDK & CLI onboarding",
      "Webhook V2 & API integrations",
      "Custom domain + White-Label setup",
      "Reseller Billing configuration",
      "3h Training Sessions (recorded)",
      "30 days priority support",
    ],
  },
];

const steps = [
  {
    number: "01",
    title: "Discovery Call",
    description: "We learn about your business, goals, and how AI agents can help. 30 minutes, no commitment.",
  },
  {
    number: "02",
    title: "Setup in 24h",
    description: "Our team configures your agents, uploads knowledge bases, sets up actions, and tests everything.",
  },
  {
    number: "03",
    title: "Training",
    description: "We walk you through the dashboard, show you how to manage agents, and answer all your questions.",
  },
  {
    number: "04",
    title: "Go Live",
    description: "Your agents go live on your website. We monitor the first week and optimize as needed.",
  },
];

const faqs = [
  {
    q: "What if I need changes after setup?",
    a: "Your 30-day support window covers any adjustments — new FAQ entries, action tweaks, branding updates. After that, you can manage everything yourself through the dashboard, or book a follow-up session.",
  },
  {
    q: "What's included in the Knowledge Base setup?",
    a: "We upload and optimize your existing docs (PDFs, website content, FAQs), chunk them for best retrieval, and test the agent's answers for accuracy. You provide the source material, we handle the rest.",
  },
  {
    q: "How long does the setup actually take?",
    a: "Most setups are completed within 24 hours of receiving your materials. Complex Agency Launch setups may take 2–3 business days. You'll have a live agent to test before we go public.",
  },
  {
    q: "Do I need a KILN subscription?",
    a: "Yes — the setup service configures your agents on your KILN account. We recommend at least the Starter plan (€39/mo) for small setups, or Pro (€99/mo) for Business and Agency packages.",
  },
  {
    q: "Can I get a refund if I'm not satisfied?",
    a: "If we can't deliver what was agreed in the discovery call, you get a full refund. We've never had to issue one — but the guarantee is there for your peace of mind.",
  },
];

export default function ServicesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0C0A09] text-neutral-200">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded font-serif text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              K
            </div>
            <span className="font-serif text-base">KILN</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 py-20 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">Professional Setup</p>
          <h1 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
            Want us to build it for you?
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
            Our team sets up your AI agents, knowledge base, and integrations — ready to go in 24 hours.
            You focus on your business, we handle the tech.
          </p>
        </section>

        {/* Packages */}
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <div className="grid gap-6 md:grid-cols-3">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  pkg.popular
                    ? "border-[#F97316]/30 bg-[#F97316]/[0.03]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                {pkg.popular && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
                  >
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white">{pkg.name}</h3>
                <div className="mt-2">
                  <span className="font-serif text-2xl text-white">{pkg.price}</span>
                </div>
                <p className="mt-2 text-[13px] text-neutral-500">{pkg.subtitle}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-neutral-400">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:andre@hephaistos-systems.de?subject=KILN Professional Setup — {pkg.name}"
                  className={`mt-6 block rounded-xl py-2.5 text-center text-sm font-medium text-white transition-all hover:brightness-110 ${
                    pkg.popular ? "" : "border border-white/10 hover:bg-white/[0.04]"
                  }`}
                  style={pkg.popular ? { background: "linear-gradient(135deg, #F97316, #DC2626)" } : undefined}
                >
                  Book a Call
                </a>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-neutral-500">
            Every setup includes 30 days of email support and a satisfaction guarantee.
          </p>
          <p className="mt-4 text-center text-sm text-neutral-400">
            Not sure which package fits?{" "}
            <a
              href="mailto:andre@hephaistos-systems.de?subject=KILN Professional Setup — Discovery Call"
              className="text-[#F97316] underline underline-offset-2 transition-colors hover:text-[#FB923C]"
            >
              Book a free 15-minute discovery call
            </a>
            {" "}— no commitment.
          </p>
        </section>

        {/* Process Steps */}
        <section className="border-t border-white/[0.06] py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">How It Works</p>
              <h2 className="font-serif text-3xl tracking-tight text-white">From call to live in 4 steps</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-4">
              {steps.map((step) => (
                <div key={step.number}>
                  <div className="mb-3 font-mono text-2xl font-bold text-[#F97316]/30">{step.number}</div>
                  <h3 className="mb-2 text-sm font-semibold text-white">{step.title}</h3>
                  <p className="text-[13px] leading-relaxed text-neutral-500">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-white/[0.06] py-20">
          <div className="mx-auto max-w-3xl px-6">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">FAQ</p>
              <h2 className="font-serif text-3xl tracking-tight text-white">Common questions</h2>
            </div>
            <div className="space-y-6">
              {faqs.map((faq) => (
                <div key={faq.q} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <h3 className="text-sm font-semibold text-white">{faq.q}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials Placeholder */}
        <section className="border-t border-white/[0.06] py-20">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">Testimonials</p>
            <h2 className="font-serif text-3xl tracking-tight text-white">What our clients say</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { name: "Coming Soon", role: "Early Adopter", quote: "We're onboarding our first Professional Setup clients now. Your testimonial could be here." },
                { name: "Coming Soon", role: "Business Owner", quote: "Be among the first to experience a fully managed KILN setup and share your story." },
                { name: "Coming Soon", role: "Agency Partner", quote: "Early partners get priority pricing and a featured spot on this page." },
              ].map((t, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-left">
                  <p className="text-[13px] italic leading-relaxed text-neutral-400">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-neutral-500">{t.name}</p>
                    <p className="text-[11px] text-neutral-600">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-white/[0.06] py-20">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="font-serif text-3xl tracking-tight text-white">Ready to get started?</h2>
            <p className="mt-4 text-neutral-400">
              Book a free 30-minute discovery call. No commitment, no pressure.
            </p>
            <a
              href="mailto:andre@hephaistos-systems.de?subject=KILN Professional Setup — Discovery Call"
              className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-medium text-white transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              Book a Discovery Call
            </a>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
