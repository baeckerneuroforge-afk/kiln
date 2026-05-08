"use client";

import Link from "next/link";
import { ArrowRight, CheckSquare } from "lucide-react";
import type { CrossCustomerApproval } from "@/lib/operations/types";

export function ApprovalsCrossQueue({ approvals }: { approvals: CrossCustomerApproval[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Approvals Queue</h2>
          <p className="text-sm text-muted-foreground">Newest customer drafts awaiting a human decision.</p>
        </div>
        <Link href="/dashboard/departments" className="text-sm font-medium text-kiln-orange hover:text-kiln-orange/80">
          View all
        </Link>
      </div>
      <div className="divide-y divide-border">
        {approvals.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-8 text-sm text-muted-foreground">
            <CheckSquare className="h-4 w-4" />
            No pending approvals across customers.
          </div>
        ) : (
          approvals.map((approval) => (
            <Link
              key={approval.id}
              href={approval.href}
              className="grid gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40 md:grid-cols-[1fr_1fr_80px_32px]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{approval.customerName}</p>
                <p className="truncate text-muted-foreground">{approval.departmentName} · {approval.channel}</p>
              </div>
              <p className="min-w-0 truncate text-muted-foreground">{approval.draftPreview}</p>
              <p className="text-amber-400">{approval.waitMinutes}m</p>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
