"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Loader2,
  Radio,
  Star,
  Zap,
  Clock,
  Copy,
  Play,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["Alle", "Sales", "Support", "Booking", "Research", "Data Processing", "Marketing", "HR", "Other"];

interface DirectoryAgent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  category: string;
  creditCost: number;
  rating: number;
  usageCount: number;
  avgResponseMs: number;
  cardUrl: string;
  endpoint: string;
}

export default function A2ADirectoryPage() {
  const [agents, setAgents] = useState<DirectoryAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Alle");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<DirectoryAgent | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category !== "Alle") params.set("category", category);
      const res = await fetch(`/api/a2a/directory?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => {
    const debounce = setTimeout(loadAgents, 300);
    return () => clearTimeout(debounce);
  }, [loadAgents]);

  async function testAgent(agent: DirectoryAgent) {
    setTestingId(agent.id);
    setTestResult(null);
    try {
      const res = await fetch(agent.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "Hello! Please briefly describe what you can help with.",
          context: {
            sourceAgent: { name: "KILN Directory", platform: "kiln" },
            taskType: "question",
            priority: "low",
          },
        }),
      });
      const data = await res.json();
      setTestResult(data.response || data.error || "No response");
    } catch {
      setTestResult("Connection failed");
    } finally {
      setTestingId(null);
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
              <Radio className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">A2A Agent Directory</h1>
              <p className="text-sm text-muted-foreground">
                Entdecke und verbinde dich mit AI Agents über das A2A Protocol
              </p>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Name, Beschreibung oder Capability..."
                className="w-full rounded-lg border border-border bg-background pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap",
                    category === cat
                      ? "bg-purple-500/15 text-purple-400"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Radio className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h2 className="text-lg font-medium text-foreground">Keine Agents gefunden</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {search
                ? `Keine Agents für "${search}" gefunden. Versuche einen anderen Suchbegriff.`
                : "Noch keine A2A-Agents im Directory. Aktiviere A2A bei deinen Agents, um sie hier zu listen."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="group rounded-xl border border-border bg-card/50 p-5 hover:border-purple-500/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground truncate">{agent.name}</h3>
                    <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400 mt-1">
                      {agent.category}
                    </span>
                  </div>
                  {agent.rating > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-medium text-amber-400">{agent.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {agent.description || "Kein Beschreibung verfügbar"}
                </p>

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {agent.capabilities.slice(0, 4).map((cap) => (
                    <span
                      key={cap}
                      className="rounded-md bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {cap}
                    </span>
                  ))}
                  {agent.capabilities.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{agent.capabilities.length - 4}</span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mb-4 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    <span>{agent.usageCount} Aufrufe</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{agent.avgResponseMs ? `${(agent.avgResponseMs / 1000).toFixed(1)}s` : "—"}</span>
                  </div>
                  <span className="text-purple-400 font-medium">{agent.creditCost} Credit{agent.creditCost !== 1 ? "s" : ""}/Call</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs"
                    onClick={() => testAgent(agent)}
                    disabled={testingId === agent.id}
                  >
                    {testingId === agent.id ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 h-3 w-3" />
                    )}
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs"
                    onClick={() => copyUrl(agent.cardUrl)}
                  >
                    <Copy className="mr-1.5 h-3 w-3" />
                    Connect
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", selectedAgent?.id === agent.id && "rotate-180")} />
                  </Button>
                </div>

                {/* Detail Panel */}
                {selectedAgent?.id === agent.id && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Card URL</p>
                      <code className="block rounded bg-muted/50 px-2 py-1.5 text-[10px] font-mono text-muted-foreground break-all">
                        {agent.cardUrl}
                      </code>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Message Endpoint</p>
                      <code className="block rounded bg-muted/50 px-2 py-1.5 text-[10px] font-mono text-muted-foreground break-all">
                        {agent.endpoint}
                      </code>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Alle Capabilities</p>
                      <div className="flex flex-wrap gap-1">
                        {agent.capabilities.map((cap) => (
                          <span key={cap} className="rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400">
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Test Result Modal */}
        {testResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setTestResult(null)}>
            <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Test Response</h3>
                <button onClick={() => setTestResult(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="rounded-lg bg-muted/30 p-4 max-h-64 overflow-y-auto">
                <p className="text-sm text-foreground whitespace-pre-wrap">{testResult}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
