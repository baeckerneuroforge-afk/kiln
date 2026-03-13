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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";

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

/* ---------- Catalog ---------- */
const integrationsCatalog = [
  { provider: "google-calendar", name: "Google Calendar", description: "Schedule meetings and check availability", icon: Calendar, color: "bg-blue-500", accent: "border-t-blue-500", category: "Productivity" },
  { provider: "gmail", name: "Gmail", description: "Send and receive emails from your agents", icon: Mail, color: "bg-red-500", accent: "border-t-red-500", category: "Communication" },
  { provider: "hubspot", name: "HubSpot", description: "CRM contacts, deals, and pipeline management", icon: BarChart3, color: "bg-orange-500", accent: "border-t-orange-500", category: "CRM" },
  { provider: "slack", name: "Slack", description: "Send messages and notifications to channels", icon: MessageSquare, color: "bg-purple-500", accent: "border-t-purple-500", category: "Communication" },
  { provider: "notion", name: "Notion", description: "Read and write to Notion databases and pages", icon: FileText, color: "bg-neutral-400", accent: "border-t-neutral-400", category: "Productivity" },
  { provider: "calendly", name: "Calendly", description: "Manage scheduling links and appointments", icon: Calendar, color: "bg-blue-600", accent: "border-t-blue-600", category: "Scheduling" },
  { provider: "stripe", name: "Stripe", description: "Process payments and manage subscriptions", icon: CreditCard, color: "bg-violet-600", accent: "border-t-violet-600", category: "Payments" },
  { provider: "mailchimp", name: "Mailchimp", description: "Email marketing campaigns and audiences", icon: Mail, color: "bg-yellow-500", accent: "border-t-yellow-500", category: "Marketing" },
  { provider: "whatsapp-business", name: "WhatsApp Business", description: "Engage customers via WhatsApp messaging", icon: Phone, color: "bg-green-500", accent: "border-t-green-500", category: "Communication" },
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [connectingProvider, setConnectingProvider] = useState<(typeof integrationsCatalog)[0] | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConnections(data.connections || []);
    } catch {
      toast("Failed to load integrations", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const connectedProviders = new Set(connections.map((c) => c.provider));

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
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
        <div className="mb-6 skeleton h-10 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
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
              const catalog = integrationsCatalog.find((c) => c.provider === conn.provider);
              const Icon = catalog?.icon || Plug;
              const color = catalog?.color || "bg-muted-foreground";
              const accent = catalog?.accent || "border-t-muted-foreground";
              const enabledAgents = conn.agentIntegrations.filter((a) => a.enabled).length;

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
          return (
            <div key={item.provider} className={cn("card-hover-lift relative overflow-hidden rounded-xl border border-t-2 p-4 transition-all", item.accent, isConnected ? "bg-card" : "bg-card")}>
              <div className="mb-3 flex items-center justify-between">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md", item.color)}>
                  <item.icon className="h-5 w-5" />
                </div>
                {isConnected ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-kiln-green/10 px-2.5 py-1 text-[10px] font-semibold text-kiln-green">
                    <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiln-green opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-kiln-green" /></span>
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    <Circle className="h-2.5 w-2.5" />
                    Not connected
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-foreground">{item.name}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{item.category}</span>
              {!isConnected && (
                <button onClick={() => setConnectingProvider(item)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-kiln-orange/40 hover:bg-kiln-orange/5 hover:text-kiln-orange hover:shadow-[0_0_0_1px_hsl(24_95%_53%/0.15)]">
                  <Plug className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {connections.length === 0 && !search && activeCategory === "All" && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10"><Calendar className="h-5 w-5 text-blue-400" /></div>
            <div className="h-px w-6 bg-gradient-to-r from-blue-400/40 to-purple-400/40" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10"><MessageSquare className="h-5 w-5 text-purple-400" /></div>
            <div className="h-px w-6 bg-gradient-to-r from-purple-400/40 to-green-400/40" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10"><Zap className="h-5 w-5 text-green-400" /></div>
          </div>
          <h3 className="text-base font-semibold text-foreground">Connect your tools</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Supercharge your agents by connecting the services they need. Start with Google Calendar or Slack.
          </p>
        </div>
      )}

      {connectingProvider && <ConnectModal integration={connectingProvider} onClose={() => setConnectingProvider(null)} onSave={saveConnection} saving={saving} />}
      {showCustomModal && <CustomIntegrationModal onClose={() => setShowCustomModal(false)} onSave={saveConnection} saving={saving} />}
    </div>
  );
}
