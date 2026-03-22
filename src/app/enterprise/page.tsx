const calendlyUrl =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  "https://calendly.com/kilnbase/enterprise";

const sections = [
  {
    label: "Security & Compliance",
    features: [
      {
        title: "SSO / SAML",
        description:
          "Connect KILN to your identity stack for secure access control and centralized provisioning.",
      },
      {
        title: "Role-Based Access Control",
        description:
          "Granular permissions per team, agent, and environment. Control who can build, deploy, and view analytics.",
      },
      {
        title: "Audit Trail & Compliance Logs",
        description:
          "Full history of every agent change, conversation, and admin action — exportable for compliance reviews.",
      },
      {
        title: "DPA & GDPR Ready",
        description:
          "EU-hosted infrastructure, signed DPA, data residency controls, and PII auto-redaction for regulated industries.",
      },
    ],
  },
  {
    label: "Data & Intelligence",
    features: [
      {
        title: "Knowledge Graph",
        description:
          "Connect related knowledge entries into a graph structure. Agents traverse relationships for deeper, more accurate answers.",
      },
      {
        title: "Self-Learning RAG",
        description:
          "Agents flag unanswered questions, suggest new KB entries, and auto-improve retrieval quality over time.",
      },
      {
        title: "ROI Dashboard",
        description:
          "Track estimated value per conversation, cost per lead, and agent ROI — with exportable reports for stakeholders.",
      },
      {
        title: "Cross-Client Analytics",
        description:
          "Aggregate performance metrics across all clients and agents in a single view. Compare, benchmark, and optimize at scale.",
      },
    ],
  },
  {
    label: "Scale & Control",
    features: [
      {
        title: "Unlimited Agents",
        description:
          "Deploy customer-facing, internal, and workflow agents without seat or volume ceilings.",
      },
      {
        title: "Agent Orchestration",
        description:
          "Define agent-to-agent handoff rules, multi-agent teams, and workflow pipelines that run autonomously.",
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
    ],
  },
  {
    label: "Agency & White-Label",
    features: [
      {
        title: "Full White-Label",
        description:
          "Remove all KILN branding. Custom logo, colors, domain, and email sender — your brand, your platform.",
      },
      {
        title: "Multi-Tenant Dashboard",
        description:
          "Manage all your clients, agents, and analytics from a single dashboard. Bulk operations and client-level isolation.",
      },
      {
        title: "Reseller Billing",
        description:
          "Set custom pricing per client, automate invoicing, and track margins — built for agencies scaling AI services.",
      },
      {
        title: "Custom Integrations",
        description:
          "Extend agents into your internal systems, CRMs, support tools, and proprietary workflows via API or webhook.",
      },
    ],
  },
];

const planComparison = [
  { feature: "Agents", pro: "10", enterprise: "Unlimited" },
  { feature: "AI Credits / mo", pro: "2,000", enterprise: "Custom" },
  { feature: "Knowledge Base", pro: "10 MB", enterprise: "Unlimited" },
  { feature: "Workflow Automations", pro: "3", enterprise: "Unlimited" },
  { feature: "SSO / SAML", pro: "—", enterprise: "✓" },
  { feature: "RBAC", pro: "—", enterprise: "✓" },
  { feature: "Audit Trail", pro: "—", enterprise: "✓" },
  { feature: "White-Label", pro: "Partial", enterprise: "Full" },
  { feature: "Multi-Tenant Dashboard", pro: "—", enterprise: "✓" },
  { feature: "Reseller Billing", pro: "—", enterprise: "✓" },
  { feature: "Custom SLA", pro: "—", enterprise: "✓" },
  { feature: "Dedicated Onboarding", pro: "—", enterprise: "✓" },
  { feature: "Priority Support", pro: "Email", enterprise: "Slack + Phone" },
];

export default function EnterprisePage() {
  return (
    <main className="min-h-screen bg-[#0C0A09] text-white">
      {/* Hero */}
      <section className="border-b border-white/[0.06] bg-[radial-gradient(circle_at_top,rgba(214,177,111,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-[#E7C98B]">
              Enterprise
            </p>
            <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
              AI Agent Infrastructure for Teams That Ship
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-300">
              SSO, RBAC, audit trails, unlimited agents, and dedicated support — everything your team needs to deploy AI agents at scale, without compromising on security or compliance.
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
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-7 py-3.5 text-sm font-medium text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Sections */}
      {sections.map((section) => (
        <section key={section.label} className="border-b border-white/[0.06] py-20">
          <div className="mx-auto max-w-6xl px-6">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C98B]">
              {section.label}
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {section.features.map((feature) => (
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
          </div>
        </section>
      ))}

      {/* Enterprise vs Pro Plan Comparison */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-6">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C98B]">
            Plan Comparison
          </p>
          <h2 className="mb-12 text-center font-serif text-3xl tracking-tight sm:text-4xl">
            Enterprise vs Pro
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]" style={{ backgroundColor: "rgba(214,177,111,0.06)" }}>
                  <th className="p-4 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">Feature</th>
                  <th className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400">Pro — €99/mo</th>
                  <th className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-[#E7C98B]">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {planComparison.map((row) => (
                  <tr key={row.feature} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 text-sm text-neutral-300">{row.feature}</td>
                    <td className="p-4 text-center text-sm text-neutral-500">{row.pro}</td>
                    <td className="p-4 text-center text-sm font-medium text-white" style={{ backgroundColor: "rgba(214,177,111,0.03)" }}>{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-2xl border border-[#D6B16F]/25 bg-[linear-gradient(180deg,rgba(214,177,111,0.08),rgba(255,255,255,0.02))] p-8 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C98B]">
                Custom Rollout
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">
                Bring KILN into complex teams without forcing a generic plan.
              </h2>
              <p className="mt-4 text-sm leading-7 text-neutral-300">
                We scope access controls, onboarding, integrations, and support around your operating model — instead of making enterprise teams squeeze into a self-serve checkout.
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
