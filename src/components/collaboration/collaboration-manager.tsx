"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Crown,
  Loader2,
  Mail,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  Eye,
  Zap,
  Settings,
  CheckCircle2,
  Clock,
  XCircle,
  Globe,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import Link from "next/link";

// --- Types ---

interface SharedAgent {
  id: string;
  agentId: string;
  agentName: string;
  targetUserId: string;
  targetUserEmail?: string;
  permissions: "read" | "trigger" | "full";
  status: "pending" | "active" | "revoked";
  createdAt: string;
}

interface ReceivedAgent {
  id: string;
  agentId: string;
  agentName: string;
  ownerUserId: string;
  ownerEmail?: string;
  permissions: "read" | "trigger" | "full";
  status: "pending" | "active" | "declined";
  createdAt: string;
}

interface DirectoryAgent {
  id: string;
  agentId: string;
  publicName: string;
  publicDescription: string;
  category: string;
  creatorName?: string;
  creatorId: string;
}

interface UserAgent {
  id: string;
  name: string;
}

interface CollaborationManagerProps {
  planAllowsCollab: boolean;
  planAllowsDirectory: boolean;
  maxCollaborations: number;
}

type Tab = "shared-by-me" | "shared-with-me" | "directory";

const PERMISSION_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  read: { label: "Lesen", icon: <Eye className="h-3 w-3" /> },
  trigger: { label: "Auslösen", icon: <Zap className="h-3 w-3" /> },
  full: { label: "Vollzugriff", icon: <Settings className="h-3 w-3" /> },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Ausstehend", color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20", icon: <Clock className="h-3 w-3" /> },
  active: { label: "Aktiv", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: <CheckCircle2 className="h-3 w-3" /> },
  revoked: { label: "Widerrufen", color: "text-red-500 bg-red-500/10 border-red-500/20", icon: <XCircle className="h-3 w-3" /> },
  declined: { label: "Abgelehnt", color: "text-red-500 bg-red-500/10 border-red-500/20", icon: <XCircle className="h-3 w-3" /> },
};

// --- Component ---

