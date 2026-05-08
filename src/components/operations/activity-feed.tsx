"use client";

import Link from "next/link";
import { Activity, AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ActivityFeedItem } from "@/lib/operations/types";

function iconFor(severity: ActivityFeedItem["severity"]) {
  if (severity === "critical") return <AlertCircle className="h-4 w-4 text-red-400" />;
  if (severity === "warning") return <TriangleAlert className="h-4 w-4 text-amber-400" />;
  if (severity === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

function relativeTime(timestamp: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed({ events }: { events: ActivityFeedItem[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">Recent Activity</h2>
        <p className="text-sm text-muted-foreground">Last 20 cross-customer department events.</p>
      </div>
      <div className="divide-y divide-border">
        {events.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-8 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            No activity yet.
          </div>
        ) : (
          events.map((event) => (
            <Link key={event.id} href={event.href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
              <span className="mt-0.5">{iconFor(event.severity)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{event.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{event.description}</span>
              </span>
              <span className="text-xs text-muted-foreground">{relativeTime(event.timestamp)}</span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
