"use client";

import { useState } from "react";
import { Copy, Check, Terminal, Code2, Package, Zap, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-stone-400 hover:text-white"
    >
      {copied ? <Check className="w-4 h-4 text-kiln-green" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg border border-stone-800 bg-stone-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-stone-800">
        <span className="text-xs text-stone-500 font-mono">{language}</span>
      </div>
      <CopyButton text={code} />
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm font-mono text-stone-300">{code}</code>
      </pre>
    </div>
  );
}

const tabs = [
  { id: "quickstart", label: "Schnellstart", icon: Zap },
  { id: "sdk", label: "SDK Referenz", icon: Code2 },
  { id: "cli", label: "CLI", icon: Terminal },
  { id: "webhooks", label: "Webhooks", icon: Package },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function SDKDocsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("quickstart");

  return (
    <div className="min-h-screen bg-[#0C0A09] text-white">
      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-kiln-orange to-kiln-ember flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-serif text-white">KILN SDK</h1>
          </div>
          <p className="text-stone-400 text-lg max-w-2xl">
            Integriere KILN in deine Anwendungen. Erstelle und verwalte AI Agents,
            starte Workflows und empfange Events — alles programmatisch.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-stone-800 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap",
                activeTab === tab.id
                  ? "text-kiln-orange border-kiln-orange"
                  : "text-stone-500 border-transparent hover:text-stone-300"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Quickstart */}
        {activeTab === "quickstart" && (
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-serif text-white mb-4">Installation</h2>
              <CodeBlock
                language="bash"
                code={`npm install @kiln/sdk`}
              />
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">API Key erstellen</h2>
              <p className="text-stone-400 mb-4">
                Erstelle einen API Key unter{" "}
                <a href="/dashboard/settings" className="text-kiln-orange hover:underline">
                  Einstellungen → API Keys
                </a>.
                Dein Key beginnt mit <code className="text-kiln-orange font-mono">sk-kiln-</code>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">Schnellstart-Beispiel</h2>
              <CodeBlock
                code={`import { KilnSDK } from '@kiln/sdk';

const sdk = new KilnSDK({
  apiKey: process.env.KILN_API_KEY!,
});

// Alle Agents auflisten
const agents = await sdk.agents.list();
console.log(agents);

// Neuen Agent erstellen
const agent = await sdk.agents.create({
  name: "Support Bot",
  systemPrompt: "Du bist ein freundlicher Support-Agent...",
  status: "LIVE",
});

// Mit Agent chatten
const response = await sdk.agents.chat(agent.id, {
  message: "Was sind eure Preise?",
});
console.log(response.response);`}
              />
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">Fehlerbehandlung</h2>
              <CodeBlock
                code={`import { KilnSDK, KilnAPIError, KilnRateLimitError } from '@kiln/sdk';

try {
  const agents = await sdk.agents.list();
} catch (err) {
  if (err instanceof KilnRateLimitError) {
    console.log(\`Rate limit. Retry nach \${err.retryAfter}s\`);
  } else if (err instanceof KilnAPIError) {
    console.error(\`API Fehler (\${err.status}): \${err.message}\`);
  }
}`}
              />
            </section>
          </div>
        )}

        {/* SDK Reference */}
        {activeTab === "sdk" && (
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-serif text-white mb-4">sdk.agents</h2>
              <div className="space-y-4">
                <ApiMethod
                  method="sdk.agents.list()"
                  description="Alle Agents des Accounts auflisten."
                  returns="Promise<Agent[]>"
                />
                <ApiMethod
                  method="sdk.agents.get(id)"
                  description="Details eines Agents abrufen."
                  returns="Promise<AgentDetail>"
                />
                <ApiMethod
                  method="sdk.agents.create(input)"
                  description="Neuen Agent erstellen."
                  returns="Promise<{ id, slug, status }>"
                  example={`await sdk.agents.create({
  name: "Sales Bot",
  systemPrompt: "Du bist ein Sales Agent...",
  llmModel: "claude-sonnet-4-6",
  status: "LIVE",
  actions: ["SCORE_LEAD", "COLLECT_EMAIL"],
});`}
                />
                <ApiMethod
                  method="sdk.agents.update(id, input)"
                  description="Agent aktualisieren."
                  returns="Promise<AgentDetail>"
                />
                <ApiMethod
                  method="sdk.agents.delete(id)"
                  description="Agent löschen."
                  returns="Promise<{ deleted: boolean }>"
                />
                <ApiMethod
                  method="sdk.agents.chat(id, input)"
                  description="Nachricht an Agent senden."
                  returns="Promise<ChatResponse>"
                  example={`const res = await sdk.agents.chat("agent_id", {
  message: "Hallo!",
  sessionId: "optional-session-id",
});
console.log(res.response);`}
                />
              </div>
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">sdk.workflows</h2>
              <div className="space-y-4">
                <ApiMethod
                  method="sdk.workflows.list()"
                  description="Alle Workflows auflisten."
                  returns="Promise<Workflow[]>"
                />
                <ApiMethod
                  method="sdk.workflows.trigger(id, input)"
                  description="Workflow ausführen."
                  returns="Promise<WorkflowExecution>"
                  example={`const exec = await sdk.workflows.trigger("workflow_id", {
  goal: "Erstelle einen Wochenbericht",
  context: { department: "Sales" },
});`}
                />
                <ApiMethod
                  method="sdk.workflows.getExecution(executionId)"
                  description="Execution-Status abrufen."
                  returns="Promise<WorkflowExecution>"
                />
              </div>
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">sdk.computerUse</h2>
              <div className="space-y-4">
                <ApiMethod
                  method="sdk.computerUse.startSession(agentId, input)"
                  description="Browser-Session starten (Computer Use)."
                  returns="Promise<ComputerUseSession>"
                />
                <ApiMethod
                  method="sdk.computerUse.executeAction(sessionId, action)"
                  description="Action in Session ausführen."
                  returns="Promise<{ success, result }>"
                />
                <ApiMethod
                  method="sdk.computerUse.getArtifacts(sessionId)"
                  description="Erzeugte Artefakte abrufen."
                  returns="Promise<{ artifacts }>"
                />
                <ApiMethod
                  method="sdk.computerUse.stopSession(sessionId)"
                  description="Session beenden."
                  returns="Promise<{ stopped }>"
                />
              </div>
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">sdk.knowledge</h2>
              <div className="space-y-4">
                <ApiMethod
                  method="sdk.knowledge.search(agentId, query, limit?)"
                  description="Semantische Suche in der Knowledge Base."
                  returns="Promise<KnowledgeSearchResult[]>"
                />
                <ApiMethod
                  method="sdk.knowledge.getEntities(agentId)"
                  description="Knowledge Graph Entities abrufen."
                  returns="Promise<{ entities }>"
                />
              </div>
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">sdk.webhooks</h2>
              <div className="space-y-4">
                <ApiMethod
                  method="sdk.webhooks.list()"
                  description="Alle Webhook-Subscriptions auflisten."
                  returns="Promise<WebhookSubscription[]>"
                />
                <ApiMethod
                  method="sdk.webhooks.create(config)"
                  description="Neuen Webhook erstellen."
                  returns="Promise<WebhookSubscription>"
                  example={`await sdk.webhooks.create({
  url: "https://example.com/webhook",
  events: ["conversation.started", "lead.captured"],
});`}
                />
                <ApiMethod
                  method="sdk.webhooks.test(webhookId)"
                  description="Test-Event an Webhook senden."
                  returns="Promise<{ success, statusCode }>"
                />
              </div>
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">sdk.credits</h2>
              <div className="space-y-4">
                <ApiMethod
                  method="sdk.credits.getBalance()"
                  description="Aktuellen Credit-Stand abrufen."
                  returns="Promise<CreditBalance>"
                />
                <ApiMethod
                  method="sdk.credits.getUsage(period?)"
                  description="Credit-Nutzungshistorie."
                  returns="Promise<{ usage: CreditUsageEntry[] }>"
                />
              </div>
            </section>
          </div>
        )}

        {/* CLI */}
        {activeTab === "cli" && (
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-serif text-white mb-4">Installation</h2>
              <CodeBlock
                language="bash"
                code={`npm install -g @kiln/sdk`}
              />
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">Login</h2>
              <CodeBlock
                language="bash"
                code={`kiln login
# API Key eingeben: sk-kiln-...
# Konfiguration wird in ~/.kiln/config.json gespeichert`}
              />
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">Agents verwalten</h2>
              <CodeBlock
                language="bash"
                code={`# Alle Agents auflisten
kiln agents list

# JSON-Output
kiln agents list --json

# Neuen Agent erstellen
kiln agents create --name "Support Bot" --prompt "Du bist ein Support-Agent..."

# Mit Agent chatten
kiln agents chat <agent-id> --message "Hallo, was kostet euer Pro-Plan?"`}
              />
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">Workflows</h2>
              <CodeBlock
                language="bash"
                code={`# Workflows auflisten
kiln workflows list

# Workflow starten
kiln workflows trigger <workflow-id> --goal "Erstelle Wochenbericht"

# Status prüfen
kiln workflows status <execution-id>`}
              />
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">Credits & Health</h2>
              <CodeBlock
                language="bash"
                code={`# Credit-Balance anzeigen
kiln credits

# System-Gesundheit prüfen
kiln health`}
              />
            </section>
          </div>
        )}

        {/* Webhooks */}
        {activeTab === "webhooks" && (
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-serif text-white mb-4">Webhook Events</h2>
              <p className="text-stone-400 mb-4">
                KILN sendet HTTP POST Requests an deine URL wenn bestimmte Events eintreten.
                Jeder Request enthält eine HMAC-SHA256 Signatur im Header{" "}
                <code className="text-kiln-orange font-mono">X-KILN-Signature</code>.
              </p>

              <div className="rounded-lg border border-stone-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-stone-900/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-stone-400 font-medium">Event</th>
                      <th className="text-left px-4 py-3 text-stone-400 font-medium">Beschreibung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800">
                    {[
                      ["conversation.started", "Neues Gespräch gestartet"],
                      ["conversation.completed", "Gespräch beendet"],
                      ["lead.captured", "Lead erfasst (E-Mail gesammelt)"],
                      ["appointment.booked", "Termin gebucht"],
                      ["agent.updated", "Agent-Konfiguration geändert"],
                      ["task.completed", "Task-Agent erfolgreich ausgeführt"],
                      ["task.failed", "Task-Agent fehlgeschlagen"],
                      ["team.execution.started", "Workflow-Execution gestartet"],
                      ["team.execution.completed", "Workflow-Execution abgeschlossen"],
                      ["team.execution.failed", "Workflow-Execution fehlgeschlagen"],
                      ["credits.low", "Credits unter 10%"],
                    ].map(([event, desc]) => (
                      <tr key={event}>
                        <td className="px-4 py-3 font-mono text-kiln-orange">{event}</td>
                        <td className="px-4 py-3 text-stone-400">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-serif text-white mb-4">Signatur verifizieren</h2>
              <CodeBlock
                code={`import crypto from 'crypto';

function verifyKilnSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express.js Beispiel
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-kiln-signature'];
  const isValid = verifyKilnSignature(
    JSON.stringify(req.body),
    signature,
    process.env.KILN_WEBHOOK_SECRET
  );

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Event verarbeiten
  const { event, data } = req.body;
  console.log(\`Event: \${event}\`, data);

  res.status(200).send('OK');
});`}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper Component ─────────────────────────────────────────

function ApiMethod({
  method,
  description,
  returns,
  example,
}: {
  method: string;
  description: string;
  returns: string;
  example?: string;
}) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/30 p-4">
      <div className="flex items-start justify-between mb-2">
        <code className="text-sm font-mono text-kiln-orange">{method}</code>
        <span className="text-xs text-stone-500 font-mono">{returns}</span>
      </div>
      <p className="text-sm text-stone-400 mb-2">{description}</p>
      {example && (
        <CodeBlock code={example} />
      )}
    </div>
  );
}
