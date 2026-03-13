import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Terms of Service — KILN",
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

export default function TermsPage() {
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
        <h1 className="font-serif text-4xl text-white">Terms of Service</h1>
        <p className="mt-3 text-sm text-neutral-500">Last updated: March 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-neutral-400">
          <Section title="Service Description">
            <p>
              KILN is an AI agent creation platform operated by André Bäcker (Hephaistos Systems),
              Alicenstraße 48, 35390 Gießen, Germany. KILN enables users to create, configure,
              deploy, and manage AI-powered conversational agents using natural language.
            </p>
          </Section>

          <Section title="Account Terms">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>You must be at least 18 years old to use KILN.</li>
              <li>Each account is for a single person. Sharing login credentials is not permitted.</li>
              <li>You are responsible for maintaining the security of your account and API keys.</li>
              <li>You must provide accurate information during registration.</li>
            </ul>
          </Section>

          <Section title="Acceptable Use">
            <p>You agree not to use KILN to:</p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>Create agents that produce illegal, harmful, or misleading content.</li>
              <li>Generate spam or send unsolicited messages through agents.</li>
              <li>Build agents that impersonate real individuals without their consent.</li>
              <li>Violate any applicable laws or regulations, including GDPR and consumer protection laws.</li>
              <li>Attempt to reverse-engineer, exploit, or compromise the KILN platform.</li>
            </ul>
          </Section>

          <Section title="Payment Terms">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>Subscriptions are billed monthly via Stripe.</li>
              <li>Plans auto-renew at the end of each billing period unless cancelled.</li>
              <li>You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.</li>
              <li>No refunds are provided for partial months or unused time.</li>
              <li>KILN reserves the right to change pricing with 30 days&apos; advance notice.</li>
            </ul>
          </Section>

          <Section title="Intellectual Property">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li><strong className="text-neutral-300">Your content:</strong> You retain full ownership of your agents, configurations, knowledge bases, and all content you create on KILN.</li>
              <li><strong className="text-neutral-300">KILN platform:</strong> The KILN platform, including its design, code, branding, and documentation, is owned by Hephaistos Systems.</li>
              <li>KILN does not claim any rights over your content or use it for purposes other than providing the service.</li>
            </ul>
          </Section>

          <Section title="API Usage">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>API access is available on Agency and Admin plans.</li>
              <li>Rate limits apply (100 requests per minute per API key).</li>
              <li>Abusive API usage, including automated mass requests or key sharing, may result in suspension.</li>
              <li>KILN may revoke API keys at any time if violations are detected.</li>
            </ul>
          </Section>

          <Section title="White-Label">
            <p>
              Users on Pro and Agency plans may remove KILN branding (&ldquo;Powered by KILN&rdquo; badge)
              from their deployed agents. Use of custom domains and white-label features is subject
              to your plan&apos;s terms.
            </p>
          </Section>

          <Section title="Data and Privacy">
            <p>
              Your use of KILN is subject to our{" "}
              <Link href="/privacy" className="text-[#F97316] hover:underline">Privacy Policy</Link>,
              which describes how we collect, use, and protect your data.
            </p>
          </Section>

          <Section title="Limitation of Liability">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>KILN is provided on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis without warranties of any kind.</li>
              <li>We do not guarantee uninterrupted service, error-free operation, or specific AI output accuracy.</li>
              <li>Our maximum aggregate liability is limited to the fees you paid to KILN in the 12 months preceding the claim.</li>
              <li>KILN is not liable for any indirect, incidental, or consequential damages.</li>
            </ul>
          </Section>

          <Section title="Agent Responsibility">
            <p>
              You are solely responsible for the behavior of AI agents you create and deploy on KILN.
              This includes ensuring your agents comply with all applicable laws and regulations,
              provide accurate information, and do not cause harm to end-users. KILN is not liable
              for outputs generated by your agents.
            </p>
          </Section>

          <Section title="Termination">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>Either party may terminate this agreement at any time.</li>
              <li>Upon termination, your access to KILN will be revoked.</li>
              <li>Your data (agents, conversations, knowledge bases) will be deleted within 30 days of account termination.</li>
              <li>KILN may suspend or terminate accounts that violate these terms without prior notice.</li>
            </ul>
          </Section>

          <Section title="Changes to These Terms">
            <p>
              KILN may update these Terms of Service from time to time. We will notify you of
              material changes at least 30 days in advance via email or in-app notification.
              Continued use of the platform after changes take effect constitutes acceptance of the
              updated terms.
            </p>
          </Section>

          <Section title="Governing Law">
            <p>
              These terms are governed by the laws of the Federal Republic of Germany. The exclusive
              place of jurisdiction is Gießen, Germany.
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
