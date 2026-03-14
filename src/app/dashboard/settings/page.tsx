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
import { cn } from "@/lib/utils";

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

const plans = [
  {
    id: "FREE" as const,
    name: "Free",
    price: "€0",
    monthlyPrice: 0,
    yearlyPrice: 0,
    icon: Zap,
    features: ["1 Agent", "50 conversations/month", "1 Knowledge Base (5MB)", "Embed Widget", "KILN Branding", "Community Support"],
  },
  {
    id: "STARTER" as const,
    name: "Starter",
    price: "€29",
    monthlyPrice: 29,
    yearlyPrice: 243,
    icon: Sparkles,
    features: ["3 Agents", "500 conversations/month", "3 Knowledge Bases (20MB)", "Basic Analytics", "Email Support", "All Actions"],
  },
  {
    id: "PRO" as const,
    name: "Pro",
    price: "€79",
    monthlyPrice: 79,
    yearlyPrice: 663,
    icon: Crown,
    popular: true,
    features: [
      "10 Agents",
      "Unlimited Chats",
      "10 Knowledge Bases (50MB)",
      "Full Analytics + ROI",
      "White-Label",
      "Feedback Loop",
      "Priority Support",
      "Prompt Editor",
    ],
  },
  {
    id: "AGENCY" as const,
    name: "Agency",
    price: "€199",
    monthlyPrice: 199,
    yearlyPrice: 1670,
    icon: Building2,
    features: [
      "Unlimited Agents & Chats",
      "Unlimited Knowledge Bases",
      "API Access + MCP Server",
      "Agent Cloning",
      "Custom Domain",
      "Multi-Client Management",
      "Dedicated Support",
    ],
  },
  {
    id: "ENTERPRISE" as const,
    name: "Enterprise",
    price: "€499",
    monthlyPrice: 499,
    yearlyPrice: 4190,
    icon: Building2,
    features: [
      "Everything in Agency",
      "SLA 99.9%",
      "Custom Onboarding",
      "50K Conversations",
      "Scheduled Agents",
      "Webhooks",
      "Priority Queue",
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
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccess, setKeySuccess] = useState<string | null>(null);

  // API Access Keys
  const [accessKeys, setAccessKeys] = useState<{ id: string; name: string; keyPrefix: string; lastUsed: string | null; createdAt: string }[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [deletingAccessKey, setDeletingAccessKey] = useState<string | null>(null);
  const [accessKeyCopied, setAccessKeyCopied] = useState(false);

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
  }, [searchParams]);

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
    try {
      const res = await fetch("/api/user/api-access-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setKeyError(data.error || "Failed to generate key"); return; }
      setGeneratedKey(data.key);
      setNewKeyName("");
      toast("API key generated");
      const keysRes = await fetch("/api/user/api-access-keys");
      const keysData = await keysRes.json();
      if (Array.isArray(keysData)) setAccessKeys(keysData);
    } catch { setKeyError("Failed to generate API key"); } finally { setGeneratingKey(false); }
  }

  async function deleteAccessKey(keyId: string) {
    setDeletingAccessKey(keyId);
    try {
      await fetch("/api/user/api-access-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      setAccessKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast("API key deleted", "info");
    } catch { setKeyError("Failed to delete key"); } finally { setDeletingAccessKey(null); }
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
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <div className="skeleton h-9 w-32 rounded-lg" />
          <div className="skeleton mt-3 h-4 w-64 rounded" />
        </div>
        <div className="flex gap-1 border-b border-border mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-24 rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="skeleton h-48 w-full rounded-xl" />
          <div className="skeleton h-32 w-full rounded-xl" />
        </div>
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
        <h1 className="font-serif text-3xl text-foreground">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account, billing, and integrations.
        </p>
      </div>

      {showSuccess && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <p className="text-sm font-medium text-green-400">
            Upgrade successful! Your plan has been updated.
          </p>
        </div>
      )}

      {/* Tab Bar */}
      <div className="mb-6 flex items-center gap-0.5 overflow-x-auto border-b border-border scrollbar-none">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
              tab.id === "danger" && activeTab === tab.id && "text-red-400",
              tab.id === "danger" && activeTab !== tab.id && "text-muted-foreground hover:text-red-400"
            )}
          >
            <tab.icon className={cn(
              "h-4 w-4",
              activeTab === tab.id && tab.id !== "danger" && "text-kiln-orange",
              activeTab === tab.id && tab.id === "danger" && "text-red-400",
            )} />
            <span className="hidden sm:inline">{tab.label}</span>
            {activeTab === tab.id && (
              <div className={cn(
                "absolute bottom-0 left-2 right-2 h-0.5 rounded-full",
                tab.id === "danger" ? "bg-red-500" : "bg-kiln-orange"
              )} />
            )}
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
                  isAdminUser ? "bg-purple-500/15 text-purple-400" : "bg-kiln-orange/15 text-kiln-orange"
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
                    isAdminUser ? "bg-purple-500/10 text-purple-400" : "bg-kiln-orange/10 text-kiln-orange"
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
              <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-amber-300">
                      Your plan will be cancelled on{" "}
                      {new Date(userPlan.cancelAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                    <p className="text-xs text-amber-400/70">You can reactivate anytime before this date.</p>
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
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-400">You&apos;re approaching your plan limits. Consider upgrading.</p>
              </div>
            )}
          </div>

          {/* Invoice History */}
          {!isAdminUser && currentPlan !== "FREE" && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10">
                  <Receipt className="h-5 w-5 text-kiln-orange" />
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
                          inv.status === "paid" ? "bg-green-500/10 text-green-400" : inv.status === "open" ? "bg-amber-500/10 text-amber-400" : "bg-muted text-muted-foreground"
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
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${!billingAnnual ? "bg-white text-[#0C0A09]" : "text-muted-foreground"}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingAnnual(true)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${billingAnnual ? "bg-white text-[#0C0A09]" : "text-muted-foreground"}`}
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
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-kiln-orange/20 border border-kiln-orange/30 px-2.5 py-0.5 text-[10px] font-semibold text-kiln-orange whitespace-nowrap">Current</div>
                      )}
                      <Icon className="mb-2 h-5 w-5 text-kiln-orange" />
                      <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                      <div className="mt-1 flex items-baseline gap-0.5">
                        <span className="text-xl font-bold text-foreground">{displayPrice}</span>
                        {plan.monthlyPrice > 0 && <span className="text-[10px] text-muted-foreground">/mo</span>}
                      </div>
                      {billingAnnual && plan.monthlyPrice > 0 && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          <span className="line-through">€{plan.monthlyPrice}</span>{" "}
                          <span className="text-[#22C55E]">€{plan.yearlyPrice}/yr</span>
                        </p>
                      )}
                      <ul className="mt-3 flex-1 space-y-1.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-kiln-orange" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4">
                        {isCurrent ? (
                          <Button disabled className="w-full h-8 text-xs" variant="outline">Current Plan</Button>
                        ) : plan.id === "FREE" ? (
                          <Button disabled className="w-full h-8 text-xs" variant="outline">Included</Button>
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Key className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">LLM API Keys</h2>
                  <p className="text-xs text-muted-foreground">Bring your own API keys for unlimited conversations.</p>
                </div>
              </div>

              {keyError && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{keyError}</div>}
              {keySuccess && <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">{keySuccess}</div>}

              <div className="space-y-5">
                {/* Anthropic Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Anthropic API Key</label>
                  {apiKeys.find((k) => k.provider === "anthropic") ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm text-muted-foreground">{apiKeys.find((k) => k.provider === "anthropic")?.keyHint}</div>
                      <Button size="sm" variant="outline" onClick={() => deleteApiKey("anthropic")} disabled={deletingKey === "anthropic"} className="text-red-400 hover:bg-red-500/10 hover:text-red-400">
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
                  {apiKeys.find((k) => k.provider === "anthropic") && <p className="mt-1.5 text-xs text-green-400">Using your own Anthropic key — unlimited conversations for Claude models.</p>}
                </div>
                {/* OpenAI Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">OpenAI API Key</label>
                  {apiKeys.find((k) => k.provider === "openai") ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm text-muted-foreground">{apiKeys.find((k) => k.provider === "openai")?.keyHint}</div>
                      <Button size="sm" variant="outline" onClick={() => deleteApiKey("openai")} disabled={deletingKey === "openai"} className="text-red-400 hover:bg-red-500/10 hover:text-red-400">
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
                  {apiKeys.find((k) => k.provider === "openai") && <p className="mt-1.5 text-xs text-green-400">Using your own OpenAI key — unlimited conversations for GPT models.</p>}
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10">
                    <Terminal className="h-5 w-5 text-kiln-orange" />
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
                <div className="mb-4 rounded-lg border border-kiln-orange/30 bg-kiln-orange/5 p-4">
                  <p className="mb-2 text-xs font-semibold text-kiln-orange">Save this key now — it won&apos;t be shown again!</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-border bg-[#1a1a1a] px-3 py-2 font-mono text-xs text-foreground break-all">{generatedKey}</code>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(generatedKey); setAccessKeyCopied(true); setTimeout(() => setAccessKeyCopied(false), 2000); }}>
                      {accessKeyCopied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                      {accessKeyCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="mb-4 flex items-center gap-2">
                <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name (e.g. Production, Staging)" className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" onKeyDown={(e) => e.key === "Enter" && generateAccessKey()} />
                <Button size="sm" onClick={generateAccessKey} disabled={generatingKey || !newKeyName.trim()}>
                  {generatingKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                  Generate Key
                </Button>
              </div>

              {accessKeys.length > 0 ? (
                <div className="space-y-2">
                  {accessKeys.map((key) => (
                    <div key={key.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{key.name}</p>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="font-mono">{key.keyPrefix}</span>
                            <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                            {key.lastUsed && <span>Last used {new Date(key.lastUsed).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteAccessKey(key.id)} disabled={deletingAccessKey === key.id} className="text-red-400 hover:bg-red-500/10 hover:text-red-400">
                        {deletingAccessKey === key.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No API keys yet. Generate one to get started.</p>
              )}

              <div className="mt-4 rounded-lg border border-dashed border-border bg-card/30 p-3">
                <p className="text-xs text-muted-foreground">API keys provide full access to your agents. Keep them secure and never expose them in client-side code. Maximum 5 keys per account. Rate limit: 100 requests/minute per key.</p>
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Webhook className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Webhooks</h2>
                  <p className="text-xs text-muted-foreground">Receive HTTP notifications when events occur in your agents.</p>
                </div>
              </div>

              {webhookError && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{webhookError}</div>}

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
                      <button key={opt.value} type="button" onClick={() => toggleWebhookEvent(opt.value)} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${webhookEvents.includes(opt.value) ? "border-blue-500/50 bg-blue-500/10 text-blue-400" : "border-border bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"}`}>
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
                            {wh.active ? <Power className="h-4 w-4 text-green-500" /> : <PowerOff className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground font-mono">{wh.url}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(wh.events as string[]).map((ev) => (
                                <span key={ev} className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">{ev}</span>
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
                          <Button size="sm" variant="ghost" onClick={() => deleteWebhook(wh.id)} disabled={deletingWebhook === wh.id} className="text-red-400 hover:bg-red-500/10 hover:text-red-400">
                            {deletingWebhook === wh.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      {expandedWebhook === wh.id && (
                        <div className="border-t border-border px-4 py-3 space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Signing Secret</label>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 rounded-lg border border-border bg-[#1a1a1a] px-3 py-1.5 font-mono text-xs text-foreground break-all">{wh.secret}</code>
                              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(wh.secret); setSecretCopied(wh.id); setTimeout(() => setSecretCopied(null), 2000); }}>
                                {secretCopied === wh.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Recent Deliveries</label>
                            {wh.deliveries.length > 0 ? (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {wh.deliveries.map((del) => (
                                  <div key={del.id} className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-xs">
                                    {del.success ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-500" /> : <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />}
                                    <span className="font-mono text-muted-foreground">{del.event}</span>
                                    <span className={`font-mono ${del.success ? "text-green-400" : "text-red-400"}`}>{del.statusCode || "ERR"}</span>
                                    {del.responseTime != null && <span className="flex items-center gap-0.5 text-muted-foreground"><Clock className="h-3 w-3" />{del.responseTime}ms</span>}
                                    {del.error && <span className="truncate text-red-400" title={del.error}>{del.error}</span>}
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10">
                  <Gift className="h-5 w-5 text-kiln-orange" />
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
                    <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm font-bold text-kiln-orange">{referralCode}</div>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(referralCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                      {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
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
                      {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
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
                    <Trophy className="h-4 w-4 text-kiln-orange" />
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
                        <span className="shrink-0 rounded-full bg-kiln-orange/10 px-2 py-0.5 text-[10px] font-medium text-kiln-orange">
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
                    className="shrink-0 ml-4 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
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
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Delete Account</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              This will permanently delete all your data including agents, conversations,
              knowledge bases, and cancel your subscription. Type{" "}
              <span className="font-mono font-bold text-red-400">DELETE</span> to confirm.
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