export function CollaborationManager({
  planAllowsCollab,
  planAllowsDirectory,
  maxCollaborations,
}: CollaborationManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("shared-by-me");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [mySharedAgents, setMySharedAgents] = useState<SharedAgent[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<ReceivedAgent[]>([]);
  const [directoryAgents, setDirectoryAgents] = useState<DirectoryAgent[]>([]);
  const [myAgents, setMyAgents] = useState<UserAgent[]>([]);

  // Share form
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareAgentId, setShareAgentId] = useState("");
  const [shareTargetEmail, setShareTargetEmail] = useState("");
  const [sharePermissions, setSharePermissions] = useState<"read" | "trigger" | "full">("read");
  const [shareLoading, setShareLoading] = useState(false);

  // Message form
  const [messageCollabId, setMessageCollabId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);

  // Directory search
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);

  const fetchCollaborations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/collaboration");
      if (!res.ok) throw new Error("Fehler beim Laden der Kollaborationen");
      const data = await res.json();
      setMySharedAgents(data.mySharedAgents || []);
      setSharedWithMe(data.sharedWithMe || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) return;
      const data = await res.json();
      setMyAgents(Array.isArray(data) ? data : data.agents || []);
    } catch {
      // Agent-Liste optional
    }
  }, []);

  const searchDirectory = useCallback(async (query: string) => {
    try {
      setDirectoryLoading(true);
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const res = await fetch(`/api/collaboration/directory?${params}`);
      if (!res.ok) throw new Error("Verzeichnis konnte nicht geladen werden");
      const data = await res.json();
      setDirectoryAgents(Array.isArray(data) ? data : []);
    } catch {
      setDirectoryAgents([]);
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (planAllowsCollab) {
      fetchCollaborations();
      fetchMyAgents();
    }
  }, [planAllowsCollab, fetchCollaborations, fetchMyAgents]);

  useEffect(() => {
    if (activeTab === "directory" && planAllowsDirectory) {
      searchDirectory(directorySearch);
    }
  }, [activeTab, planAllowsDirectory, searchDirectory, directorySearch]);

  // --- Handlers ---

  const handleShare = async () => {
    if (!shareAgentId || !shareTargetEmail) return;
    try {
      setShareLoading(true);
      const res = await fetch("/api/collaboration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: shareAgentId,
          targetUserId: shareTargetEmail,
          permissions: sharePermissions,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler beim Teilen");
      }
      setShowShareForm(false);
      setShareAgentId("");
      setShareTargetEmail("");
      setSharePermissions("read");
      fetchCollaborations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Teilen");
    } finally {
      setShareLoading(false);
    }
  };

  const handleRevoke = async (collaborationId: string) => {
    try {
      const res = await fetch(`/api/collaboration/${collaborationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Fehler beim Widerrufen");
      fetchCollaborations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Widerrufen");
    }
  };

  const handleAccept = async (collaborationId: string) => {
    try {
      const res = await fetch(`/api/collaboration/${collaborationId}/accept`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Fehler beim Annehmen");
      fetchCollaborations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Annehmen");
    }
  };

  const handleDecline = async (collaborationId: string) => {
    try {
      const res = await fetch(`/api/collaboration/${collaborationId}/decline`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Fehler beim Ablehnen");
      fetchCollaborations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Ablehnen");
    }
  };

  const handleSendMessage = async (collaborationId: string) => {
    if (!messageText.trim()) return;
    try {
      setMessageSending(true);
      const res = await fetch(`/api/collaboration/${collaborationId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
      });
      if (!res.ok) throw new Error("Nachricht konnte nicht gesendet werden");
      setMessageCollabId(null);
      setMessageText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Senden");
    } finally {
      setMessageSending(false);
    }
  };

  const handleCollaborate = async (directoryAgentId: string) => {
    try {
      const res = await fetch("/api/collaboration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: directoryAgentId,
          permissions: "read",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler bei der Zusammenarbeit");
      }
      fetchCollaborations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler bei der Zusammenarbeit");
    }
  };

  // --- Upgrade Prompt (kein Collab-Zugriff) ---

  if (!planAllowsCollab) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-kiln-orange/20 bg-kiln-orange/5 px-8 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-orange/10 border border-kiln-orange/20">
          <Crown className="h-7 w-7 text-kiln-orange" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2 font-[family-name:var(--font-instrument)]">
          Agent Collaboration freischalten
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Teile deine AI Agents mit Teammitgliedern und arbeite gemeinsam an Projekten.
          Upgrade auf Pro oder Agency, um Collaboration zu aktivieren.
        </p>
        <Link href="/dashboard/settings">
          <Button className="bg-kiln-orange hover:bg-kiln-orange/90 text-white gap-2">
            <Crown className="h-4 w-4" />
            Plan upgraden
          </Button>
        </Link>
      </div>
    );
  }

  // --- Tabs ---

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "shared-by-me", label: "Geteilt von mir", icon: <Share2 className="h-4 w-4" /> },
    { id: "shared-with-me", label: "Geteilt mit mir", icon: <UserCheck className="h-4 w-4" /> },
    { id: "directory", label: "Verzeichnis", icon: <Globe className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="rounded-lg p-1 text-red-400 hover:text-red-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all flex-1 justify-center",
              activeTab === tab.id
                ? "bg-kiln-orange/10 text-kiln-orange border border-kiln-orange/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "shared-by-me" && (
        <SharedByMeTab
          loading={loading}
          agents={mySharedAgents}
          myAgents={myAgents}
          maxCollaborations={maxCollaborations}
          showShareForm={showShareForm}
          setShowShareForm={setShowShareForm}
          shareAgentId={shareAgentId}
          setShareAgentId={setShareAgentId}
          shareTargetEmail={shareTargetEmail}
          setShareTargetEmail={setShareTargetEmail}
          sharePermissions={sharePermissions}
          setSharePermissions={setSharePermissions}
          shareLoading={shareLoading}
          onShare={handleShare}
          onRevoke={handleRevoke}
        />
      )}

      {activeTab === "shared-with-me" && (
        <SharedWithMeTab
          loading={loading}
          agents={sharedWithMe}
          messageCollabId={messageCollabId}
          setMessageCollabId={setMessageCollabId}
          messageText={messageText}
          setMessageText={setMessageText}
          messageSending={messageSending}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onSendMessage={handleSendMessage}
        />
      )}

      {activeTab === "directory" && (
        <DirectoryTab
          planAllowsDirectory={planAllowsDirectory}
          agents={directoryAgents}
          search={directorySearch}
          setSearch={setDirectorySearch}
          loading={directoryLoading}
          onCollaborate={handleCollaborate}
        />
      )}
    </div>
  );
}

