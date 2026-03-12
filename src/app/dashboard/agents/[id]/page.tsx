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
  Bug,
  ScrollText,
  Brain,
  Link2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wrench,
  ImageIcon,
  Timer,
  CopyPlus,
  X,
  GitFork,
  History,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AgentLiveChat } from "@/components/agents/agent-live-chat";
import { KnowledgeTab } from "@/components/agents/knowledge-tab";
import { ActionsTab } from "@/components/agents/actions-tab";
import { AnalyticsTab } from "@/components/agents/analytics-tab";
import { LogsTab } from "@/components/agents/logs-tab";
import { MemoryTab } from "@/components/agents/memory-tab";
import { CustomToolsTab } from "@/components/agents/custom-tools-tab";
import { AutomationsTab } from "@/components/agents/automations-tab";
import { VersionsTab } from "@/components/agents/versions-tab";
import { TestingTab } from "@/components/agents/testing-tab";
import { PromptEditor } from "@/components/agents/prompt-editor";
import { cn } from "@/lib/utils";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";

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
  memoryEnabled: boolean;
  imageAnalysisEnabled: boolean;
  customDomain: string | null;
  clonedFromId: string | null;
  clonedFromName: string | null;
  createdAt: string;
  actions: { id: string; type: string; enabled: boolean; config: Record<string, string> | null }[];
  knowledgeBases: { id: string; type: string; sourceName: string; embeddingStatus: string; chunkCount: number; createdAt: string }[];
  _count: { conversations: number };
}

type Tab = "config" | "knowledge" | "actions" | "analytics" | "embed" | "tools" | "debug" | "logs" | "memory" | "automations" | "versions" | "testing";

const baseTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "config", label: "Configuration", icon: Settings2 },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "actions", label: "Actions", icon: Zap },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "embed", label: "Embed Code", icon: Code2 },
];

const advancedTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "tools", label: "Custom Tools", icon: Wrench },
  { id: "automations", label: "Automations", icon: Timer },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "versions", label: "Versions", icon: History },
  { id: "testing", label: "Testing", icon: FlaskConical },
];

const statusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "LIVE", label: "Live" },
  { value: "PAUSED", label: "Paused" },
];

