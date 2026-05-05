"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Check,
  X,
  AlertTriangle,
  FileText,
  Shield,
  Loader2,
  RefreshCw,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

interface Approval {
  id: string;
  actionType: string;
  actionSummary: string;
  requestedAt: string;
  agent?: { name: string };
}

type NotificationType = "approval" | "alert" | "report";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  approvalId?: string;
  severity?: "info" | "warning" | "critical";
}

// ── Main Component ───────────────────────────────────────────

export function MobileNotifications() {
  const [, setApprovals] = useState<Approval[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | NotificationType>("all");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      if (res.ok) {
        const data = await res.json();
        const approvalList: Approval[] = data.approvals || [];
        setApprovals(approvalList);

        // Map approvals to notification items
        const approvalNotifs: NotificationItem[] = approvalList.map((a) => ({
          id: `approval_${a.id}`,
          type: "approval" as const,
          title: `Genehmigung erforderlich: ${a.actionType}`,
          body: a.actionSummary,
          timestamp: a.requestedAt,
          read: false,
          approvalId: a.id,
        }));

        setNotifications(approvalNotifs);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleApprovalAction = async (approvalId: string, action: "approve" | "reject") => {
    setProcessing(approvalId);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
        setNotifications((prev) => prev.filter((n) => n.approvalId !== approvalId));
      }
    } catch {
      // ignore
    } finally {
      setProcessing(null);
    }
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const filteredNotifications =
    activeFilter === "all"
      ? notifications
      : notifications.filter((n) => n.type === activeFilter);

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-kiln-orange" />
          <h1 className="font-serif text-xl text-foreground">Benachrichtigungen</h1>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-kiln-ember px-1.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              title="Alle gelesen"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2">
        {(["all", "approval", "alert", "report"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeFilter === filter
                ? "bg-kiln-orange/15 text-kiln-orange"
                : "bg-card border border-border text-muted-foreground active:text-foreground"
            )}
          >
            {filter === "all" ? "Alle" : filter === "approval" ? "Genehmigungen" : filter === "alert" ? "Alerts" : "Berichte"}
          </button>
        ))}
      </div>

      {/* Notification List */}
      {filteredNotifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Keine Benachrichtigungen</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              processing={processing === notification.approvalId}
              onApprove={
                notification.approvalId
                  ? () => handleApprovalAction(notification.approvalId!, "approve")
                  : undefined
              }
              onReject={
                notification.approvalId
                  ? () => handleApprovalAction(notification.approvalId!, "reject")
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notification Card ───────────────────────────────────────

function NotificationCard({
  notification,
  processing,
  onApprove,
  onReject,
}: {
  notification: NotificationItem;
  processing: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const iconMap: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
    approval: Shield,
    alert: AlertTriangle,
    report: FileText,
  };
  const Icon = iconMap[notification.type];

  const colorMap: Record<NotificationType, string> = {
    approval: "text-kiln-orange border-kiln-orange/20",
    alert: "text-yellow-400 border-yellow-500/20",
    report: "text-kiln-blue border-kiln-blue/20",
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        notification.read ? "opacity-60" : "",
        colorMap[notification.type] || "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-card border border-border">
          <Icon className={cn("h-4 w-4", colorMap[notification.type]?.split(" ")[0])} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">{notification.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {new Date(notification.timestamp).toLocaleString("de-DE")}
          </div>
        </div>
      </div>

      {/* Approval Actions */}
      {notification.type === "approval" && onApprove && onReject && (
        <div className="flex gap-2 mt-3 ml-12">
          <button
            onClick={onApprove}
            disabled={processing}
            className="flex items-center gap-1 rounded-lg bg-kiln-green/10 px-3 py-2 text-xs font-medium text-kiln-green active:bg-kiln-green/20 transition-colors disabled:opacity-50"
          >
            {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Genehmigen
          </button>
          <button
            onClick={onReject}
            disabled={processing}
            className="flex items-center gap-1 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 active:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Ablehnen
          </button>
        </div>
      )}
    </div>
  );
}
