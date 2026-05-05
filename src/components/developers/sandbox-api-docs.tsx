"use client";

/**
 * Sandbox API Dokumentation — Interaktive Client-Komponente
 * Zeigt Endpoints, Code-Beispiele und ein "Try it"-Interface
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Check,
  Play,
  Loader2,
  Globe,
  Code2,
  Monitor,
  MousePointer,
  Type,
  ArrowDown,
  FileText,
} from "lucide-react";

/* ── Copy-Button ── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-[#22C55E]" /> : <Copy className="h-3 w-3" />}
      {copied ? "Kopiert" : "Kopieren"}
    </button>
  );
}

/* ── Code-Block ── */

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
        <code className="font-mono text-foreground">{code}</code>
      </pre>
    </div>
  );
}

/* ── Endpoint-Karte ── */

function EndpointCard({
  method,
  path,
  description,
  requestBody,
  responseBody,
  children,
}: {
  method: "GET" | "POST" | "DELETE";
  path: string;
  description: string;
  requestBody?: string;
  responseBody?: string;
  children?: React.ReactNode;
}) {
  const methodColors = {
    GET: "bg-[#3B82F6]/15 text-[#3B82F6]",
    POST: "bg-[#22C55E]/15 text-[#22C55E]",
    DELETE: "bg-[#DC2626]/15 text-[#DC2626]",
  };

  return (
    <div className="rounded-2xl border border-border bg-muted overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-md px-2.5 py-1 font-mono text-xs font-bold ${methodColors[method]}`}
          >
            {method}
          </span>
          <code className="font-mono text-sm text-foreground">{path}</code>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-0">
        {requestBody && (
          <div className="border-b border-border px-6 py-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Request Body
            </p>
            <CodeBlock code={requestBody} language="JSON" />
          </div>
        )}
        {responseBody && (
          <div className="border-b border-border px-6 py-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Response
            </p>
            <CodeBlock code={responseBody} language="JSON" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ── Action-Typen ── */

const ACTION_TYPES = [
  {
    type: "navigate",
    label: "Navigate",
    desc: "Browser zu einer URL navigieren",
    icon: Globe,
    fields: '{ "type": "navigate", "url": "https://example.com" }',
  },
  {
    type: "screenshot",
    label: "Screenshot",
    desc: "Screenshot der aktuellen Seite aufnehmen",
    icon: Monitor,
    fields: '{ "type": "screenshot" }',
  },
  {
    type: "click",
    label: "Click",
    desc: "An Koordinaten klicken",
    icon: MousePointer,
    fields: '{ "type": "click", "x": 100, "y": 200 }',
  },
  {
    type: "type",
    label: "Type",
    desc: "Text eingeben (Tastatur)",
    icon: Type,
    fields: '{ "type": "type", "text": "Hello World" }',
  },
  {
    type: "scroll",
    label: "Scroll",
    desc: "Seite scrollen",
    icon: ArrowDown,
    fields: '{ "type": "scroll", "direction": "down", "amount": 500 }',
  },
  {
    type: "execute_code",
    label: "Code ausführen",
    desc: "Python oder JavaScript in der Sandbox ausführen",
    icon: Code2,
    fields: '{ "type": "execute_code", "language": "python", "code": "print(42)" }',
  },
  {
    type: "read_page",
    label: "Seite lesen",
    desc: "Seiteninhalt als Text extrahieren",
    icon: FileText,
    fields: '{ "type": "read_page" }',
  },
];

/* ── Try-It Sektion ── */

function TryItSection() {
  const [apiKey, setApiKey] = useState("");
  const [actionType, setActionType] = useState("navigate");
  const [actionBody, setActionBody] = useState(
    '{\n  "type": "navigate",\n  "url": "https://example.com"\n}'
  );
  const [sessionId, setSessionId] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "action" | "status" | "destroy">("create");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function executeRequest(method: string, path: string, body?: unknown) {
    if (!apiKey) {
      setResponse(JSON.stringify({ error: "Bitte API-Key eingeben" }, null, 2));
      return;
    }

    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));

      // Session-ID automatisch setzen bei Erstellung
      if (data.sessionId && activeTab === "create") {
        setSessionId(data.sessionId);
      }
    } catch (err) {
      setResponse(
        JSON.stringify(
          { error: err instanceof Error ? err.message : "Request fehlgeschlagen" },
          null,
          2
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-kiln-orange/20 bg-kiln-orange/[0.03] overflow-hidden">
      <div className="border-b border-kiln-orange/10 px-6 py-4">
        <h3 className="text-lg font-semibold text-foreground">Ausprobieren</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Teste die Sandbox API direkt hier. Du brauchst einen gültigen API-Key.
        </p>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* API Key */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-kiln-..."
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange/50 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
          />
        </div>

        {/* Session ID */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Session ID{" "}
            {sessionId && <span className="text-[#22C55E]">(automatisch gesetzt)</span>}
          </label>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="Session ID hier eingeben oder Session erstellen"
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange/50 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
          />
        </div>

        {/* Tab-Auswahl */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { key: "create", label: "Erstellen" },
              { key: "action", label: "Action" },
              { key: "status", label: "Status" },
              { key: "destroy", label: "Beenden" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-kiln-orange text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab-Content */}
        {activeTab === "create" && (
          <div className="space-y-3">
            <CodeBlock
              code={JSON.stringify(
                {
                  capabilities: ["browser", "code_python", "screenshots"],
                  timeout: 300,
                  maxSteps: 50,
                },
                null,
                2
              )}
              language="Request Body"
            />
            <button
              onClick={() =>
                executeRequest("POST", "/api/v1/sandbox", {
                  capabilities: ["browser", "code_python", "screenshots"],
                  timeout: 300,
                  maxSteps: 50,
                })
              }
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-[#22C55E] px-4 py-2 text-sm font-semibold text-[#1a1918] transition-all hover:scale-105 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Session erstellen
            </button>
          </div>
        )}

        {activeTab === "action" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Action-Typ
              </label>
              <select
                value={actionType}
                onChange={(e) => {
                  setActionType(e.target.value);
                  const found = ACTION_TYPES.find((a) => a.type === e.target.value);
                  if (found) setActionBody(JSON.stringify(JSON.parse(found.fields), null, 2));
                }}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-kiln-orange/50 focus:outline-none"
              >
                {ACTION_TYPES.map((a) => (
                  <option key={a.type} value={a.type}>
                    {a.label} -- {a.desc}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Request Body
              </label>
              <textarea
                value={actionBody}
                onChange={(e) => setActionBody(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-white placeholder:text-muted-foreground focus:border-kiln-orange/50 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
              />
            </div>
            <button
              onClick={() => {
                if (!sessionId) {
                  setResponse(
                    JSON.stringify({ error: "Bitte erst eine Session erstellen" }, null, 2)
                  );
                  return;
                }
                try {
                  executeRequest(
                    "POST",
                    `/api/v1/sandbox/${sessionId}/action`,
                    JSON.parse(actionBody)
                  );
                } catch {
                  setResponse(JSON.stringify({ error: "Ungültiges JSON" }, null, 2));
                }
              }}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-kiln-orange px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-105 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Action ausführen
            </button>
          </div>
        )}

        {activeTab === "status" && (
          <button
            onClick={() => {
              if (!sessionId) {
                setResponse(JSON.stringify({ error: "Bitte Session-ID eingeben" }, null, 2));
                return;
              }
              executeRequest("GET", `/api/v1/sandbox/${sessionId}`);
            }}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-105 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Status abfragen
          </button>
        )}

        {activeTab === "destroy" && (
          <button
            onClick={() => {
              if (!sessionId) {
                setResponse(JSON.stringify({ error: "Bitte Session-ID eingeben" }, null, 2));
                return;
              }
              executeRequest("DELETE", `/api/v1/sandbox/${sessionId}`);
            }}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-105 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Session beenden
          </button>
        )}

        {/* Response */}
        {response && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">Response</span>
              <CopyButton text={response} />
            </div>
            <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-card p-4 font-mono text-xs leading-relaxed text-foreground">
              {response}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Hauptkomponente ── */

export function SandboxApiDocs() {
  const [exampleTab, setExampleTab] = useState<"curl" | "javascript">("curl");

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-white">
      {/* Navigation */}
      <Link
        href="/developers"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zu Developers
      </Link>

      {/* Header */}
      <div className="mb-12">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-kiln-orange/20 bg-kiln-orange/10 px-3 py-1 text-xs font-medium text-kiln-orange">
          <Code2 className="h-3.5 w-3.5" />
          REST API
        </div>
        <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Sandbox API</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          Programmatischer Zugriff auf Browser-Automatisierung und Code-Ausführung. Navigiere
          Webseiten, nimm Screenshots auf, führe Python/JavaScript aus — alles über eine
          einfache REST API.
        </p>
      </div>

      {/* Inhaltsverzeichnis */}
      <nav className="mb-12 rounded-xl border border-border bg-muted p-4">
        <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Inhalt
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            { href: "#authentifizierung", label: "Authentifizierung" },
            { href: "#session-erstellen", label: "Session erstellen" },
            { href: "#action-ausfuehren", label: "Actions ausführen" },
            { href: "#action-typen", label: "Action-Typen" },
            { href: "#session-status", label: "Session-Status" },
            { href: "#session-beenden", label: "Session beenden" },
            { href: "#artefakte", label: "Artefakte" },
            { href: "#ausprobieren", label: "Ausprobieren" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-kiln-orange"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-16">
        {/* Authentifizierung */}
        <section id="authentifizierung">
          <h2 className="mb-4 font-serif text-2xl text-white">Authentifizierung</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Alle API-Aufrufe erfordern einen gültigen API-Key im Authorization-Header. Die
            Sandbox API ist ab dem Pro-Plan verfügbar.
          </p>
          <CodeBlock code="Authorization: Bearer sk-kiln-YOUR_API_KEY" language="Header" />
          <p className="mt-3 text-xs text-muted-foreground">
            API-Keys erstellst du unter Dashboard &rarr; Einstellungen &rarr; API Keys.
          </p>
        </section>

        {/* Session erstellen */}
        <section id="session-erstellen">
          <h2 className="mb-4 font-serif text-2xl text-white">Session erstellen</h2>
          <EndpointCard
            method="POST"
            path="/api/v1/sandbox"
            description="Erstellt eine neue Sandbox-Session mit den gewünschten Capabilities."
            requestBody={JSON.stringify(
              {
                capabilities: ["browser", "code_python", "screenshots"],
                timeout: 300,
                maxSteps: 50,
              },
              null,
              2
            )}
            responseBody={JSON.stringify(
              {
                sessionId: "clxyz123abc",
                status: "ready",
                capabilities: ["browser", "code_python", "screenshots"],
                expiresAt: "2026-03-22T15:05:00.000Z",
                config: {
                  capabilities: ["browser", "code_python", "screenshots"],
                  timeout: 300,
                  maxSteps: 50,
                },
              },
              null,
              2
            )}
          >
            <div className="px-6 py-4">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">capabilities:</strong> Array mit{" "}
                <code className="text-kiln-orange">browser</code>,{" "}
                <code className="text-kiln-orange">code_python</code>,{" "}
                <code className="text-kiln-orange">code_javascript</code>,{" "}
                <code className="text-kiln-orange">screenshots</code>
                <br />
                <strong className="text-foreground">timeout:</strong> Sekunden bis Ablauf
                (30-600, default 300)
                <br />
                <strong className="text-foreground">maxSteps:</strong> Maximale Anzahl an
                Actions (1-200, default 50)
              </p>
            </div>
          </EndpointCard>
        </section>

        {/* Actions ausführen */}
        <section id="action-ausfuehren">
          <h2 className="mb-4 font-serif text-2xl text-white">Actions ausführen</h2>

          <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 w-fit">
            {(["curl", "javascript"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setExampleTab(tab)}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                  exampleTab === tab
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "curl" ? "cURL" : "JavaScript"}
              </button>
            ))}
          </div>

          {exampleTab === "curl" ? (
            <CodeBlock
              code={`# Browser navigieren
curl -X POST https://your-domain.com/api/v1/sandbox/{sessionId}/action \\
  -H "Authorization: Bearer sk-kiln-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "type": "navigate", "url": "https://example.com" }'

# Screenshot aufnehmen
curl -X POST https://your-domain.com/api/v1/sandbox/{sessionId}/action \\
  -H "Authorization: Bearer sk-kiln-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "type": "screenshot" }'

# Python-Code ausführen
curl -X POST https://your-domain.com/api/v1/sandbox/{sessionId}/action \\
  -H "Authorization: Bearer sk-kiln-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "type": "execute_code", "language": "python", "code": "print(2+2)" }'`}
              language="cURL"
            />
          ) : (
            <CodeBlock
              code={`const API_KEY = "sk-kiln-YOUR_KEY";
const BASE = "https://your-domain.com/api/v1";
const SESSION_ID = "clxyz123abc";

// Browser navigieren
const nav = await fetch(\`\${BASE}/sandbox/\${SESSION_ID}/action\`, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "navigate", url: "https://example.com" }),
}).then(r => r.json());

// Screenshot aufnehmen
const screenshot = await fetch(\`\${BASE}/sandbox/\${SESSION_ID}/action\`, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "screenshot" }),
}).then(r => r.json());

// Python-Code ausführen
const code = await fetch(\`\${BASE}/sandbox/\${SESSION_ID}/action\`, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type: "execute_code",
    language: "python",
    code: "import math\\nprint(math.pi)",
  }),
}).then(r => r.json());

console.log(code.result.stdout); // 3.141592653589793`}
              language="JavaScript"
            />
          )}

          <div className="mt-4">
            <EndpointCard
              method="POST"
              path="/api/v1/sandbox/{sessionId}/action"
              description="Führt eine Action in der Sandbox-Session aus. Unterstützt Browser-Steuerung und Code-Ausführung."
              responseBody={JSON.stringify(
                {
                  success: true,
                  result: {
                    url: "https://example.com",
                    contentLength: 12453,
                    contentPreview: "<!doctype html>...",
                  },
                  screenshot: "data:image/png;base64,...",
                  creditsUsed: 0.5,
                  durationMs: 2340,
                },
                null,
                2
              )}
            />
          </div>
        </section>

        {/* Action-Typen */}
        <section id="action-typen">
          <h2 className="mb-4 font-serif text-2xl text-white">Action-Typen</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {ACTION_TYPES.map((action) => {
              const Icon = action.icon;
              return (
                <div
                  key={action.type}
                  className="rounded-xl border border-border bg-muted p-4 transition-all hover:border-border"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/10">
                      <Icon className="h-4 w-4 text-kiln-orange" />
                    </div>
                    <div>
                      <code className="text-sm font-mono font-bold text-white">{action.type}</code>
                      <p className="text-xs text-muted-foreground">{action.desc}</p>
                    </div>
                  </div>
                  <pre className="rounded-lg bg-card p-2 font-mono text-[11px] text-muted-foreground overflow-x-auto">
                    {action.fields}
                  </pre>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border border-border bg-muted p-4">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Capability-Zuordnung:</strong>{" "}
              <code className="text-kiln-orange">navigate</code>,{" "}
              <code className="text-kiln-orange">click</code>,{" "}
              <code className="text-kiln-orange">type</code>,{" "}
              <code className="text-kiln-orange">scroll</code>,{" "}
              <code className="text-kiln-orange">read_page</code> erfordern{" "}
              <code className="text-[#22C55E]">browser</code>.{" "}
              <code className="text-kiln-orange">screenshot</code> erfordert{" "}
              <code className="text-[#22C55E]">screenshots</code> oder{" "}
              <code className="text-[#22C55E]">browser</code>.{" "}
              <code className="text-kiln-orange">execute_code</code> erfordert{" "}
              <code className="text-[#22C55E]">code_python</code> oder{" "}
              <code className="text-[#22C55E]">code_javascript</code>.
            </p>
          </div>
        </section>

        {/* Session-Status */}
        <section id="session-status">
          <h2 className="mb-4 font-serif text-2xl text-white">Session-Status abfragen</h2>
          <EndpointCard
            method="GET"
            path="/api/v1/sandbox/{sessionId}"
            description="Gibt den aktuellen Status der Session zurück, inklusive Action-History und verbrauchten Credits."
            responseBody={JSON.stringify(
              {
                id: "clxyz123abc",
                status: "active",
                capabilities: ["browser", "code_python", "screenshots"],
                config: { timeout: 300, maxSteps: 50 },
                actionsExecuted: 3,
                creditsUsed: 1.3,
                actionHistory: [
                  {
                    action: { type: "navigate", url: "https://example.com" },
                    result: { success: true },
                    timestamp: "2026-03-22T14:30:00.000Z",
                  },
                ],
                expiresAt: "2026-03-22T15:05:00.000Z",
                createdAt: "2026-03-22T15:00:00.000Z",
              },
              null,
              2
            )}
          >
            <div className="px-6 py-4">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Status-Werte:</strong>{" "}
                <code className="text-[#22C55E]">ready</code> (erstellt, noch keine Action),{" "}
                <code className="text-[#3B82F6]">active</code> (Actions werden ausgeführt),{" "}
                <code className="text-muted-foreground">completed</code> (maxSteps erreicht),{" "}
                <code className="text-kiln-orange">expired</code> (Timeout),{" "}
                <code className="text-[#DC2626]">destroyed</code> (manuell beendet)
              </p>
            </div>
          </EndpointCard>
        </section>

        {/* Session beenden */}
        <section id="session-beenden">
          <h2 className="mb-4 font-serif text-2xl text-white">Session beenden</h2>
          <EndpointCard
            method="DELETE"
            path="/api/v1/sandbox/{sessionId}"
            description="Beendet die Session und räumt alle Ressourcen (Browser, Code-Sandbox) auf."
            responseBody={JSON.stringify(
              { success: true, message: "Session destroyed." },
              null,
              2
            )}
          />
        </section>

        {/* Artefakte */}
        <section id="artefakte">
          <h2 className="mb-4 font-serif text-2xl text-white">Artefakte</h2>
          <EndpointCard
            method="GET"
            path="/api/v1/sandbox/{sessionId}/artifacts"
            description="Listet alle Artefakte (Screenshots, Code-Outputs, Seitenauslese) aus der Session auf."
            responseBody={JSON.stringify(
              {
                sessionId: "clxyz123abc",
                totalArtifacts: 2,
                artifacts: [
                  {
                    id: "artifact_0_screenshot",
                    type: "screenshot",
                    actionType: "navigate",
                    timestamp: "2026-03-22T14:30:00.000Z",
                    data: { format: "base64_png", size: 48320 },
                  },
                  {
                    id: "artifact_1_output",
                    type: "code_output",
                    actionType: "execute_code",
                    timestamp: "2026-03-22T14:30:05.000Z",
                    data: { stdout: "3.141592653589793", stderr: "" },
                  },
                ],
              },
              null,
              2
            )}
          />
        </section>

        {/* Ausprobieren */}
        <section id="ausprobieren">
          <h2 className="mb-4 font-serif text-2xl text-white">Ausprobieren</h2>
          <TryItSection />
        </section>

        {/* Limits */}
        <section>
          <h2 className="mb-4 font-serif text-2xl text-white">Limits und Preise</h2>
          <div className="rounded-xl border border-border bg-muted p-6">
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
                  Max. Timeout
                </p>
                <p className="text-white font-medium">600 Sekunden</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
                  Max. Steps pro Session
                </p>
                <p className="text-white font-medium">200 (konfigurierbar)</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
                  Sessions/Monat (Pro)
                </p>
                <p className="text-white font-medium">100</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
                  Sessions/Monat (Agency+)
                </p>
                <p className="text-white font-medium">Unbegrenzt</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Credit-Kosten pro Action: navigate (0.5), screenshot (0.3), click (0.3), type
                (0.2), scroll (0.1), execute_code (1.0), read_page (0.5)
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer CTA */}
      <div className="mt-16 text-center">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 rounded-xl bg-kiln-orange px-6 py-3 text-sm font-semibold text-white transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#F97316]/20"
        >
          API-Key erstellen
        </Link>
      </div>
    </div>
  );
}
