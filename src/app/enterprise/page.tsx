const calendlyUrl =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  "https://calendly.com/kilnbase/enterprise";

const enterpriseFeatures = [
  {
    title: "Unlimited Agents",
    description:
      "Deploy customer-facing, internal, and workflow agents without seat or volume ceilings.",
  },
  {
    title: "Dedicated Onboarding",
    description:
      "Roll out with guided setup, architecture support, and a tailored launch plan for your team.",
  },
  {
    title: "Custom SLA",
    description:
      "Align uptime, support response, and escalation paths to your operational requirements.",
  },
  {
    title: "Priority Support",
    description:
      "Get a faster line to the KILN team for production issues, rollout questions, and optimization.",
  },
  {
    title: "SSO / SAML",
    description:
      "Connect KILN to your identity stack for secure access control and centralized provisioning.",
  },
  {
    title: "Custom Integrations",
    description:
      "Extend agents into your internal systems, CRMs, support tools, and proprietary workflows.",
  },
];

export default function EnterprisePage() {
  return (
    <main className="min-h-screen bg-[#0C0A09] text-white">
      <section className="border-b border-white/[0.06] bg-[radial-gradient(circle_at_top,rgba(214,177,111,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-[#E7C98B]">
              Enterprise
            </p>
            <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
              KILN for Enterprise
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-300">
              Custom AI agent infrastructure for teams that need more
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href={calendlyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-white px-7 py-3.5 text-sm font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
              >
                Schedule a Demo
              </a>
              <a
                href="mailto:enterprise@kilnbase.com"
                className="text-sm text-neutral-300 underline underline-offset-4 hover:text-white"
              >
                Or email us at enterprise@kilnbase.com
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {enterpriseFeatures.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6"
              >
                <h2 className="text-lg font-semibold">{feature.title}</h2>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border border-[#D6B16F]/25 bg-[linear-gradient(180deg,rgba(214,177,111,0.08),rgba(255,255,255,0.02))] p-8 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C98B]">
                Custom Rollout
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">
                Bring KILN into complex teams without forcing a generic plan.
              </h2>
              <p className="mt-4 text-sm leading-7 text-neutral-300">
                We can scope access controls, onboarding, integrations, and
                support around your operating model instead of making enterprise
                teams squeeze into a self-serve checkout.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <a
                  href={calendlyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-7 py-3.5 text-sm font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
                >
                  Schedule a Demo
                </a>
                <a
                  href="mailto:enterprise@kilnbase.com"
                  className="text-sm text-neutral-300 underline underline-offset-4 hover:text-white"
                >
                  enterprise@kilnbase.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
