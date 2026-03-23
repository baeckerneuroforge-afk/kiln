"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Key,
  Bot,
  MessageSquare,
  Database,
  Zap,
  Plug,
  Globe,
  Server,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Code2,
  BookOpen,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Code Block with Copy ── */

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="group relative rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="text-[10px] font-mono uppercase text-zinc-600">{language}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
        <code className="text-zinc-300">{code}</code>
      </pre>
    </div>
  );
}

/* ── Code Tabs (curl/JS/Python) ── */

function CodeTabs({ examples }: { examples: { label: string; lang: string; code: string }[] }) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {examples.map((ex, i) => (
          <button
            key={ex.label}
            onClick={() => setActive(i)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              active === i
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {ex.label}
          </button>
        ))}
      </div>
      <CodeBlock code={examples[active].code} language={examples[active].lang} />
    </div>
  );
}

/* ── Method Badge ── */

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-500/10 text-green-400 border-green-500/20",
    POST: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    PATCH: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    PUT: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    DELETE: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold font-mono border", colors[method] || "bg-zinc-800 text-zinc-400")}>
      {method}
    </span>
  );
}

/* ── Collapsible Section ── */

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
  defaultOpen = false,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="scroll-mt-24">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-left transition-colors hover:border-zinc-700"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
          <Icon className="h-5 w-5 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        </div>
        {open ? (
          <ChevronDown className="mt-1 h-5 w-5 flex-shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-zinc-500" />
        )}
      </button>
      {open && (
        <div className="mt-4 space-y-6 pl-2">
          {children}
        </div>
      )}
    </section>
  );
}

/* ── Endpoint Block ── */

function Endpoint({
  method,
  path,
  description,
  auth: authScope,
  requestBody,
  responseExample,
  codeExamples,
}: {
  method: string;
  path: string;
  description: string;
  auth: string;
  requestBody?: string;
  responseExample?: string;
  codeExamples?: { label: string; lang: string; code: string }[];
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={method} />
        <code className="text-sm font-mono text-zinc-300">{path}</code>
      </div>
      <p className="text-sm text-zinc-400">{description}</p>
      <div className="flex items-center gap-1.5 text-xs text-zinc-600">
        <Shield className="h-3 w-3" />
        <span>Auth: {authScope}</span>
      </div>
      {requestBody && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-600">Request Body</h4>
          <CodeBlock code={requestBody} language="typescript" />
        </div>
      )}
      {responseExample && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-600">Response</h4>
          <CodeBlock code={responseExample} language="json" />
        </div>
      )}
      {codeExamples && codeExamples.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-600">Examples</h4>
          <CodeTabs examples={codeExamples} />
        </div>
      )}
    </div>
  );
}

/* ── Sidebar Nav ── */

const sections = [
  { id: "auth", label: "Authentication", icon: Key },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "knowledge", label: "Knowledge Base", icon: Database },
  { id: "workflows", label: "Workflows", icon: Zap },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "webhooks", label: "Webhooks", icon: Globe },
  { id: "mcp", label: "MCP Server", icon: Server },
];

/* ── Main Page ── */

