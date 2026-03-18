"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  MessageSquare,
  X,
  Send,
  Trash2,
  User,
  Zap,
  Edit3,
  Play,
  History,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Node Comment Types ── */

export interface NodeComment {
  id: string;
  text: string;
  author: string;
  authorName?: string;
  createdAt: string;
}

/* ── Activity Feed Types ── */

export interface WorkflowActivity {
  id: string;
  type: "execution" | "config_change" | "comment" | "version_save" | "rollback";
  title: string;
  detail?: string;
  author?: string;
  authorName?: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

/* ── Node Comment Popover ── */

export function NodeCommentPopover({
  nodeId,
  nodeLabel,
  comments,
  onAdd,
  onDelete,
  onClose,
  position,
}: {
  nodeId: string;
  nodeLabel: string;
  comments: NodeComment[];
  onAdd: (nodeId: string, text: string) => void;
  onDelete: (nodeId: string, commentId: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(nodeId, trimmed);
    setText("");
  };

  return (
    <div
      className="fixed z-50 w-72 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-medium text-zinc-200">{nodeLabel}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Comments list */}
      <div className="max-h-48 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-zinc-500">No comments yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {comments.map((comment) => (
              <div key={comment.id} className="group px-3 py-2.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5">
                    <User className="h-2.5 w-2.5 text-zinc-600" />
                    <span className="text-[10px] font-medium text-zinc-400">
                      {comment.authorName || "User"}
                    </span>
                    <span className="text-[9px] text-zinc-600">
                      {relativeTime(comment.createdAt)}
                    </span>
                  </div>
                  <button
                    onClick={() => onDelete(nodeId, comment.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-zinc-600 hover:text-red-400"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-300 leading-relaxed">{comment.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-2.5">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 px-2.5 py-1.5 outline-none focus:border-amber-500/60 placeholder:text-zinc-600"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onClose();
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Comment Badge (shown on node in visual editor) ── */

export function CommentBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute -top-2 -right-2 z-10 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1",
        "bg-amber-500 text-[9px] font-bold text-zinc-900",
        "shadow-lg shadow-amber-500/30 transition-transform hover:scale-110"
      )}
    >
      {count}
    </button>
  );
}

/* ── Activity Feed ── */

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

const activityIcons: Record<WorkflowActivity["type"], React.ElementType> = {
  execution: Play,
  config_change: Edit3,
  comment: MessageCircle,
  version_save: History,
  rollback: History,
};

const activityColors: Record<WorkflowActivity["type"], string> = {
  execution: "text-green-400 bg-green-500/10",
  config_change: "text-orange-400 bg-orange-500/10",
  comment: "text-amber-400 bg-amber-500/10",
  version_save: "text-blue-400 bg-blue-500/10",
  rollback: "text-violet-400 bg-violet-500/10",
};

export function WorkflowActivityFeed({
  teamId,
}: {
  teamId: string;
}) {
  const [activities, setActivities] = useState<WorkflowActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/activity`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-medium text-zinc-100">Activity</h3>
        </div>
        <button
          onClick={fetchActivity}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 py-10 text-center">
          <Zap className="mb-3 h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-400">No activity yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {activities.map((activity) => {
            const Icon = activityIcons[activity.type];
            const colorClass = activityColors[activity.type];

            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-800/30"
              >
                <div className={cn("mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg", colorClass)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-200">{activity.title}</p>
                  {activity.detail && (
                    <p className="mt-0.5 text-[10px] text-zinc-500">{activity.detail}</p>
                  )}
                </div>
                <span className="flex-shrink-0 text-[10px] text-zinc-600">
                  {relativeTime(activity.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Workflow Changelog ── */

export function WorkflowChangelog({
  teamId,
}: {
  teamId: string;
}) {
  const [entries, setEntries] = useState<Array<{
    version: number;
    changelog: string;
    note: string | null;
    createdAt: string;
    createdBy: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/teams/${teamId}/versions`)
      .then((r) => r.json())
      .then((data) => setEntries(data.versions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-800/60" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-zinc-500 text-center py-6">No changelog entries</p>
    );
  }

  // Group by date
  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) {
    const date = new Date(entry.createdAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(entry);
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([date, dayEntries]) => (
        <div key={date}>
          <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            {date}
          </h4>
          <div className="space-y-1.5">
            {dayEntries.map((entry) => (
              <div
                key={entry.version}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2 bg-zinc-800/20"
              >
                <span className="mt-0.5 text-[10px] font-mono text-zinc-500">
                  v{entry.version}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300">{entry.changelog}</p>
                  {entry.note && (
                    <p className="mt-0.5 text-[10px] text-zinc-500 italic">
                      &quot;{entry.note}&quot;
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-zinc-600">
                  {new Date(entry.createdAt).toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
