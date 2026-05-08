"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { CustomerHealth } from "@/lib/operations/types";
import { cn } from "@/lib/utils";

function relativeTime(timestamp: string | null): string {
  if (!timestamp) return "No activity yet";
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function CustomerHealthCard({ customer }: { customer: CustomerHealth }) {
  const tone =
    customer.status === "CRITICAL"
      ? "border-red-500/40 bg-red-500/5 text-red-400"
      : customer.status === "NEEDS_ATTENTION"
      ? "border-amber-500/40 bg-amber-500/5 text-amber-400"
      : "border-emerald-500/30 bg-emerald-500/5 text-emerald-400";

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-kiln-orange/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {customer.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={customer.logoUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
              {customer.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">{customer.name}</h3>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              <span>{relativeTime(customer.lastActivityAt)}</span>
            </div>
          </div>
        </div>
        <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]", tone)}>
          {customer.status.replace("_", " ")}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-md bg-muted/40 p-2">
          <p className="font-semibold text-foreground">{customer.approvalsPending}</p>
          <p className="text-xs text-muted-foreground">Approvals</p>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <p className="font-semibold text-foreground">{customer.activeDepartments}</p>
          <p className="text-xs text-muted-foreground">Depts</p>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <p className="font-semibold text-foreground">{customer.failedRuns24h}</p>
          <p className="text-xs text-muted-foreground">Failed</p>
        </div>
      </div>
      <Link
        href={customer.openHref}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-kiln-orange hover:text-kiln-orange/80"
      >
        Open customer <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
