"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  CreditCard,
  Crown,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Zap,
  Building2,
  Sparkles,
  Gift,
  Copy,
  Check,
  Users,
  Trophy,
  Key,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  Terminal,
  Plus,
  BookOpen,
  Webhook,
  Send,
  Power,
  PowerOff,
  ChevronDown,
  ChevronUp,
  XCircle,
  CheckCircle,
  Clock,
  FileDown,
  RotateCcw,
  Receipt,
  User,
  Store,
  Star,
  Download,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import {
  API_ACCESS_EXPIRY_OPTIONS,
  API_ACCESS_SCOPES,
  DEFAULT_API_ACCESS_SCOPES,
  formatApiAccessExpiry,
  isApiAccessKeyExpiringSoon,
  type ApiAccessExpiryOption,
  type ApiAccessScope,
} from "@/lib/api-access-keys";
import { cn } from "@/lib/utils";
import { CreditUsageChart } from "@/components/credit-usage-chart";
import { Skeleton } from "@/components/ui/skeleton";

interface UserPlan {
  plan: "FREE" | "STARTER" | "PRO" | "AGENCY" | "ENTERPRISE" | "ADMIN";
  agentCount: number;
  chatCount: number;
  limits: { agents: number; chatsPerMonth: number };
  cancelAtPeriodEnd?: boolean;
  cancelAt?: string | null;
}

interface Invoice {
  id: string;
  date: string | null;
  amount: number;
  currency: string;
  status: string | null;
  pdfUrl: string | null;
}

interface AccessKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiAccessScope[];
  expiresAt: string | null;
  lastUsed: string | null;
  createdAt: string;
  usage: {
    requests7d: number;
    requests30d: number;
    mostUsedEndpoints: { endpoint: string; count: number }[];
  };
}

const plans = [
  {
    id: "FREE" as const,
    name: "Free",
    price: "€0",
    monthlyPrice: 0,
    yearlyPrice: 0,
    icon: Zap,
    features: ["1 Agent", "50 AI credits/month", "1 Knowledge Base (5MB)", "Embed Widget", "KILN Branding", "Community Support"],
  },
  {
    id: "STARTER" as const,
    name: "Starter",
    price: "€39",
    monthlyPrice: 39,
    yearlyPrice: 327,
    icon: Sparkles,
    features: ["3 Agents", "500 AI credits/month", "3 Knowledge Bases (20MB)", "Basic Analytics", "Email Support", "All Actions", "Agent Teams & Orchestration", "Workflow Editor", "All Basic Nodes", "Reasoning Log"],
  },
  {
    id: "PRO" as const,
    name: "Pro",
    price: "€99",
    monthlyPrice: 99,
    yearlyPrice: 832,
    icon: Crown,
    popular: true,
    features: [
      "10 Agents",
      "2,000 AI credits/month",
      "10 Knowledge Bases (50MB)",
      "Full Analytics + ROI",
      "White-Label",
      "Feedback Loop",
      "Priority Support",
      "Prompt Editor",
      "Computer Use Pro (Browser + Vision)",
      "100 Computer Use Steps per Run",
      "Code Sandbox (Python & JS)",
      "Agent Swarm (5 Agents)",
      "Verification Checkpoints",
      "Diff Detection",
      "Proof of Work",
      "3 Scheduled Automations",
      "Smart Model Routing",
    ],
  },
  {
    id: "AGENCY" as const,
    name: "Business",
    price: "€249",
    monthlyPrice: 249,
    yearlyPrice: 2091,
    icon: Building2,
    features: [
      "Unlimited Agents, 5,000 credits/mo",
      "Unlimited Knowledge Bases",
      "API Access + MCP Server",
      "Agent Cloning",
      "Custom Domain",
      "Multi-Client Management",
      "Dedicated Support",
      "Computer Use Unlimited",
      "Agent Swarm (20 Agents)",
      "Multi-Site Orchestration",
      "Watch & Learn",
      "Agent builds Agents",
      "API Autodiscovery",
      "Zero-Config Wizard",
      "Procedural Memory",
      "Manual Model Routing",
      "Unlimited Schedules",
      "Parallel Execution (10 Branches)",
      "Priority Execution",
    ],
  },
  {
    id: "ENTERPRISE" as const,
    name: "Enterprise",
    price: "Custom",
    monthlyPrice: 0,
    yearlyPrice: 0,
    isCustom: true,
    icon: Building2,
    features: [
      "Everything in Business",
      "SLA 99.9%",
      "Custom Onboarding",
      "50,000 AI credits/month",
      "Scheduled Agents",
      "Webhooks",
      "Priority Queue",
      "Dedicated Sandbox Instance",
      "Dedicated Resources",
    ],
  },
];

type SettingsTab = "profile" | "billing" | "api-keys" | "webhooks" | "referral" | "templates" | "danger";

const settingsTabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "referral", label: "Referral", icon: Gift },
  { id: "templates", label: "My Templates", icon: Store },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

