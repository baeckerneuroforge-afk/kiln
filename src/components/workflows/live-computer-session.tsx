"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Monitor, Play, Pause, Square, RefreshCw, ChevronDown,
  ChevronRight, Clock, CheckCircle2, XCircle, Loader2,
  Eye, Maximize2, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SessionAction {
  type: string;
  detail: string;
  timestamp: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

interface SessionState {
  id: string;
  status: "active" | "closed" | "error";
  createdAt: string;
  screenshotCount: number;
  latestScreenshot: string | null;
  actionLog: SessionAction[];
  actionCount: number;
}

interface LiveComputerSessionProps {
  sessionId: string;
  onClose?: () => void;
}

export function LiveComputerSession({ sessionId, onClose }: LiveComputerSessionProps) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showLog, setShowLog] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/computer-session/${sessionId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Session nicht gefunden");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json() as SessionState;
      setSession(data);
      setError(null);

      // Polling stoppen wenn Session beendet
      if (data.status !== "active" && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Polling alle 2 Sekunden
  useEffect(() => {
    fetchSession();
    intervalRef.current = setInterval(fetchSession, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchSession]);

  const handleAction = async (action: string) => {
    try {
      await fetch(`/api/workflows/computer-session/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await fetchSession();
    } catch {
      // Fehler ignorieren, nächster Poll zeigt Status
    }
  };

  const statusColors: Record<string, string> = {
    active: "text-green-400",
    closed: "text-zinc-500",
    error: "text-red-400",
  };

  const statusLabels: Record<string, string> = {
    active: "Aktiv",
    closed: "Beendet",
    error: "Fehler",
  };

  if (loading && !session) {
    return (
      <div className="rounded-xl border border-[#2a2a3a] bg-[#1a1a24] p-6">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Session wird geladen...</span>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-[#2a2a3a] bg-[#1a1a24] overflow-hidden transition-all",
        fullscreen && "fixed inset-4 z-50 rounded-2xl shadow-2xl"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a3a] bg-[#141418]">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10">
            <Monitor className="h-4 w-4 text-pink-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200">Live Browser Session</span>
              <span className={cn("text-[10px] font-bold uppercase", statusColors[session.status] || "text-zinc-500")}>
                {statusLabels[session.status] || session.status}
              </span>
            </div>
            <span className="text-[10px] text-zinc-600 font-mono">{session.id}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {session.status === "active" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAction("pause")}
                className="h-7 w-7 p-0 text-zinc-500 hover:text-yellow-400"
                title="Pause"
              >
                <Pause className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAction("abort")}
                className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
                title="Abbrechen"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchSession}
            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300"
            title="Aktualisieren"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFullscreen(!fullscreen)}
            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300"
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          {onClose && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-7 px-2 text-zinc-500 hover:text-zinc-300 text-[10px]"
            >
              Schließen
            </Button>
          )}
        </div>
      </div>

      {/* Screenshot View */}
      <div
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded && session.latestScreenshot ? (
          <div className="relative bg-black">
            <img
              src={`data:image/png;base64,${session.latestScreenshot}`}
              alt="Browser Screenshot"
              className="w-full h-auto max-h-[400px] object-contain"
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 rounded px-2 py-1">
              <Eye className="h-3 w-3 text-zinc-400" />
              <span className="text-[10px] text-zinc-400">
                {session.screenshotCount} Screenshots
              </span>
            </div>
            {session.status === "active" && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-green-500/20 border border-green-500/30 rounded-full px-2.5 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] font-medium text-green-400">LIVE</span>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 flex items-center gap-2 text-zinc-500 hover:text-zinc-400 transition-colors">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">
              {session.latestScreenshot ? "Screenshot anzeigen" : "Kein Screenshot verfügbar"}
            </span>
          </div>
        )}
      </div>

      {/* Action Log */}
      <div className="border-t border-[#2a2a3a]">
        <button
          onClick={() => setShowLog(!showLog)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
        >
          <span className="font-medium">
            Aktionslog ({session.actionCount} Aktionen)
          </span>
          {showLog ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {showLog && (
          <div className="max-h-[250px] overflow-y-auto px-4 pb-3 space-y-1">
            {session.actionLog.length === 0 ? (
              <p className="text-[11px] text-zinc-600 py-2">Noch keine Aktionen...</p>
            ) : (
              session.actionLog.map((action, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 py-1.5 border-b border-[#1a1a24] last:border-0"
                >
                  <div className="mt-0.5">
                    {action.success ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-medium text-zinc-400 uppercase">
                        {action.type}
                      </span>
                      <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {action.durationMs}ms
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 truncate">{action.detail}</p>
                    {action.error && (
                      <p className="text-[10px] text-red-400 mt-0.5">{action.error}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="border-t border-[#2a2a3a] px-4 py-2 flex items-center justify-between bg-[#141418]">
        <div className="flex items-center gap-4 text-[10px] text-zinc-600">
          <span>{session.actionCount} Aktionen</span>
          <span>{session.screenshotCount} Screenshots</span>
        </div>
        <span className="text-[10px] text-zinc-700 font-mono">
          {new Date(session.createdAt).toLocaleTimeString("de-DE")}
        </span>
      </div>
    </div>
  );
}

/* ── Compact Session Preview (für Workflow Editor) ── */

export function ComputerSessionPreview({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<string>("loading");
  const [actionCount, setActionCount] = useState(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/workflows/computer-session/${sessionId}`);
        if (res.ok) {
          const data = await res.json() as SessionState;
          setStatus(data.status);
          setActionCount(data.actionCount);
        }
      } catch {
        setStatus("error");
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a3a] bg-[#141418] px-3 py-1.5">
      <Monitor className="h-3.5 w-3.5 text-pink-400" />
      <span className="text-[11px] text-zinc-400">
        {status === "active" ? (
          <span className="text-green-400 flex items-center gap-1">
            <Play className="h-2.5 w-2.5" /> Aktiv
          </span>
        ) : (
          status
        )}
      </span>
      <span className="text-[10px] text-zinc-600">{actionCount} Aktionen</span>
    </div>
  );
}
