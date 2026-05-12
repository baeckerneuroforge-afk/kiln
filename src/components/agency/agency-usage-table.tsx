"use client";

/**
 * Sprint 19.7.5 — sortable table of per-sub-org usage. Server passes in
 * the snapshot; this component only handles client-side sort + the
 * period selector + the CSV download button.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgencyUsage, SubOrgUsageRow } from "@/lib/agency/get-agency-usage";

type Period = "week" | "month";

type SortKey =
  | "subOrgName"
  | "conversationCount"
  | "llmCalls"
  | "inputTokens"
  | "outputTokens"
  | "costUsd";

interface Props {
  usage: AgencyUsage;
  period: Period;
}

const FORMAT_NUMBER = new Intl.NumberFormat("de-DE");

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AgencyUsageTable({ usage, period }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("costUsd");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const copy = [...usage.perSubOrg];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : (av as number) - (bv as number);
      return direction === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [usage.perSubOrg, sortKey, direction]);

  function clickHeader(key: SortKey) {
    if (sortKey === key) {
      setDirection(direction === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setDirection("desc");
    }
  }

  return (
    <div data-testid="agency-usage-table">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-card/40 p-1 text-xs">
          <Link
            href="/dashboard/agency/usage?period=week"
            className={cn(
              "rounded px-2.5 py-1",
              period === "week"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="agency-usage-period-week"
          >
            7 Tage
          </Link>
          <Link
            href="/dashboard/agency/usage?period=month"
            className={cn(
              "rounded px-2.5 py-1",
              period === "month"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="agency-usage-period-month"
          >
            30 Tage
          </Link>
        </div>
        <a
          href={`/api/agency/usage?period=${period}&format=csv`}
          className={buttonVariants({ variant: "outline" })}
          data-testid="agency-usage-export-csv"
        >
          <Download className="mr-1 h-4 w-4" /> CSV-Export
        </a>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sub-Orgs" value={usage.perSubOrg.length} />
        <StatCard label="Conversations" value={FORMAT_NUMBER.format(usage.totals.conversationCount)} />
        <StatCard label="LLM-Calls" value={FORMAT_NUMBER.format(usage.totals.llmCalls)} />
        <StatCard label="Kosten" value={formatUsd(usage.totals.costUsd)} />
      </section>

      {rows.length === 0 ? (
        <p
          className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center text-sm text-muted-foreground"
          data-testid="agency-usage-empty"
        >
          Noch keine Sub-Orgs angelegt.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm" data-testid="agency-usage-rows">
            <thead className="border-b border-border bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <SortableHeader label="Sub-Org" sortKey="subOrgName" current={sortKey} direction={direction} onClick={clickHeader} align="left" />
                <SortableHeader label="Conversations" sortKey="conversationCount" current={sortKey} direction={direction} onClick={clickHeader} align="right" />
                <SortableHeader label="LLM-Calls" sortKey="llmCalls" current={sortKey} direction={direction} onClick={clickHeader} align="right" />
                <SortableHeader label="Input-Tokens" sortKey="inputTokens" current={sortKey} direction={direction} onClick={clickHeader} align="right" />
                <SortableHeader label="Output-Tokens" sortKey="outputTokens" current={sortKey} direction={direction} onClick={clickHeader} align="right" />
                <SortableHeader label="Kosten" sortKey="costUsd" current={sortKey} direction={direction} onClick={clickHeader} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.subOrgId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  current,
  direction,
  onClick,
  align,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  direction: "asc" | "desc";
  onClick: (key: SortKey) => void;
  align: "left" | "right";
}) {
  const active = current === sortKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : null;
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 font-semibold",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "justify-end",
        )}
        data-testid={`agency-usage-sort-${sortKey}`}
      >
        {label}
        {Icon && <Icon className="h-3 w-3" />}
      </button>
    </th>
  );
}

function Row({ row }: { row: SubOrgUsageRow }) {
  const archived = row.subOrgStatus !== "ACTIVE";
  return (
    <tr
      className={cn("border-b border-border/70 last:border-b-0", archived && "opacity-60")}
      data-testid={`agency-usage-row-${row.subOrgId}`}
    >
      <td className="px-3 py-2">
        <Link
          href={`/dashboard/sub-org/${row.subOrgId}/analytics`}
          className="text-foreground hover:text-kiln-orange"
        >
          {row.subOrgName}
        </Link>
        {archived && (
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {row.subOrgStatus}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{FORMAT_NUMBER.format(row.conversationCount)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{FORMAT_NUMBER.format(row.llmCalls)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{FORMAT_NUMBER.format(row.inputTokens)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{FORMAT_NUMBER.format(row.outputTokens)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatUsd(row.costUsd)}</td>
    </tr>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <p className="mt-1 font-serif text-2xl text-foreground">{value}</p>
    </div>
  );
}
