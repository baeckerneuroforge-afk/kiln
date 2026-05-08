"use client";

import type { CustomerHealth } from "@/lib/operations/types";
import { CustomerHealthCard } from "@/components/operations/customer-health-card";

export function CustomerHealthGrid({ customers }: { customers: CustomerHealth[] }) {
  const allHealthy = customers.length > 0 && customers.every((customer) => customer.status === "HEALTHY");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Customer Health</h2>
          <p className="text-sm text-muted-foreground">Live operating status across all managed sub-orgs.</p>
        </div>
        {allHealthy && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            All systems operational
          </span>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {customers.map((customer) => (
          <CustomerHealthCard key={customer.subOrgId} customer={customer} />
        ))}
      </div>
    </section>
  );
}