// --- Sub-Components ---

function SharedByMeTab({
  loading,
  agents,
  myAgents,
  maxCollaborations,
  showShareForm,
  setShowShareForm,
  shareAgentId,
  setShareAgentId,
  shareTargetEmail,
  setShareTargetEmail,
  sharePermissions,
  setSharePermissions,
  shareLoading,
  onShare,
  onRevoke,
}: {
  loading: boolean;
  agents: SharedAgent[];
  myAgents: UserAgent[];
  maxCollaborations: number;
  showShareForm: boolean;
  setShowShareForm: (v: boolean) => void;
  shareAgentId: string;
  setShareAgentId: (v: string) => void;
  shareTargetEmail: string;
  setShareTargetEmail: (v: string) => void;
  sharePermissions: "read" | "trigger" | "full";
  setSharePermissions: (v: "read" | "trigger" | "full") => void;
  shareLoading: boolean;
  onShare: () => void;
  onRevoke: (id: string) => void;
}) {
  const activeCount = agents.filter((a) => a.status !== "revoked").length;
  const canShareMore = maxCollaborations >= 999999 || activeCount < maxCollaborations;

  return (
    <div className="space-y-4">
      {/* Header mit Share-Button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {activeCount} von {maxCollaborations >= 999999 ? "unbegrenzt" : maxCollaborations} Kollaborationen aktiv
          </p>
        </div>
        <Button
          onClick={() => setShowShareForm(!showShareForm)}
          disabled={!canShareMore}
          className="bg-kiln-orange hover:bg-kiln-orange/90 text-white gap-2"
          size="sm"
        >
          <UserPlus className="h-4 w-4" />
          Agent teilen
        </Button>
      </div>

      {/* Share Form */}
      {showShareForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Agent teilen</h4>
            <button onClick={() => setShowShareForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Agent auswählen */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Agent</label>
            <select
              value={shareAgentId}
              onChange={(e) => setShareAgentId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-kiln-orange/50"
            >
              <option value="">Agent auswählen...</option>
              {myAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Ziel-User */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">E-Mail oder User-ID</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={shareTargetEmail}
                onChange={(e) => setShareTargetEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-kiln-orange/50"
              />
            </div>
          </div>

          {/* Berechtigungen */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Berechtigungen</label>
            <div className="flex gap-2">
              {(["read", "trigger", "full"] as const).map((perm) => {
                const config = PERMISSION_LABELS[perm];
                return (
                  <button
                    key={perm}
                    onClick={() => setSharePermissions(perm)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                      sharePermissions === perm
                        ? "border-kiln-orange/40 bg-kiln-orange/10 text-kiln-orange"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    )}
                  >
                    {config.icon}
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={onShare}
            disabled={!shareAgentId || !shareTargetEmail || shareLoading}
            className="w-full bg-kiln-orange hover:bg-kiln-orange/90 text-white gap-2"
          >
            {shareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Agent teilen
          </Button>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Share2 className="h-7 w-7 text-muted-foreground" />}
          title="Noch keine Agents geteilt"
          description="Teile deine AI Agents mit Teammitgliedern oder Kunden, um gemeinsam daran zu arbeiten."
          actionLabel="Agent teilen"
          onAction={() => setShowShareForm(true)}
        />
      ) : (
        <div className="space-y-2">
          {agents.map((collab) => {
            const status = STATUS_CONFIG[collab.status] || STATUS_CONFIG.pending;
            const perm = PERMISSION_LABELS[collab.permissions] || PERMISSION_LABELS.read;
            return (
              <div
                key={collab.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-card/80"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-kiln-orange/10 border border-kiln-orange/20">
                    <Bot className="h-4 w-4 text-kiln-orange" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{collab.agentName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Geteilt mit {collab.targetUserEmail || collab.targetUserId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium", status.color)}>
                    {status.icon}
                    {status.label}
                  </span>
                  <span className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    {perm.icon}
                    {perm.label}
                  </span>
                  {collab.status !== "revoked" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(collab.id)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SharedWithMeTab({
  loading,
  agents,
  messageCollabId,
  setMessageCollabId,
  messageText,
  setMessageText,
  messageSending,
  onAccept,
  onDecline,
  onSendMessage,
}: {
  loading: boolean;
  agents: ReceivedAgent[];
  messageCollabId: string | null;
  setMessageCollabId: (v: string | null) => void;
  messageText: string;
  setMessageText: (v: string) => void;
  messageSending: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onSendMessage: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={<UserCheck className="h-7 w-7 text-muted-foreground" />}
        title="Keine geteilten Agents"
        description="Wenn jemand einen Agent mit dir teilt, erscheint er hier. Du kannst Einladungen annehmen oder ablehnen."
      />
    );
  }

  return (
    <div className="space-y-2">
      {agents.map((collab) => {
        const status = STATUS_CONFIG[collab.status] || STATUS_CONFIG.pending;
        const perm = PERMISSION_LABELS[collab.permissions] || PERMISSION_LABELS.read;
        return (
          <div key={collab.id} className="space-y-0">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-card/80">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <Bot className="h-4 w-4 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{collab.agentName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Von {collab.ownerEmail || collab.ownerUserId}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium", status.color)}>
                  {status.icon}
                  {status.label}
                </span>
                <span className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  {perm.icon}
                  {perm.label}
                </span>
                {collab.status === "pending" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAccept(collab.id)}
                      className="h-7 gap-1 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Annehmen
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDecline(collab.id)}
                      className="h-7 gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Ablehnen
                    </Button>
                  </>
                )}
                {collab.status === "active" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setMessageCollabId(messageCollabId === collab.id ? null : collab.id)
                    }
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Nachricht senden
                  </Button>
                )}
              </div>
            </div>

            {/* Inline Message Input */}
            {messageCollabId === collab.id && (
              <div className="flex items-center gap-2 rounded-b-xl border border-t-0 border-border bg-muted/30 px-4 py-3">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Nachricht eingeben..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSendMessage(collab.id);
                    }
                  }}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-kiln-orange/50"
                />
                <Button
                  onClick={() => onSendMessage(collab.id)}
                  disabled={!messageText.trim() || messageSending}
                  size="sm"
                  className="bg-kiln-orange hover:bg-kiln-orange/90 text-white gap-1.5"
                >
                  {messageSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Senden
                </Button>
                <button
                  onClick={() => {
                    setMessageCollabId(null);
                    setMessageText("");
                  }}
                  className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DirectoryTab({
  planAllowsDirectory,
  agents,
  search,
  setSearch,
  loading,
  onCollaborate,
}: {
  planAllowsDirectory: boolean;
  agents: DirectoryAgent[];
  search: string;
  setSearch: (v: string) => void;
  loading: boolean;
  onCollaborate: (agentId: string) => void;
}) {
  if (!planAllowsDirectory) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-kiln-orange/20 bg-kiln-orange/5 px-8 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-orange/10 border border-kiln-orange/20">
          <Crown className="h-7 w-7 text-kiln-orange" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2 font-[family-name:var(--font-instrument)]">
          Agent-Verzeichnis freischalten
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Durchsuche das öffentliche Agent-Verzeichnis und starte Zusammenarbeiten mit Agents
          anderer Ersteller. Verfügbar ab dem Agency-Plan.
        </p>
        <Link href="/dashboard/settings">
          <Button className="bg-kiln-orange hover:bg-kiln-orange/90 text-white gap-2">
            <Crown className="h-4 w-4" />
            Plan upgraden
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Suchleiste */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Agents durchsuchen..."
          className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-kiln-orange/50"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-7 w-7 text-muted-foreground" />}
          title="Keine Agents gefunden"
          description={
            search
              ? `Keine Agents für "${search}" gefunden. Versuche einen anderen Suchbegriff.`
              : "Im Verzeichnis sind noch keine öffentlichen Agents veröffentlicht."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-kiln-orange/30 hover:shadow-lg hover:shadow-kiln-orange/5"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-kiln-orange/20 to-kiln-ember/10 border border-kiln-orange/20">
                  <Bot className="h-5 w-5 text-kiln-orange" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-foreground truncate">{agent.publicName}</h4>
                  {agent.creatorName && (
                    <p className="text-[10px] text-muted-foreground">von {agent.creatorName}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3 flex-1">
                {agent.publicDescription}
              </p>
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {agent.category}
                </span>
                <Button
                  onClick={() => onCollaborate(agent.agentId)}
                  size="sm"
                  className="h-7 gap-1.5 bg-kiln-orange hover:bg-kiln-orange/90 text-white text-xs"
                >
                  <Users className="h-3 w-3" />
                  Zusammenarbeiten
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
