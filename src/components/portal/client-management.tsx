"use client";

import { useState, useEffect } from "react";
import {
  Globe, Plus, Copy, Trash2, RefreshCw, ExternalLink, Loader2, Check, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Portal {
  id: string;
  name: string;
  slug: string;
  clientEmail: string;
  clientName?: string;
  accessToken: string;
  isActive: boolean;
  lastAccessedAt?: string;
  createdAt: string;
  agentIds: string[];
}

interface Agent {
  id: string;
  name: string;
}

export function ClientManagement() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
    ])
      .then(([portalData, agentData]) => {
        setPortals(portalData.portals || []);
        const agentList = agentData.agents || agentData || [];
        setAgents(Array.isArray(agentList) ? agentList : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copyPortalLink = (portal: Portal) => {
    const url = `${window.location.origin}/portal/${portal.id}?token=${portal.accessToken}`;
    navigator.clipboard.writeText(url);
    setCopiedId(portal.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const createPortal = async () => {
    if (!name || !clientEmail || !selectedAgents.length) return;
    setCreating(true);

    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clientEmail, clientName, agentIds: selectedAgents }),
      });
      const data = await res.json();
      if (data.portal) {
        setPortals((prev) => [data.portal, ...prev]);
        setShowCreate(false);
        setName("");
        setClientEmail("");
        setClientName("");
        setSelectedAgents([]);
      }
    } catch {
      // Fehler ignorieren
    }
    setCreating(false);
  };

  const deletePortal = async (portalId: string) => {
    await fetch(`/api/portal/${portalId}`, { method: "DELETE" });
    setPortals((prev) => prev.filter((p) => p.id !== portalId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Client Portale</h2>
          <p className="mt-0.5 text-xs text-foreground0">
            White-Label Dashboards für Ihre Kunden
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
          className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Neues Portal
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-foreground0">
                Portal-Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Kunde X Dashboard"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-foreground0">
                Kunden-Name
              </label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Firma GmbH"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-foreground0">
              Kunden-E-Mail
            </label>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="kunde@firma.de"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-foreground0">
              Sichtbare Agents
            </label>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() =>
                    setSelectedAgents((prev) =>
                      prev.includes(agent.id)
                        ? prev.filter((id) => id !== agent.id)
                        : [...prev, agent.id],
                    )
                  }
                  className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                    selectedAgents.includes(agent.id)
                      ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                      : "bg-card text-muted-foreground border border-border hover:border-border"
                  }`}
                >
                  {agent.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={createPortal}
              disabled={creating || !name || !clientEmail || !selectedAgents.length}
              className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
            >
              {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              Erstellen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreate(false)}
              className="text-xs h-8 border-border"
            >
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* Portal List */}
      {portals.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Noch keine Portale</h3>
          <p className="text-xs text-foreground0">
            Erstelle ein Portal, um deinen Kunden Zugriff auf Agent-Analytics zu geben.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {portals.map((portal) => (
            <div
              key={portal.id}
              className="rounded-xl border border-border bg-card/50 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <Globe className="h-4.5 w-4.5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{portal.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-foreground0">{portal.clientEmail}</span>
                      {portal.clientName && (
                        <span className="text-xs text-muted-foreground">· {portal.clientName}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copyPortalLink(portal)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Link kopieren"
                  >
                    {copiedId === portal.id ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <a
                    href={`/portal/${portal.id}?token=${portal.accessToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Portal öffnen"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => deletePortal(portal.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span
                  className={`flex items-center gap-1 ${portal.isActive ? "text-green-500" : "text-red-500"}`}
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  {portal.isActive ? "Aktiv" : "Deaktiviert"}
                </span>
                <span>{portal.agentIds.length} Agent(s)</span>
                {portal.lastAccessedAt && (
                  <span>
                    Letzter Zugriff: {new Date(portal.lastAccessedAt).toLocaleDateString("de-DE")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
