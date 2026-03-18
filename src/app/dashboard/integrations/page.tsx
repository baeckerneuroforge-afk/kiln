"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plug,
  Search,
  Loader2,
  X,
  Activity,
  CheckCircle2,
  Circle,
  Trash2,
  Plus,
  Sparkles,
  Calendar,
  Mail,
  MessageSquare,
  Send,
  FileText,
  CreditCard,
  ShoppingCart,
  Database,
  GitBranch,
  Zap,
  Globe,
  Phone,
  BarChart3,
  Shield,
  ExternalLink,
  ArrowRight,
  Clock,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/* ---------- Types ---------- */
interface IntegrationConnection {
  id: string;
  provider: string;
  name: string;
  config: string;
  isActive: boolean;
  isCustom: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  agentIntegrations: { id: string; agentId: string; enabled: boolean }[];
}

interface GoogleCalendarDetails {
  connected: boolean;
  name?: string;
  isActive?: boolean;
  lastSyncAt?: string | null;
  selectedCalendarId?: string | null;
  selectedCalendarName?: string | null;
  calendars: {
    id: string;
    summary: string;
    primary: boolean;
    timeZone?: string;
  }[];
  upcomingAppointments: {
    id: string;
    summary: string;
    htmlLink?: string;
    start: string | null;
    end: string | null;
    status: string | null;
  }[];
}

function normalizeProvider(provider: string) {
  return provider === "google-calendar" ? "google_calendar" : provider;
}

/* ---------- Catalog ---------- */
const integrationsCatalog = [
  { provider: "google_calendar", name: "Google Calendar", description: "Schedule meetings and check live availability", icon: Calendar, color: "bg-blue-500", accent: "border-t-blue-500", category: "Productivity" },
  { provider: "gmail", name: "Gmail", description: "Send and receive emails from your agents", icon: Mail, color: "bg-red-500", accent: "border-t-red-500", category: "Communication" },
  { provider: "hubspot", name: "HubSpot", description: "CRM contacts, deals, and pipeline management", icon: BarChart3, color: "bg-orange-500", accent: "border-t-orange-500", category: "CRM" },
  { provider: "slack", name: "Slack", description: "Send messages and notifications to channels", icon: MessageSquare, color: "bg-purple-500", accent: "border-t-purple-500", category: "Communication" },
  { provider: "telegram", name: "Telegram", description: "Configure bot tokens manually per agent without OAuth", icon: Send, color: "bg-sky-500", accent: "border-t-sky-500", category: "Communication" },
  { provider: "notion", name: "Notion", description: "Read and write to Notion databases and pages", icon: FileText, color: "bg-neutral-400", accent: "border-t-neutral-400", category: "Productivity" },
  { provider: "calendly", name: "Calendly", description: "Manage scheduling links and appointments", icon: Calendar, color: "bg-blue-600", accent: "border-t-blue-600", category: "Scheduling" },
  { provider: "stripe", name: "Stripe", description: "Configure your own Stripe Secret Key per agent for payments and invoices", icon: CreditCard, color: "bg-violet-600", accent: "border-t-violet-600", category: "Payments" },
  { provider: "mailchimp", name: "Mailchimp", description: "Email marketing campaigns and audiences", icon: Mail, color: "bg-yellow-500", accent: "border-t-yellow-500", category: "Marketing" },
  { provider: "whatsapp-business", name: "WhatsApp Business", description: "Configure Meta API credentials manually per agent", icon: Phone, color: "bg-green-500", accent: "border-t-green-500", category: "Communication" },
  { provider: "shopify", name: "Shopify", description: "Manage products, orders, and customers", icon: ShoppingCart, color: "bg-green-600", accent: "border-t-green-600", category: "E-Commerce" },
  { provider: "salesforce", name: "Salesforce", description: "Enterprise CRM and sales automation", icon: BarChart3, color: "bg-sky-500", accent: "border-t-sky-500", category: "CRM" },
  { provider: "airtable", name: "Airtable", description: "Database and spreadsheet hybrid workspace", icon: Database, color: "bg-teal-500", accent: "border-t-teal-500", category: "Productivity" },
  { provider: "google-sheets", name: "Google Sheets", description: "Read and write spreadsheet data", icon: Database, color: "bg-emerald-500", accent: "border-t-emerald-500", category: "Productivity" },
  { provider: "zapier", name: "Zapier", description: "Connect to 5,000+ apps via Zapier triggers", icon: Zap, color: "bg-orange-600", accent: "border-t-orange-600", category: "Automation" },
  { provider: "make", name: "Make", description: "Visual automation and integration scenarios", icon: Globe, color: "bg-violet-500", accent: "border-t-violet-500", category: "Automation" },
  { provider: "github", name: "GitHub", description: "Repository management and issue tracking", icon: GitBranch, color: "bg-neutral-600", accent: "border-t-neutral-600", category: "Developer" },
];

