"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  Send,
  Mail,
  Phone,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Globe,
  AlertCircle,
  Copy,
  Clock,
  FileText,
  RefreshCw,
  Database,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

interface TelegramStatus {
  connected: boolean;
  isActive?: boolean;
  botUsername?: string | null;
  createdAt?: string;
}

interface EmailStatus {
  connected: boolean;
  isActive?: boolean;
  agentEmail?: string;
  forwardingEmail?: string | null;
  lastEmailAt?: string | null;
  emailsToday?: number;
  createdAt?: string;
}

interface SlackStatus {
  connected: boolean;
  slackConnected?: boolean;
  isActive?: boolean;
  channelName?: string | null;
  teamName?: string | null;
  channels?: { id: string; name: string; isMember: boolean; isPrivate: boolean }[];
  createdAt?: string;
}

interface SlackChannelOption {
  id: string;
  name: string;
  isMember: boolean;
  isPrivate: boolean;
}

interface NotionStatus {
  connected: boolean;
  notionConnected?: boolean;
  workspaceName?: string | null;
  config?: {
    kbPageIds?: { id: string; title: string }[];
    leadDatabaseId?: string | null;
    leadDatabaseTitle?: string | null;
    autoSyncEnabled?: boolean;
  };
  lastSyncAt?: string | null;
  searchResults?: { id: string; title: string; url?: string; icon?: string | null }[];
}

interface NotionSearchResult {
  id: string;
  title: string;
  url?: string;
  icon?: string | null;
}

