"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plug,
  Loader2,
  CheckCircle2,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

interface AgentIntegrationItem {
  id: string;
  provider: string;
  name: string;
  isCustom: boolean;
  assigned: boolean;
  enabled: boolean;
  assignmentId: string | null;
}

/* ---------- Provider visual config ---------- */
const providerConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  "google-calendar": { icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/10" },
  gmail: { icon: Mail, color: "text-red-400", bg: "bg-red-500/10" },
  hubspot: { icon: BarChart3, color: "text-orange-400", bg: "bg-orange-500/10" },
  slack: { icon: MessageSquare, color: "text-purple-400", bg: "bg-purple-500/10" },
  notion: { icon: FileText, color: "text-neutral-300", bg: "bg-neutral-500/10" },
  calendly: { icon: Calendar, color: "text-blue-400", bg: "bg-blue-600/10" },
  stripe: { icon: CreditCard, color: "text-violet-400", bg: "bg-violet-500/10" },
  mailchimp: { icon: Mail, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  "whatsapp-business": { icon: Phone, color: "text-green-400", bg: "bg-green-500/10" },
  shopify: { icon: ShoppingCart, color: "text-green-400", bg: "bg-green-600/10" },
  salesforce: { icon: BarChart3, color: "text-sky-400", bg: "bg-sky-500/10" },
  airtable: { icon: Database, color: "text-teal-400", bg: "bg-teal-500/10" },
  "google-sheets": { icon: Database, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  zapier: { icon: Zap, color: "text-orange-400", bg: "bg-orange-600/10" },
  make: { icon: Globe, color: "text-violet-400", bg: "bg-violet-500/10" },
  github: { icon: GitBranch, color: "text-neutral-300", bg: "bg-neutral-600/10" },
};

const defaultConfig = { icon: Plug, color: "text-muted-foreground", bg: "bg-muted" };

export function IntegrationsTab({ agentId }: { agentId: string }) {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<AgentIntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/integrations`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIntegrations(data.integrations || []);
    } catch {
      toast("Failed to load integrations", "error");
    } finally {
      setLoading(false);
    }
  }, [agentId, toast]);

  useEffect(() => { load(); }, [load]);

  const toggleIntegration = async (item: AgentIntegrationItem) => {
    setToggling(item.id);
    const newEnabled = !item.enabled;
    setIntegrations((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: newEnabled, assigned: true } : i)));

    try {
      const res = await fetch(`/api/agents/${agentId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: item.id, enabled: newEnabled }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch {
      setIntegrations((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: item.enabled, assigned: item.assigned } : i)));
      toast("Failed to update", "error");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-[72px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (integrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-kiln-blue/10">
          <Plug className="h-7 w-7 text-kiln-blue" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">No integrations connected</h3>
        <p className="mx-auto mt-1.5 max-w-xs text-xs text-muted-foreground">
          Connect integrations in the{" "}
          <a href="/dashboard/integrations" className="font-medium text-kiln-orange hover:underline">
            Integration Hub
          </a>{" "}
          first, then enable them here for this agent.
        </p>
        <a href="/dashboard/integrations" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted">
          <Plug className="h-3.5 w-3.5" />
          Open Integration Hub
        </a>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">
        Enable integrations for this agent. When enabled, the agent will know it can reference
        these services during conversations.
      </p>
      <div className="space-y-2">
        {integrations.map((item) => {
          const config = providerConfig[item.provider] || defaultConfig;
          const Icon = config.icon;

          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all duration-200",
                item.enabled
                  ? "border-kiln-green/20 bg-kiln-green/[0.03]"
                  : "border-border bg-card hover:bg-card/80"
              )}
            >
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.bg)}>
                <Icon className={cn("h-4 w-4", config.color)} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  {item.enabled && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-kiln-green animate-in zoom-in duration-200" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {item.isCustom ? "Custom integration" : item.provider.replace(/-/g, " ")}
                </p>
              </div>

              <button
                onClick={() => toggleIntegration(item)}
                disabled={toggling === item.id}
                className="shrink-0"
              >
                {toggling === item.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <div
                    className={cn(
                      "relative h-6 w-10 rounded-full transition-colors duration-200",
                      item.enabled ? "bg-kiln-green" : "bg-muted"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                        item.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                      )}
                    />
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