const categories = ["All", "CRM", "Communication", "Productivity", "Marketing", "Automation", "Developer", "Payments", "Scheduling", "E-Commerce"];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ---------- Connect Modal ---------- */
const WEBHOOK_ONLY_PROVIDERS = new Set(["zapier", "make"]);

function ConnectModal({
  integration,
  onClose,
  onSave,
  saving,
}: {
  integration: (typeof integrationsCatalog)[0] | null;
  onClose: () => void;
  onSave: (provider: string, name: string, config: Record<string, string>, isCustom: boolean) => void;
  saving: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [step, setStep] = useState(1);

  if (!integration) return null;

  const isWebhookOnly = WEBHOOK_ONLY_PROVIDERS.has(integration.provider);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
        {/* Brand color top stripe */}
        <div className={cn("h-1", integration.color)} />

        <button onClick={onClose} className="absolute right-4 top-5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="mb-6 flex items-center gap-4">
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-lg", integration.color)}>
              <integration.icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Connect {integration.name}</h2>
              <p className="text-xs text-muted-foreground">{integration.description}</p>
            </div>
          </div>

          {isWebhookOnly ? (
            /* Webhook-only flow (Zapier, Make) */
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  Webhook URL
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder={integration.provider === "zapier" ? "https://hooks.zapier.com/hooks/catch/..." : "https://hook.eu1.make.com/..."}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                />
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                <p className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                  <Shield className="h-3 w-3 text-kiln-green" />
                  Your webhook URL is encrypted before storage
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {integration.provider === "zapier"
                    ? "Create a Zap with \"Webhooks by Zapier\" as the trigger, then paste the webhook URL here. KILN will send events (leads, appointments, etc.) to this URL."
                    : "Create a Make scenario with \"Webhooks\" as the trigger module, then paste the webhook URL here. KILN will send events to this URL."}
                </p>
              </div>
              <button
                onClick={() => onSave(integration.provider, integration.name, { webhookUrl }, false)}
                disabled={saving || !webhookUrl}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                Connect
              </button>
            </div>
          ) : (
            /* Standard API key + webhook flow */
            <>
              {/* Steps indicator */}
              <div className="mb-5 flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold", step >= 1 ? "bg-kiln-orange text-white" : "bg-muted text-muted-foreground")}>1</div>
                <div className={cn("h-px flex-1", step >= 2 ? "bg-kiln-orange" : "bg-border")} />
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold", step >= 2 ? "bg-kiln-orange text-white" : "bg-muted text-muted-foreground")}>2</div>
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Enter your ${integration.name} API key...`}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                    />
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!apiKey}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-40"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <ExternalLink className="h-3 w-3" />
                      Webhook URL <span className="text-muted-foreground/50">(optional)</span>
                    </label>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                    />
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                      <Shield className="h-3 w-3 text-kiln-green" />
                      Your credentials are encrypted before storage
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => onSave(integration.provider, integration.name, { apiKey, webhookUrl }, false)}
                      disabled={saving}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                      Connect
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Custom Integration Modal ---------- */
function CustomIntegrationModal({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: (provider: string, name: string, config: Record<string, string>, isCustom: boolean) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState<string>("api-key");
  const [authValue, setAuthValue] = useState("");
  const provider = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="h-1 bg-gradient-to-r from-purple-500 to-violet-600" />
        <button onClick={onClose} className="absolute right-4 top-5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 shadow-lg shadow-purple-500/10">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Custom Integration</h2>
              <p className="text-xs text-muted-foreground">Connect any API endpoint</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Custom API"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">API Base URL</label>
              <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Auth Type</label>
              <div className="flex gap-2">
                {(["api-key", "bearer", "basic"] as const).map((t) => (
                  <button key={t} onClick={() => setAuthType(t)}
                    className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", authType === t ? "border-purple-500/50 bg-purple-500/10 text-purple-400" : "border-border text-muted-foreground hover:bg-muted")}>
                    {t === "api-key" ? "API Key" : t === "bearer" ? "Bearer" : "Basic"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Auth Value</label>
              <input type="password" value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder={authType === "basic" ? "username:password" : "Your token or key..."}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20" />
            </div>
            <button onClick={() => onSave(provider, name, { baseUrl, authType, authValue }, true)} disabled={saving || !name || !baseUrl || !authValue}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500/90 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Integration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */
export default function IntegrationsPage() {
  const { toast } = useToast();
  const { advancedMode } = useAdvancedMode();
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [googleCalendar, setGoogleCalendar] = useState<GoogleCalendarDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [connectingProvider, setConnectingProvider] = useState<(typeof integrationsCatalog)[0] | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState<Record<string, string>>({});
  const [waitlistSubmitted, setWaitlistSubmitted] = useState<Set<string>>(new Set());
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [ghRepo, setGhRepo] = useState("");
  const [ghEvents, setGhEvents] = useState<string[]>(["issues", "pull_request"]);
  const [ghAgentId, setGhAgentId] = useState("");
  const [ghAgents, setGhAgents] = useState<{ id: string; name: string }[]>([]);
  const [ghSaving, setGhSaving] = useState(false);
  const [savingGoogleCalendar, setSavingGoogleCalendar] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, { available: boolean; note?: string }>>({});

  const loadData = useCallback(async () => {
    try {
      const [connectionsRes, googleCalendarRes, availabilityRes] = await Promise.all([
        fetch("/api/integrations"),
        fetch("/api/integrations/google-calendar"),
        fetch("/api/integrations/availability"),
      ]);

      const data = await connectionsRes.json();
      if (data.error) throw new Error(data.error);
      setConnections(data.connections || []);

      if (googleCalendarRes.ok) {
        const googleData = await googleCalendarRes.json();
        setGoogleCalendar(googleData);
      } else {
        setGoogleCalendar(null);
      }

      if (availabilityRes.ok) {
        const availData = await availabilityRes.json();
        const map: Record<string, { available: boolean; note?: string }> = {};
        for (const item of availData.availability || []) {
          map[item.provider] = { available: item.available, note: item.note };
        }
        setAvailabilityMap(map);
      }
    } catch {
      toast("Failed to load integrations", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const connectedProviders = new Set(connections.map((c) => normalizeProvider(c.provider)));

  const saveConnection = async (provider: string, name: string, config: Record<string, string>, isCustom: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, name, config, isCustom }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(`${name} connected`);
      setConnectingProvider(null);
      setShowCustomModal(false);
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteConnection = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch("/api/integrations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      toast("Integration disconnected");
    } catch { toast("Failed to disconnect", "error"); } finally { setDeletingId(null); }
  };

  const toggleActive = async (conn: IntegrationConnection) => {
    const newActive = !conn.isActive;
    setConnections((prev) => prev.map((c) => (c.id === conn.id ? { ...c, isActive: newActive } : c)));
    try {
      await fetch("/api/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: conn.id, isActive: newActive }) });
    } catch {
      setConnections((prev) => prev.map((c) => (c.id === conn.id ? { ...c, isActive: conn.isActive } : c)));
      toast("Failed to update", "error");
    }
  };

  const connectGoogleCalendar = () => {
    window.location.href = "/api/integrations/google-calendar/auth?redirectTo=/dashboard/integrations";
  };

  const selectGoogleCalendar = async (calendarId: string) => {
    setSavingGoogleCalendar(true);
    try {
      const res = await fetch("/api/integrations/google-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update calendar");
      toast("Booking calendar updated");
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update calendar", "error");
    } finally {
      setSavingGoogleCalendar(false);
    }
  };

  const openGitHubModal = async () => {
    setShowGitHubModal(true);
    setGhToken("");
    setGhRepo("");
    setGhEvents(["issues", "pull_request"]);
    setGhAgentId("");
    // Load agents for the dropdown
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (Array.isArray(data)) setGhAgents(data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
    } catch { /* silent */ }
  };

  const connectGitHub = async () => {
    if (!ghToken || !ghRepo || !ghAgentId) return;
    setGhSaving(true);
    try {
      const res = await fetch(`/api/agents/${ghAgentId}/channels/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubToken: ghToken, repoFullName: ghRepo, events: ghEvents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect");
      toast(`GitHub connected to ${ghRepo}`);
      setShowGitHubModal(false);
      // Also save as an integration connection for the UI
      await saveConnection("github", "GitHub", { repo: ghRepo, agentId: ghAgentId }, false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to connect", "error");
    } finally {
      setGhSaving(false);
    }
  };

  // Filter
  const filteredCatalog = integrationsCatalog.filter((i) => {
    const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || i.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Stats
  const totalConnected = connections.length;
  const activeConnections = connections.filter((c) => c.isActive).length;
  const lastSync = connections.filter((c) => c.lastSyncAt).sort((a, b) => new Date(b.lastSyncAt!).getTime() - new Date(a.lastSyncAt!).getTime())[0]?.lastSyncAt;

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="skeleton h-9 w-9 rounded-xl" />
          <div className="space-y-1.5"><div className="skeleton h-5 w-36 rounded" /><div className="skeleton h-3 w-56 rounded" /></div>
        </div>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="mb-6 skeleton h-10 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-kiln-blue/10">
            <Plug className="h-4.5 w-4.5 text-kiln-blue" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Integration Hub</h1>
            <p className="text-xs text-muted-foreground">Connect your tools to supercharge your agents</p>
          </div>
        </div>
        {advancedMode && (
          <button onClick={() => setShowCustomModal(true)}
            className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/20">
            <Plus className="h-4 w-4" />
            Custom Integration
          </button>
        )}
      </div>

      {/* Health Dashboard */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-kiln-blue/5" />
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Plug className="h-3.5 w-3.5" />
            Total Connected
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">{totalConnected}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-kiln-green/5" />
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Active
          </div>
          <p className="mt-2 text-3xl font-bold text-kiln-green">{activeConnections}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-kiln-orange/5" />
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Last Sync
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">{lastSync ? timeAgo(lastSync) : "No syncs yet"}</p>
        </div>
      </div>

      {/* Search + Category Tabs */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search integrations..."
            className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={cn(
                "relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategory === cat
                  ? "bg-kiln-orange/10 text-kiln-orange"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
              {cat}
              {activeCategory === cat && <div className="absolute bottom-0 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-kiln-orange" />}
            </button>
          ))}
        </div>
      </div>

      {/* Connected section */}
      {connections.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Connected ({connections.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {connections.map((conn) => {
              const provider = normalizeProvider(conn.provider);
              const catalog = integrationsCatalog.find((c) => c.provider === provider);
              const Icon = catalog?.icon || Plug;
              const color = catalog?.color || "bg-muted-foreground";
              const accent = catalog?.accent || "border-t-muted-foreground";
              const enabledAgents = conn.agentIntegrations.filter((a) => a.enabled).length;
              const isGoogleCalendar = provider === "google_calendar";

              return (
                <div key={conn.id} className={cn("card-hover-lift group relative overflow-hidden rounded-xl border border-t-2 p-4 transition-all", accent, conn.isActive ? "bg-card" : "bg-card opacity-50")}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md", color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleActive(conn)} className="shrink-0">
                        <div className={cn("relative h-5 w-9 rounded-full transition-colors duration-200", conn.isActive ? "bg-kiln-green" : "bg-muted")}>
                          <div className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200", conn.isActive ? "translate-x-4" : "translate-x-0.5")} />
                        </div>
                      </button>
                      <button onClick={() => deleteConnection(conn.id)} disabled={deletingId === conn.id}
                        className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100">
                        {deletingId === conn.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{conn.name}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {conn.isActive ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-kiln-green">
                        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiln-green opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-kiln-green" /></span>
                        Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Circle className="h-1.5 w-1.5" /> Paused</span>
                    )}
                    {conn.isCustom && <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-medium text-purple-400">Custom</span>}
                  </div>
                  <div className="mt-2.5 flex items-center gap-3 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                    {enabledAgents > 0 && <span>{enabledAgents} agent{enabledAgents !== 1 ? "s" : ""}</span>}
                    {conn.lastSyncAt && <span>Synced {timeAgo(conn.lastSyncAt)}</span>}
                  </div>
                  {isGoogleCalendar && googleCalendar?.connected && (
                    <div className="mt-3 rounded-lg border border-border/60 bg-background/50 p-3">
                      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Booking Calendar
                      </label>
                      <select
                        value={googleCalendar.selectedCalendarId || ""}
                        onChange={(e) => selectGoogleCalendar(e.target.value)}
                        disabled={savingGoogleCalendar}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                      >
                        {googleCalendar.calendars.map((calendar) => (
                          <option key={calendar.id} value={calendar.id}>
                            {calendar.summary}{calendar.primary ? " (Primary)" : ""}
                          </option>
                        ))}
                      </select>

                      <div className="mt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Upcoming Appointments
                        </p>
                        {googleCalendar.upcomingAppointments.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {googleCalendar.upcomingAppointments.slice(0, 3).map((appointment) => (
                              <div key={appointment.id} className="rounded-md border border-border/50 bg-card/70 px-2.5 py-2">
                                <p className="truncate text-xs font-medium text-foreground">
                                  {appointment.summary || "Booked appointment"}
                                </p>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  {appointment.start ? timeAgo(appointment.start) : "Start time unavailable"}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            No upcoming bookings on the selected calendar yet.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available integrations */}
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Available ({filteredCatalog.length})
      </h2>

      {filteredCatalog.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Search className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No integrations match your search</p>
          <button onClick={() => { setSearch(""); setActiveCategory("All"); }} className="mt-2 text-xs text-kiln-orange hover:underline">Clear filters</button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredCatalog.map((item) => {
          const isConnected = connectedProviders.has(item.provider);
          const isSubmitted = waitlistSubmitted.has(item.provider);
          return (
            <div key={item.provider} className={cn("relative overflow-hidden rounded-xl border border-t-2 p-4 transition-all", item.accent, isConnected ? "card-hover-lift bg-card" : "bg-card/60")}>
              <div className="mb-3 flex items-center justify-between">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md", item.color, !isConnected && "opacity-70")}>
                  <item.icon className="h-5 w-5" />
                </div>
                {isConnected ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-kiln-green/10 px-2.5 py-1 text-[10px] font-semibold text-kiln-green">
                    <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiln-green opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-kiln-green" /></span>
                    Connected
                  </span>
                ) : item.provider === "telegram" || item.provider === "whatsapp-business" || item.provider === "stripe" || item.provider === "airtable" || item.provider === "calendly" ? (
                  <button
                    onClick={() => {
                      window.location.href = "/dashboard/agents";
                    }}
                    className="flex items-center gap-1 rounded-full bg-kiln-orange/10 px-2.5 py-1 text-[10px] font-semibold text-kiln-orange transition-colors hover:bg-kiln-orange/20"
                  >
                    <ArrowRight className="h-2.5 w-2.5" />
                    Configure
                  </button>
                ) : availabilityMap[item.provider]?.available !== false ? (
                  <button
                    onClick={() => {
                      if (item.provider === "github") openGitHubModal();
                      else if (item.provider === "google_calendar") connectGoogleCalendar();
                      else if (item.provider === "gmail") window.location.href = `/api/integrations/gmail/auth?redirectTo=/dashboard/integrations`;
                      else if (item.provider === "google-sheets") window.location.href = `/api/integrations/google-sheets/auth?redirectTo=/dashboard/integrations`;
                      else if (item.provider === "hubspot") window.location.href = `/api/integrations/hubspot/auth?redirectTo=/dashboard/integrations`;
                      else if (item.provider === "slack") window.location.href = `/api/integrations/slack/auth`;
                      else if (item.provider === "notion") window.location.href = `/api/integrations/notion/auth`;
                      else if (item.provider === "zapier" || item.provider === "make") setConnectingProvider(item);
                    }}
                    className="flex items-center gap-1 rounded-full bg-kiln-orange/10 px-2.5 py-1 text-[10px] font-semibold text-kiln-orange transition-colors hover:bg-kiln-orange/20"
                  >
                    <Plug className="h-2.5 w-2.5" />
                    Connect
                  </button>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-kiln-blue/10 px-2.5 py-1 text-[10px] font-semibold text-kiln-blue">
                    <Clock className="h-2.5 w-2.5" />
                    Coming Soon
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-foreground">{item.name}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{item.category}</span>
              {!isConnected && availabilityMap[item.provider]?.available !== false && item.provider === "github" && (
                <button
                  onClick={() => openGitHubModal()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-kiln-orange px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-kiln-orange/90"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Connect Repository
                </button>
              )}
              {!isConnected && availabilityMap[item.provider]?.available !== false && item.provider === "google_calendar" && (
                <>
                  <button
                    onClick={connectGoogleCalendar}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500/90"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Connect Google Calendar
                  </button>
                </>
              )}
              {!isConnected && availabilityMap[item.provider]?.available !== false && item.provider === "gmail" && (
                <button
                  onClick={() => {
                    window.location.href = `/api/integrations/gmail/auth?redirectTo=/dashboard/integrations`;
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500/90"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Connect Gmail
                </button>
              )}
              {!isConnected && availabilityMap[item.provider]?.available !== false && item.provider === "google-sheets" && (
                <button
                  onClick={() => {
                    window.location.href = `/api/integrations/google-sheets/auth?redirectTo=/dashboard/integrations`;
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500/90"
                >
                  <Database className="h-3.5 w-3.5" />
                  Connect Google Sheets
                </button>
              )}
              {!isConnected && availabilityMap[item.provider]?.available !== false && item.provider === "hubspot" && (
                <button
                  onClick={() => {
                    window.location.href = `/api/integrations/hubspot/auth?redirectTo=/dashboard/integrations`;
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-orange-500/90"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Connect HubSpot
                </button>
              )}
              {!isConnected && availabilityMap[item.provider]?.available !== false && item.provider === "slack" && (
                <button
                  onClick={() => {
                    window.location.href = `/api/integrations/slack/auth`;
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-500/90"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Connect Workspace
                </button>
              )}
              {!isConnected && availabilityMap[item.provider]?.available !== false && item.provider === "notion" && (
                <button
                  onClick={() => {
                    window.location.href = `/api/integrations/notion/auth`;
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-600/90"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Connect Notion
                </button>
              )}
              {!isConnected && (item.provider === "telegram" || item.provider === "whatsapp-business" || item.provider === "stripe" || item.provider === "airtable" || item.provider === "calendly") && (
                <button
                  onClick={() => {
                    window.location.href = "/dashboard/agents";
                  }}
                  className={cn(
                    "mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors",
                    item.provider === "telegram"
                      ? "bg-sky-500 hover:bg-sky-500/90"
                      : item.provider === "whatsapp-business"
                        ? "bg-green-500 hover:bg-green-500/90"
                        : item.provider === "airtable"
                          ? "bg-teal-500 hover:bg-teal-500/90"
                          : item.provider === "calendly"
                            ? "bg-blue-500 hover:bg-blue-500/90"
                            : "bg-violet-500 hover:bg-violet-500/90"
                  )}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Configure in Agent
                </button>
              )}
              {!isConnected && availabilityMap[item.provider]?.note && availabilityMap[item.provider]?.available !== false && (
                <p className="mt-2 text-[10px] text-muted-foreground/60">{availabilityMap[item.provider].note}</p>
              )}
              {!isConnected && item.provider !== "telegram" && item.provider !== "whatsapp-business" && item.provider !== "stripe" && item.provider !== "airtable" && item.provider !== "calendly" && availabilityMap[item.provider]?.available === false && (
                isSubmitted ? (
                  <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-kiln-green/30 bg-kiln-green/5 px-3 py-2 text-xs font-medium text-kiln-green">
                    <Bell className="h-3.5 w-3.5" />
                    We&apos;ll notify you!
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const email = waitlistEmail[item.provider]?.trim();
                      if (!email) return;
                      try {
                        await fetch("/api/waitlist", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email, source: `integration-${item.provider}` }),
                        });
                      } catch { /* silent */ }
                      setWaitlistSubmitted((prev) => new Set(prev).add(item.provider));
                    }}
                    className="mt-3 flex gap-1.5"
                  >
                    <input
                      type="email"
                      placeholder={`Get notified when ${item.name} is available`}
                      value={waitlistEmail[item.provider] || ""}
                      onChange={(e) => setWaitlistEmail((prev) => ({ ...prev, [item.provider]: e.target.value }))}
                      className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Notify me
                    </button>
                  </form>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {connections.length === 0 && !search && activeCategory === "All" && (
        <div className="mt-8">
          <EmptyState
            icon={<Plug className="h-7 w-7 text-muted-foreground" />}
            title="Verbinde deine Tools"
            description="Integriere Kalender, CRM, E-Mail und mehr mit deinen AI Agents."
          />
        </div>
      )}

      {connectingProvider && <ConnectModal integration={connectingProvider} onClose={() => setConnectingProvider(null)} onSave={saveConnection} saving={saving} />}
      {showCustomModal && <CustomIntegrationModal onClose={() => setShowCustomModal(false)} onSave={saveConnection} saving={saving} />}

      {/* GitHub Connect Modal */}
      {showGitHubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowGitHubModal(false)}>
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="h-1 bg-neutral-600" />
            <button onClick={() => setShowGitHubModal(false)} className="absolute right-4 top-5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>

            <div className="p-6">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-600 text-white shadow-lg">
                  <GitBranch className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Connect GitHub</h2>
                  <p className="text-xs text-muted-foreground">Your agent will respond to GitHub events</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Shield className="h-3 w-3" />
                    Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={ghToken}
                    onChange={(e) => setGhToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Needs <span className="font-mono text-foreground/70">repo</span> and <span className="font-mono text-foreground/70">admin:repo_hook</span> scopes
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Repository</label>
                  <input
                    type="text"
                    value={ghRepo}
                    onChange={(e) => setGhRepo(e.target.value)}
                    placeholder="owner/repository"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Agent</label>
                  <select
                    value={ghAgentId}
                    onChange={(e) => setGhAgentId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                  >
                    <option value="">Select an agent...</option>
                    {ghAgents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Events</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "issues", label: "Issues" },
                      { key: "pull_request", label: "Pull Requests" },
                      { key: "push", label: "Push" },
                      { key: "release", label: "Releases" },
                    ].map((ev) => (
                      <button
                        key={ev.key}
                        type="button"
                        onClick={() => setGhEvents((prev) => prev.includes(ev.key) ? prev.filter((e) => e !== ev.key) : [...prev, ev.key])}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          ghEvents.includes(ev.key)
                            ? "border-kiln-orange/50 bg-kiln-orange/10 text-kiln-orange"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {ev.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                    <Shield className="h-3 w-3 text-kiln-green" />
                    Your token is encrypted before storage. A webhook will be created on the repo.
                  </p>
                </div>

                <button
                  onClick={connectGitHub}
                  disabled={ghSaving || !ghToken || !ghRepo || !ghAgentId || ghEvents.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-50"
                >
                  {ghSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
                  Connect Repository
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