const channels = [
  {
    id: "web",
    name: "Web Chat",
    description: "Embed on any website via script tag or iframe",
    icon: Globe,
    color: "text-kiln-orange",
    bg: "bg-kiln-orange/10",
    border: "border-kiln-orange/20",
    alwaysOn: true,
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect a Telegram bot to chat with your agent",
    icon: Send,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    id: "email",
    name: "Email",
    description: "Receive and respond to emails automatically",
    icon: Mail,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect via WhatsApp Business API",
    icon: Phone,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    comingSoon: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Add your agent to Slack workspaces",
    icon: MessageSquare,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Sync pages as Knowledge Base, export leads to databases",
    icon: FileText,
    color: "text-neutral-300",
    bg: "bg-neutral-500/10",
    border: "border-neutral-500/20",
  },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ChannelsTab({ agentId }: { agentId: string }) {
  const { toast } = useToast();

  // Telegram state
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus>({ connected: false });
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [botToken, setBotToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState("");

  // Email state
  const [emailStatus, setEmailStatus] = useState<EmailStatus>({ connected: false });
  const [emailLoading, setEmailLoading] = useState(true);
  const [forwardingEmail, setForwardingEmail] = useState("");
  const [emailConnecting, setEmailConnecting] = useState(false);
  const [emailDisconnecting, setEmailDisconnecting] = useState(false);
  const [showEmailSetup, setShowEmailSetup] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [copied, setCopied] = useState(false);

  // Slack state
  const [slackStatus, setSlackStatus] = useState<SlackStatus>({ connected: false });
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackChannels, setSlackChannels] = useState<SlackChannelOption[]>([]);
  const [selectedSlackChannel, setSelectedSlackChannel] = useState("");
  const [slackConnecting, setSlackConnecting] = useState(false);
  const [slackDisconnecting, setSlackDisconnecting] = useState(false);
  const [showSlackSetup, setShowSlackSetup] = useState(false);
  const [slackError, setSlackError] = useState("");
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Notion state
  const [notionStatus, setNotionStatus] = useState<NotionStatus>({ connected: false });
  const [notionLoading, setNotionLoading] = useState(true);
  const [showNotionSetup, setShowNotionSetup] = useState(false);
  const [notionError, setNotionError] = useState("");
  const [notionPages, setNotionPages] = useState<NotionSearchResult[]>([]);
  const [notionDatabases, setNotionDatabases] = useState<NotionSearchResult[]>([]);
  const [selectedNotionPages, setSelectedNotionPages] = useState<{ id: string; title: string }[]>([]);
  const [selectedLeadDb, setSelectedLeadDb] = useState("");
  const [notionSearchQuery, setNotionSearchQuery] = useState("");
  const [searchingNotion, setSearchingNotion] = useState(false);
  const [notionSaving, setNotionSaving] = useState(false);
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [notionDisconnecting, setNotionDisconnecting] = useState(false);

  const loadTelegramStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/channels/telegram`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTelegramStatus(data);
    } catch {
      // Not connected
    } finally {
      setTelegramLoading(false);
    }
  }, [agentId]);

  const loadEmailStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/channels/email`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEmailStatus(data);
    } catch {
      // Not connected
    } finally {
      setEmailLoading(false);
    }
  }, [agentId]);

  const loadSlackStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/channels/slack`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSlackStatus(data);
    } catch {
      // Not connected
    } finally {
      setSlackLoading(false);
    }
  }, [agentId]);

  const loadNotionStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/integrations/notion`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNotionStatus(data);
      if (data.config?.kbPageIds) setSelectedNotionPages(data.config.kbPageIds);
      if (data.config?.leadDatabaseId) setSelectedLeadDb(data.config.leadDatabaseId);
    } catch {
      // Not connected
    } finally {
      setNotionLoading(false);
    }
  }, [agentId]);

  useEffect(() => { loadTelegramStatus(); loadEmailStatus(); loadSlackStatus(); loadNotionStatus(); }, [loadTelegramStatus, loadEmailStatus, loadSlackStatus, loadNotionStatus]);

  // Telegram handlers
  const connectTelegram = async () => {
    if (!botToken.trim()) return;
    setConnecting(true);
    setError("");

    try {
      const res = await fetch(`/api/agents/${agentId}/channels/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: botToken.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      toast("Telegram bot connected!");
      setTelegramStatus({ connected: true, isActive: true, botUsername: data.botUsername });
      setBotToken("");
      setShowSetup(false);
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnectTelegram = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/channels/telegram`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast("Telegram bot disconnected");
      setTelegramStatus({ connected: false });
      setShowSetup(false);
    } catch {
      toast("Failed to disconnect", "error");
    } finally {
      setDisconnecting(false);
    }
  };

  // Email handlers
  const connectEmail = async () => {
    setEmailConnecting(true);
    setEmailError("");

    try {
      const res = await fetch(`/api/agents/${agentId}/channels/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forwardingEmail: forwardingEmail.trim() || null }),
      });
      const data = await res.json();
      if (data.error) {
        setEmailError(data.error);
        return;
      }
      toast("Email channel enabled!");
      setEmailStatus({
        connected: true,
        isActive: true,
        agentEmail: data.agentEmail,
        forwardingEmail: forwardingEmail.trim() || null,
        emailsToday: 0,
      });
      setForwardingEmail("");
      setShowEmailSetup(false);
    } catch {
      setEmailError("Failed to enable. Please try again.");
    } finally {
      setEmailConnecting(false);
    }
  };

  const disconnectEmail = async () => {
    setEmailDisconnecting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/channels/email`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast("Email channel disconnected");
      setEmailStatus({ connected: false, agentEmail: emailStatus.agentEmail });
      setShowEmailSetup(false);
    } catch {
      toast("Failed to disconnect", "error");
    } finally {
      setEmailDisconnecting(false);
    }
  };

  // Notion handlers
  const startNotionOAuth = () => {
    window.location.href = `${window.location.origin}/api/integrations/notion/auth?agentId=${agentId}`;
  };

  const searchNotionPages = async () => {
    setSearchingNotion(true);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/integrations/notion?action=searchPages&q=${encodeURIComponent(notionSearchQuery)}`
      );
      const data = await res.json();
      if (data.searchResults) setNotionPages(data.searchResults);
    } catch {
      setNotionError("Failed to search Notion");
    } finally {
      setSearchingNotion(false);
    }
  };

  const searchNotionDatabases = async () => {
    setSearchingNotion(true);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/integrations/notion?action=searchDatabases&q=`
      );
      const data = await res.json();
      if (data.searchResults) setNotionDatabases(data.searchResults);
    } catch {
      setNotionError("Failed to load databases");
    } finally {
      setSearchingNotion(false);
    }
  };

  const saveNotionConfig = async () => {
    setNotionSaving(true);
    setNotionError("");
    try {
      // Save KB pages
      await fetch(`/api/agents/${agentId}/integrations/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setKbPages", pages: selectedNotionPages }),
      });

      // Save lead database
      const selectedDb = notionDatabases.find((d) => d.id === selectedLeadDb);
      await fetch(`/api/agents/${agentId}/integrations/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setLeadDatabase",
          databaseId: selectedLeadDb || null,
          databaseTitle: selectedDb?.title || null,
        }),
      });

      toast("Notion configuration saved!");
      await loadNotionStatus();
      setShowNotionSetup(false);
    } catch {
      setNotionError("Failed to save configuration");
    } finally {
      setNotionSaving(false);
    }
  };

  const syncNotionNow = async () => {
    setNotionSyncing(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/integrations/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "syncNow" }),
      });
      const data = await res.json();
      if (data.error) {
        toast(data.error, "error");
        return;
      }
      toast("Notion sync started! Pages will be imported to your Knowledge Base.");
    } catch {
      toast("Failed to start sync", "error");
    } finally {
      setNotionSyncing(false);
    }
  };

  const toggleNotionAutoSync = async (enabled: boolean) => {
    try {
      await fetch(`/api/agents/${agentId}/integrations/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setAutoSync", enabled }),
      });
      setNotionStatus((prev) => ({
        ...prev,
        config: { ...prev.config, autoSyncEnabled: enabled },
      }));
      toast(enabled ? "Auto-sync enabled" : "Auto-sync disabled");
    } catch {
      toast("Failed to update", "error");
    }
  };

  const disconnectNotion = async () => {
    setNotionDisconnecting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/integrations/notion`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast("Notion disconnected from this agent");
      setNotionStatus((prev) => ({ ...prev, connected: false }));
      setSelectedNotionPages([]);
      setSelectedLeadDb("");
      setShowNotionSetup(false);
    } catch {
      toast("Failed to disconnect", "error");
    } finally {
      setNotionDisconnecting(false);
    }
  };

  // Slack handlers
  const startSlackOAuth = () => {
    const appUrl = window.location.origin;
    window.location.href = `${appUrl}/api/integrations/slack/auth?agentId=${agentId}`;
  };

  const loadSlackChannels = async () => {
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/channels/slack?listChannels=true`);
      const data = await res.json();
      if (data.channels) {
        setSlackChannels(data.channels);
      }
    } catch {
      setSlackError("Failed to load channels");
    } finally {
      setLoadingChannels(false);
    }
  };

  const connectSlackChannel = async () => {
    if (!selectedSlackChannel) return;
    setSlackConnecting(true);
    setSlackError("");

    const channel = slackChannels.find((c) => c.id === selectedSlackChannel);
    if (!channel) return;

    try {
      const res = await fetch(`/api/agents/${agentId}/channels/slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channel.id, channelName: channel.name }),
      });
      const data = await res.json();
      if (data.error) {
        setSlackError(data.error);
        return;
      }
      toast("Slack channel connected!");
      setSlackStatus({ connected: true, slackConnected: true, isActive: true, channelName: data.channelName, teamName: data.teamName });
      setSelectedSlackChannel("");
      setShowSlackSetup(false);
    } catch {
      setSlackError("Failed to connect. Please try again.");
    } finally {
      setSlackConnecting(false);
    }
  };

  const disconnectSlack = async () => {
    setSlackDisconnecting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/channels/slack`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast("Slack channel disconnected");
      setSlackStatus((prev) => ({ ...prev, connected: false }));
      setShowSlackSetup(false);
    } catch {
      toast("Failed to disconnect", "error");
    } finally {
      setSlackDisconnecting(false);
    }
  };

  const copyEmail = async () => {
    const email = emailStatus.agentEmail;
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast("Email address copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Failed to copy", "error");
    }
  };

  return (
    <div>
      <p className="mb-5 text-xs text-muted-foreground">
        Connect your agent to multiple channels. Users can interact with your agent via web chat, Telegram, email, and more.
      </p>

      <div className="space-y-3">
        {channels.map((ch) => {
          const isTelegram = ch.id === "telegram";
          const isEmail = ch.id === "email";
          const isSlack = ch.id === "slack";
          const isNotion = ch.id === "notion";
          return (
            <div key={ch.id} className="rounded-xl border border-border bg-card">
              {/* Channel card header */}
              <div className="flex items-center gap-3 p-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", ch.bg)}>
                  <ch.icon className={cn("h-5 w-5", ch.color)} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{ch.name}</p>
                    {ch.comingSoon && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{ch.description}</p>
                </div>

                {/* Status / Action */}
                <div className="shrink-0">
                  {ch.alwaysOn && (
                    <span className="flex items-center gap-1.5 rounded-full bg-kiln-green/10 px-3 py-1 text-[10px] font-semibold text-kiln-green">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiln-green opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-kiln-green" />
                      </span>
                      Always On
                    </span>
                  )}

                  {/* Telegram status */}
                  {isTelegram && !telegramLoading && telegramStatus.connected && (
                    <span className="flex items-center gap-1.5 rounded-full bg-kiln-green/10 px-3 py-1 text-[10px] font-semibold text-kiln-green">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </span>
                  )}

                  {isTelegram && !telegramLoading && !telegramStatus.connected && !ch.comingSoon && (
                    <button
                      onClick={() => setShowSetup(!showSetup)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Set Up
                    </button>
                  )}

                  {isTelegram && telegramLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}

                  {/* Email status */}
                  {isEmail && !emailLoading && emailStatus.connected && (
                    <span className="flex items-center gap-1.5 rounded-full bg-kiln-green/10 px-3 py-1 text-[10px] font-semibold text-kiln-green">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </span>
                  )}

                  {isEmail && !emailLoading && !emailStatus.connected && (
                    <button
                      onClick={() => setShowEmailSetup(!showEmailSetup)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Set Up
                    </button>
                  )}

                  {isEmail && emailLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}

                  {/* Slack status */}
                  {isSlack && !slackLoading && slackStatus.connected && (
                    <span className="flex items-center gap-1.5 rounded-full bg-kiln-green/10 px-3 py-1 text-[10px] font-semibold text-kiln-green">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </span>
                  )}

                  {isSlack && !slackLoading && !slackStatus.connected && (
                    <button
                      onClick={() => {
                        setShowSlackSetup(!showSlackSetup);
                        if (!showSlackSetup && slackStatus.slackConnected && slackChannels.length === 0) {
                          loadSlackChannels();
                        }
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Set Up
                    </button>
                  )}

                  {isSlack && slackLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}

                  {/* Notion status */}
                  {isNotion && !notionLoading && notionStatus.connected && (
                    <span className="flex items-center gap-1.5 rounded-full bg-kiln-green/10 px-3 py-1 text-[10px] font-semibold text-kiln-green">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </span>
                  )}

                  {isNotion && !notionLoading && !notionStatus.connected && (
                    <button
                      onClick={() => {
                        setShowNotionSetup(!showNotionSetup);
                        if (!showNotionSetup && notionStatus.notionConnected) {
                          if (notionPages.length === 0) searchNotionPages();
                          if (notionDatabases.length === 0) searchNotionDatabases();
                        }
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Set Up
                    </button>
                  )}

                  {isNotion && notionLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}

                  {ch.comingSoon && (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </div>
              </div>

              {/* Telegram: Connected details */}
              {isTelegram && telegramStatus.connected && (
                <div className="border-t border-border px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {telegramStatus.botUsername && (
                        <a
                          href={`https://t.me/${telegramStatus.botUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:underline"
                        >
                          @{telegramStatus.botUsername}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <button
                      onClick={disconnectTelegram}
                      disabled={disconnecting}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Disconnect
                    </button>
                  </div>
                </div>
              )}

              {/* Telegram: Setup form */}
              {isTelegram && showSetup && !telegramStatus.connected && (
                <div className="border-t border-border p-4">
                  <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                    <p className="text-xs font-medium text-blue-400 mb-2">Setup Instructions</p>
                    <ol className="space-y-1.5 text-[11px] text-muted-foreground list-decimal list-inside">
                      <li>Open Telegram and search for <span className="font-medium text-foreground">@BotFather</span></li>
                      <li>Send <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">/newbot</code> and follow the prompts</li>
                      <li>Copy the <span className="font-medium text-foreground">Bot Token</span> BotFather gives you</li>
                      <li>Paste it below and click Connect</li>
                    </ol>
                  </div>

                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bot Token</label>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => { setBotToken(e.target.value); setError(""); }}
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  />

                  {error && (
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-red-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowSetup(false); setError(""); setBotToken(""); }}
                      className="flex-1 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={connectTelegram}
                      disabled={connecting || !botToken.trim()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500/90 disabled:opacity-50"
                    >
                      {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Connect
                    </button>
                  </div>
                </div>
              )}

              {/* Email: Connected details */}
              {isEmail && emailStatus.connected && (
                <div className="border-t border-border px-4 py-3">
                  <div className="space-y-3">
                    {/* Agent email address — copyable */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-muted-foreground">Agent Email</span>
                        <button
                          onClick={copyEmail}
                          className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:bg-muted"
                        >
                          {emailStatus.agentEmail}
                          {copied ? (
                            <CheckCircle2 className="h-3 w-3 text-kiln-green" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={disconnectEmail}
                        disabled={emailDisconnecting}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        {emailDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Disconnect
                      </button>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                      {emailStatus.forwardingEmail && (
                        <span>
                          Forwarding to <span className="font-medium text-foreground">{emailStatus.forwardingEmail}</span>
                        </span>
                      )}
                      {emailStatus.lastEmailAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last email {timeAgo(emailStatus.lastEmailAt)}
                        </span>
                      )}
                      {typeof emailStatus.emailsToday === "number" && (
                        <span>{emailStatus.emailsToday}/50 emails today</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Email: Setup form */}
              {isEmail && showEmailSetup && !emailStatus.connected && (
                <div className="border-t border-border p-4">
                  <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <p className="text-xs font-medium text-red-400 mb-2">How Email Channel Works</p>
                    <ol className="space-y-1.5 text-[11px] text-muted-foreground list-decimal list-inside">
                      <li>Your agent gets a unique email address: <span className="font-medium text-foreground">{emailStatus.agentEmail || "your-agent@getkiln.com"}</span></li>
                      <li>Anyone who emails that address gets an AI-powered reply</li>
                      <li>Conversations are saved and visible in your dashboard</li>
                      <li>Optionally forward copies to your own email for monitoring</li>
                    </ol>
                  </div>

                  {/* Agent email preview */}
                  <div className="mb-3 rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-[10px] text-muted-foreground">Your agent&apos;s email address</span>
                    <p className="font-mono text-sm text-foreground">{emailStatus.agentEmail || "your-agent@getkiln.com"}</p>
                  </div>

                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Forwarding Email <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={forwardingEmail}
                    onChange={(e) => { setForwardingEmail(e.target.value); setEmailError(""); }}
                    placeholder="you@company.com"
                    className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/20"
                  />
                  <p className="mb-3 text-[10px] text-muted-foreground">
                    Receive a copy of every inbound email for monitoring. Rate limit: 50 emails/day per agent.
                  </p>

                  {emailError && (
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-red-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {emailError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowEmailSetup(false); setEmailError(""); setForwardingEmail(""); }}
                      className="flex-1 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={connectEmail}
                      disabled={emailConnecting}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500/90 disabled:opacity-50"
                    >
                      {emailConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                      Enable Email
                    </button>
                  </div>
                </div>
              )}

              {/* Slack: Connected details */}
              {isSlack && slackStatus.connected && (
                <div className="border-t border-border px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">#{slackStatus.channelName}</span>
                        {slackStatus.teamName && (
                          <span className="ml-1.5 text-muted-foreground/60">in {slackStatus.teamName}</span>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={disconnectSlack}
                      disabled={slackDisconnecting}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      {slackDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Disconnect
                    </button>
                  </div>
                </div>
              )}

              {/* Slack: Setup form */}
              {isSlack && showSlackSetup && !slackStatus.connected && (
                <div className="border-t border-border p-4">
                  {!slackStatus.slackConnected ? (
                    // Step 1: Connect Slack workspace via OAuth
                    <div>
                      <div className="mb-4 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                        <p className="text-xs font-medium text-purple-400 mb-2">Setup Instructions</p>
                        <ol className="space-y-1.5 text-[11px] text-muted-foreground list-decimal list-inside">
                          <li>Click <span className="font-medium text-foreground">Connect Slack</span> below</li>
                          <li>Authorize KILN in your Slack workspace</li>
                          <li>Select a channel for your agent to respond in</li>
                          <li>Messages in that channel will get AI responses</li>
                        </ol>
                      </div>

                      <button
                        onClick={startSlackOAuth}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-purple-500/90"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Connect Slack Workspace
                      </button>

                      <button
                        onClick={() => { setShowSlackSetup(false); setSlackError(""); }}
                        className="mt-2 w-full rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    // Step 2: Select channel (Slack already connected)
                    <div>
                      <div className="mb-3 rounded-lg bg-purple-500/5 border border-purple-500/20 px-3 py-2">
                        <span className="text-[10px] text-muted-foreground">Connected to</span>
                        <p className="text-sm font-medium text-foreground">{slackStatus.teamName}</p>
                      </div>

                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Select Channel</label>
                      {loadingChannels ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading channels...
                        </div>
                      ) : (
                        <select
                          value={selectedSlackChannel}
                          onChange={(e) => { setSelectedSlackChannel(e.target.value); setSlackError(""); }}
                          className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                        >
                          <option value="">Choose a channel...</option>
                          {slackChannels.map((ch2) => (
                            <option key={ch2.id} value={ch2.id}>
                              #{ch2.name} {ch2.isPrivate ? "(private)" : ""}
                            </option>
                          ))}
                        </select>
                      )}

                      {slackError && (
                        <div className="mb-2 flex items-center gap-1.5 text-xs text-red-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {slackError}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowSlackSetup(false); setSlackError(""); setSelectedSlackChannel(""); }}
                          className="flex-1 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={connectSlackChannel}
                          disabled={slackConnecting || !selectedSlackChannel}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-500/90 disabled:opacity-50"
                        >
                          {slackConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                          Connect Channel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notion: Connected details */}
              {isNotion && notionStatus.connected && (
                <div className="border-t border-border px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{notionStatus.workspaceName}</span>
                      {notionStatus.lastSyncAt && (
                        <span className="ml-2 text-muted-foreground/60">
                          <Clock className="inline h-3 w-3 mr-0.5" />
                          Last sync {timeAgo(notionStatus.lastSyncAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={syncNotionNow}
                        disabled={notionSyncing}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-500/10"
                      >
                        {notionSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Sync Now
                      </button>
                      <button
                        onClick={disconnectNotion}
                        disabled={notionDisconnecting}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        {notionDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Disconnect
                      </button>
                    </div>
                  </div>

                  {/* KB Pages summary */}
                  {notionStatus.config?.kbPageIds && notionStatus.config.kbPageIds.length > 0 && (
                    <div className="mb-2">
                      <span className="text-[10px] font-medium text-muted-foreground">KB Sync Pages:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {notionStatus.config.kbPageIds.map((p) => (
                          <span key={p.id} className="rounded bg-muted px-2 py-0.5 text-[10px] text-foreground">
                            {p.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lead Database summary */}
                  {notionStatus.config?.leadDatabaseTitle && (
                    <div className="mb-2">
                      <span className="text-[10px] font-medium text-muted-foreground">Lead Export:</span>
                      <span className="ml-1.5 rounded bg-muted px-2 py-0.5 text-[10px] text-foreground">
                        <Database className="inline h-3 w-3 mr-0.5" />
                        {notionStatus.config.leadDatabaseTitle}
                      </span>
                    </div>
                  )}

                  {/* Auto-sync toggle */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                    <span className="text-[10px] text-muted-foreground">Auto-sync daily</span>
                    <button onClick={() => toggleNotionAutoSync(!notionStatus.config?.autoSyncEnabled)}>
                      <div className={cn("relative h-5 w-9 rounded-full transition-colors duration-200", notionStatus.config?.autoSyncEnabled ? "bg-kiln-green" : "bg-muted")}>
                        <div className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200", notionStatus.config?.autoSyncEnabled ? "translate-x-4" : "translate-x-0.5")} />
                      </div>
                    </button>
                  </div>

                  {/* Edit config button */}
                  <button
                    onClick={() => {
                      setShowNotionSetup(true);
                      if (notionPages.length === 0) searchNotionPages();
                      if (notionDatabases.length === 0) searchNotionDatabases();
                    }}
                    className="mt-2 w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Edit Configuration
                  </button>
                </div>
              )}

              {/* Notion: Setup form */}
              {isNotion && showNotionSetup && (
                <div className="border-t border-border p-4">
                  {!notionStatus.notionConnected ? (
                    // Step 1: Connect Notion workspace via OAuth
                    <div>
                      <div className="mb-4 rounded-lg border border-neutral-500/20 bg-neutral-500/5 p-3">
                        <p className="text-xs font-medium text-neutral-300 mb-2">Setup Instructions</p>
                        <ol className="space-y-1.5 text-[11px] text-muted-foreground list-decimal list-inside">
                          <li>Click <span className="font-medium text-foreground">Connect Notion</span> below</li>
                          <li>Authorize KILN to access your Notion workspace</li>
                          <li>Select pages to sync as Knowledge Base</li>
                          <li>Optionally select a database for lead export</li>
                        </ol>
                      </div>

                      <button
                        onClick={startNotionOAuth}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-600 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-neutral-600/90"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Connect Notion Workspace
                      </button>

                      <button
                        onClick={() => { setShowNotionSetup(false); setNotionError(""); }}
                        className="mt-2 w-full rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    // Step 2: Configure KB sync + lead export
                    <div className="space-y-4">
                      <div className="rounded-lg bg-neutral-500/5 border border-neutral-500/20 px-3 py-2">
                        <span className="text-[10px] text-muted-foreground">Connected to</span>
                        <p className="text-sm font-medium text-foreground">{notionStatus.workspaceName}</p>
                      </div>

                      {/* KB Page selection */}
                      <div>
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          Knowledge Base Pages
                        </label>
                        <p className="mb-2 text-[10px] text-muted-foreground/70">
                          Select Notion pages to import as knowledge for your agent.
                        </p>

                        <div className="mb-2 flex gap-1.5">
                          <input
                            type="text"
                            value={notionSearchQuery}
                            onChange={(e) => setNotionSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchNotionPages(); } }}
                            placeholder="Search pages..."
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400/20"
                          />
                          <button
                            onClick={searchNotionPages}
                            disabled={searchingNotion}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
                          >
                            {searchingNotion ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                          </button>
                        </div>

                        {/* Selected pages */}
                        {selectedNotionPages.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1">
                            {selectedNotionPages.map((p) => (
                              <span
                                key={p.id}
                                className="flex items-center gap-1 rounded-md bg-neutral-500/10 px-2 py-1 text-[10px] text-foreground"
                              >
                                {p.title}
                                <button
                                  onClick={() => setSelectedNotionPages((prev) => prev.filter((x) => x.id !== p.id))}
                                  className="ml-0.5 text-muted-foreground hover:text-red-400"
                                >
                                  &times;
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Page search results */}
                        {notionPages.length > 0 && (
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                            {notionPages.map((page) => {
                              const isSelected = selectedNotionPages.some((p) => p.id === page.id);
                              return (
                                <button
                                  key={page.id}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedNotionPages((prev) => prev.filter((p) => p.id !== page.id));
                                    } else {
                                      setSelectedNotionPages((prev) => [...prev, { id: page.id, title: page.title }]);
                                    }
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted",
                                    isSelected && "bg-neutral-500/10"
                                  )}
                                >
                                  <span className="shrink-0 text-sm">{page.icon || "📄"}</span>
                                  <span className="min-w-0 truncate text-foreground">{page.title}</span>
                                  {isSelected && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-kiln-green" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Lead Database selection */}
                      <div>
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Database className="h-3 w-3" />
                          Lead Export Database <span className="text-muted-foreground/50">(optional)</span>
                        </label>
                        <p className="mb-2 text-[10px] text-muted-foreground/70">
                          When your agent captures a lead, automatically create a row in this Notion database.
                        </p>

                        {searchingNotion && notionDatabases.length === 0 ? (
                          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading databases...
                          </div>
                        ) : (
                          <select
                            value={selectedLeadDb}
                            onChange={(e) => setSelectedLeadDb(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400/20"
                          >
                            <option value="">No lead export</option>
                            {notionDatabases.map((db) => (
                              <option key={db.id} value={db.id}>
                                {db.icon || "📋"} {db.title}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {notionError && (
                        <div className="flex items-center gap-1.5 text-xs text-red-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {notionError}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowNotionSetup(false); setNotionError(""); }}
                          className="flex-1 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveNotionConfig}
                          disabled={notionSaving}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-600/90 disabled:opacity-50"
                        >
                          {notionSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                          Save Configuration
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Web: hint to Embed tab */}
              {ch.alwaysOn && (
                <div className="border-t border-border px-4 py-2.5">
                  <p className="text-[10px] text-muted-foreground">
                    Configure in the <span className="font-medium text-foreground">Embed Code</span> tab
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
