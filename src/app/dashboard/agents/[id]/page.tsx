"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { TaskAgentDetail } from "@/components/agents/task-agent-detail";
import {
  ArrowLeft,
  Bot,
  Settings2,
  BookOpen,
  Zap,
  BarChart3,
  Gauge,
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
  AlertTriangle,
  Shield,
  Bolt,
  Plug,
  Radio,
  Lock,
  Users,
  Store,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AgentLiveChat } from "@/components/agents/agent-live-chat";
import { KnowledgeTab } from "@/components/agents/knowledge-tab";
import { ActionsTab } from "@/components/agents/actions-tab";
import { AnalyticsTab } from "@/components/agents/analytics-tab";
import { EvalTab } from "@/components/agents/eval-tab";
import { LogsTab } from "@/components/agents/logs-tab";
import { MemoryTab } from "@/components/agents/memory-tab";
import { VisitorMemoryTab } from "@/components/agents/visitor-memory-tab";
import { CustomToolsTab } from "@/components/agents/custom-tools-tab";
import { AutomationsTab } from "@/components/agents/automations-tab";
import { VersionsTab } from "@/components/agents/versions-tab";
import { TestingTab } from "@/components/agents/testing-tab";
import { TestLab } from "@/components/agents/test-lab";
import { WebhooksTab } from "@/components/agents/webhooks-tab";
import { EventSubscriptionsTab } from "@/components/agents/event-subscriptions-tab";
import { IntegrationsTab } from "@/components/agents/integrations-tab";
import { ChannelsTab } from "@/components/agents/channels-tab";
import { TeamAccess } from "@/components/agents/team-access";
import { AgentScheduleSection } from "@/components/agents/agent-schedule-section";
import { PromptEditor } from "@/components/agents/prompt-editor";
import { LivePreviewPanel } from "@/components/agents/live-preview-panel";
import { cn } from "@/lib/utils";
import { PROVIDERS, getModelsForProvider, getModelDef, type ProviderKey } from "@/lib/ai";
import {
  type AgentScheduleConfig,
  getAgentScheduleFromWhiteLabel,
  normalizeAgentSchedule,
} from "@/lib/agent-scheduling";
import { getCreditCost } from "@/lib/credits";
import { EMBED_THEME_LIST, type EmbedThemeId } from "@/lib/embed-themes";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useToast } from "@/components/toast";

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
  temperature: number;
  modelProvider: string;
  status: "DRAFT" | "LIVE" | "PAUSED";
  whiteLabel: Record<string, unknown> | null;
  showPoweredBy: boolean;
  autoDetectLanguage: boolean;
  memoryEnabled: boolean;
  visitorMemoryEnabled: boolean;
  imageAnalysisEnabled: boolean;
  showAiDisclaimer: boolean;
  customDomain: string | null;
  promptBranches: { name: string; keywords: string[]; promptSnippet: string; enabled: boolean }[] | null;
  agentType: "PUBLIC" | "INTERNAL";
  agentMode: "CHAT" | "TASK";
  triggerType?: "MANUAL" | "SCHEDULE" | "WEBHOOK" | "EVENT";
  outputType?: "NONE" | "HTTP_REQUEST" | "EMAIL" | "NEXT_AGENT" | "WEBHOOK" | "CUSTOM_CODE";
  triggerConfig?: Record<string, unknown> | null;
  outputConfig?: Record<string, unknown> | null;
  lastRunAt?: string | null;
  lastRunResult?: Record<string, unknown> | null;
  teamRoutingEnabled: boolean;
  teamRoutingTeamId: string | null;
  clonedFromId: string | null;
  clonedFromName: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion?: number;
  actions: { id: string; type: string; enabled: boolean; config: Record<string, string> | null }[];
  knowledgeBases: { id: string; type: string; sourceName: string; embeddingStatus: string; chunkCount: number; createdAt: string }[];
  _count: { conversations: number };
}

type CompareConfig = {
  systemPrompt: string;
  llmModel: string;
  modelProvider: string;
  temperature: number;
};

type VersionComparePreset = {
  versionId: string;
  version: number;
  config: CompareConfig;
};

type ProactiveRule = {
  match: string;
  message: string;
};

type WidgetSettings = {
  avatarUrl: string;
  autoTheme: boolean;
  soundEnabled: boolean;
};

type Tab = "config" | "knowledge" | "actions" | "analytics" | "eval" | "embed" | "channels" | "integrations" | "tools" | "debug" | "logs" | "memory" | "visitor-memories" | "automations" | "versions" | "testing" | "testlab" | "webhooks" | "runs";

const chatBaseTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "config", label: "Configuration", icon: Settings2 },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "actions", label: "Actions", icon: Zap },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "visitor-memories", label: "Visitors", icon: Users },
  { id: "eval", label: "Eval", icon: Gauge },
  { id: "embed", label: "Embed Code", icon: Code2 },
  { id: "channels", label: "Channels", icon: Radio },
  { id: "integrations", label: "Integrations", icon: Plug },
];


const advancedTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "tools", label: "Custom Tools", icon: Wrench },
  { id: "automations", label: "Automations", icon: Timer },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "versions", label: "Versions", icon: History },
  { id: "testing", label: "Testing", icon: FlaskConical },
  { id: "testlab", label: "Test Lab", icon: FlaskConical },
  { id: "webhooks", label: "Webhooks", icon: Link2 },
];

const statusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "LIVE", label: "Live" },
  { value: "PAUSED", label: "Paused" },
];

const fullWidthTabs: Tab[] = ["analytics", "eval", "visitor-memories", "tools", "logs", "memory", "automations", "versions", "testing", "testlab", "runs"];

