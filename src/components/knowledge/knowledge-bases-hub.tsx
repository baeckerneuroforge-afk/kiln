"use client";

/**
 * Knowledge Bases Hub.
 *
 * Top-level view for /dashboard/knowledge?tab=bases. Shows aggregate
 * stats across the org's KB collections plus a list of every agent
 * that has at least one knowledge entry. Search runs against the
 * cross-base text index (sourceName + content snippets).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Database,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  Loader2,
  Search,
  Type as TypeIcon,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BaseRow {
  agentId: string;
  agentName: string;
  agentSlug: string;
  documentCount: number;
  sizeBytes: number;
  updatedAt: string;
  types: string[];
  sharedWith: string[];
}

interface Stats {
  totalBases: number;
  totalDocuments: number;
  totalSizeBytes: number;
  agentsUsingKnowledge: number;
  bases: BaseRow[];
}

interface SearchHit {
  id: string;
  type: string;
  sourceName: string;
  snippet: string;
  agentId: string;
  agentName: string;
  href: string;
}

const KB_TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PDF: FileText,
  URL: Globe,
  FAQ: HelpCircle,
  TEXT: TypeIcon,
};

export function KnowledgeBasesHubView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/bases");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load (${res.status})`);
      }
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced cross-base search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/knowledge/search?q=${encodeURIComponent(q)}`,
        );
        if (res.ok) {
          const body = await res.json();
          setSearchHits(body.items || []);
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Local filter on the bases list (separate from server-side search)
  const filteredBases = useMemo(() => {
    if (!stats || !query.trim()) return stats?.bases ?? [];
    const q = query.toLowerCase();
    return stats.bases.filter((b) => b.agentName.toLowerCase().includes(q));
  }, [stats, query]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card/40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
        {error}
      </div>
    );
  }

  const isEmpty = (stats?.totalBases ?? 0) === 0;

  if (isEmpty) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 px-6 py-16 text-center"
        data-testid="knowledge-bases-empty"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-kiln-orange/10">
          <Database className="h-7 w-7 text-kiln-orange" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">
          No knowledge bases yet
        </h3>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-muted-foreground">
          Knowledge bases let your agents reference documents during
          conversations. Add knowledge to an agent to populate this view.
        </p>
        <Link
          href="/dashboard/agents"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Bot className="h-3.5 w-3.5" />
          Open Agents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="knowledge-bases-hub">
      {/* Stats header */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Database className="h-4 w-4 text-kiln-orange" />}
          label="Knowledge Bases"
          value={stats?.totalBases ?? 0}
        />
        <StatCard
          icon={<FileText className="h-4 w-4 text-kiln-blue" />}
          label="Documents"
          value={stats?.totalDocuments ?? 0}
        />
        <StatCard
          icon={<TypeIcon className="h-4 w-4 text-violet-400" />}
          label="Total size"
          value={formatBytes(stats?.totalSizeBytes ?? 0)}
        />
        <StatCard
          icon={<Users className="h-4 w-4 text-kiln-green" />}
          label="Agents with knowledge"
          value={stats?.agentsUsingKnowledge ?? 0}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search across all knowledge bases…"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange/40 focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Server-side document hits — only when query >= 2 chars */}
      {searchHits !== null && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Document matches ({searchHits.length})
            </h3>
          </div>
          {searchHits.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No documents matching &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {searchHits.map((hit) => {
                const Icon = KB_TYPE_ICON[hit.type] || FileText;
                return (
                  <li key={hit.id}>
                    <Link
                      href={hit.href}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-foreground truncate">
                            {hit.sourceName}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            in {hit.agentName}
                          </span>
                        </div>
                        {hit.snippet && (
                          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                            {hit.snippet}
                          </p>
                        )}
                      </div>
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Bases list */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            All bases ({filteredBases.length})
          </h3>
        </div>
        {filteredBases.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No agents match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filteredBases.map((base) => (
              <li key={base.agentId}>
                <Link
                  href={`/dashboard/agents/${base.agentId}?tab=knowledge`}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kiln-orange/10">
                    <Bot className="h-4 w-4 text-kiln-orange" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-kiln-orange transition-colors">
                      {base.agentName}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {base.documentCount}{" "}
                        {base.documentCount === 1 ? "document" : "documents"}
                      </span>
                      <span>·</span>
                      <span>{formatBytes(base.sizeBytes)}</span>
                      <span>·</span>
                      <span>Updated {formatRel(base.updatedAt)}</span>
                      {base.types.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            {base.types.map((t) => (
                              <span
                                key={t}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase"
                              >
                                {t}
                              </span>
                            ))}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
      <div>{icon}</div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatRel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
