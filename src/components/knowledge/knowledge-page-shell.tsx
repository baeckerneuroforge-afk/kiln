"use client";

/**
 * Top-level shell for /dashboard/knowledge.
 *
 * Hosts the tab bar (Bases / Graph) and reads the active tab from the
 * URL (`?tab=bases` default, `?tab=graph`). Switching tabs updates the
 * URL via `router.replace` so deep links survive a refresh and the
 * back button moves between tabs naturally.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Database, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { KnowledgeBasesHubView } from "./knowledge-bases-hub";
import KnowledgeGraphView from "./knowledge-graph-view";

type TabKey = "bases" | "graph";

interface Props {
  planHasGraph: boolean;
  planHasVisual: boolean;
}

export function KnowledgePageShell({ planHasGraph, planHasVisual }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams?.get("tab");
  const tab: TabKey = raw === "graph" ? "graph" : "bases";

  const setTab = useCallback(
    (next: TabKey) => {
      const sp = new URLSearchParams(searchParams?.toString() || "");
      sp.set("tab", next);
      router.replace(`/dashboard/knowledge?${sp.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Knowledge
        </p>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-foreground">
          {tab === "bases" ? "Knowledge Bases" : "Knowledge Graph"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {tab === "bases"
            ? "Every agent's reference documents in one place. Search across all bases or jump straight into an agent's collection."
            : "Automatically generated from agent activity. Entities, relationships, and knowledge from all conversations."}
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-0.5 rounded-xl bg-card/50 border border-border p-1 w-fit"
        role="tablist"
      >
        <TabButton
          active={tab === "bases"}
          icon={<Database className="h-4 w-4" />}
          label="Bases"
          onClick={() => setTab("bases")}
        />
        <TabButton
          active={tab === "graph"}
          icon={<Network className="h-4 w-4" />}
          label="Graph"
          onClick={() => setTab("graph")}
        />
      </div>

      {tab === "bases" ? (
        <KnowledgeBasesHubView />
      ) : (
        <KnowledgeGraphView
          planHasGraph={planHasGraph}
          planHasVisual={planHasVisual}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-kiln-orange/10 text-kiln-orange font-semibold"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
