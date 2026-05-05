"use client";

import { useState } from "react";
import { Copy, Check, Terminal, Key, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Lang = "curl" | "python" | "javascript";

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {lang}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="h-3 w-3 text-muted-foreground" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs text-foreground leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

const endpoints = [
  {
    method: "GET",
    path: "/api/v1/agents",
    description: "List all your agents",
    examples: {
      curl: `curl -X GET https://kilnbase.com/api/v1/agents \\
  -H "Authorization: Bearer sk-kiln-YOUR_KEY"`,
      python: `import requests

response = requests.get(
    "https://kilnbase.com/api/v1/agents",
    headers={"Authorization": "Bearer sk-kiln-YOUR_KEY"}
)

agents = response.json()["agents"]
for agent in agents:
    print(f"{agent['name']} ({agent['id']})")`,
      javascript: `const response = await fetch("https://kilnbase.com/api/v1/agents", {
  headers: { "Authorization": "Bearer sk-kiln-YOUR_KEY" }
});

const { agents } = await response.json();
console.log(agents);`,
    },
    response: `{
  "agents": [
    {
      "id": "clx1abc...",
      "name": "Sales Bot",
      "slug": "sales-bot",
      "description": "Handles sales inquiries",
      "model": "claude-sonnet-4-6",
      "status": "LIVE",
      "conversationCount": 142,
      "createdAt": "2026-01-15T10:00:00.000Z"
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/agents/:id/chat",
    description: "Send a message to an agent and get a response",
    examples: {
      curl: `curl -X POST https://kilnbase.com/api/v1/agents/YOUR_AGENT_ID/chat \\
  -H "Authorization: Bearer sk-kiln-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What are your pricing plans?", "sessionId": "user-123"}'`,
      python: `import requests

response = requests.post(
    "https://kilnbase.com/api/v1/agents/YOUR_AGENT_ID/chat",
    headers={
        "Authorization": "Bearer sk-kiln-YOUR_KEY",
        "Content-Type": "application/json"
    },
    json={
        "message": "What are your pricing plans?",
        "sessionId": "user-123"  # optional, for conversation continuity
    }
)

data = response.json()
print(data["response"])
print(f"Session: {data['sessionId']}")`,
      javascript: `const response = await fetch(
  "https://kilnbase.com/api/v1/agents/YOUR_AGENT_ID/chat",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer sk-kiln-YOUR_KEY",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "What are your pricing plans?",
      sessionId: "user-123" // optional
    })
  }
);

const { response: reply, sessionId, leadScore } = await response.json();
console.log(reply);`,
    },
    response: `{
  "response": "We offer three plans: Free (€0), Pro (€49/mo), and Agency (€149/mo)...",
  "sessionId": "user-123",
  "leadScore": null,
  "conversationId": "clx1def...",
  "model": "claude-sonnet-4-6"
}`,
  },
];

export default function ApiDocsPage() {
  const [activeLang, setActiveLang] = useState<Lang>("curl");

  const langs: { id: Lang; label: string }[] = [
    { id: "curl", label: "cURL" },
    { id: "python", label: "Python" },
    { id: "javascript", label: "JavaScript" },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold text-foreground">API Documentation</h1>
        <p className="mt-2 text-muted-foreground">
          Integrate KILN agents into your applications with our REST API.
        </p>
      </div>

      {/* Quick Start */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <Key className="mb-3 h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">1. Get an API Key</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate a key in Settings. Agency plan required.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Terminal className="mb-3 h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">2. Make Requests</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Send messages to your agents via REST API.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Zap className="mb-3 h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">3. Build Integrations</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect to Slack, WhatsApp, custom apps, and more.
          </p>
        </div>
      </div>

      {/* Authentication */}
      <div className="mb-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Authentication</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          All API requests require an API key passed in the <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">Authorization</code> header:
        </p>
        <CodeBlock
          code={`Authorization: Bearer sk-kiln-YOUR_API_KEY`}
          lang="Header"
        />
        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/10 p-3">
          <p className="text-xs text-muted-foreground">
            <strong>Rate Limit:</strong> 100 requests per minute per API key. Responses include{" "}
            <code className="text-foreground">X-RateLimit-Remaining</code> and{" "}
            <code className="text-foreground">Retry-After</code> headers.
          </p>
        </div>
      </div>

      {/* Language Tabs */}
      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {langs.map((lang) => (
          <button
            key={lang.id}
            onClick={() => setActiveLang(lang.id)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeLang === lang.id
                ? "border-kiln-orange text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {lang.label}
          </button>
        ))}
      </div>

      {/* Endpoints */}
      <div className="space-y-10">
        {endpoints.map((ep) => (
          <div key={ep.path} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={cn(
                "rounded px-2 py-1 text-xs font-bold",
                ep.method === "GET"
                  ? "bg-muted text-muted-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {ep.method}
              </span>
              <code className="font-mono text-sm text-foreground">{ep.path}</code>
            </div>
            <p className="text-sm text-muted-foreground">{ep.description}</p>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Example Request
              </h4>
              <CodeBlock
                code={ep.examples[activeLang]}
                lang={activeLang}
              />
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Example Response
              </h4>
              <CodeBlock code={ep.response} lang="JSON" />
            </div>
          </div>
        ))}
      </div>

      {/* Request/Response Schema */}
      <div className="mt-10 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Chat Request Body
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Parameter</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Type</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Required</th>
                <th className="pb-2 font-medium text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">message</td>
                <td className="py-2 pr-4">string</td>
                <td className="py-2 pr-4">Yes</td>
                <td className="py-2 text-muted-foreground">The user&apos;s message</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">sessionId</td>
                <td className="py-2 pr-4">string</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2 text-muted-foreground">Unique session ID for conversation continuity. Auto-generated if omitted.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Codes */}
      <div className="mt-8 mb-12 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Error Codes
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Status</th>
                <th className="pb-2 font-medium text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-xs">401</td>
                <td className="py-2 text-muted-foreground">Invalid or missing API key</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-xs">404</td>
                <td className="py-2 text-muted-foreground">Agent not found or not owned by you</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-xs">429</td>
                <td className="py-2 text-muted-foreground">Rate limit exceeded (100 req/min)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">500</td>
                <td className="py-2 text-muted-foreground">Internal server error</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