function SettingsContent() {
  const { toast } = useToast();
  const { user } = useUser();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredUsers, setReferredUsers] = useState(0);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [copied, setCopied] = useState(false);

  // API Keys (BYOK)
  const [apiKeys, setApiKeys] = useState<{ id: string; provider: string; keyHint: string }[]>([]);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [perplexityKey, setPerplexityKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showPerplexityKey, setShowPerplexityKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccess, setKeySuccess] = useState<string | null>(null);

  // API Access Keys
  const [accessKeys, setAccessKeys] = useState<AccessKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<ApiAccessScope[]>(DEFAULT_API_ACCESS_SCOPES);
  const [newKeyExpiry, setNewKeyExpiry] = useState<ApiAccessExpiryOption>("never");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [deletingAccessKey, setDeletingAccessKey] = useState<string | null>(null);
  const [accessKeyCopied, setAccessKeyCopied] = useState(false);
  const [accessKeyError, setAccessKeyError] = useState<string | null>(null);

  // Subscription management
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  // Delete Account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Webhooks
  interface WebhookDeliveryItem {
    id: string;
    event: string;
    statusCode: number | null;
    responseTime: number | null;
    success: boolean;
    error: string | null;
    createdAt: string;
  }
  interface WebhookItem {
    id: string;
    url: string;
    events: string[];
    secret: string;
    active: boolean;
    createdAt: string;
    deliveries: WebhookDeliveryItem[];
  }
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [addingWebhook, setAddingWebhook] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState<string | null>(null);

  // AI Credits
  interface CreditInfo {
    balance: number;
    totalCredits: number;
    monthlyCredits: number;
    resetDate: string | null;
    byokActive: boolean;
    byokKeyCount: number;
    plan: string;
    creditTier: number;
    tiers: { credits: number; monthlyPrice: number; yearlyPrice: number }[];
    isAdmin: boolean;
    usage: {
      dailyUsage: { date: string; credits: number }[];
      topAgents: { agentId: string; agentName: string; credits: number }[];
      totalUsed: number;
      byType: { type: string; credits: number }[];
    };
  }
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);
  const [purchasingCredits, setPurchasingCredits] = useState<string | null>(null);

  // My Templates
  interface MyTemplate {
    id: string;
    name: string;
    category: string;
    price: number;
    rating: number;
    ratingCount: number;
    downloads: number;
    createdAt: string;
  }
  const [myTemplates, setMyTemplates] = useState<MyTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
      setActiveTab("billing");
      setTimeout(() => setShowSuccess(false), 5000);
    }
    if (searchParams.get("credits") === "success") {
      setActiveTab("billing");
      toast("Credits purchased successfully! They have been added to your balance.");
      // Refresh credit info
      fetch("/api/credits").then((r) => r.json()).then((d) => { if (d.balance !== undefined) setCreditInfo(d); }).catch(() => {});
    }
    const tab = searchParams.get("tab");
    if (tab && ["profile", "billing", "api-keys", "webhooks", "referral", "templates", "danger"].includes(tab)) {
      setActiveTab(tab as SettingsTab);
    }
  }, [searchParams, toast]);

  useEffect(() => {
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => {
        setUserPlan(data);
        if (data.plan !== "FREE" && data.plan !== "ADMIN") {
          setLoadingInvoices(true);
          fetch("/api/stripe/invoices")
            .then((r) => r.json())
            .then((inv) => { if (Array.isArray(inv)) setInvoices(inv); })
            .catch(() => {})
            .finally(() => setLoadingInvoices(false));
        }
      })
      .catch(() => setUserPlan({ plan: "FREE", agentCount: 0, chatCount: 0, limits: { agents: 1, chatsPerMonth: 50 } }))
      .finally(() => setLoading(false));

    fetch("/api/referral")
      .then((res) => res.json())
      .then((data) => {
        setReferralCode(data.referralCode || null);
        setReferredUsers(data.referredUsers || 0);
        setCreditsEarned(data.creditsEarned || 0);
      })
      .catch(() => {});

    fetch("/api/user/api-keys")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setApiKeys(data); })
      .catch(() => {});

    fetch("/api/credits")
      .then((res) => res.json())
      .then((data) => { if (data.balance !== undefined) setCreditInfo(data); })
      .catch(() => {});

    fetch("/api/user/api-access-keys")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setAccessKeys(data); })
      .catch(() => {});

    fetch("/api/user/webhooks")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setWebhooks(data); })
      .catch(() => {});

    // Load user's marketplace templates
    setLoadingTemplates(true);
    fetch("/api/marketplace?authorId=me")
      .then((res) => res.json())
      .then((data) => { if (data.templates) setMyTemplates(data.templates); })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpgrade(planId: string) {
    const envKey = billingAnnual
      ? `NEXT_PUBLIC_STRIPE_${planId}_YEARLY_PRICE_ID`
      : `NEXT_PUBLIC_STRIPE_${planId}_PRICE_ID`;
    const priceId = process.env[envKey];
    if (!priceId) return;
    setUpgrading(planId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {} finally { setUpgrading(null); }
  }

  async function handleManage() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
  }

  async function handleReactivate() {
    setReactivating(true);
    try {
      const res = await fetch("/api/stripe/reactivate", { method: "POST" });
      if (res.ok) {
        const planRes = await fetch("/api/stripe/plan");
        const data = await planRes.json();
        setUserPlan(data);
        toast("Subscription reactivated");
      }
    } catch {} finally { setReactivating(false); }
  }

  async function generateAccessKey() {
    if (!newKeyName.trim()) return;
    setGeneratingKey(true);
    setGeneratedKey(null);
    setAccessKeyError(null);
    try {
      const res = await fetch("/api/user/api-access-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: newKeyScopes,
          expiry: newKeyExpiry,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAccessKeyError(data.error || "Failed to generate key"); return; }
      setGeneratedKey(data.key);
      setNewKeyName("");
      setNewKeyScopes(DEFAULT_API_ACCESS_SCOPES);
      setNewKeyExpiry("never");
      toast("API key generated");
      const keysRes = await fetch("/api/user/api-access-keys");
      const keysData = await keysRes.json();
      if (Array.isArray(keysData)) setAccessKeys(keysData);
    } catch { setAccessKeyError("Failed to generate API key"); } finally { setGeneratingKey(false); }
  }

  async function deleteAccessKey(keyId: string) {
    setDeletingAccessKey(keyId);
    setAccessKeyError(null);
    try {
      await fetch("/api/user/api-access-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      setAccessKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast("API key deleted", "info");
    } catch { setAccessKeyError("Failed to delete key"); } finally { setDeletingAccessKey(null); }
  }

  function toggleAccessScope(scope: ApiAccessScope) {
    setNewKeyScopes((prev) => {
      if (scope === "admin") {
        return prev.includes("admin") ? prev : ["admin"];
      }

      const withoutAdmin = prev.filter((item) => item !== "admin");
      if (withoutAdmin.includes(scope)) {
        return withoutAdmin.length === 1
          ? prev
          : withoutAdmin.filter((item) => item !== scope);
      }

      return [...withoutAdmin, scope];
    });
  }

  async function purchaseCredits(packageId: string) {
    setPurchasingCredits(packageId);
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast("Failed to start checkout", "error");
    } catch { toast("Failed to purchase credits", "error"); }
    finally { setPurchasingCredits(null); }
  }

  async function saveApiKey(provider: string, apiKey: string) {
    if (!apiKey.trim()) return;
    setSavingKey(provider);
    setKeyError(null);
    setKeySuccess(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setKeyError(data.error || "Failed to save key"); return; }
      const keysRes = await fetch("/api/user/api-keys");
      const keysData = await keysRes.json();
      if (Array.isArray(keysData)) setApiKeys(keysData);
      if (provider === "anthropic") setAnthropicKey("");
      if (provider === "openai") setOpenaiKey("");
      toast(`${provider === "anthropic" ? "Anthropic" : "OpenAI"} API key saved`);
      setKeySuccess(`${provider === "anthropic" ? "Anthropic" : "OpenAI"} API key saved successfully.`);
      setTimeout(() => setKeySuccess(null), 3000);
    } catch { setKeyError("Failed to save API key"); } finally { setSavingKey(null); }
  }

  async function deleteApiKey(provider: string) {
    setDeletingKey(provider);
    setKeyError(null);
    try {
      await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      setApiKeys((prev) => prev.filter((k) => k.provider !== provider));
    } catch { setKeyError("Failed to delete key"); } finally { setDeletingKey(null); }
  }

  const WEBHOOK_EVENT_OPTIONS = [
    { value: "conversation.started", label: "Conversation Started" },
    { value: "conversation.ended", label: "Conversation Ended" },
    { value: "lead.scored", label: "Lead Scored" },
    { value: "action.executed", label: "Action Executed" },
    { value: "agent.updated", label: "Agent Updated" },
  ];

  async function addWebhook() {
    if (!webhookUrl.trim() || webhookEvents.length === 0) return;
    setAddingWebhook(true);
    setWebhookError(null);
    try {
      const res = await fetch("/api/user/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl.trim(), events: webhookEvents }),
      });
      const data = await res.json();
      if (!res.ok) { setWebhookError(data.error || "Failed to create webhook"); return; }
      setWebhooks((prev) => [data, ...prev]);
      setWebhookUrl("");
      setWebhookEvents([]);
      toast("Webhook created");
    } catch { setWebhookError("Failed to create webhook"); } finally { setAddingWebhook(false); }
  }

  async function toggleWebhook(webhookId: string, active: boolean) {
    try {
      const res = await fetch("/api/user/webhooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId, active }),
      });
      const data = await res.json();
      if (res.ok) setWebhooks((prev) => prev.map((w) => (w.id === webhookId ? data : w)));
    } catch {}
  }

  async function deleteWebhook(webhookId: string) {
    setDeletingWebhook(webhookId);
    try {
      await fetch("/api/user/webhooks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId }),
      });
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
      toast("Webhook deleted", "info");
    } catch { setWebhookError("Failed to delete webhook"); } finally { setDeletingWebhook(null); }
  }

  async function testWebhook(webhookId: string) {
    setTestingWebhook(webhookId);
    try {
      const res = await fetch("/api/user/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", webhookId }),
      });
      const data = await res.json();
      const refreshRes = await fetch("/api/user/webhooks");
      const refreshData = await refreshRes.json();
      if (Array.isArray(refreshData)) setWebhooks(refreshData);
      if (!data.success) {
        setWebhookError(`Test failed: ${data.error || `Status ${data.statusCode}`}`);
        setTimeout(() => setWebhookError(null), 5000);
      } else {
        toast("Test webhook sent");
      }
    } catch { setWebhookError("Failed to send test"); } finally { setTestingWebhook(null); }
  }

  function toggleWebhookEvent(event: string) {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8 px-6">
        <Skeleton className="h-7 w-32" />
        <div className="rounded-xl border border-border bg-card/50 p-6 space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
    );
  }

  const currentPlan = userPlan?.plan || "FREE";
  const isAdminUser = currentPlan === "ADMIN";
  const displayName = user?.firstName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "User";
  const displayEmail = user?.emailAddresses?.[0]?.emailAddress || "";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account, billing, and integrations.
        </p>
      </div>

      {showSuccess && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-500/30 bg-muted p-4">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Upgrade successful! Your plan has been updated.
          </p>
        </div>
      )}

      {/* Tab Bar */}
      <div className="mb-6 flex items-center gap-0.5 overflow-x-auto rounded-xl bg-muted border border-border p-1 scrollbar-none">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
              activeTab === tab.id
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
              tab.id === "danger" && activeTab === tab.id && "text-muted-foreground",
              tab.id === "danger" && activeTab !== tab.id && "text-muted-foreground hover:text-muted-foreground"
            )}
          >
            <tab.icon className={cn(
              "h-4 w-4",
              activeTab === tab.id && tab.id !== "danger" && "text-muted-foreground",
              activeTab === tab.id && tab.id === "danger" && "text-muted-foreground",
            )} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════ PROFILE TAB ═══════════════ */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Profile</h2>
            <div className="flex items-center gap-4 mb-6">
              {user?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.imageUrl}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-semibold text-foreground ring-2 ring-border">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-foreground">{displayName}</p>
                <p className="text-sm text-muted-foreground">{displayEmail}</p>
                <span className={cn(
                  "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  isAdminUser ? "bg-purple-500/15 text-muted-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {isAdminUser ? "Admin" : currentPlan} Plan
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Full Name</label>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground">
                  {user?.fullName || displayName}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Email</label>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground">
                  {displayEmail}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Profile information is managed through Clerk. Click your avatar in the sidebar to access account settings.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ BILLING TAB ═══════════════ */}
      {activeTab === "billing" && (
        <div className="space-y-6">
          {/* Current Plan */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Current Plan</h2>
                <div className="mt-2 flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    isAdminUser ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {isAdminUser ? "Admin" : currentPlan}
                  </span>
                  {isAdminUser ? (
                    <span className="text-sm text-muted-foreground">Unlimited — all features enabled</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{plans.find((p) => p.id === currentPlan)?.price}/month</span>
                  )}
                </div>
              </div>
              {!isAdminUser && currentPlan !== "FREE" && (
                <Button variant="outline" size="sm" onClick={handleManage}>
                  <CreditCard className="mr-2 h-3.5 w-3.5" />
                  Manage Subscription
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              )}
            </div>

            {userPlan && (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Agents</span>
                    <span className="text-foreground">
                      {userPlan.agentCount} / {userPlan.limits.agents >= 999999 ? "∞" : userPlan.limits.agents}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-kiln-orange transition-all"
                      style={{ width: `${Math.min((userPlan.agentCount / (userPlan.limits.agents >= 999999 ? 100 : userPlan.limits.agents)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Conversations (this month)</span>
                    <span className="text-foreground">
                      {userPlan.chatCount} / {userPlan.limits.chatsPerMonth.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-kiln-orange transition-all"
                      style={{ width: `${Math.min((userPlan.chatCount / userPlan.limits.chatsPerMonth) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Cancellation Banner */}
            {userPlan?.cancelAtPeriodEnd && userPlan.cancelAt && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/20 bg-muted p-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Your plan will be cancelled on{" "}
                      {new Date(userPlan.cancelAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                    <p className="text-xs text-muted-foreground/70">You can reactivate anytime before this date.</p>
                  </div>
                </div>
                <Button size="sm" onClick={handleReactivate} disabled={reactivating} className="bg-amber-500 text-white hover:bg-amber-600">
                  {reactivating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                  Reactivate
                </Button>
              </div>
            )}

            {/* Downgrade Warning */}
            {userPlan && !isAdminUser && (
              userPlan.agentCount >= userPlan.limits.agents ||
              (userPlan.limits.chatsPerMonth < 999999 && userPlan.chatCount >= userPlan.limits.chatsPerMonth * 0.8)
            ) && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-muted p-4">
                <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">You&apos;re approaching your plan limits. Consider upgrading.</p>
              </div>
            )}
          </div>

          {/* AI Credits Dashboard */}
          {creditInfo && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-foreground">AI Credits</h2>
                  <p className="text-xs text-muted-foreground">Credits consumed per AI response. BYOK keys bypass credit usage.</p>
                </div>
                {creditInfo.byokActive && (
                  <span className="rounded-full bg-muted border border-green-500/20 px-3 py-1 text-xs font-semibold text-muted-foreground">BYOK: Unlimited</span>
                )}
              </div>

              {/* Balance Bar */}
              <div className="grid gap-4 md:grid-cols-2 mb-4">
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Credits remaining</span>
                    <span className={cn("font-semibold",
                      creditInfo.isAdmin ? "text-foreground" :
                      creditInfo.balance / creditInfo.totalCredits <= 0.05 ? "text-muted-foreground" :
                      creditInfo.balance / creditInfo.totalCredits <= 0.2 ? "text-muted-foreground" :
                      creditInfo.balance / creditInfo.totalCredits <= 0.5 ? "text-yellow-400" : "text-foreground"
                    )}>
                      {creditInfo.isAdmin ? "∞" : `${creditInfo.balance.toLocaleString()} / ${creditInfo.totalCredits.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all",
                        creditInfo.isAdmin ? "bg-kiln-green" :
                        creditInfo.balance / creditInfo.totalCredits <= 0.05 ? "bg-red-500" :
                        creditInfo.balance / creditInfo.totalCredits <= 0.2 ? "bg-amber-500" :
                        creditInfo.balance / creditInfo.totalCredits <= 0.5 ? "bg-yellow-500" : "bg-kiln-green"
                      )}
                      style={{ width: `${creditInfo.isAdmin ? 100 : Math.min((creditInfo.balance / creditInfo.totalCredits) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  {creditInfo.resetDate && (
                    <p className="text-sm text-muted-foreground">
                      <Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                      Resets: {new Date(creditInfo.resetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Used this month: {creditInfo.usage.totalUsed.toLocaleString()} credits</p>
                </div>
              </div>

              {/* Credit Tier Selector */}
              {!creditInfo.isAdmin && creditInfo.tiers && creditInfo.tiers.length > 1 && (
                <div className="mb-4 rounded-lg border border-border bg-card/50 p-4">
                  <h3 className="text-sm font-medium text-foreground mb-2">Credit Tier</h3>
                  <p className="text-xs text-muted-foreground mb-3">Adjust your monthly credit allocation within your {creditInfo.plan} plan.</p>
                  <div className="grid gap-2 md:grid-cols-3">
                    {creditInfo.tiers.map((tier, idx) => (
                      <button
                        key={idx}
                        className={cn(
                          "flex flex-col items-center rounded-lg border p-3 text-center transition-all",
                          idx === creditInfo.creditTier
                            ? "border-kiln-orange bg-muted"
                            : "border-border hover:border-foreground/20 hover:bg-muted/40"
                        )}
                        disabled={idx === creditInfo.creditTier}
                      >
                        <span className="text-lg font-bold text-foreground">{tier.credits.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">credits/month</span>
                        <span className="mt-1 text-sm font-semibold text-muted-foreground">
                          {tier.monthlyPrice > 0 ? `€${tier.monthlyPrice}/mo` : "Free"}
                        </span>
                        {idx === creditInfo.creditTier && (
                          <span className="mt-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Current</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Low credit warnings */}
              {!creditInfo.isAdmin && creditInfo.balance <= 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/20 bg-muted p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="flex-1 text-xs text-muted-foreground">Your AI credits are exhausted. Agents cannot respond.</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={() => purchaseCredits("credits_500")}>Buy Credits</Button>
                    <Link href="/dashboard/settings?tab=api-keys"><Button size="sm" variant="outline" className="h-7 text-xs">Add API Key</Button></Link>
                  </div>
                </div>
              )}
              {!creditInfo.isAdmin && creditInfo.balance > 0 && creditInfo.balance / creditInfo.totalCredits <= 0.05 && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/20 bg-muted p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="flex-1 text-xs text-muted-foreground">Critical: Only {creditInfo.balance} credits remaining.</p>
                  <Button size="sm" className="h-7 text-xs" onClick={() => purchaseCredits("credits_500")}>Buy Credits</Button>
                </div>
              )}
              {!creditInfo.isAdmin && creditInfo.balance > 0 && creditInfo.balance / creditInfo.totalCredits > 0.05 && creditInfo.balance / creditInfo.totalCredits <= 0.2 && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-muted p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="flex-1 text-xs text-muted-foreground">{creditInfo.balance} credits remaining this month.</p>
                </div>
              )}

              {/* Recharts Daily Usage */}
              {creditInfo.usage.dailyUsage.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-foreground mb-2">Daily Usage (Last 30 Days)</h3>
                  <div className="h-32 w-full">
                    <CreditUsageChart data={creditInfo.usage.dailyUsage} />
                  </div>
                </div>
              )}

              {/* Usage by Type + Top Agents side by side */}
              <div className="grid gap-4 md:grid-cols-2 mb-4">
                {/* Usage by Type */}
                {creditInfo.usage.byType.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">By Type</h3>
                    <div className="space-y-1.5">
                      {creditInfo.usage.byType.map((t) => {
                        const typeLabels: Record<string, string> = { CHAT: "Chat", TEAM_TASK: "Teams", ORCHESTRATION: "Orchestration", SCHEDULED: "Scheduled", WEBHOOK: "Webhooks", EMBEDDING: "Embedding" };
                        const typeColors: Record<string, string> = { CHAT: "bg-kiln-orange", TEAM_TASK: "bg-blue-500", ORCHESTRATION: "bg-purple-500", SCHEDULED: "bg-kiln-green", WEBHOOK: "bg-amber-500", EMBEDDING: "bg-muted-foreground" };
                        const pct = creditInfo.usage.totalUsed > 0 ? (t.credits / creditInfo.usage.totalUsed) * 100 : 0;
                        return (
                          <div key={t.type} className="flex items-center gap-2 text-xs">
                            <div className={cn("h-2 w-2 rounded-full shrink-0", typeColors[t.type] || "bg-muted")} />
                            <span className="text-muted-foreground flex-1">{typeLabels[t.type] || t.type}</span>
                            <span className="font-medium text-foreground">{t.credits.toLocaleString()}</span>
                            <span className="text-muted-foreground w-10 text-right">{Math.round(pct)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top Agents */}
                {creditInfo.usage.topAgents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">Top Agents</h3>
                    <div className="space-y-1.5">
                      {creditInfo.usage.topAgents.map((a) => (
                        <div key={a.agentId} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate">{a.agentName}</span>
                          <span className="font-medium text-foreground">{a.credits.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Buy More Credits */}
              {!creditInfo.isAdmin && (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">Buy More Credits</h3>
                  <div className="grid gap-2 md:grid-cols-3">
                    {[
                      { id: "credits_500", credits: "500", price: "€9" },
                      { id: "credits_2000", credits: "2,000", price: "€29" },
                      { id: "credits_5000", credits: "5,000", price: "€59" },
                    ].map((pkg) => (
                      <button
                        key={pkg.id}
                        onClick={() => purchaseCredits(pkg.id)}
                        disabled={purchasingCredits !== null}
                        className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-3 text-left transition-all hover:border-foreground/20 hover:bg-muted/40 disabled:opacity-50"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">{pkg.credits} Credits</p>
                          <p className="text-xs text-muted-foreground">One-time purchase</p>
                        </div>
                        <span className="text-sm font-bold text-muted-foreground">{pkg.price}</span>
                        {purchasingCredits === pkg.id && <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Invoice History */}
          {!isAdminUser && currentPlan !== "FREE" && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Invoice History</h2>
                  <p className="text-xs text-muted-foreground">Your recent invoices and receipts.</p>
                </div>
              </div>
              {loadingInvoices ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : invoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-foreground">
                          {inv.date ? new Date(inv.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">{inv.currency} {inv.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          inv.status === "paid" ? "bg-muted text-muted-foreground" : inv.status === "open" ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          {inv.status || "unknown"}
                        </span>
                        {inv.pdfUrl && (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Download PDF">
                            <FileDown className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Available Plans */}
          {!isAdminUser && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Available Plans</h2>
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card p-1">
                  <button
                    onClick={() => setBillingAnnual(false)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${!billingAnnual ? "bg-white text-[#1a1918]" : "text-muted-foreground"}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingAnnual(true)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${billingAnnual ? "bg-white text-[#1a1918]" : "text-muted-foreground"}`}
                  >
                    Yearly
                    <span className="ml-1 text-[10px] text-[#22C55E]">-30%</span>
                  </button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {plans.map((plan) => {
                  const isCurrent = plan.id === currentPlan;
                  const Icon = plan.icon;
                  const displayPrice = billingAnnual && plan.monthlyPrice > 0
                    ? `€${Math.round(plan.yearlyPrice / 12)}`
                    : plan.price;
                  const planOrder = ["FREE", "STARTER", "PRO", "AGENCY", "ENTERPRISE"];
                  const currentIdx = planOrder.indexOf(currentPlan);
                  const planIdx = planOrder.indexOf(plan.id);
                  const isDowngrade = planIdx < currentIdx;
                  return (
                    <div key={plan.id} className={`relative flex flex-col rounded-xl border p-4 ${plan.popular ? "border-kiln-orange bg-kiln-orange/5" : isCurrent ? "border-kiln-orange/40 bg-kiln-orange/[0.03]" : "border-border bg-card"}`}>
                      {plan.popular && !isCurrent && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-kiln-orange px-2.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap">Most Popular</div>
                      )}
                      {isCurrent && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-muted border border-foreground/20 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">Current</div>
                      )}
                      <Icon className="mb-2 h-5 w-5 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                      <div className="mt-1 flex items-baseline gap-0.5">
                        <span className="text-xl font-bold text-foreground">{plan.isCustom ? "Custom" : displayPrice}</span>
                        {!plan.isCustom && plan.monthlyPrice > 0 && <span className="text-xs text-muted-foreground">/mo</span>}
                      </div>
                      {!plan.isCustom && billingAnnual && plan.monthlyPrice > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className="line-through">€{plan.monthlyPrice}</span>{" "}
                          <span className="text-[#22C55E]">€{plan.yearlyPrice}/yr</span>
                        </p>
                      )}
                      <ul className="mt-3 flex-1 space-y-1.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4">
                        {isCurrent ? (
                          <Button disabled className="w-full h-8 text-xs" variant="outline">Current Plan</Button>
                        ) : plan.id === "FREE" ? (
                          <Button disabled className="w-full h-8 text-xs" variant="outline">Included</Button>
                        ) : plan.isCustom ? (
                          <a href="mailto:andre@hephaistos-systems.de" className="flex h-8 w-full items-center justify-center rounded-md border border-border text-xs font-medium text-foreground transition-colors hover:bg-muted">
                            Contact Sales
                          </a>
                        ) : isDowngrade ? (
                          <Button disabled className="w-full h-8 text-xs" variant="outline">Downgrade</Button>
                        ) : (
                          <Button className="w-full h-8 text-xs" onClick={() => handleUpgrade(plan.id)} disabled={upgrading !== null}>
                            {upgrading === plan.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                            Upgrade
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════ API KEYS TAB ═══════════════ */}
      {activeTab === "api-keys" && (
        <div className="space-y-6">
          {/* BYOK Keys */}
          {(["PRO", "AGENCY", "ENTERPRISE"].includes(currentPlan) || isAdminUser) ? (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Key className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">LLM API Keys</h2>
                  <p className="text-xs text-muted-foreground">Bring your own API keys for unlimited conversations.</p>
                </div>
              </div>

              {/* BYOK = Unlimited banner */}
              {apiKeys.length > 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-green-500/20 bg-muted p-3">
                  <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Using your own API key? Enjoy unlimited conversations — no credits consumed.</p>
                </div>
              )}

              {keyError && <div className="mb-4 rounded-lg border border-red-500/30 bg-muted px-3 py-2 text-xs text-muted-foreground">{keyError}</div>}
              {keySuccess && <div className="mb-4 rounded-lg border border-green-500/30 bg-muted px-3 py-2 text-xs text-muted-foreground">{keySuccess}</div>}

              <div className="space-y-5">
                {/* Anthropic Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Anthropic API Key</label>
                  {apiKeys.find((k) => k.provider === "anthropic") ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm text-muted-foreground">{apiKeys.find((k) => k.provider === "anthropic")?.keyHint}</div>
                      <Button size="sm" variant="outline" onClick={() => deleteApiKey("anthropic")} disabled={deletingKey === "anthropic"} className="text-muted-foreground hover:bg-muted hover:text-muted-foreground">
                        {deletingKey === "anthropic" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type={showAnthropicKey ? "text" : "password"} value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                        <button type="button" onClick={() => setShowAnthropicKey(!showAnthropicKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showAnthropicKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button size="sm" onClick={() => saveApiKey("anthropic", anthropicKey)} disabled={savingKey === "anthropic" || !anthropicKey.trim()}>
                        {savingKey === "anthropic" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  )}
                  {apiKeys.find((k) => k.provider === "anthropic") && <p className="mt-1.5 text-xs text-muted-foreground">Using your own Anthropic key — unlimited conversations for Claude models.</p>}
                </div>
                {/* OpenAI Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">OpenAI API Key</label>
                  {apiKeys.find((k) => k.provider === "openai") ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm text-muted-foreground">{apiKeys.find((k) => k.provider === "openai")?.keyHint}</div>
                      <Button size="sm" variant="outline" onClick={() => deleteApiKey("openai")} disabled={deletingKey === "openai"} className="text-muted-foreground hover:bg-muted hover:text-muted-foreground">
                        {deletingKey === "openai" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type={showOpenaiKey ? "text" : "password"} value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                        <button type="button" onClick={() => setShowOpenaiKey(!showOpenaiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button size="sm" onClick={() => saveApiKey("openai", openaiKey)} disabled={savingKey === "openai" || !openaiKey.trim()}>
                        {savingKey === "openai" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  )}
                  {apiKeys.find((k) => k.provider === "openai") && <p className="mt-1.5 text-xs text-muted-foreground">Using your own OpenAI key — unlimited conversations for GPT models.</p>}
                </div>
                {/* Perplexity Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Perplexity API Key</label>
                  {apiKeys.find((k) => k.provider === "perplexity") ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm text-muted-foreground">{apiKeys.find((k) => k.provider === "perplexity")?.keyHint}</div>
                      <Button size="sm" variant="outline" onClick={() => deleteApiKey("perplexity")} disabled={deletingKey === "perplexity"} className="text-muted-foreground hover:bg-muted hover:text-muted-foreground">
                        {deletingKey === "perplexity" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type={showPerplexityKey ? "text" : "password"} value={perplexityKey} onChange={(e) => setPerplexityKey(e.target.value)} placeholder="pplx-..." className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                        <button type="button" onClick={() => setShowPerplexityKey(!showPerplexityKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPerplexityKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button size="sm" onClick={() => saveApiKey("perplexity", perplexityKey)} disabled={savingKey === "perplexity" || !perplexityKey.trim()}>
                        {savingKey === "perplexity" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  )}
                  {apiKeys.find((k) => k.provider === "perplexity") && <p className="mt-1.5 text-xs text-muted-foreground">Using your own Perplexity key — unlimited conversations for Sonar models.</p>}
                </div>
                {/* Google AI Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Google AI API Key</label>
                  {apiKeys.find((k) => k.provider === "google") ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm text-muted-foreground">{apiKeys.find((k) => k.provider === "google")?.keyHint}</div>
                      <Button size="sm" variant="outline" onClick={() => deleteApiKey("google")} disabled={deletingKey === "google"} className="text-muted-foreground hover:bg-muted hover:text-muted-foreground">
                        {deletingKey === "google" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type={showGoogleKey ? "text" : "password"} value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} placeholder="AIza..." className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                        <button type="button" onClick={() => setShowGoogleKey(!showGoogleKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showGoogleKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button size="sm" onClick={() => saveApiKey("google", googleKey)} disabled={savingKey === "google" || !googleKey.trim()}>
                        {savingKey === "google" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  )}
                  {apiKeys.find((k) => k.provider === "google") && <p className="mt-1.5 text-xs text-muted-foreground">Using your own Google AI key — unlimited conversations for Gemini models.</p>}
                </div>
                {/* Groq Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Groq API Key</label>
                  {apiKeys.find((k) => k.provider === "groq") ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm text-muted-foreground">{apiKeys.find((k) => k.provider === "groq")?.keyHint}</div>
                      <Button size="sm" variant="outline" onClick={() => deleteApiKey("groq")} disabled={deletingKey === "groq"} className="text-muted-foreground hover:bg-muted hover:text-muted-foreground">
                        {deletingKey === "groq" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type={showGroqKey ? "text" : "password"} value={groqKey} onChange={(e) => setGroqKey(e.target.value)} placeholder="gsk_..." className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                        <button type="button" onClick={() => setShowGroqKey(!showGroqKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showGroqKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button size="sm" onClick={() => saveApiKey("groq", groqKey)} disabled={savingKey === "groq" || !groqKey.trim()}>
                        {savingKey === "groq" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  )}
                  {apiKeys.find((k) => k.provider === "groq") && <p className="mt-1.5 text-xs text-muted-foreground">Using your own Groq key — unlimited conversations for Llama & Mixtral models.</p>}
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-border bg-card/30 p-3">
                <p className="text-xs text-muted-foreground">Your keys are encrypted with AES-256-GCM and stored securely. They are only used when your agents process conversations. KILN never stores them in plaintext.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Key className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">API keys available on Pro and Agency plans</p>
              <p className="mt-1 text-xs text-muted-foreground">Upgrade to bring your own LLM API keys for unlimited conversations.</p>
              <Button size="sm" className="mt-4" onClick={() => setActiveTab("billing")}>View Plans</Button>
            </div>
          )}

          {/* API Access Keys */}
          {(["AGENCY", "ENTERPRISE"].includes(currentPlan) || isAdminUser) && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Terminal className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">API Access</h2>
                    <p className="text-xs text-muted-foreground">Generate API keys for programmatic access to your agents.</p>
                  </div>
                </div>
                <Link href="/dashboard/api-docs">
                  <Button size="sm" variant="outline"><BookOpen className="mr-1.5 h-3.5 w-3.5" />API Docs</Button>
                </Link>
              </div>

              {generatedKey && (
                <div className="mb-4 rounded-lg border border-foreground/20 bg-kiln-orange/5 p-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Save this key now — it won&apos;t be shown again!</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground break-all">{generatedKey}</code>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(generatedKey); setAccessKeyCopied(true); setTimeout(() => setAccessKeyCopied(false), 2000); }}>
                      {accessKeyCopied ? <Check className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                      {accessKeyCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              )}

              {accessKeyError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {accessKeyError}
                </div>
              )}

              <div className="mb-4 space-y-4 rounded-lg border border-dashed border-border bg-card/30 p-4">
                <div className="flex flex-col gap-2 md:flex-row">
                  <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name (e.g. Production, Staging)" className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" onKeyDown={(e) => e.key === "Enter" && generateAccessKey()} />
                  <select value={newKeyExpiry} onChange={(e) => setNewKeyExpiry(e.target.value as ApiAccessExpiryOption)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                    {API_ACCESS_EXPIRY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={generateAccessKey} disabled={generatingKey || !newKeyName.trim()}>
                    {generatingKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                    Generate Key
                  </Button>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Scopes</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {API_ACCESS_SCOPES.map((scope) => {
                      const checked = newKeyScopes.includes(scope.id);

                      return (
                        <label key={scope.id} className={cn("flex items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors", checked ? "border-kiln-orange/40 bg-kiln-orange/5" : "border-border bg-card")}>
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-border bg-card text-muted-foreground focus:ring-kiln-orange"
                            checked={checked}
                            onChange={() => toggleAccessScope(scope.id)}
                          />
                          <div>
                            <p className="font-medium text-foreground">{scope.label}</p>
                            <p className="text-xs text-muted-foreground">{scope.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {accessKeys.length > 0 ? (
                <div className="space-y-2">
                  {accessKeys.map((key) => (
                    <div key={key.id} className="flex items-start justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{key.name}</p>
                            {isApiAccessKeyExpiringSoon(key.expiresAt) && (
                              <span className="rounded-full border border-amber-500/40 bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Expiring soon
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="font-mono">{key.keyPrefix}</span>
                            <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                            {key.lastUsed && <span>Last used {new Date(key.lastUsed).toLocaleDateString()}</span>}
                            <span>Expires {formatApiAccessExpiry(key.expiresAt)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {key.scopes.map((scope) => (
                              <span key={`${key.id}-${scope}`} className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
                                {scope}
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>{key.usage.requests7d} requests / 7d</span>
                            <span>{key.usage.requests30d} requests / 30d</span>
                            <span>
                              Top: {key.usage.mostUsedEndpoints[0]
                                ? `${key.usage.mostUsedEndpoints[0].endpoint} (${key.usage.mostUsedEndpoints[0].count})`
                                : "No usage yet"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteAccessKey(key.id)} disabled={deletingAccessKey === key.id} className="text-muted-foreground hover:bg-muted hover:text-muted-foreground">
                        {deletingAccessKey === key.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No API keys yet. Generate one to get started.</p>
              )}

              <div className="mt-4 rounded-lg border border-dashed border-border bg-card/30 p-3">
                <p className="text-xs text-muted-foreground">API keys support scoped access, optional expiry, and per-request usage tracking. Keep them secure and never expose them in client-side code. Maximum 5 keys per account. Rate limit: 100 requests/minute per key.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ WEBHOOKS TAB ═══════════════ */}
      {activeTab === "webhooks" && (
        <div className="space-y-6">
          {(["PRO", "AGENCY", "ENTERPRISE"].includes(currentPlan) || isAdminUser) ? (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Webhook className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Webhooks</h2>
                  <p className="text-xs text-muted-foreground">Receive HTTP notifications when events occur in your agents.</p>
                </div>
              </div>

              {webhookError && <div className="mb-4 rounded-lg border border-red-500/30 bg-muted px-3 py-2 text-xs text-muted-foreground">{webhookError}</div>}

              {/* Add Webhook Form */}
              <div className="mb-5 space-y-3 rounded-lg border border-dashed border-border bg-card/30 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Endpoint URL</label>
                  <input type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Events</label>
                  <div className="flex flex-wrap gap-2">
                    {WEBHOOK_EVENT_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => toggleWebhookEvent(opt.value)} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${webhookEvents.includes(opt.value) ? "border-blue-500/50 bg-muted text-muted-foreground" : "border-border bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button size="sm" onClick={addWebhook} disabled={addingWebhook || !webhookUrl.trim() || webhookEvents.length === 0}>
                  {addingWebhook ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                  Add Webhook
                </Button>
              </div>

              {/* Webhooks List */}
              {webhooks.length > 0 ? (
                <div className="space-y-3">
                  {webhooks.map((wh) => (
                    <div key={wh.id} className="rounded-lg border border-border bg-muted/20">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <button type="button" onClick={() => toggleWebhook(wh.id, !wh.active)} className="flex-shrink-0" title={wh.active ? "Disable" : "Enable"}>
                            {wh.active ? <Power className="h-4 w-4 text-muted-foreground" /> : <PowerOff className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground font-mono">{wh.url}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(wh.events as string[]).map((ev) => (
                                <span key={ev} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{ev}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                          <Button size="sm" variant="ghost" onClick={() => testWebhook(wh.id)} disabled={testingWebhook === wh.id} title="Send test event">
                            {testingWebhook === wh.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setExpandedWebhook(expandedWebhook === wh.id ? null : wh.id)} title="Show details">
                            {expandedWebhook === wh.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteWebhook(wh.id)} disabled={deletingWebhook === wh.id} className="text-muted-foreground hover:bg-muted hover:text-muted-foreground">
                            {deletingWebhook === wh.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      {expandedWebhook === wh.id && (
                        <div className="border-t border-border px-4 py-3 space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Signing Secret</label>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground break-all">{wh.secret}</code>
                              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(wh.secret); setSecretCopied(wh.id); setTimeout(() => setSecretCopied(null), 2000); }}>
                                {secretCopied === wh.id ? <Check className="h-3 w-3 text-muted-foreground" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Recent Deliveries</label>
                            {wh.deliveries.length > 0 ? (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {wh.deliveries.map((del) => (
                                  <div key={del.id} className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-xs">
                                    {del.success ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" /> : <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
                                    <span className="font-mono text-muted-foreground">{del.event}</span>
                                    <span className={`font-mono ${del.success ? "text-muted-foreground" : "text-muted-foreground"}`}>{del.statusCode || "ERR"}</span>
                                    {del.responseTime != null && <span className="flex items-center gap-0.5 text-muted-foreground"><Clock className="h-3 w-3" />{del.responseTime}ms</span>}
                                    {del.error && <span className="truncate text-muted-foreground" title={del.error}>{del.error}</span>}
                                    <span className="ml-auto text-muted-foreground">{new Date(del.createdAt).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No deliveries yet.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No webhooks configured. Add one to start receiving event notifications.</p>
              )}

              <div className="mt-4 rounded-lg border border-dashed border-border bg-card/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Payloads are signed with HMAC-SHA256. Verify the <code className="font-mono text-foreground">X-KILN-Signature</code> header against your signing secret. Maximum 5 webhooks per account. Deliveries retry once on failure with a 5-second timeout.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Webhook className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Webhooks available on Pro and Agency plans</p>
              <p className="mt-1 text-xs text-muted-foreground">Upgrade to receive HTTP notifications when events occur.</p>
              <Button size="sm" className="mt-4" onClick={() => setActiveTab("billing")}>View Plans</Button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ REFERRAL TAB ═══════════════ */}
      {activeTab === "referral" && (
        <div className="space-y-6">
          {referralCode ? (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Gift className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Referral Program</h2>
                  <p className="text-xs text-muted-foreground">Invite friends and earn 1 free month when they upgrade.</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Your Referral Code</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm font-bold text-muted-foreground">{referralCode}</div>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(referralCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                      {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Share Link</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 truncate rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {typeof window !== "undefined" ? `${window.location.origin}/sign-up?ref=${referralCode}` : `/sign-up?ref=${referralCode}`}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { const link = `${window.location.origin}/sign-up?ref=${referralCode}`; navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                      {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Users Referred</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-foreground">{referredUsers}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Credits Earned</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {creditsEarned}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">month{creditsEarned !== 1 ? "s" : ""} free</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Gift className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Referral program loading...</p>
              <p className="mt-1 text-xs text-muted-foreground">Your referral code will appear here once your account is set up.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ MY TEMPLATES TAB ═══════════════ */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">My Templates</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Templates you&apos;ve published to the marketplace.
            </p>
          </div>

          {loadingTemplates ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : myTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Store className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No templates published yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Publish an agent from the agent detail page to share it on the marketplace.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myTemplates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">{t.name}</h3>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t.category}
                      </span>
                      {t.price > 0 && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          €{t.price}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {t.downloads} downloads
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {t.rating > 0 ? `${t.rating} (${t.ratingCount})` : "No ratings"}
                      </span>
                      <span>
                        {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 ml-4 border-red-500/30 text-muted-foreground hover:bg-muted hover:text-red-300"
                    disabled={deletingTemplate === t.id}
                    onClick={async () => {
                      if (!confirm("Remove this template from the marketplace?")) return;
                      setDeletingTemplate(t.id);
                      try {
                        await fetch("/api/marketplace", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ templateId: t.id }),
                        });
                        setMyTemplates((prev) => prev.filter((x) => x.id !== t.id));
                        toast("Template removed", "info");
                      } catch {
                        toast("Failed to remove template", "error");
                      } finally {
                        setDeletingTemplate(null);
                      }
                    }}
                  >
                    {deletingTemplate === t.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ DANGER ZONE TAB ═══════════════ */}
      {activeTab === "danger" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete Account</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Permanently delete your account and all associated data.
                </p>
              </div>
              <Button
                variant="outline"
                className="border-red-500/30 text-muted-foreground hover:bg-muted hover:text-red-300"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl mx-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Delete Account</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              This will permanently delete all your data including agents, conversations,
              knowledge bases, and cancel your subscription. Type{" "}
              <span className="font-mono font-bold text-muted-foreground">DELETE</span> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}>Cancel</Button>
              <Button
                size="sm"
                disabled={deleteConfirm !== "DELETE" || deleting}
                className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch("/api/account/delete", { method: "DELETE" });
                    if (res.ok) window.location.href = "/";
                  } catch { setDeleting(false); }
                }}
              >
                {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                Delete Forever
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