export default function DocsPage() {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("auth");

  // Intersection observer for active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections.filter(
      (s) => s.label.toLowerCase().includes(q) || s.id.includes(q)
    );
  }, [search]);

  return (
    <div className="min-h-screen bg-[#0C0A09]">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#0C0A09]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}>
                <span className="font-serif text-sm font-bold text-white">K</span>
              </div>
              <span className="font-serif text-lg">KILN</span>
            </Link>
            <span className="text-zinc-700">/</span>
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium text-zinc-300">API Documentation</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/developers"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
            >
              <Code2 className="h-3.5 w-3.5" />
              MCP Docs
            </Link>
            <Link
              href="/dashboard"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-8">
        {/* Left Sidebar */}
        <aside className="hidden w-56 flex-shrink-0 lg:block">
          <div className="sticky top-24 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search endpoints..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-xs text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-orange-500/40"
              />
            </div>

            {/* Nav */}
            <nav className="space-y-0.5">
              {filteredSections.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                      activeSection === s.id
                        ? "bg-orange-500/10 text-orange-400"
                        : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {s.label}
                  </a>
                );
              })}
            </nav>

            {/* Quick Links */}
            <div className="border-t border-zinc-800 pt-4 space-y-1">
              <a href="#errors" className="block px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Error Codes</a>
              <a href="#rate-limits" className="block px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Rate Limits</a>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Hero */}
          <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent p-8">
            <h1 className="font-serif text-3xl text-zinc-100">API Documentation</h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-2xl">
              Build powerful AI-powered applications with the KILN API. Create agents, manage knowledge bases,
              execute workflows, and integrate with your existing tools.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5">
                <span className="text-[10px] text-zinc-500">Base URL</span>
                <p className="font-mono text-xs text-zinc-300">https://kiln.so/api/v1</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5">
                <span className="text-[10px] text-zinc-500">Version</span>
                <p className="font-mono text-xs text-zinc-300">v1</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5">
                <span className="text-[10px] text-zinc-500">Format</span>
                <p className="font-mono text-xs text-zinc-300">JSON</p>
              </div>
            </div>
          </div>

          {/* ── Authentication ── */}
          <Section id="auth" icon={Key} title="Authentication" description="API key management and scoped permissions" defaultOpen>
            <div className="prose-sm text-sm text-zinc-400 space-y-3">
              <p>
                All API requests require a Bearer token. Get your API key from{" "}
                <Link href="/dashboard/settings?tab=api-keys" className="text-orange-400 hover:underline">
                  Dashboard &rarr; Settings &rarr; API Keys
                </Link>.
              </p>
              <CodeBlock
                code={`Authorization: Bearer kiln_sk_your_api_key_here`}
                language="http"
              />
              <p>
                API keys have scoped permissions. You can create keys with read-only access,
                agent management, or full access including workflow execution.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Permission Scopes</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { scope: "agents:read", desc: "List and view agents" },
                  { scope: "agents:write", desc: "Create, update, delete agents" },
                  { scope: "chat", desc: "Send chat messages" },
                  { scope: "knowledge:read", desc: "List knowledge base entries" },
                  { scope: "knowledge:write", desc: "Upload and manage KB data" },
                  { scope: "workflows:read", desc: "View workflows and executions" },
                  { scope: "workflows:execute", desc: "Run and manage workflows" },
                  { scope: "webhooks:manage", desc: "Configure webhook endpoints" },
                ].map((s) => (
                  <div key={s.scope} className="flex items-start gap-2 rounded-lg bg-zinc-800/30 px-3 py-2">
                    <code className="text-[11px] font-mono text-orange-400">{s.scope}</code>
                    <span className="text-xs text-zinc-500">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Agents ── */}
          <Section id="agents" icon={Bot} title="Agents" description="Create, list, update, and delete AI agents">
            <Endpoint
              method="GET"
              path="/api/v1/agents"
              description="List all agents for the authenticated user."
              auth="agents:read"
              responseExample={`{
  "agents": [
    {
      "id": "clx1abc...",
      "name": "Sales Assistant",
      "slug": "sales-assistant",
      "status": "LIVE",
      "agentType": "PUBLIC",
      "llmModel": "claude-sonnet-4-6",
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}`}
              codeExamples={[
                { label: "curl", lang: "bash", code: `curl -H "Authorization: Bearer kiln_sk_..." \\
  https://kiln.so/api/v1/agents` },
                { label: "JavaScript", lang: "javascript", code: `const res = await fetch("https://kiln.so/api/v1/agents", {
  headers: { Authorization: "Bearer kiln_sk_..." }
});
const { agents } = await res.json();` },
                { label: "Python", lang: "python", code: `import requests

res = requests.get("https://kiln.so/api/v1/agents",
    headers={"Authorization": "Bearer kiln_sk_..."})
agents = res.json()["agents"]` },
              ]}
            />

            <Endpoint
              method="POST"
              path="/api/v1/agents"
              description="Create a new AI agent with the specified configuration."
              auth="agents:write"
              requestBody={`{
  name: string;           // Agent display name
  systemPrompt: string;   // System instructions
  llmModel?: string;      // Default: "claude-sonnet-4-6"
  temperature?: number;   // 0.0 - 1.0, default: 0.7
  welcomeMessage?: string;
  agentType?: "PUBLIC" | "INTERNAL";
}`}
              responseExample={`{
  "id": "clx1abc...",
  "name": "Sales Assistant",
  "slug": "sales-assistant",
  "status": "DRAFT",
  "createdAt": "2026-03-19T10:00:00Z"
}`}
              codeExamples={[
                { label: "curl", lang: "bash", code: `curl -X POST https://kiln.so/api/v1/agents \\
  -H "Authorization: Bearer kiln_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Sales Assistant",
    "systemPrompt": "You are a helpful sales assistant.",
    "welcomeMessage": "Hi! How can I help you today?"
  }'` },
                { label: "JavaScript", lang: "javascript", code: `const res = await fetch("https://kiln.so/api/v1/agents", {
  method: "POST",
  headers: {
    Authorization: "Bearer kiln_sk_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Sales Assistant",
    systemPrompt: "You are a helpful sales assistant.",
  }),
});` },
                { label: "Python", lang: "python", code: `import requests

res = requests.post("https://kiln.so/api/v1/agents",
    headers={"Authorization": "Bearer kiln_sk_..."},
    json={
        "name": "Sales Assistant",
        "systemPrompt": "You are a helpful sales assistant.",
    })` },
              ]}
            />

            <Endpoint
              method="PATCH"
              path="/api/v1/agents/:id"
              description="Update an existing agent's configuration. Only provided fields are updated."
              auth="agents:write"
              requestBody={`{
  name?: string;
  systemPrompt?: string;
  status?: "DRAFT" | "LIVE" | "PAUSED";
  temperature?: number;
  welcomeMessage?: string;
}`}
              responseExample={`{
  "id": "clx1abc...",
  "name": "Updated Agent",
  "status": "LIVE",
  "updatedAt": "2026-03-19T11:00:00Z"
}`}
            />

            <Endpoint
              method="DELETE"
              path="/api/v1/agents/:id"
              description="Permanently delete an agent and all associated data."
              auth="agents:write"
              responseExample={`{ "success": true }`}
            />
          </Section>

          {/* ── Chat ── */}
          <Section id="chat" icon={MessageSquare} title="Chat" description="Send messages and receive streaming responses">
            <Endpoint
              method="POST"
              path="/api/agents/:id/chat"
              description="Send a chat message to an agent. Supports streaming SSE responses."
              auth="chat (or public agent)"
              requestBody={`{
  message: string;           // User message
  conversationId?: string;   // Continue existing conversation
  visitorId?: string;        // Track returning visitors
  metadata?: Record<string, string>;  // Custom metadata
}`}
              responseExample={`// Streaming SSE response:
data: {"type":"text","content":"Hello! "}
data: {"type":"text","content":"How can I "}
data: {"type":"text","content":"help you?"}
data: {"type":"done","conversationId":"conv_abc123"}

// Non-streaming JSON response:
{
  "response": "Hello! How can I help you?",
  "conversationId": "conv_abc123"
}`}
              codeExamples={[
                { label: "curl", lang: "bash", code: `curl -X POST https://kiln.so/api/agents/clx1abc.../chat \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What services do you offer?"}'` },
                { label: "JavaScript", lang: "javascript", code: `const res = await fetch(
  "https://kiln.so/api/agents/clx1abc.../chat",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "What services do you offer?" }),
  }
);

// Stream the response
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  console.log(chunk);
}` },
                { label: "Python", lang: "python", code: `import requests

res = requests.post(
    "https://kiln.so/api/agents/clx1abc.../chat",
    json={"message": "What services do you offer?"},
    stream=True,
)
for line in res.iter_lines():
    if line:
        print(line.decode())` },
              ]}
            />
          </Section>

          {/* ── Knowledge Base ── */}
          <Section id="knowledge" icon={Database} title="Knowledge Base" description="Upload documents, manage knowledge entries">
            <Endpoint
              method="GET"
              path="/api/v1/agents/:id/knowledge"
              description="List all knowledge base entries for an agent."
              auth="knowledge:read"
              responseExample={`{
  "entries": [
    {
      "id": "kb_123",
      "title": "Product FAQ",
      "type": "PDF",
      "chunks": 42,
      "createdAt": "2026-02-01T10:00:00Z"
    }
  ]
}`}
            />

            <Endpoint
              method="POST"
              path="/api/v1/agents/:id/knowledge"
              description="Upload a document to the knowledge base. Supports PDF, TXT, URL, and FAQ entries."
              auth="knowledge:write"
              requestBody={`{
  type: "PDF" | "URL" | "TEXT" | "FAQ";
  title?: string;
  // For URL:
  url?: string;
  // For TEXT:
  content?: string;
  // For FAQ:
  question?: string;
  answer?: string;
  // For PDF: send as multipart/form-data
}`}
              responseExample={`{
  "id": "kb_456",
  "title": "Uploaded Document",
  "chunks": 15,
  "status": "PROCESSING"
}`}
            />

            <Endpoint
              method="DELETE"
              path="/api/v1/agents/:id/knowledge/:entryId"
              description="Delete a knowledge base entry and its associated vector embeddings."
              auth="knowledge:write"
              responseExample={`{ "success": true }`}
            />
          </Section>

          {/* ── Workflows ── */}
          <Section id="workflows" icon={Zap} title="Workflows" description="Create and execute multi-agent workflows">
            <Endpoint
              method="GET"
              path="/api/v1/workflows"
              description="List all workflows (teams) for the authenticated user."
              auth="workflows:read"
              responseExample={`{
  "workflows": [
    {
      "id": "team_abc",
      "name": "Sales Pipeline",
      "status": "ACTIVE",
      "memberCount": 4,
      "lastExecution": "2026-03-18T15:30:00Z"
    }
  ]
}`}
            />

            <Endpoint
              method="POST"
              path="/api/v1/workflows/:id/execute"
              description="Trigger a workflow execution. Returns execution ID for tracking."
              auth="workflows:execute"
              requestBody={`{
  goal?: string;        // Override default goal
  variables?: Record<string, string>;  // Workflow variables
  priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
}`}
              responseExample={`{
  "executionId": "exec_xyz789",
  "status": "RUNNING",
  "startedAt": "2026-03-19T10:00:00Z"
}`}
            />

            <Endpoint
              method="GET"
              path="/api/v1/workflows/:id/executions/:execId"
              description="Get execution status and results."
              auth="workflows:read"
              responseExample={`{
  "id": "exec_xyz789",
  "status": "COMPLETED",
  "totalTasks": 5,
  "completedTasks": 5,
  "duration": 4.2,
  "result": { ... }
}`}
            />
          </Section>

          {/* ── Integrations ── */}
          <Section id="integrations" icon={Plug} title="Integrations" description="Connect external services and tools">
            <Endpoint
              method="GET"
              path="/api/v1/integrations"
              description="List all connected integrations."
              auth="agents:read"
              responseExample={`{
  "integrations": [
    {
      "id": "int_123",
      "provider": "slack",
      "status": "CONNECTED",
      "connectedAt": "2026-02-15T10:00:00Z"
    }
  ]
}`}
            />
          </Section>

          {/* ── Webhooks ── */}
          <Section id="webhooks" icon={Globe} title="Webhooks" description="Configure real-time event notifications">
            <Endpoint
              method="POST"
              path="/api/v1/webhooks"
              description="Create a webhook endpoint to receive real-time events."
              auth="webhooks:manage"
              requestBody={`{
  url: string;       // HTTPS endpoint URL
  events: string[];  // Event types to subscribe
  secret?: string;   // HMAC signing secret (auto-generated if omitted)
}`}
              responseExample={`{
  "id": "wh_abc123",
  "url": "https://example.com/webhook",
  "events": ["conversation.created", "lead.captured"],
  "secret": "whsec_...",
  "status": "ACTIVE"
}`}
            />

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Available Events</h4>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {[
                  "conversation.created",
                  "conversation.completed",
                  "lead.captured",
                  "appointment.booked",
                  "agent.status_changed",
                  "workflow.execution_completed",
                  "workflow.execution_failed",
                  "workflow.approval_required",
                ].map((evt) => (
                  <code key={evt} className="rounded bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-400">{evt}</code>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500">HMAC Verification</h4>
              <p className="text-sm text-zinc-400">
                Verify webhook signatures using the <code className="text-orange-400">X-Kiln-Signature</code> header.
              </p>
              <CodeBlock
                code={`const crypto = require("crypto");

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`}
                language="javascript"
              />
            </div>
          </Section>

          {/* ── MCP Server ── */}
          <Section id="mcp" icon={Server} title="MCP Server" description="Model Context Protocol integration for Claude Code">
            <div className="prose-sm text-sm text-zinc-400 space-y-3">
              <p>
                KILN provides an MCP server that lets you manage agents directly from Claude Code or any MCP-compatible client.
                See the full MCP documentation on the{" "}
                <Link href="/developers" className="text-orange-400 hover:underline">Developer page</Link>.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Installation</h4>
              <CodeBlock
                code={`// Add to Claude Code MCP config:
{
  "mcpServers": {
    "kiln": {
      "command": "npx",
      "args": ["-y", "@anthropic/kiln-mcp"],
      "env": {
        "KILN_API_KEY": "kiln_sk_..."
      }
    }
  }
}`}
                language="json"
              />
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Available Tools</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { tool: "kiln_list_agents", desc: "List all agents" },
                  { tool: "kiln_create_agent", desc: "Create a new agent" },
                  { tool: "kiln_update_agent", desc: "Update agent config" },
                  { tool: "kiln_chat", desc: "Chat with an agent" },
                  { tool: "kiln_add_knowledge", desc: "Add KB entry" },
                  { tool: "kiln_run_tests", desc: "Run agent test suite" },
                  { tool: "kiln_create_team", desc: "Create workflow team" },
                  { tool: "kiln_execute_team", desc: "Execute workflow" },
                ].map((t) => (
                  <div key={t.tool} className="flex items-start gap-2 rounded bg-zinc-800/30 px-3 py-2">
                    <code className="text-[11px] font-mono text-green-400">{t.tool}</code>
                    <span className="text-xs text-zinc-500">{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Error Codes ── */}
          <section id="errors" className="scroll-mt-24 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="mb-4 text-base font-semibold text-zinc-100">Error Codes</h2>
            <div className="space-y-2">
              {[
                { code: 400, desc: "Bad Request — Invalid parameters or malformed JSON" },
                { code: 401, desc: "Unauthorized — Missing or invalid API key" },
                { code: 403, desc: "Forbidden — API key lacks required scope" },
                { code: 404, desc: "Not Found — Resource does not exist" },
                { code: 429, desc: "Rate Limited — Too many requests (100/min per key)" },
                { code: 500, desc: "Server Error — Unexpected error, please retry" },
              ].map((e) => (
                <div key={e.code} className="flex items-center gap-3 rounded-lg bg-zinc-800/30 px-4 py-2.5">
                  <span className={cn(
                    "font-mono text-sm font-bold",
                    e.code < 400 ? "text-green-400" : e.code < 500 ? "text-amber-400" : "text-red-400"
                  )}>
                    {e.code}
                  </span>
                  <span className="text-sm text-zinc-400">{e.desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Rate Limits ── */}
          <section id="rate-limits" className="scroll-mt-24 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="mb-4 text-base font-semibold text-zinc-100">Rate Limits</h2>
            <div className="text-sm text-zinc-400 space-y-3">
              <p>API requests are rate limited per API key:</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { plan: "Free", limit: "100 req/min" },
                  { plan: "Pro", limit: "500 req/min" },
                  { plan: "Agency", limit: "2,000 req/min" },
                ].map((p) => (
                  <div key={p.plan} className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-center">
                    <p className="text-xs text-zinc-500">{p.plan}</p>
                    <p className="mt-1 font-mono text-sm text-zinc-200">{p.limit}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-600">
                Rate limit headers: <code className="text-zinc-500">X-RateLimit-Limit</code>,{" "}
                <code className="text-zinc-500">X-RateLimit-Remaining</code>,{" "}
                <code className="text-zinc-500">X-RateLimit-Reset</code>
              </p>
            </div>
          </section>

          {/* Footer */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
            <p className="text-sm text-zinc-400">
              Need help?{" "}
              <Link href="/help" className="text-orange-400 hover:underline">Contact support</Link>
              {" · "}
              <Link href="/developers" className="text-orange-400 hover:underline">MCP Documentation</Link>
              {" · "}
              <Link href="/changelog" className="text-orange-400 hover:underline">Changelog</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
