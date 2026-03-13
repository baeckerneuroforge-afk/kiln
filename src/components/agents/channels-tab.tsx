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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

interface TelegramStatus {
  connected: boolean;
  isActive?: boolean;
  botUsername?: string | null;
  createdAt?: string;
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
    comingSoon: true,
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
    comingSoon: true,
  },
];

export function ChannelsTab({ agentId }: { agentId: string }) {
  const { toast } = useToast();
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus>({ connected: false });
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [botToken, setBotToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => { loadTelegramStatus(); }, [loadTelegramStatus]);

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

  return (
    <div>
      <p className="mb-5 text-xs text-muted-foreground">
        Connect your agent to multiple channels. Users can interact with your agent via web chat, Telegram, email, and more.
      </p>

      <div className="space-y-3">
        {channels.map((ch) => {
          const isTelegram = ch.id === "telegram";
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
