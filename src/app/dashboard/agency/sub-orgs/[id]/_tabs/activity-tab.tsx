"use client";

/**
 * Activity tab — paginated audit log for the sub-org. Filter by
 * category; load more via the cursor returned from the endpoint.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity as ActivityIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  category: string;
  action: string;
  resourceId: string | null;
  resourceType: string | null;
  severity: string;
  createdAt: string;
  userId: string;
};

const CATEGORY_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "agent", label: "Agents" },
  { value: "workflow", label: "Workflows" },
  { value: "settings", label: "Settings" },
  { value: "approval", label: "Approvals" },
];

export function ActivityTab({ subOrgId }: { subOrgId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategory] = useState("");

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("limit", "50");
    if (category) sp.set("category", category);
    return sp.toString();
  }, [category]);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setItems([]);
    setCursor(null);
    const res = await fetch(
      `/api/agency/sub-orgs/${subOrgId}/activity?${queryString}`,
    );
    if (res.ok) {
      const body = await res.json();
      setItems(body.items || []);
      setCursor(body.nextCursor);
      setHasMore(Boolean(body.nextCursor));
    }
    setLoading(false);
  }, [subOrgId, queryString]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/agency/sub-orgs/${subOrgId}/activity?${queryString}&cursor=${cursor}`,
      );
      if (res.ok) {
        const body = await res.json();
        setItems((prev) => [...prev, ...(body.items || [])]);
        setCursor(body.nextCursor);
        setHasMore(Boolean(body.nextCursor));
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="activity-tab">
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORY_FILTERS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              category === c.value
                ? "border-kiln-orange bg-kiln-orange/10 text-kiln-orange"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card/60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
          <ActivityIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-foreground">No activity yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {items.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[12px_80px_1fr_auto] items-center gap-3 px-4 py-2.5 text-xs"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    e.severity === "critical"
                      ? "bg-red-400"
                      : e.severity === "warning"
                        ? "bg-amber-400"
                        : "bg-muted-foreground/60",
                  )}
                />
                <span className="text-muted-foreground capitalize">
                  {e.category}
                </span>
                <span
                  className="text-foreground truncate font-mono text-[10px]"
                  title={e.action}
                >
                  {e.action}
                  {e.resourceType && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({e.resourceType})
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {formatRel(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="border-t border-border px-4 py-2 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
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
