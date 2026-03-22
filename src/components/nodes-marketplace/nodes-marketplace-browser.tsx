"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Puzzle,
  Download,
  Loader2,
  X,
  Plus,
  Star,
  Filter,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";

interface MarketplaceNode {
  id: string;
  nodeId: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  version: string;
  installCount: number;
  rating: number | null;
  creatorId: string;
  createdAt: string;
  installed?: boolean;
}

const CATEGORIES = [
  { value: "", label: "Alle" },
  { value: "data", label: "Daten" },
  { value: "ai", label: "AI / ML" },
  { value: "integration", label: "Integration" },
  { value: "utility", label: "Utility" },
  { value: "communication", label: "Kommunikation" },
  { value: "analytics", label: "Analytics" },
  { value: "automation", label: "Automatisierung" },
];

export function NodesMarketplaceBrowser() {
  const [nodes, setNodes] = useState<MarketplaceNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadNodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);

      const res = await fetch(`/api/nodes-marketplace?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Laden");
      }
      const data = await res.json();
      setNodes(data.nodes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadNodes();
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadNodes, search]);

  async function handleInstall(nodeId: string) {
    setInstallingId(nodeId);
    try {
      const res = await fetch(`/api/nodes-marketplace/${nodeId}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Installation fehlgeschlagen");
      }

      setInstalledIds((prev) => new Set([...prev, nodeId]));
      // installCount im lokalen State erhoehen
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, installCount: n.installCount + 1 } : n
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setInstallingId(null);
    }
  }

  async function handleUninstall(nodeId: string) {
    setInstallingId(nodeId);
    try {
      const res = await fetch(`/api/nodes-marketplace/${nodeId}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Deinstallation fehlgeschlagen");
      }

      setInstalledIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, installCount: Math.max(0, n.installCount - 1) } : n
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setInstallingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Suchleiste und Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nodes durchsuchen..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 py-2 pl-9 pr-3 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-colors placeholder:text-zinc-600"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  category === cat.value
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : "bg-zinc-800/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Node einreichen CTA */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
        <div>
          <p className="text-sm font-medium text-zinc-200">Eigenen Node erstellen</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Baue und veroeffentliche Custom Nodes fuer die Community
          </p>
        </div>
        <a
          href="/dashboard/nodes-marketplace?tab=submit"
          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Node einreichen
        </a>
      </div>

      {/* Fehler */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}

      {/* Empty State */}
      {!loading && nodes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/50 mb-4">
            <Puzzle className="h-6 w-6 text-zinc-500" />
          </div>
          <p className="text-sm font-medium text-zinc-300">
            Noch keine Community-Nodes verfuegbar
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {search
              ? "Keine Nodes fuer diese Suche gefunden. Probiere andere Begriffe."
              : "Sei der Erste und veroeffentliche einen Custom Node!"}
          </p>
        </div>
      )}

      {/* Node Grid */}
      {!loading && nodes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nodes.map((node) => {
            const isInstalled = installedIds.has(node.id) || node.installed;
            const isInstalling = installingId === node.id;

            return (
              <div
                key={node.id}
                className="group rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 hover:border-zinc-700/50 transition-all"
              >
                {/* Node Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: node.color || "#F97316" }}
                    >
                      <Puzzle className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-zinc-200">{node.name}</h3>
                      <p className="text-[10px] text-zinc-500 font-mono">{node.nodeId}</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-medium text-orange-400">
                    Community
                  </span>
                </div>

                {/* Beschreibung */}
                <p className="mt-3 text-xs text-zinc-400 leading-relaxed line-clamp-2">
                  {node.description}
                </p>

                {/* Metadaten */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="rounded-full bg-zinc-800/50 px-2 py-0.5 text-[10px] text-zinc-400">
                    {node.category}
                  </span>
                  <span className="text-[10px] text-zinc-500">v{node.version}</span>
                  <div className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                    <Download className="h-3 w-3" />
                    {node.installCount}
                  </div>
                  {node.rating && (
                    <div className="flex items-center gap-0.5 text-[10px] text-yellow-500">
                      <Star className="h-3 w-3 fill-current" />
                      {node.rating.toFixed(1)}
                    </div>
                  )}
                </div>

                {/* Aktionen */}
                <div className="mt-4 flex items-center gap-2">
                  {isInstalled ? (
                    <button
                      onClick={() => handleUninstall(node.id)}
                      disabled={isInstalling}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                    >
                      {isInstalling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Installiert
                    </button>
                  ) : (
                    <button
                      onClick={() => handleInstall(node.id)}
                      disabled={isInstalling}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 py-1.5 text-xs font-medium text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                    >
                      {isInstalling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Installieren
                    </button>
                  )}
                  <a
                    href={`/dashboard/nodes-marketplace?node=${node.id}`}
                    className="flex items-center justify-center rounded-lg border border-zinc-800 p-1.5 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
