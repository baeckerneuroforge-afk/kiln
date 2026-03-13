"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug, Loader2 } from "lucide-react";
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

// Provider icons as colored circles with initials
const providerColors: Record<string, string> = {
  "google-calendar": "bg-blue-500",
  gmail: "bg-red-500",
  hubspot: "bg-orange-500",
  slack: "bg-purple-500",
  notion: "bg-neutral-100 text-black",
  calendly: "bg-blue-600",
  stripe: "bg-violet-600",
  mailchimp: "bg-yellow-500",
  "whatsapp-business": "bg-green-500",
  shopify: "bg-green-600",
  salesforce: "bg-sky-500",
  airtable: "bg-teal-500",
  "google-sheets": "bg-emerald-500",
  zapier: "bg-orange-600",
  make: "bg-violet-500",
  github: "bg-neutral-700",
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

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

    // Optimistic update
    setIntegrations((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, enabled: newEnabled, assigned: true } : i))
    );

    try {
      const res = await fetch(`/api/agents/${agentId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: item.id, enabled: newEnabled }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch {
      setIntegrations((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, enabled: item.enabled, assigned: item.assigned } : i))
      );
      toast("Failed to update", "error");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (integrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
          <Plug className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">No integrations connected</h3>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Connect integrations in the{" "}
          <a href="/dashboard/integrations" className="text-kiln-orange hover:underline">
            Integration Hub
          </a>{" "}
          first, then enable them here for this agent.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="mb-4 text-xs text-muted-foreground">
        Enable integrations for this agent. When enabled, the agent will know it can reference
        these services during conversations.
      </p>
      {integrations.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
            item.enabled ? "border-kiln-green/20 bg-kiln-green/5" : "border-border bg-card"
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
              providerColors[item.provider] || "bg-muted-foreground"
            )}
          >
            {getInitials(item.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{item.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {item.isCustom ? "Custom" : item.provider}
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
                  "relative h-5 w-9 rounded-full transition-colors duration-200",
                  item.enabled ? "bg-kiln-green" : "bg-muted"
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                    item.enabled ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </div>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
