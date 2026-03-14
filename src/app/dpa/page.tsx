import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Data Processing Agreement — KILN",
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

export default function DpaPage() {
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
        <h1 className="font-serif text-4xl text-white">Data Processing Agreement</h1>
        <p className="mt-1 text-lg text-neutral-400">Auftragsverarbeitungsvertrag (AVV)</p>
        <p className="mt-3 text-sm text-neutral-500">Last updated: March 2026 · Zuletzt aktualisiert: März 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-neutral-400">
          {/* Preamble */}
          <Section title="Preamble / Präambel">
            <p>
              This Data Processing Agreement (&quot;DPA&quot;) is entered into between the customer using the KILN platform (&quot;Controller&quot;) and Hephaistos Systems, represented by André Bäcker, Gießen, Germany (&quot;Processor&quot;), in accordance with Art. 28 of the General Data Protection Regulation (GDPR / DSGVO).
            </p>
            <p>
              Dieser Auftragsverarbeitungsvertrag (&quot;AVV&quot;) wird geschlossen zwischen dem Kunden der KILN-Plattform (&quot;Verantwortlicher&quot;) und Hephaistos Systems, vertreten durch André Bäcker, Gießen, Deutschland (&quot;Auftragsverarbeiter&quot;), gemäß Art. 28 der Datenschutz-Grundverordnung (DSGVO).
            </p>
          </Section>

          {/* 1 */}
          <Section title="1. Subject Matter and Duration / Gegenstand und Dauer">
            <p>
              <strong className="text-neutral-300">Subject:</strong> The Processor processes personal data on behalf of the Controller in connection with the provision of the KILN AI Creation Platform. This includes hosting AI agents, processing chat conversations, storing knowledge base content, managing leads and analytics, and handling email and webhook communications.
            </p>
            <p>
              <strong className="text-neutral-300">Gegenstand:</strong> Der Auftragsverarbeiter verarbeitet personenbezogene Daten im Auftrag des Verantwortlichen im Rahmen der Bereitstellung der KILN AI Creation Platform. Dies umfasst das Hosting von AI Agents, die Verarbeitung von Chat-Konversationen, die Speicherung von Knowledge-Base-Inhalten, die Verwaltung von Leads und Analytics sowie die Abwicklung von E-Mail- und Webhook-Kommunikation.
            </p>
            <p>
              <strong className="text-neutral-300">Duration:</strong> This DPA is effective for the duration of the Controller&apos;s use of the KILN platform and terminates upon deletion of the Controller&apos;s account and completion of all data deletion obligations.
            </p>
            <p>
              <strong className="text-neutral-300">Dauer:</strong> Dieser AVV gilt für die Dauer der Nutzung der KILN-Plattform durch den Verantwortlichen und endet mit der Löschung des Kontos und Erfüllung aller Datenlöschungspflichten.
            </p>
          </Section>

          {/* 2 */}
          <Section title="2. Nature and Purpose of Processing / Art und Zweck der Verarbeitung">
            <p>The Processor processes personal data for the following purposes:</p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>Processing and storing chat conversations between end-users and the Controller&apos;s AI agents</li>
              <li>Storing and indexing knowledge base content (documents, URLs, FAQs) for retrieval-augmented generation (RAG)</li>
              <li>Collecting and managing lead data (names, emails, scores) generated through agent interactions</li>
              <li>Generating analytics and usage metrics for the Controller&apos;s dashboard</li>
              <li>Sending transactional emails on behalf of the Controller&apos;s agents</li>
              <li>Processing webhook events from connected third-party services (GitHub, Telegram, etc.)</li>
              <li>Authenticating and managing user accounts</li>
              <li>Processing payments and managing subscriptions</li>
            </ul>
          </Section>

          {/* 3 */}
          <Section title="3. Types of Personal Data / Art der personenbezogenen Daten">
            <p>The following categories of personal data may be processed:</p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li><strong className="text-neutral-300">Identification data</strong> — names, email addresses, usernames</li>
              <li><strong className="text-neutral-300">Communication data</strong> — chat messages, conversation history, email content</li>
              <li><strong className="text-neutral-300">Technical data</strong> — IP addresses, browser user agent strings, session identifiers</li>
              <li><strong className="text-neutral-300">Usage data</strong> — interaction timestamps, conversation metadata, lead scores, sentiment analysis</li>
              <li><strong className="text-neutral-300">Payment data</strong> — billing details (processed and stored exclusively by Stripe)</li>
              <li><strong className="text-neutral-300">Content data</strong> — knowledge base uploads, documents, and any personal data contained therein</li>
            </ul>
          </Section>

          {/* 4 */}
          <Section title="4. Categories of Data Subjects / Kategorien betroffener Personen">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li><strong className="text-neutral-300">Website visitors</strong> — individuals who interact with the Controller&apos;s AI agents via web chat, embedded widgets, or public agent pages</li>
              <li><strong className="text-neutral-300">Leads</strong> — individuals whose contact information is collected through agent interactions (e.g., email capture, appointment booking)</li>
              <li><strong className="text-neutral-300">Customers of the Controller</strong> — existing customers who use the Controller&apos;s AI agents for support, information, or transactions</li>
              <li><strong className="text-neutral-300">Team members</strong> — employees or collaborators of the Controller who access internal agents</li>
            </ul>
          </Section>

          {/* 5 */}
          <Section title="5. Obligations of the Processor / Pflichten des Auftragsverarbeiters">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li><strong className="text-neutral-300">Instruction-bound processing:</strong> The Processor shall process personal data only on documented instructions from the Controller, including with regard to transfers to third countries, unless required to do so by EU or Member State law.</li>
              <li><strong className="text-neutral-300">Confidentiality:</strong> All persons authorized to process personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.</li>
              <li><strong className="text-neutral-300">Security measures:</strong> The Processor implements appropriate technical and organizational measures as described in Section 7.</li>
              <li><strong className="text-neutral-300">Sub-processor management:</strong> The Processor shall not engage another processor without prior specific or general written authorization of the Controller. A list of approved sub-processors is provided in Section 6.</li>
              <li><strong className="text-neutral-300">Data subject rights:</strong> The Processor assists the Controller in fulfilling obligations to respond to requests for exercising data subject rights (access, rectification, erasure, portability).</li>
              <li><strong className="text-neutral-300">Breach notification:</strong> The Processor shall notify the Controller without undue delay after becoming aware of a personal data breach.</li>
              <li><strong className="text-neutral-300">Data Protection Impact Assessment:</strong> The Processor assists the Controller with DPIAs and prior consultations with supervisory authorities where required.</li>
            </ul>
          </Section>

          {/* 6 */}
          <Section title="6. Sub-processors / Unterauftragsverarbeiter">
            <p>The Controller grants general authorization for the use of the following sub-processors. The Processor will inform the Controller of any intended changes concerning the addition or replacement of sub-processors, giving the Controller the opportunity to object.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2.5 pr-4 text-left font-medium text-neutral-300">Sub-processor</th>
                    <th className="py-2.5 pr-4 text-left font-medium text-neutral-300">Purpose</th>
                    <th className="py-2.5 text-left font-medium text-neutral-300">Location</th>
                  </tr>
                </thead>
                <tbody className="text-neutral-400">
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-medium text-neutral-300">Anthropic</td>
                    <td className="py-2.5 pr-4">AI model provider (Claude) — processes chat messages for generating agent responses</td>
                    <td className="py-2.5">USA</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-medium text-neutral-300">OpenAI</td>
                    <td className="py-2.5 pr-4">Alternative AI model provider — processes chat messages when selected by Controller</td>
                    <td className="py-2.5">USA</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-medium text-neutral-300">Supabase</td>
                    <td className="py-2.5 pr-4">Database hosting (PostgreSQL), vector embeddings (pgvector), file storage</td>
                    <td className="py-2.5">EU (Frankfurt)</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-medium text-neutral-300">Clerk</td>
                    <td className="py-2.5 pr-4">User authentication, session management, social login</td>
                    <td className="py-2.5">USA</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-medium text-neutral-300">Stripe</td>
                    <td className="py-2.5 pr-4">Payment processing, subscription management, billing</td>
                    <td className="py-2.5">USA / EU</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-medium text-neutral-300">Vercel</td>
                    <td className="py-2.5 pr-4">Application hosting, serverless function execution, edge network</td>
                    <td className="py-2.5">Global (Edge)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-medium text-neutral-300">Resend</td>
                    <td className="py-2.5 pr-4">Transactional email delivery on behalf of agents</td>
                    <td className="py-2.5">USA</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              For US-based sub-processors, data transfers are governed by the EU-US Data Privacy Framework or Standard Contractual Clauses (SCCs) as applicable.
            </p>
          </Section>

          {/* 7 */}
          <Section title="7. Technical and Organizational Measures / Technische und organisatorische Maßnahmen">
            <p>The Processor implements the following measures to ensure an appropriate level of security (Art. 32 GDPR):</p>

            <p className="mt-2"><strong className="text-neutral-300">Encryption:</strong></p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>Encryption at rest: AES-256 for all database storage (Supabase managed encryption)</li>
              <li>Encryption in transit: TLS 1.3 for all data transmission between clients, servers, and sub-processors</li>
              <li>API keys and sensitive credentials are encrypted before storage using application-level encryption</li>
            </ul>

            <p className="mt-4"><strong className="text-neutral-300">Access Control:</strong></p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>User authentication managed via Clerk with support for multi-factor authentication (MFA)</li>
              <li>Role-based access control: data isolation per user account, agents are scoped to their owner</li>
              <li>API access controlled via per-user API keys with revocation capability</li>
              <li>Internal agent access restricted to authorized team members with configurable roles (Admin, Editor, Viewer)</li>
            </ul>

            <p className="mt-4"><strong className="text-neutral-300">Infrastructure Security:</strong></p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>Application hosted on Vercel with automatic security patches and DDoS protection</li>
              <li>Database hosted on Supabase with automated backups, point-in-time recovery, and network isolation</li>
              <li>All secrets and environment variables stored securely, never committed to version control</li>
            </ul>

            <p className="mt-4"><strong className="text-neutral-300">Monitoring and Incident Response:</strong></p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-neutral-600">
              <li>Application error monitoring and logging</li>
              <li>Rate limiting on all public API endpoints to prevent abuse</li>
              <li>Webhook signature verification for inbound integrations</li>
            </ul>
          </Section>

          {/* 8 */}
          <Section title="8. Data Deletion and Return / Löschung und Rückgabe">
            <p>
              <strong className="text-neutral-300">Account deletion:</strong> Upon deletion of the Controller&apos;s account, all personal data processed on behalf of the Controller — including agent configurations, conversations, leads, knowledge base content, and analytics — will be permanently deleted within 30 calendar days.
            </p>
            <p>
              <strong className="text-neutral-300">Data export:</strong> The Controller may export agent configurations as JSON files at any time via the platform&apos;s Export Config feature. Conversation logs and lead data can be accessed via the KILN API.
            </p>
            <p>
              <strong className="text-neutral-300">Kontolöschung:</strong> Nach Löschung des Kontos des Verantwortlichen werden alle in seinem Auftrag verarbeiteten personenbezogenen Daten — einschließlich Agent-Konfigurationen, Konversationen, Leads, Knowledge-Base-Inhalte und Analytics — innerhalb von 30 Kalendertagen endgültig gelöscht.
            </p>
            <p>
              <strong className="text-neutral-300">Backup retention:</strong> Automated database backups that may contain Controller data are retained for a maximum of 7 days and are then automatically purged.
            </p>
          </Section>

          {/* 9 */}
          <Section title="9. Audit Rights / Audit-Rechte">
            <p>
              The Controller has the right to conduct audits, including inspections, to verify the Processor&apos;s compliance with this DPA. The Processor shall make available to the Controller all information necessary to demonstrate compliance with the obligations laid down in Art. 28 GDPR.
            </p>
            <p>
              Audits shall be conducted with reasonable prior notice (at least 14 calendar days) and during normal business hours. The Controller may engage a qualified, independent third-party auditor bound by confidentiality obligations.
            </p>
            <p>
              Der Verantwortliche hat das Recht, Audits durchzuführen, um die Einhaltung dieses AVV durch den Auftragsverarbeiter zu überprüfen. Der Auftragsverarbeiter stellt dem Verantwortlichen alle erforderlichen Informationen zur Verfügung, um die Einhaltung der in Art. 28 DSGVO festgelegten Pflichten nachzuweisen.
            </p>
          </Section>

          {/* 10 */}
          <Section title="10. Liability / Haftung">
            <p>
              The liability of the parties is governed by the applicable provisions of the GDPR, in particular Art. 82 GDPR. Each party is liable for the damage caused by processing that infringes the GDPR in accordance with Art. 82(2) and (3) GDPR.
            </p>
            <p>
              The Processor shall be liable for damage caused by processing only where it has not complied with obligations of the GDPR specifically directed to processors, or where it has acted outside or contrary to lawful instructions of the Controller.
            </p>
            <p>
              Die Haftung der Parteien richtet sich nach den anwendbaren Bestimmungen der DSGVO, insbesondere Art. 82 DSGVO. Jede Partei haftet für den Schaden, der durch eine Verarbeitung verursacht wird, die gegen die DSGVO verstößt, gemäß Art. 82 Abs. 2 und 3 DSGVO.
            </p>
          </Section>

          {/* Contact */}
          <Section title="Contact / Kontakt">
            <p>
              <strong className="text-neutral-300">Processor / Auftragsverarbeiter:</strong><br />
              Hephaistos Systems<br />
              André Bäcker<br />
              Gießen, Germany<br />
              E-Mail: <a href="mailto:info@hephaistos-systems.de" className="text-[#F97316] hover:underline">info@hephaistos-systems.de</a>
            </p>
          </Section>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
