"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, History, Loader2, RotateCcw, SplitSquareVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SnapshotAction = {
  type: string;
  enabled: boolean;
  config: unknown;
};

type ConfigSnapshot = {
  name?: string;
  systemPrompt?: string;
  personality?: Record<string, unknown> | null;
  welcomeMessage?: string | null;
  suggestedQuestions?: string[];
  llmModel?: string;
  temperature?: number;
  modelProvider?: string;
  status?: string;
  whiteLabel?: Record<string, unknown> | null;
  showPoweredBy?: boolean;
  autoDetectLanguage?: boolean;
  memoryEnabled?: boolean;
  visitorMemoryEnabled?: boolean;
  imageAnalysisEnabled?: boolean;
  showAiDisclaimer?: boolean;
  promptBranches?: unknown;
  agentType?: string;
  customDomain?: string | null;
  actions?: SnapshotAction[];
};

type AgentVersion = {
  id: string;
  version: number;
  config: ConfigSnapshot;
  changelog: string;
  createdAt: string;
  createdBy: string;
};

type ComparePreset = {
  versionId: string;
  version: number;
  config: {
    systemPrompt: string;
    llmModel: string;
    modelProvider: string;
    temperature: number;
  };
};

type VersionResponse = {
  currentVersion: number;
  versions: AgentVersion[];
};

const DIFF_FIELDS: { key: keyof ConfigSnapshot; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "systemPrompt", label: "System Prompt" },
  { key: "welcomeMessage", label: "Greeting" },
  { key: "llmModel", label: "Model" },
  { key: "temperature", label: "Temperature" },
  { key: "personality", label: "Personality" },
  { key: "whiteLabel", label: "White-Label" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Actions" },
  { key: "promptBranches", label: "Prompt Branches" },
  { key: "customDomain", label: "Custom Domain" },
];

function serialize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function computeChanges(
  previousConfig: ConfigSnapshot,
  nextConfig: ConfigSnapshot
): { key: string; label: string; oldVal: string; newVal: string }[] {
  return DIFF_FIELDS.reduce<
    { key: string; label: string; oldVal: string; newVal: string }[]
  >((changes, { key, label }) => {
    const oldVal = serialize(previousConfig[key]);
    const newVal = serialize(nextConfig[key]);
    if (oldVal !== newVal) {
      changes.push({ key, label, oldVal, newVal });
    }
    return changes;
  }, []);
}

function truncate(value: string, maxLength = 600) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function formatRelativeTime(dateString: string) {
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

interface Props {
  agentId: string;
  currentVersion: number;
  currentConfig: ConfigSnapshot;
  onCompare: (preset: ComparePreset) => void;
  onRestore?: () => void;
}

export function VersionsTab({
  agentId,
  currentVersion,
  currentConfig,
  onCompare,
  onRestore,
}: Props) {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AgentVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    void fetchVersions();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchVersions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/versions`);
      if (!res.ok) return;
      const data: VersionResponse = await res.json();
      setVersions(Array.isArray(data.versions) ? data.versions : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(version: AgentVersion) {
    setRestoring(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/versions/${version.id}`, {
        method: "PUT",
      });

      if (!res.ok) {
        return;
      }

      setRestoreTarget(null);
      await fetchVersions();
      onRestore?.();
    } catch {
      // silent
    } finally {
      setRestoring(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-card/60 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Version History</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current version is v{currentVersion}. Every save snapshots the previous config so you can roll back safely.
          </p>
        </div>
        <div className="rounded-full border border-kiln-orange/20 bg-kiln-orange/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-kiln-orange">
          {versions.length} rollback point{versions.length === 1 ? "" : "s"}
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <History className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No versions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Save the agent once and KILN will start building a rollback timeline.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((version, index) => {
            const nextConfig = index === 0 ? currentConfig : versions[index - 1].config;
            const nextVersion = index === 0 ? currentVersion : versions[index - 1].version;
            const changes = computeChanges(version.config, nextConfig);
            const isExpanded = expandedId === version.id;

            return (
              <div
                key={version.id}
                className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card/60"
              >
                <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-kiln-orange/10 text-sm font-bold text-kiln-orange">
                      v{version.version}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          v{version.version} → v{nextVersion}
                        </p>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {formatRelativeTime(version.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-foreground/90">{version.changelog}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {changes.length} change{changes.length === 1 ? "" : "s"} recorded
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onCompare({
                          versionId: version.id,
                          version: version.version,
                          config: {
                            systemPrompt: version.config.systemPrompt || "",
                            llmModel: version.config.llmModel || "",
                            modelProvider: version.config.modelProvider || "ANTHROPIC",
                            temperature:
                              typeof version.config.temperature === "number"
                                ? version.config.temperature
                                : 0.7,
                          },
                        })
                      }
                    >
                      <SplitSquareVertical className="mr-1.5 h-3.5 w-3.5" />
                      Compare with current
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : version.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {isExpanded ? "Hide diff" : "Show diff"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setRestoreTarget(version)}
                      className="bg-kiln-orange hover:bg-kiln-orange/90"
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Rollback to this version
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/[0.08] px-5 py-4">
                    <div className="space-y-3">
                      {changes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No config differences to show.</p>
                      ) : (
                        changes.map((change) => (
                          <div key={change.key} className="overflow-hidden rounded-xl border border-white/[0.08]">
                            <div className="bg-white/[0.04] px-4 py-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                {change.label}
                              </p>
                            </div>
                            <div className="grid gap-px bg-white/[0.08] lg:grid-cols-2">
                              <div className="bg-red-500/5 px-4 py-3">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-red-300">Before</p>
                                <pre className="whitespace-pre-wrap text-[12px] leading-5 text-red-100/90">
                                  {truncate(change.oldVal || "—")}
                                </pre>
                              </div>
                              <div className="bg-emerald-500/5 px-4 py-3">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-emerald-300">After</p>
                                <pre className="whitespace-pre-wrap text-[12px] leading-5 text-emerald-100/90">
                                  {truncate(change.newVal || "—")}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setRestoreTarget(null)}
          />
          <div className="relative z-10 mx-4 w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#242220] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground">
              Roll back to v{restoreTarget.version}?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              KILN will restore the selected config and save the current state as a fresh rollback point first.
            </p>
            <p className="mt-3 rounded-xl border border-kiln-orange/20 bg-kiln-orange/10 px-4 py-3 text-sm text-kiln-orange">
              {restoreTarget.changelog}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setRestoreTarget(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleRestore(restoreTarget)}
                disabled={restoring}
                className={cn("bg-kiln-orange hover:bg-kiln-orange/90", restoring && "opacity-80")}
              >
                {restoring ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Roll back
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
