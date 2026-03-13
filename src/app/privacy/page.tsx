import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Privacy Policy — KILN",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0C0A09] text-neutral-200">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-6">
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

      {/* Content */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="font-serif text-4xl text-white">Privacy Policy</h1>
        <p className="mt-3 text-sm text-neutral-500">Last updated: March 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-neutral-400">
          <Section title="What Data We Collect">
            <p>When you use KILN, we collect the following categories of data:</p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li><strong className="text-neutral-300">Account data</strong> — name, email address, and authentication details managed through Clerk.</li>
              <li><strong className="text-neutral-300">Agent configurations</strong> — system prompts, personality settings, knowledge base content, actions, and custom tools you create.</li>
              <li><strong className="text-neutral-300">Conversation data</strong> — messages exchanged between end-users and your AI agents, including session IDs and visitor metadata.</li>
              <li><strong className="text-neutral-300">Knowledge base uploads</strong> — text, URLs, PDFs, and FAQ entries you provide for RAG (Retrieval-Augmented Generation).</li>
              <li><strong className="text-neutral-300">Analytics</strong> — aggregated conversation counts, lead scores, and usage metrics.</li>
              <li><strong className="text-neutral-300">Payment data</strong> — billing information processed and stored by Stripe. KILN does not store credit card numbers.</li>
            </ul>
          </Section>

          <Section title="How We Use Your Data">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>To provide and operate the KILN platform, including AI agent creation, deployment, and conversation handling.</li>
              <li>To improve agent performance through analytics and the feedback/correction loop.</li>
              <li>To calculate usage analytics and generate lead scores for your dashboard.</li>
              <li>To process payments and manage your subscription.</li>
              <li>To send transactional emails (e.g. account verification, billing receipts).</li>
            </ul>
          </Section>

          <Section title="Sub-Processors">
            <p>We use the following third-party services to operate KILN:</p>
            <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-2.5 font-medium text-neutral-300">Provider</th>
                    <th className="px-4 py-2.5 font-medium text-neutral-300">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  <tr><td className="px-4 py-2.5 text-neutral-300">Anthropic</td><td className="px-4 py-2.5">Claude API — chat processing, zero data retention</td></tr>
                  <tr><td className="px-4 py-2.5 text-neutral-300">OpenAI</td><td className="px-4 py-2.5">ada-002 embeddings — knowledge base indexing</td></tr>
                  <tr><td className="px-4 py-2.5 text-neutral-300">Supabase</td><td className="px-4 py-2.5">PostgreSQL database — EU region</td></tr>
                  <tr><td className="px-4 py-2.5 text-neutral-300">Clerk</td><td className="px-4 py-2.5">Authentication and user management</td></tr>
                  <tr><td className="px-4 py-2.5 text-neutral-300">Stripe</td><td className="px-4 py-2.5">Payment processing</td></tr>
                  <tr><td className="px-4 py-2.5 text-neutral-300">Vercel</td><td className="px-4 py-2.5">Hosting and edge functions</td></tr>
                  <tr><td className="px-4 py-2.5 text-neutral-300">Resend</td><td className="px-4 py-2.5">Transactional emails</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Data Storage Location">
            <p>
              Your data is primarily stored in the EU. Our database is hosted on Supabase in the EU
              region, and Vercel serves content from EU edge locations. Some sub-processors (Anthropic,
              OpenAI, Stripe, Clerk) may process data in the United States under appropriate safeguards.
            </p>
          </Section>

          <Section title="Your Rights Under GDPR">
            <p>As a data subject under the GDPR, you have the right to:</p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li><strong className="text-neutral-300">Access</strong> — request a copy of your personal data.</li>
              <li><strong className="text-neutral-300">Rectification</strong> — correct inaccurate or incomplete data.</li>
              <li><strong className="text-neutral-300">Deletion</strong> — request erasure of your personal data.</li>
              <li><strong className="text-neutral-300">Portability</strong> — receive your data in a structured, machine-readable format.</li>
              <li><strong className="text-neutral-300">Objection</strong> — object to certain types of processing.</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:hello@kiln.ai" className="text-[#F97316] hover:underline">hello@kiln.ai</a>.
              We will respond within 30 days.
            </p>
          </Section>

          <Section title="AI Transparency">
            <p>
              KILN uses AI language models (primarily Anthropic&apos;s Claude) to power agent conversations.
              We operate under Anthropic&apos;s API zero-retention policy: conversation data sent to the Claude
              API is not stored by Anthropic and is not used for model training.
            </p>
          </Section>

          <Section title="Bring Your Own Key (BYOK)">
            <p>
              When you provide your own API keys for AI providers (Anthropic, OpenAI), conversation
              data is sent directly to your chosen provider under your own API agreement and terms.
              KILN does not control or monitor how your provider handles that data.
            </p>
          </Section>

          <Section title="Cookies">
            <p>
              KILN uses only <strong className="text-neutral-300">essential cookies</strong> required for
              authentication (Clerk session cookies). We do not use tracking cookies, analytics cookies,
              or any third-party advertising cookies.
            </p>
          </Section>

          <Section title="Contact">
            <p className="text-neutral-300">
              André Bäcker<br />
              KILN — Hephaistos Systems<br />
              Alicenstraße 48, 35390 Gießen, Germany<br />
              <a href="mailto:hello@kiln.ai" className="text-[#F97316] hover:underline">hello@kiln.ai</a>
            </p>
          </Section>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