const fullWidthTabs: Tab[] = ["analytics", "tools", "logs", "memory", "automations", "versions", "testing"];

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { advancedMode } = useAdvancedMode();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("config");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // Editierbare Felder
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [status, setStatus] = useState<string>("DRAFT");
  const [primaryColor, setPrimaryColor] = useState("#F97316");
  const [logoUrl, setLogoUrl] = useState("");
  const [llmModel, setLlmModel] = useState("claude-sonnet-4-20250514");
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [imageAnalysisEnabled, setImageAnalysisEnabled] = useState(false);
  const [customDomain, setCustomDomain] = useState("");
  const [domainVerified, setDomainVerified] = useState<boolean | null>(null);
  const [domainMessage, setDomainMessage] = useState("");
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [userPlan, setUserPlan] = useState<string>("FREE");

  // Clone modal state
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneIncludeKB, setCloneIncludeKB] = useState(true);
  const [cloneIncludeActions, setCloneIncludeActions] = useState(true);
  const [cloneIncludeTools, setCloneIncludeTools] = useState(true);
  const [cloneBulkCount, setCloneBulkCount] = useState(1);
  const [cloning, setCloning] = useState(false);

  // Test case pre-fill from logs
  const [testCasePrefill, setTestCasePrefill] = useState<{ input: string; response: string } | null>(null);

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
        setLlmModel(data.llmModel || "claude-sonnet-4-20250514");
        setMemoryEnabled(data.memoryEnabled || false);
        setImageAnalysisEnabled(data.imageAnalysisEnabled || false);
        setCustomDomain(data.customDomain || "");
        const wl = (data.whiteLabel || {}) as Record<string, string>;
        setPrimaryColor(wl.primaryColor || "#F97316");
        setLogoUrl(wl.logo || "");
      })
      .catch(() => router.push("/dashboard/agents"))
      .finally(() => setLoading(false));

    // Plan laden für Custom Domain Gating
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => setUserPlan(data.plan || "FREE"))
      .catch(() => {});
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
          llmModel,
          memoryEnabled,
          imageAnalysisEnabled,
          customDomain: customDomain.trim() || null,
          whiteLabel: {
            primaryColor,
            logo: logoUrl || null,
            position: "bottom-right",
          },
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

  async function verifyDomain() {
    if (!agent || !customDomain.trim()) return;
    setVerifyingDomain(true);
    setDomainVerified(null);
    setDomainMessage("");
    try {
      const res = await fetch(`/api/agents/${agent.id}/verify-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: customDomain.trim() }),
      });
      const data = await res.json();
      setDomainVerified(data.verified);
      setDomainMessage(data.message);
    } catch {
      setDomainVerified(false);
      setDomainMessage("Verification failed. Please try again.");
    } finally {
      setVerifyingDomain(false);
    }
  }

  function copyEmbedCode() {
    if (!agent) return;
    const code = `<script src="${window.location.origin}/embed/${agent.slug}.js" async></script>`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleClone() {
    if (!agent || !cloneName.trim()) return;
    setCloning(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cloneName.trim(),
          count: cloneBulkCount,
          includeKB: cloneIncludeKB,
          includeActions: cloneIncludeActions,
          includeTools: cloneIncludeTools,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCloneModal(false);
        // Bei einzelnem Klon: direkt zum neuen Agent navigieren
        if (data.clonedIds.length === 1) {
          router.push(`/dashboard/agents/${data.clonedIds[0]}`);
        } else {
          router.push("/dashboard/agents");
        }
      }
    } catch {
      // Fehler
    } finally {
      setCloning(false);
    }
  }

  // Wenn Advanced ausgeschaltet wird und wir auf einem Advanced-Tab sind → zurück zu config
  useEffect(() => {
    if (!advancedMode && advancedTabs.some((t) => t.id === activeTab)) {
      setActiveTab("config");
    }
  }, [advancedMode, activeTab]);

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleTabs = advancedMode ? [...baseTabs, ...advancedTabs] : baseTabs;
  const isFullWidth = fullWidthTabs.includes(activeTab);
  const isDebugTab = activeTab === "debug";

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
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">/{agent.slug}</p>
              {agent.clonedFromName && (
                <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                  <GitFork className="h-2.5 w-2.5" />
                  Cloned from {agent.clonedFromName}
                </span>
              )}
            </div>
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
          {(userPlan === "PRO" || userPlan === "AGENCY") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCloneName(`Copy of ${agent.name}`);
                setCloneBulkCount(1);
                setCloneIncludeKB(true);
                setCloneIncludeActions(true);
                setCloneIncludeTools(true);
                setShowCloneModal(true);
              }}
            >
              <CopyPlus className="mr-2 h-3.5 w-3.5" />
              Clone
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
              advancedTabs.some((at) => at.id === tab.id) && "text-purple-400 hover:text-purple-300",
              activeTab === tab.id && advancedTabs.some((at) => at.id === tab.id) && "border-purple-500 text-purple-400"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={cn(
        "grid grid-cols-1 gap-6",
        !isFullWidth && !isDebugTab && "lg:grid-cols-5"
      )}>
        {/* Linke Seite: Tab-Inhalt */}
        <div className={isFullWidth ? "" : isDebugTab ? "lg:col-span-3" : "lg:col-span-3"}>
          {activeTab === "config" && (
            <div className="space-y-6">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Agent Name
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
                  Welcome Message
                </label>
                <textarea
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Model Selection — nur im Advanced Mode */}
              {advancedMode && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Model
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (Advanced)
                    </span>
                  </label>
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  >
                    <option value="claude-sonnet-4-20250514">Claude Sonnet (default)</option>
                    <option value="claude-opus-4-20250514">Claude Opus</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                  </select>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    OpenAI models require an OpenAI API key in Settings. Add your own API keys for unlimited conversations.
                  </p>
                </div>
              )}

              {/* System Prompt */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    System Prompt
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (Advanced)
                    </span>
                  </label>
                  {advancedMode && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowPromptEditor(true)}
                      className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
                    >
                      <Code2 className="mr-1.5 h-3.5 w-3.5" />
                      Advanced Editor
                    </Button>
                  )}
                </div>
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
                  Suggested Questions
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

              {/* White-Label */}
              <div className="rounded-xl border border-border bg-card/50 p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    White-Label Design
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Customize the appearance of your chat widget.
                  </p>
                </div>

                {/* Primary Color */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-28 rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="#F97316"
                    />
                    <div
                      className="flex h-10 items-center rounded-lg px-4 text-xs font-medium text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Preview
                    </div>
                  </div>
                </div>

                {/* Logo URL */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Logo-URL
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {logoUrl && (
                    <div className="mt-2 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoUrl}
                        alt="Logo Preview"
                        className="h-10 w-10 rounded-full object-cover border border-border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span className="text-xs text-muted-foreground">
                        Logo Preview
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Persistent Memory Toggle — nur im Advanced Mode */}
              {advancedMode && (
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                      <Brain className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Persistent Memory
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Remember facts about returning visitors across conversations.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMemoryEnabled(!memoryEnabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      memoryEnabled ? "bg-purple-500" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                        memoryEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
              )}

              {/* Image Analysis Toggle — nur im Advanced Mode */}
              {advancedMode && (
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                      <ImageIcon className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Image Analysis
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Allow users to upload images for the agent to analyze.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setImageAnalysisEnabled(!imageAnalysisEnabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      imageAnalysisEnabled ? "bg-blue-500" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                        imageAnalysisEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
              )}

              {/* Custom Domain — nur für Pro/Agency/Admin im Advanced Mode */}
              {advancedMode && (userPlan === "PRO" || userPlan === "AGENCY" || userPlan === "ADMIN") && (
                <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                      <Link2 className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Custom Domain
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Serve this agent on your own domain.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Domain
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customDomain}
                        onChange={(e) => {
                          setCustomDomain(e.target.value);
                          setDomainVerified(null);
                          setDomainMessage("");
                        }}
                        placeholder="bot.your-domain.com"
                        className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={verifyDomain}
                        disabled={verifyingDomain || !customDomain.trim()}
                      >
                        {verifyingDomain ? (
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Globe className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Verify
                      </Button>
                    </div>

                    {domainMessage && (
                      <div className={cn(
                        "mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
                        domainVerified
                          ? "border border-green-500/30 bg-green-500/10 text-green-400"
                          : "border border-red-500/30 bg-red-500/10 text-red-400"
                      )}>
                        {domainVerified ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {domainMessage}
                      </div>
                    )}
                  </div>

                  {/* Setup Instructions */}
                  <div className="rounded-lg border border-dashed border-border bg-card/30 p-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Setup Instructions
                    </h4>
                    <ol className="space-y-2 text-xs text-muted-foreground">
                      <li className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">1</span>
                        <span>Go to your DNS provider and add a <code className="rounded bg-muted px-1 py-0.5 text-foreground">CNAME</code> record:</span>
                      </li>
                      <li className="ml-7">
                        <div className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-[11px]">
                          <div><span className="text-muted-foreground">Name:</span> <span className="text-foreground">{customDomain.trim() ? customDomain.trim().split(".")[0] : "bot"}</span></div>
                          <div><span className="text-muted-foreground">Target:</span> <span className="text-kiln-orange">kiln-topaz.vercel.app</span></div>
                          <div><span className="text-muted-foreground">TTL:</span> <span className="text-foreground">Auto</span></div>
                        </div>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">2</span>
                        <span>Add <code className="rounded bg-muted px-1 py-0.5 text-foreground">{customDomain.trim() || "bot.your-domain.com"}</code> as a custom domain in your <a href="https://vercel.com/docs/projects/domains" target="_blank" rel="noopener noreferrer" className="text-kiln-orange underline">Vercel project settings</a>.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">3</span>
                        <span>Click &quot;Verify&quot; above to confirm your CNAME is set correctly.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">4</span>
                        <span>Save this page. Your agent will be live at <code className="rounded bg-muted px-1 py-0.5 text-foreground">https://{customDomain.trim() || "bot.your-domain.com"}</code></span>
                      </li>
                    </ol>
                  </div>
                </div>
              )}
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
            <AnalyticsTab agentId={agent.id} />
          )}

          {activeTab === "debug" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                <h3 className="mb-1 text-sm font-semibold text-foreground flex items-center gap-2">
                  <Bug className="h-4 w-4 text-purple-400" />
                  Debug Mode Active
                </h3>
                <p className="text-xs text-muted-foreground">
                  The test chat on the right now shows debug information under each response:
                  RAG chunks with similarity scores, available tools, tool calls made, system prompt preview, and token counts.
                  Send a message to see debug data.
                </p>
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <LogsTab
              agentId={agent.id}
              onAddTestCase={(inputMessage, expectedResponse) => {
                setTestCasePrefill({ input: inputMessage, response: expectedResponse });
                setActiveTab("testing");
              }}
            />
          )}

          {activeTab === "tools" && (
            <CustomToolsTab agentId={agent.id} />
          )}

          {activeTab === "memory" && (
            <MemoryTab agentId={agent.id} />
          )}

          {activeTab === "automations" && (
            <AutomationsTab agentId={agent.id} />
          )}

          {activeTab === "versions" && (
            <VersionsTab
              agentId={agent.id}
              onRestore={() => {
                // Agent neu laden nach Restore
                fetch(`/api/agents/${agent.id}`)
                  .then((res) => res.json())
                  .then((data: Agent) => {
                    setAgent(data);
                    setName(data.name);
                    setSystemPrompt(data.systemPrompt);
                    setWelcomeMessage(data.welcomeMessage || "");
                    setStatus(data.status);
                    setLlmModel(data.llmModel || "claude-sonnet-4-20250514");
                    setMemoryEnabled(data.memoryEnabled || false);
                    setImageAnalysisEnabled(data.imageAnalysisEnabled || false);
                    setCustomDomain(data.customDomain || "");
                    const wl = (data.whiteLabel || {}) as Record<string, string>;
                    setPrimaryColor(wl.primaryColor || "#F97316");
                    setLogoUrl(wl.logo || "");
                  })
                  .catch(() => {});
              }}
            />
          )}

          {activeTab === "testing" && (
            <TestingTab
              agentId={agent.id}
              prefill={testCasePrefill}
              onPrefillConsumed={() => setTestCasePrefill(null)}
            />
          )}

          {activeTab === "embed" && (
            <div className="space-y-6">
              {/* Public URL */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Public Agent URL
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-muted-foreground">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/a/${agent.slug}`
                      : `/a/${agent.slug}`}
                  </div>
                  <Button size="sm" variant="outline">
                    <Globe className="mr-2 h-3.5 w-3.5" />
                    Open
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Embed Code */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Embed Code
                </label>
                <p className="mb-3 text-xs text-muted-foreground">
                  Add this code to your website to embed the chat widget.
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
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rechte Seite: Live-Chat (versteckt bei Full-Width-Tabs) */}
        {!isFullWidth && (
        <div className="lg:col-span-2">
          <div className="sticky top-6 h-[600px]">
            <AgentLiveChat
              agentId={agent.id}
              agentName={agent.name}
              welcomeMessage={agent.welcomeMessage}
              suggestedQuestions={agent.suggestedQuestions}
              debugMode={isDebugTab}
              imageAnalysisEnabled={imageAnalysisEnabled}
            />
          </div>
        </div>
        )}
      </div>

      {/* Advanced Prompt Editor Modal */}
      {showPromptEditor && (
        <PromptEditor
          value={systemPrompt}
          onChange={setSystemPrompt}
          onClose={() => setShowPromptEditor(false)}
        />
      )}

      {/* Clone Agent Modal */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCloneModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-[#1C1917] p-6 shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-foreground">Clone Agent</h3>
              <button
                onClick={() => setShowCloneModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  New Agent Name
                </label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Checkboxen */}
              <div className="space-y-2.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneIncludeKB}
                    onChange={(e) => setCloneIncludeKB(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">Include Knowledge Base</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneIncludeActions}
                    onChange={(e) => setCloneIncludeActions(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">Include Actions config</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneIncludeTools}
                    onChange={(e) => setCloneIncludeTools(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">Include Custom Tools</span>
                </label>
              </div>

              {/* Bulk Clone — nur Agency */}
              {userPlan === "AGENCY" && (
                <div className="rounded-lg border border-border bg-card/50 p-3">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Bulk Clone
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(Agency)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={cloneBulkCount}
                      onChange={(e) => setCloneBulkCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-20 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">
                      copies (1–10)
                    </span>
                  </div>
                  {cloneBulkCount > 1 && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      Creates: {Array.from({ length: Math.min(3, cloneBulkCount) }, (_, i) => `"${cloneName} (${i + 1})"`).join(", ")}
                      {cloneBulkCount > 3 && `, ... (${cloneBulkCount} total)`}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowCloneModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleClone}
                disabled={cloning || !cloneName.trim()}
              >
                {cloning ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CopyPlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                {cloneBulkCount > 1 ? `Clone ${cloneBulkCount} Copies` : "Clone Agent"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