function normalizeProactiveRules(input: unknown): ProactiveRule[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const match = typeof record.match === "string" ? record.match.trim() : "";
      const message = typeof record.message === "string" ? record.message.trim() : "";
      if (!match || !message) return null;
      return { match, message };
    })
    .filter((entry): entry is ProactiveRule => Boolean(entry));
}

function getProactiveSettings(whiteLabel: Record<string, unknown> | null | undefined) {
  const proactive =
    whiteLabel &&
    typeof whiteLabel === "object" &&
    whiteLabel.proactive &&
    typeof whiteLabel.proactive === "object"
      ? (whiteLabel.proactive as Record<string, unknown>)
      : null;

  const delay =
    typeof proactive?.delay === "number" && Number.isFinite(proactive.delay)
      ? Math.max(0, Math.round(proactive.delay))
      : 15;

  return {
    enabled: proactive?.enabled !== false,
    delay,
    rules: normalizeProactiveRules(proactive?.rules),
  };
}

function encodeRulesForAttribute(rules: ProactiveRule[]) {
  return JSON.stringify(rules).replace(/'/g, "&apos;");
}

function getWidgetSettings(whiteLabel: Record<string, unknown> | null | undefined): WidgetSettings {
  return {
    avatarUrl:
      whiteLabel && typeof whiteLabel.avatarUrl === "string" ? whiteLabel.avatarUrl : "",
    autoTheme:
      whiteLabel && typeof whiteLabel.autoTheme === "boolean"
        ? whiteLabel.autoTheme
        : true,
    soundEnabled:
      whiteLabel && typeof whiteLabel.soundEnabled === "boolean"
        ? whiteLabel.soundEnabled
        : false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatRelativeTime(dateString: string | null | undefined) {
  if (!dateString) return "just now";

  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.max(1, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { advancedMode } = useAdvancedMode();
  const { toast } = useToast();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("config");
  const [saving, setSaving] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // Editierbare Felder
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [status, setStatus] = useState<string>("DRAFT");
  const [primaryColor, setPrimaryColor] = useState("#F97316");
  const [logoUrl, setLogoUrl] = useState("");
  const [llmModel, setLlmModel] = useState("claude-sonnet-4-20250514");
  const [temperature, setTemperature] = useState(0.7);
  const [modelProvider, setModelProvider] = useState("ANTHROPIC");
  const [autoDetectLanguage, setAutoDetectLanguage] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [visitorMemoryEnabled, setVisitorMemoryEnabled] = useState(true);
  const [imageAnalysisEnabled, setImageAnalysisEnabled] = useState(false);
  const [showAiDisclaimer, setShowAiDisclaimer] = useState(true);
  const [agentType, setAgentType] = useState<"PUBLIC" | "INTERNAL">("PUBLIC");
  const [teamRoutingEnabled, setTeamRoutingEnabled] = useState(false);
  const [teamRoutingTeamId, setTeamRoutingTeamId] = useState<string | null>(null);
  const [availableTeams, setAvailableTeams] = useState<{id: string; name: string}[]>([]);
  const [promptBranches, setPromptBranches] = useState<{ name: string; keywords: string[]; promptSnippet: string; enabled: boolean }[]>([]);
  const [customDomain, setCustomDomain] = useState("");
  const [proactiveEnabled, setProactiveEnabled] = useState(true);
  const [proactiveDelay, setProactiveDelay] = useState(15);
  const [proactiveRules, setProactiveRules] = useState<ProactiveRule[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [widgetAutoTheme, setWidgetAutoTheme] = useState(true);
  const [widgetSoundEnabled, setWidgetSoundEnabled] = useState(false);
  const [widgetTheme, setWidgetTheme] = useState<EmbedThemeId>("modern");
  const [scheduleConfig, setScheduleConfig] = useState<AgentScheduleConfig>(
    () => normalizeAgentSchedule(null)
  );
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

  // Publish to Marketplace modal
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishName, setPublishName] = useState("");
  const [publishDescription, setPublishDescription] = useState("");
  const [publishCategory, setPublishCategory] = useState("Business");
  const [publishPrice, setPublishPrice] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Saved version flash
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  // Test case pre-fill from logs
  const [testCasePrefill, setTestCasePrefill] = useState<{ input: string; response: string } | null>(null);
  const [versionComparePreset, setVersionComparePreset] = useState<VersionComparePreset | null>(null);

  function applyAgentState(data: Agent) {
    setAgent(data);
    setName(data.name);
    setSystemPrompt(data.systemPrompt);
    setWelcomeMessage(data.welcomeMessage || "");
    setStatus(data.status);
    setLlmModel(data.llmModel || "claude-sonnet-4-20250514");
    setTemperature(typeof data.temperature === "number" ? data.temperature : 0.7);
    setModelProvider(data.modelProvider || "ANTHROPIC");
    setAutoDetectLanguage(data.autoDetectLanguage !== false);
    setMemoryEnabled(data.memoryEnabled || false);
    setVisitorMemoryEnabled(data.visitorMemoryEnabled !== false);
    setImageAnalysisEnabled(data.imageAnalysisEnabled || false);
    setShowAiDisclaimer(data.showAiDisclaimer !== false);
    setAgentType(data.agentType || "PUBLIC");
    setTeamRoutingEnabled(data.teamRoutingEnabled || false);
    setTeamRoutingTeamId(data.teamRoutingTeamId || null);
    setPromptBranches(Array.isArray(data.promptBranches) ? data.promptBranches : []);
    setCustomDomain(data.customDomain || "");
    const wl = (data.whiteLabel || {}) as Record<string, unknown>;
    const proactive = getProactiveSettings(wl);
    const widget = getWidgetSettings(wl);
    const schedule = getAgentScheduleFromWhiteLabel(wl);
    setPrimaryColor(typeof wl.primaryColor === "string" ? wl.primaryColor : "#F97316");
    setLogoUrl(typeof wl.logo === "string" ? wl.logo : "");
    setAvatarUrl(widget.avatarUrl);
    setWidgetAutoTheme(widget.autoTheme);
    setWidgetSoundEnabled(widget.soundEnabled);
    setWidgetTheme(
      typeof wl.theme === "string" && ["modern", "classic", "minimal", "playful"].includes(wl.theme)
        ? (wl.theme as EmbedThemeId)
        : "modern"
    );
    setScheduleConfig(schedule);
    setProactiveEnabled(proactive.enabled);
    setProactiveDelay(proactive.delay);
    setProactiveRules(proactive.rules);
  }

  async function loadAgent() {
    const res = await fetch(`/api/agents/${params.id}`);
    if (!res.ok) {
      throw new Error("Failed to load agent");
    }

    const data: Agent = await res.json();
    applyAgentState(data);
  }


  useEffect(() => {
    void loadAgent()
      .catch(() => router.push("/dashboard/agents"))
      .finally(() => setLoading(false));

    // Plan laden für Custom Domain Gating
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => setUserPlan(data.plan || "FREE"))
      .catch(() => {});
  }, [params.id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function fetchTeams() {
      try {
        const res = await fetch("/api/teams");
        if (res.ok) {
          const data = await res.json();
          setAvailableTeams(Array.isArray(data) ? data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })) : []);
        }
      } catch {}
    }
    fetchTeams();
  }, []);


  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    try {
      const existingWhiteLabel = (agent.whiteLabel || {}) as Record<string, unknown>;
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          systemPrompt,
          welcomeMessage,
          status,
          llmModel,
          temperature,
          modelProvider,
          autoDetectLanguage,
          memoryEnabled,
          visitorMemoryEnabled,
          imageAnalysisEnabled,
          showAiDisclaimer,
          agentType,
          teamRoutingEnabled,
          teamRoutingTeamId,
          promptBranches: promptBranches.length > 0 ? promptBranches : null,
          customDomain: customDomain.trim() || null,
          whiteLabel: {
            ...existingWhiteLabel,
            primaryColor,
            logo: logoUrl || null,
            avatarUrl: avatarUrl.trim() || null,
            autoTheme: widgetAutoTheme,
            soundEnabled: widgetSoundEnabled,
            theme: widgetTheme,
            schedule: scheduleConfig,
            position:
              typeof existingWhiteLabel.position === "string"
                ? existingWhiteLabel.position
                : "bottom-right",
            proactive: {
              enabled: proactiveEnabled,
              delay: proactiveEnabled ? Math.max(0, proactiveDelay) : 0,
              rules: proactiveRules,
            },
          },
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        applyAgentState({ ...agent, ...updated });
        setVersionComparePreset(null);
        // Flash saved version
        if (updated.currentVersion) {
          setSavedVersion(updated.currentVersion);
          setTimeout(() => setSavedVersion(null), 3000);
        }
        toast("Agent saved");
      } else {
        toast("Failed to save agent", "error");
      }
    } catch {
      toast("Failed to save agent", "error");
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

  async function handleApplyTestVersion(config: {
    systemPrompt: string;
    llmModel: string;
    modelProvider: string;
    temperature: number;
  }) {
    if (!agent) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: config.systemPrompt,
          llmModel: config.llmModel,
          modelProvider: config.modelProvider,
          temperature: config.temperature,
        }),
      });

      if (!res.ok) {
        toast("Failed to apply test version", "error");
        return;
      }

      const updated = await res.json();
      applyAgentState({ ...agent, ...updated });
      setVersionComparePreset(null);
      setSystemPrompt(updated.systemPrompt || config.systemPrompt);
      setLlmModel(updated.llmModel || config.llmModel);
      setTemperature(
        typeof updated.temperature === "number" ? updated.temperature : config.temperature
      );
      setModelProvider(updated.modelProvider || config.modelProvider);
      toast("Test version applied", "success");
    } catch {
      toast("Failed to apply test version", "error");
    } finally {
      setSaving(false);
    }
  }

  const [copiedWidget, setCopiedWidget] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);

  function buildWidgetCodeSnippet(host: string) {
    if (!agent) return "";

    const lines = [
      "<script",
      `  src="${host}/api/embed/widget.js"`,
      `  data-agent-id="${agent.id}"`,
      `  data-auto-theme="${widgetAutoTheme ? "true" : "false"}"`,
      `  data-sound="${widgetSoundEnabled ? "true" : "false"}"`,
      `  data-proactive-delay="${proactiveEnabled ? Math.max(0, proactiveDelay) : 0}"`,
    ];

    if (proactiveRules.length > 0) {
      lines.push(`  data-proactive-rules='${encodeRulesForAttribute(proactiveRules)}'`);
    }

    lines.push("  async", "></script>");

    return lines.join("\n");
  }

  function copyWidgetCode() {
    if (!agent) return;
    const host = typeof window !== "undefined" ? window.location.origin : "https://kilnbase.com";
    const code = buildWidgetCodeSnippet(host);
    navigator.clipboard.writeText(code);
    void fetch("/api/user/onboarding-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "embed_copied" }),
    }).catch(() => {});
    setCopiedWidget(true);
    setTimeout(() => setCopiedWidget(false), 2000);
  }

  function copyEmbedCode() {
    if (!agent) return;
    const code = `<iframe src="${window.location.origin}/embed/${agent.slug}" width="400" height="600" style="border:none;border-radius:16px" allow="clipboard-write"></iframe>`;
    navigator.clipboard.writeText(code);
    void fetch("/api/user/onboarding-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "embed_copied" }),
    }).catch(() => {});
    setCopiedIframe(true);
    setTimeout(() => setCopiedIframe(false), 2000);
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

  async function handlePublish() {
    if (!agent || !publishName.trim() || !publishDescription.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          name: publishName.trim(),
          description: publishDescription.trim(),
          category: publishCategory,
          price: publishPrice ? parseFloat(publishPrice) : 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowPublishModal(false);
        toast("Published to Marketplace!", "success");
      } else {
        toast(data.error || "Failed to publish", "error");
      }
    } catch {
      toast("Failed to publish", "error");
    } finally {
      setPublishing(false);
    }
  }

  function handleExportConfig() {
    if (!agent) return;
    const exportData: Record<string, unknown> = {
      kiln_version: "1.0",
      name: agent.name,
      slug: agent.slug,
      description: agent.description,
      agentMode: agent.agentMode,
      systemPrompt: agent.systemPrompt,
      personality: agent.personality,
      welcomeMessage: agent.welcomeMessage,
      suggestedQuestions: agent.suggestedQuestions,
      llmModel: agent.llmModel,
      temperature: agent.temperature,
      modelProvider: agent.modelProvider,
      memoryEnabled: agent.memoryEnabled,
      visitorMemoryEnabled: agent.visitorMemoryEnabled,
      imageAnalysisEnabled: agent.imageAnalysisEnabled,
      showAiDisclaimer: agent.showAiDisclaimer,
      agentType: agent.agentType,
      whiteLabel: agent.whiteLabel,
      showPoweredBy: agent.showPoweredBy,
      promptBranches: agent.promptBranches,
      actions: agent.actions.map((a) => ({
        type: a.type,
        enabled: a.enabled,
        config: a.config,
      })),
    };
    // Task Agent fields
    if (agent.agentMode === "TASK") {
      exportData.triggerType = agent.triggerType;
      exportData.triggerConfig = agent.triggerConfig;
      exportData.outputType = agent.outputType;
      exportData.outputConfig = agent.outputConfig;
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-${agent.slug}-config.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Config exported", "success");
  }

  // Wenn Advanced ausgeschaltet wird und wir auf einem Advanced-Tab sind → zurück zu config
  useEffect(() => {
    if (!advancedMode && advancedTabs.some((t) => t.id === activeTab)) {
      setActiveTab("config");
    }
  }, [advancedMode, activeTab]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (!requestedTab) return;

    const availableTabs = new Set<Tab>([
      ...chatBaseTabs.map((tab) => tab.id),
      ...(advancedMode ? advancedTabs.map((tab) => tab.id) : []),
    ]);

    if (availableTabs.has(requestedTab as Tab)) {
      setActiveTab(requestedTab as Tab);
    }
  }, [advancedMode, searchParams]);

  if (loading || !agent) {
    return (
      <div className="mx-auto max-w-6xl">
        {/* Header skeleton */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="skeleton h-8 w-8 rounded-lg" />
            <div className="skeleton h-10 w-10 rounded-lg" />
            <div>
              <div className="skeleton h-7 w-48 rounded" />
              <div className="skeleton mt-1.5 h-4 w-24 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="skeleton h-9 w-24 rounded-lg" />
            <div className="skeleton h-9 w-20 rounded-lg" />
          </div>
        </div>
        {/* Tab bar skeleton */}
        <div className="mb-6 flex gap-1 border-b border-border pb-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-28 rounded-lg" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-5">
            <div className="skeleton h-10 w-full rounded-lg" />
            <div className="skeleton h-24 w-full rounded-lg" />
            <div className="skeleton h-48 w-full rounded-lg" />
          </div>
          <div className="lg:col-span-2">
            <div className="skeleton h-[500px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Task Agents get their own visual flow-based layout
  if (agent?.agentMode === "TASK") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <TaskAgentDetail agent={agent as any} />;
  }

  const baseTabs = chatBaseTabs;
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Bot className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-foreground">{agent.name}</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">/{agent.slug}</p>
              <span className="text-xs text-muted-foreground">
                v{agent.currentVersion || 1} · Last edited {formatRelativeTime(agent.updatedAt)}
              </span>
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
          {(userPlan === "PRO" || userPlan === "AGENCY" || userPlan === "ADMIN") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPublishName(agent.name);
                setPublishDescription(agent.description || "");
                setPublishCategory("Business");
                setPublishPrice("");
                setShowPublishModal(true);
              }}
            >
              <Store className="mr-2 h-3.5 w-3.5" />
              Publish
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportConfig}>
            <Download className="mr-2 h-3.5 w-3.5" />
            Export
          </Button>
          <div className="relative">
            {savedVersion && (
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 animate-in fade-in slide-in-from-bottom-2 duration-300">
                Saved as v{savedVersion}
              </span>
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
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-0.5 overflow-x-auto rounded-xl bg-white/[0.03] border border-white/[0.06] p-1 scrollbar-none">
        {baseTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
              activeTab === tab.id
                ? "bg-white/[0.08] text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            )}
          >
            <tab.icon className={cn("h-4 w-4", activeTab === tab.id && "text-kiln-orange")} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}

        {advancedMode && (
          <>
            <div className="mx-1.5 h-5 w-px bg-border shrink-0" />
            {advancedTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
                  activeTab === tab.id
                    ? "bg-white/[0.08] text-purple-400 shadow-sm"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-purple-300"
                )}
              >
                <tab.icon className={cn("h-4 w-4", activeTab === tab.id && "text-purple-400")} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Unlock Advanced — shown when Advanced Mode is off */}
      {!advancedMode && activeTab !== "embed" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-dashed border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 shrink-0">
            <Bolt className="h-4 w-4 text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Unlock Advanced Features</p>
            <p className="text-xs text-muted-foreground">
              Debug, Logs, Memory, Versions, Testing, Webhooks, and Custom Tools — toggle Advanced Mode in the sidebar.
            </p>
          </div>
        </div>
      )}

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

              {/* AI Model Section */}
              <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">AI Model</label>
                  {(() => {
                    const md = getModelDef(llmModel);
                    return md?.badge ? (
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                        md.badge === "Most Capable" && "bg-purple-500/15 text-purple-400",
                        md.badge === "Best Value" && "bg-green-500/15 text-green-400",
                        md.badge === "Fastest" && "bg-blue-500/15 text-blue-400",
                        md.badge === "Best for Research" && "bg-orange-500/15 text-orange-400",
                      )}>{md.badge}</span>
                    ) : null;
                  })()}
                </div>

                {/* Provider */}
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Provider</label>
                  <select
                    value={modelProvider}
                    onChange={(e) => {
                      const newProvider = e.target.value as ProviderKey;
                      setModelProvider(newProvider);
                      const models = getModelsForProvider(newProvider);
                      if (models.length > 0) setLlmModel(models[0].id);
                    }}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  >
                    {(Object.keys(PROVIDERS) as ProviderKey[]).map((pk) => (
                      <option key={pk} value={pk}>{PROVIDERS[pk].label}</option>
                    ))}
                  </select>
                </div>

                {/* Model */}
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Model</label>
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  >
                    {getModelsForProvider(modelProvider as ProviderKey).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} {m.badge ? `— ${m.badge}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Indicators */}
                {(() => {
                  const md = getModelDef(llmModel);
                  if (!md) return null;
                  const dots = (n: number, max: number) => "●".repeat(n) + "○".repeat(max - n);
                  return (
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                      <span>Speed: <span className="text-foreground">{dots(md.speed, 3)}</span></span>
                      <span>Quality: <span className="text-foreground">{dots(md.quality, 3)}</span></span>
                      <span>Cost: <span className="text-foreground">{dots(md.cost, 3)}</span></span>
                      <span className="text-kiln-orange font-medium">{getCreditCost(md.id)} credits/msg</span>
                      {md.supportsTools && <span className="text-green-400">Tools ✓</span>}
                      {!md.supportsTools && <span className="text-amber-400">No tools</span>}
                    </div>
                  );
                })()}

                {/* Warnings */}
                {(() => {
                  const md = getModelDef(llmModel);
                  if (!md) return null;
                  return (
                    <>
                      {md.requiresByok && (
                        <p className="text-[10px] text-amber-400">
                          Requires your own {PROVIDERS[md.provider].label} API key. Add it in Settings → API Keys.
                        </p>
                      )}
                      {!md.supportsTools && agent?.actions.some((a) => a.enabled) && (
                        <p className="text-[10px] text-red-400">
                          ⚠ Actions and tool use require Anthropic or OpenAI models. Your enabled actions won&apos;t work with this model.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

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

              <AgentScheduleSection
                value={scheduleConfig}
                onChange={setScheduleConfig}
              />

              {/* Auto-detect Language Toggle */}
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
                      <Globe className="h-4 w-4 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Auto-detect Language
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Automatically respond in the visitor&apos;s language.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoDetectLanguage(!autoDetectLanguage)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      autoDetectLanguage ? "bg-cyan-500" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                        autoDetectLanguage ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
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

              {/* Visitor Memory Toggle */}
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                      <Users className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Visitor Memory
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Recognize returning visitors and personalize greetings.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setVisitorMemoryEnabled(!visitorMemoryEnabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      visitorMemoryEnabled ? "bg-purple-500" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                        visitorMemoryEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>

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

              {/* AI Transparency Disclaimer */}
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Shield className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Show AI Disclaimer
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Prepend &quot;I am an AI assistant.&quot; to the welcome message.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAiDisclaimer(!showAiDisclaimer)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      showAiDisclaimer ? "bg-emerald-500" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                        showAiDisclaimer ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
                {!showAiDisclaimer && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <p className="text-xs text-amber-400">
                      The EU AI Act requires transparency about AI-powered interactions.
                    </p>
                  </div>
                )}
              </div>

              {/* Internal Agent Toggle */}
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                      <Lock className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Internal Agent
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Only accessible by your team members. Requires login to chat.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAgentType(agentType === "INTERNAL" ? "PUBLIC" : "INTERNAL")}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      agentType === "INTERNAL" ? "bg-purple-500" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                        agentType === "INTERNAL" ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
                {agentType === "INTERNAL" && (
                  <div className="mt-4">
                    <div className="mb-3 flex items-start gap-2 rounded-lg bg-purple-500/10 p-3">
                      <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-400" />
                      <div className="text-xs text-purple-300">
                        <p className="font-medium text-purple-400 mb-1">Use cases</p>
                        <ul className="space-y-0.5 text-muted-foreground">
                          <li>• Employee onboarding bot</li>
                          <li>• Internal wiki assistant</li>
                          <li>• IT helpdesk agent</li>
                        </ul>
                      </div>
                    </div>
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-purple-400" />
                        <h4 className="text-xs font-semibold text-foreground">Team Access</h4>
                      </div>
                      <TeamAccess agentId={agent.id} />
                    </div>

                    {/* Team Chat Routing */}
                    <div className="border-t border-border pt-3 mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-4 w-4 text-orange-400" />
                        <h4 className="text-xs font-semibold text-foreground">Team Chat Routing</h4>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-3">
                        Automatisch zum passenden Team-Agenten weiterleiten, basierend auf der Nutzer-Intention.
                      </p>
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={teamRoutingEnabled}
                            onChange={(e) => setTeamRoutingEnabled(e.target.checked)}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-orange-500 focus:ring-orange-500/30"
                          />
                          <span className="text-xs text-zinc-300">Intent-basiertes Routing aktivieren</span>
                        </label>
                        {teamRoutingEnabled && (
                          <div>
                            <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">Team auswählen</label>
                            <select
                              value={teamRoutingTeamId || ""}
                              onChange={(e) => setTeamRoutingTeamId(e.target.value || null)}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-orange-500/50 focus:outline-none"
                            >
                              <option value="">— Kein Team —</option>
                              {availableTeams.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            {teamRoutingTeamId && (
                              <p className="mt-2 text-[10px] text-zinc-500">
                                Bei jeder Nachricht wird die Intention erkannt und der Agent gewechselt, wenn ein anderer besser passt (Confidence &gt; 80%).
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

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

          {activeTab === "eval" && (
            <EvalTab agentId={agent.id} />
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

          {activeTab === "visitor-memories" && (
            <VisitorMemoryTab agentId={agent.id} />
          )}

          {activeTab === "automations" && (
            <AutomationsTab agentId={agent.id} />
          )}

          {activeTab === "versions" && (
            <VersionsTab
              agentId={agent.id}
              currentVersion={agent.currentVersion || 1}
              currentConfig={{
                name,
                systemPrompt,
                personality: agent.personality,
                welcomeMessage,
                suggestedQuestions: agent.suggestedQuestions,
                llmModel,
                temperature,
                modelProvider,
                status: status as Agent["status"],
                whiteLabel: {
                  ...(agent.whiteLabel || {}),
                  primaryColor,
                  logo: logoUrl || null,
                  avatarUrl: avatarUrl.trim() || null,
                  autoTheme: widgetAutoTheme,
                  soundEnabled: widgetSoundEnabled,
                  schedule: scheduleConfig,
                  proactive: {
                    enabled: proactiveEnabled,
                    delay: proactiveEnabled ? Math.max(0, proactiveDelay) : 0,
                    rules: proactiveRules,
                  },
                },
                showPoweredBy: agent.showPoweredBy,
                autoDetectLanguage,
                memoryEnabled,
                visitorMemoryEnabled,
                imageAnalysisEnabled,
                showAiDisclaimer,
                promptBranches: promptBranches.length > 0 ? promptBranches : null,
                agentType,
                customDomain: customDomain.trim() || null,
                actions: agent.actions.map((action) => ({
                  type: action.type,
                  enabled: action.enabled,
                  config: action.config,
                })),
              }}
              onCompare={(preset) => {
                setVersionComparePreset(preset);
                setActiveTab("testlab");
              }}
              onRestore={() => {
                setVersionComparePreset(null);
                void loadAgent();
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

          {activeTab === "testlab" && (
            <TestLab
              agentId={agent.id}
              currentConfig={{
                systemPrompt,
                llmModel,
                modelProvider,
                temperature,
              }}
              initialTestConfig={versionComparePreset?.config}
              initialTestLabel={
                versionComparePreset ? `Loaded from v${versionComparePreset.version}` : undefined
              }
              initialTestKey={versionComparePreset?.versionId || null}
              onApplyVersion={handleApplyTestVersion}
            />
          )}

          {activeTab === "webhooks" && (
            <div className="space-y-10">
              <WebhooksTab agentId={agent.id} />
              <div className="border-t border-white/[0.06] pt-8">
                <EventSubscriptionsTab agentId={agent.id} />
              </div>
            </div>
          )}

          {activeTab === "channels" && (
            <ChannelsTab agentId={agent.id} />
          )}

          {activeTab === "integrations" && (
            <IntegrationsTab agentId={agent.id} />
          )}

          {activeTab === "embed" && (
            <div className="space-y-6">
              {/* Theme Selector */}
              <div className="rounded-xl border border-border bg-card/40 p-5">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Widget Theme</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose a pre-designed theme. Custom CSS still works on top of the selected theme.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {EMBED_THEME_LIST.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => setWidgetTheme(theme.id)}
                        className={cn(
                          "group relative rounded-xl border p-3 text-left transition-all",
                          widgetTheme === theme.id
                            ? "border-orange-500/50 bg-orange-500/5 ring-1 ring-orange-500/20"
                            : "border-border bg-card/40 hover:border-border/80 hover:bg-card/60"
                        )}
                      >
                        {/* Mini Preview */}
                        <div className="mb-2.5 overflow-hidden rounded-lg border border-white/[0.06] bg-white">
                          {/* Mini header */}
                          <div
                            className="h-5 flex items-center px-2"
                            style={{
                              background: theme.chat.headerStyle === "none"
                                ? "transparent"
                                : theme.chat.headerStyle === "gradient"
                                  ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`
                                  : primaryColor,
                              borderRadius: `${parseInt(theme.chat.windowRadius) || 0}px ${parseInt(theme.chat.windowRadius) || 0}px 0 0`,
                            }}
                          >
                            {theme.chat.headerStyle !== "none" && (
                              <div className="h-1 w-10 rounded-full bg-white/60" />
                            )}
                          </div>
                          {/* Mini messages */}
                          <div className="space-y-1 p-1.5">
                            <div className="flex">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: "60%",
                                  background: theme.chat.messageBubbleStyle === "plain" ? "transparent" : "#f0f0f0",
                                  borderBottom: theme.chat.messageBubbleStyle === "plain" ? "1px solid #f0f0f0" : "none",
                                  borderRadius: theme.chat.messageBubbleRadius,
                                }}
                              />
                            </div>
                            <div className="flex justify-end">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: "45%",
                                  background: theme.chat.messageBubbleStyle === "plain" ? "transparent" : primaryColor,
                                  borderBottom: theme.chat.messageBubbleStyle === "plain" ? "1px solid #f0f0f0" : "none",
                                  borderRadius: theme.chat.messageBubbleRadius,
                                  opacity: theme.chat.messageBubbleStyle === "plain" ? 1 : 0.85,
                                }}
                              />
                            </div>
                            <div className="flex">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: "50%",
                                  background: theme.chat.messageBubbleStyle === "plain" ? "transparent" : "#f0f0f0",
                                  borderBottom: theme.chat.messageBubbleStyle === "plain" ? "1px solid #f0f0f0" : "none",
                                  borderRadius: theme.chat.messageBubbleRadius,
                                }}
                              />
                            </div>
                          </div>
                          {/* Mini input */}
                          <div className="border-t border-gray-100 p-1.5">
                            <div
                              className="h-2.5 rounded bg-gray-50 border border-gray-100"
                              style={{ borderRadius: theme.chat.inputRadius }}
                            />
                          </div>
                        </div>
                        {/* Mini bubble preview */}
                        <div className="absolute -bottom-1 -right-1">
                          {theme.bubble.triggerType === "icon" ? (
                            <div
                              className="flex items-center justify-center text-white text-[6px] font-bold shadow-sm"
                              style={{
                                width: Math.max(theme.bubble.size * 0.35, 16),
                                height: Math.max(theme.bubble.size * 0.35, 16),
                                borderRadius: theme.bubble.borderRadius,
                                background: primaryColor,
                              }}
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            </div>
                          ) : (
                            <span className="text-[7px] font-medium" style={{ color: primaryColor }}>
                              {theme.bubble.triggerText}
                            </span>
                          )}
                        </div>
                        {/* Label */}
                        <p className="text-xs font-medium text-foreground">{theme.name}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{theme.description}</p>
                        {widgetTheme === theme.id && (
                          <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-orange-500 flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card/40 p-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),220px]">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Widget Identity & Theme</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Control how the widget looks on external websites without breaking the default embed flow.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Avatar URL
                      </label>
                      <input
                        type="url"
                        value={avatarUrl}
                        onChange={(event) => setAvatarUrl(event.target.value)}
                        placeholder="https://cdn.example.com/agent-avatar.png"
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                      />
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Used in the widget bubble and beside agent messages. If empty, KILN generates a letter avatar automatically.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-black/10 px-3 py-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={widgetAutoTheme}
                          onChange={(event) => setWidgetAutoTheme(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border bg-card text-kiln-orange"
                        />
                        Auto-theme from host site
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-black/10 px-3 py-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={widgetSoundEnabled}
                          onChange={(event) => setWidgetSoundEnabled(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border bg-card text-kiln-orange"
                        />
                        Play response sound
                      </label>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Preview
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold text-white shadow-lg"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {avatarUrl.trim() ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarUrl}
                            alt={agent.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          agent.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Bubble/avatar will inherit the host color when auto-theme is enabled.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card/40 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Proactive Messages</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Show a context-aware prompt when visitors linger or scroll deep on the page.
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/[0.08] bg-black/10 px-3 py-1.5 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={proactiveEnabled}
                      onChange={(event) => setProactiveEnabled(event.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border bg-card text-kiln-orange"
                    />
                    Enable proactive messages
                  </label>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[180px,1fr]">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Delay
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={proactiveDelay}
                      disabled={!proactiveEnabled}
                      onChange={(event) =>
                        setProactiveDelay(Math.max(0, Number(event.target.value) || 0))
                      }
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Seconds before the popup appears. `0` disables proactive triggers.
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Custom URL Rules
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setProactiveRules((prev) => [...prev, { match: "", message: "" }])
                        }
                        disabled={!proactiveEnabled}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add Rule
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {proactiveRules.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                          No custom rules yet. Built-in rules for pricing, product, contact, and FAQ still apply.
                        </div>
                      ) : (
                        proactiveRules.map((rule, index) => (
                          <div
                            key={index}
                            className="grid gap-3 rounded-lg border border-border bg-black/10 p-3 md:grid-cols-[180px,1fr,auto]"
                          >
                            <input
                              type="text"
                              value={rule.match}
                              disabled={!proactiveEnabled}
                              onChange={(event) =>
                                setProactiveRules((prev) =>
                                  prev.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? { ...entry, match: event.target.value }
                                      : entry
                                  )
                                )
                              }
                              placeholder="pricing"
                              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <input
                              type="text"
                              value={rule.message}
                              disabled={!proactiveEnabled}
                              onChange={(event) =>
                                setProactiveRules((prev) =>
                                  prev.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? { ...entry, message: event.target.value }
                                      : entry
                                  )
                                )
                              }
                              placeholder="Looking at pricing? I can help you find the right plan."
                              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              disabled={!proactiveEnabled}
                              onClick={() =>
                                setProactiveRules((prev) =>
                                  prev.filter((_, entryIndex) => entryIndex !== index)
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/a/${agent.slug}`, "_blank")}
                  >
                    <Globe className="mr-2 h-3.5 w-3.5" />
                    Open
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Chat Bubble Widget — Primary */}
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <label className="block text-sm font-medium text-foreground">
                    Chat Bubble Widget
                  </label>
                  <span className="rounded-full bg-kiln-green/10 px-2 py-0.5 text-[10px] font-semibold text-kiln-green">
                    Recommended
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Paste this single line into your website. A floating chat bubble appears in the bottom-right corner — click to open, Escape to close. Fully responsive on mobile.
                </p>
                <div className="relative">
                  <pre className="rounded-lg border border-border bg-card p-4 font-mono text-xs text-foreground overflow-x-auto">
{buildWidgetCodeSnippet(
  typeof window !== "undefined" ? window.location.origin : "https://kilnbase.com"
)}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute right-2 top-2"
                    onClick={copyWidgetCode}
                  >
                    {copiedWidget ? (
                      <Check className="mr-1.5 h-3 w-3 text-kiln-green" />
                    ) : (
                      <Copy className="mr-1.5 h-3 w-3" />
                    )}
                    {copiedWidget ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-medium text-foreground">Optional attributes:</p>
                  <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
                    <p><span className="text-kiln-orange">data-position</span>=&quot;bottom-left&quot; — Place bubble on the left</p>
                    <p><span className="text-kiln-orange">data-greeting</span>=&quot;Hi! Need help?&quot; — Override the default proactive message</p>
                    <p><span className="text-kiln-orange">data-auto-theme</span>=&quot;true&quot; — Detect the host website accent color automatically</p>
                    <p><span className="text-kiln-orange">data-sound</span>=&quot;true&quot; — Play a subtle response ping when the tab is unfocused</p>
                    <p><span className="text-kiln-orange">data-proactive-delay</span>=&quot;15&quot; — Delay before the proactive popup appears</p>
                    <p><span className="text-kiln-orange">data-proactive-rules</span>=&apos;[&#123;&quot;match&quot;:&quot;pricing&quot;,&quot;message&quot;:&quot;Looking at pricing?&quot;&#125;]&apos; — Custom URL pattern rules</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* iframe Embed — Advanced */}
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <label className="block text-sm font-medium text-foreground">
                    iframe Embed
                  </label>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    Advanced
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Embed the chat directly into your page layout. Use this if you want full control over sizing and placement.
                </p>
                <div className="relative">
                  <pre className="rounded-lg border border-border bg-card p-4 font-mono text-xs text-foreground overflow-x-auto">
{`<iframe
  src="${typeof window !== "undefined" ? window.location.origin : "https://kilnbase.com"}/embed/${agent.slug}"
  width="400"
  height="600"
  style="border:none;border-radius:16px"
  allow="clipboard-write"
></iframe>`}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute right-2 top-2"
                    onClick={copyEmbedCode}
                  >
                    {copiedIframe ? (
                      <Check className="mr-1.5 h-3 w-3 text-kiln-green" />
                    ) : (
                      <Copy className="mr-1.5 h-3 w-3" />
                    )}
                    {copiedIframe ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rechte Seite: Preview oder Live-Chat (versteckt bei Full-Width-Tabs) */}
        {!isFullWidth && (
        <div className="lg:col-span-2">
          {activeTab === "config" ? (
            <LivePreviewPanel
              agentId={agent.id}
              config={{
                name,
                systemPrompt,
                model: llmModel,
                modelProvider,
                temperature,
              }}
            />
          ) : (
            <div className="sticky top-6 h-[600px]">
              <AgentLiveChat
                agentId={agent.id}
                agentName={agent.name}
                welcomeMessage={showAiDisclaimer
                  ? `I am an AI assistant.${agent.welcomeMessage ? ` ${agent.welcomeMessage}` : ""}`
                  : agent.welcomeMessage}
                suggestedQuestions={agent.suggestedQuestions}
                debugMode={isDebugTab}
                imageAnalysisEnabled={imageAnalysisEnabled}
              />
            </div>
          )}
        </div>
        )}
      </div>

      {/* Advanced Prompt Editor Modal */}
      {showPromptEditor && (
        <PromptEditor
          value={systemPrompt}
          onChange={setSystemPrompt}
          onClose={() => setShowPromptEditor(false)}
          advancedMode={advancedMode}
          branches={promptBranches}
          onBranchesChange={setPromptBranches}
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

      {/* Publish to Marketplace Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPublishModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-[#1C1917] p-6 shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-foreground">Publish to Marketplace</h3>
              <button
                onClick={() => setShowPublishModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-xs text-muted-foreground">
              Share your agent as a template. Personal data, knowledge base content, and API keys are automatically stripped.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Template Name</label>
                <input
                  type="text"
                  value={publishName}
                  onChange={(e) => setPublishName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Description</label>
                <textarea
                  value={publishDescription}
                  onChange={(e) => setPublishDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Category</label>
                <select
                  value={publishCategory}
                  onChange={(e) => setPublishCategory(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  {["Business", "Marketing", "Support", "Sales", "Health", "Education", "Operations", "Real Estate", "Trades", "Restaurant", "Other"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Price (EUR)
                  <span className="ml-2 text-xs font-normal text-muted-foreground">Leave empty for free</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={publishPrice}
                  onChange={(e) => setPublishPrice(e.target.value)}
                  placeholder="0 (Free)"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowPublishModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={publishing || !publishName.trim() || !publishDescription.trim()}
              >
                {publishing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Store className="mr-1.5 h-3.5 w-3.5" />
                )}
                Publish
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
