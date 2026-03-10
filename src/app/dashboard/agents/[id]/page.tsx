"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Settings2,
  BookOpen,
  Zap,
  BarChart3,
  Code2,
  Loader2,
  Save,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AgentLiveChat } from "@/components/agents/agent-live-chat";
import { KnowledgeTab } from "@/components/agents/knowledge-tab";
import { ActionsTab } from "@/components/agents/actions-tab";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  systemPrompt: string;
  personality: { tone?: string; language?: string; formality?: string } | null;
  welcomeMessage: string | null;
  suggestedQuestions: string[];
  llmModel: string;
  status: "DRAFT" | "LIVE" | "PAUSED";
  whiteLabel: Record<string, unknown> | null;
  showPoweredBy: boolean;
  createdAt: string;
  actions: { id: string; type: string; enabled: boolean; config: Record<string, string> | null }[];
  knowledgeBases: { id: string; type: string; sourceName: string; embeddingStatus: string; chunkCount: number; createdAt: string }[];
  _count: { conversations: number };
}

type Tab = "config" | "knowledge" | "actions" | "analytics" | "embed";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "config", label: "Konfiguration", icon: Settings2 },
  { id: "knowledge", label: "Wissen", icon: BookOpen },
  { id: "actions", label: "Actions", icon: Zap },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "embed", label: "Embed-Code", icon: Code2 },
];

const statusOptions = [
  { value: "DRAFT", label: "Entwurf" },
  { value: "LIVE", label: "Live" },
  { value: "PAUSED", label: "Pausiert" },
];


export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("config");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Editierbare Felder
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [status, setStatus] = useState<string>("DRAFT");

  useEffect(() => {
    fetch(`/api/agents/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data: Agent) => {
        setAgent(data);
        setName(data.name);
        setSystemPrompt(data.systemPrompt);
        setWelcomeMessage(data.welcomeMessage || "");
        setStatus(data.status);
      })
      .catch(() => router.push("/dashboard/agents"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          systemPrompt,
          welcomeMessage,
          status,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAgent({ ...agent, ...updated });
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setSaving(false);
    }
  }

  function copyEmbedCode() {
    if (!agent) return;
    const code = `<script src="${window.location.origin}/embed/${agent.slug}.js" async></script>`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/agents"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10">
            <Bot className="h-5 w-5 text-kiln-orange" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-foreground">{agent.name}</h1>
            <p className="text-sm text-muted-foreground">/{agent.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Speichern
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Linke Seite: Tab-Inhalt */}
        <div className="lg:col-span-3">
          {activeTab === "config" && (
            <div className="space-y-6">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Agent-Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Welcome Message */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Willkommensnachricht
                </label>
                <textarea
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  System-Prompt
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (Advanced)
                  </span>
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Suggested Questions */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Vorgeschlagene Fragen
                </label>
                <div className="space-y-2">
                  {agent.suggestedQuestions.map((q, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    >
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "knowledge" && (
            <KnowledgeTab
              agentId={agent.id}
              initialEntries={agent.knowledgeBases}
            />
          )}

          {activeTab === "actions" && (
            <ActionsTab
              agentId={agent.id}
              initialActions={agent.actions}
            />
          )}

          {activeTab === "analytics" && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: "Gespräche", value: agent._count.conversations.toString() },
                  { label: "Leads", value: "0" },
                  { label: "Termine", value: "0" },
                  { label: "Gesch. Wert", value: "€0" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-dashed border-border py-12 text-center">
                <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Charts und detaillierte Analytics kommen in der nächsten Phase.
                </p>
              </div>
            </div>
          )}

          {activeTab === "embed" && (
            <div className="space-y-6">
              {/* Public URL */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Öffentliche Agent-URL
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-muted-foreground">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/a/${agent.slug}`
                      : `/a/${agent.slug}`}
                  </div>
                  <Button size="sm" variant="outline">
                    <Globe className="mr-2 h-3.5 w-3.5" />
                    Öffnen
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Embed Code */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Embed-Code
                </label>
                <p className="mb-3 text-xs text-muted-foreground">
                  Füge diesen Code in deine Website ein um das Chat-Widget
                  einzubetten.
                </p>
                <div className="relative">
                  <pre className="rounded-lg border border-border bg-card p-4 font-mono text-xs text-foreground overflow-x-auto">
{`<script
  src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/${agent.slug}.js"
  async
></script>`}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute right-2 top-2"
                    onClick={copyEmbedCode}
                  >
                    {copied ? (
                      <Check className="mr-1.5 h-3 w-3 text-kiln-green" />
                    ) : (
                      <Copy className="mr-1.5 h-3 w-3" />
                    )}
                    {copied ? "Kopiert" : "Kopieren"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rechte Seite: Live-Chat */}
        <div className="lg:col-span-2">
          <div className="sticky top-6 h-[600px]">
            <AgentLiveChat
              agentId={agent.id}
              agentName={agent.name}
              welcomeMessage={agent.welcomeMessage}
              suggestedQuestions={agent.suggestedQuestions}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
