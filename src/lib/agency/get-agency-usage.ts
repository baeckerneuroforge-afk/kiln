/**
 * Sprint 19.7.5 — aggregate per-sub-org usage for the active agency.
 *
 * Joins OrgRelationship (one row per sub-org) with LlmUsage +
 * Conversation counts. The window is configurable (period token: week
 * /month/custom). Returns one row per ACTIVE sub-org plus the agency
 * totals — the dashboard renders both.
 *
 * Numbers come from raw LlmUsage so they include every model call the
 * sub-org made, regardless of whether the agency or the sub-org paid
 * for it (cost-display toggling happens at the UI layer).
 */
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export type AgencyUsagePeriod = "week" | "month" | "custom";

export interface SubOrgUsageRow {
  subOrgId: string;          // OrgRelationship.id (CUID)
  clerkOrgId: string;        // OrgRelationship.childOrgId
  subOrgName: string;
  subOrgStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  conversationCount: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
}

export interface AgencyUsage {
  period: AgencyUsagePeriod;
  since: Date;
  until: Date;
  totals: Omit<SubOrgUsageRow, "subOrgId" | "clerkOrgId" | "subOrgName" | "subOrgStatus">;
  perSubOrg: SubOrgUsageRow[];
}

type PrismaLike = Pick<PrismaClient, "orgRelationship" | "llmUsage" | "conversation">;

export interface AgencyUsageArgs {
  agencyOrgId: string;
  period?: AgencyUsagePeriod;
  /** Custom window. When set, `period` is forced to "custom". */
  since?: Date;
  until?: Date;
}

function periodWindow(period: AgencyUsagePeriod): { since: Date; until: Date } {
  const until = new Date();
  const since = new Date(until);
  if (period === "week") since.setUTCDate(since.getUTCDate() - 7);
  else since.setUTCDate(since.getUTCDate() - 30);
  return { since, until };
}

export async function getAgencyUsage(
  args: AgencyUsageArgs,
  prisma: PrismaLike = defaultPrisma,
): Promise<AgencyUsage> {
  const periodLabel: AgencyUsagePeriod = args.since && args.until ? "custom" : args.period ?? "month";
  const { since, until } =
    args.since && args.until ? { since: args.since, until: args.until } : periodWindow(periodLabel);

  // List every sub-org under the agency. Archived ones are included so
  // historic spend stays visible; the UI dims them.
  const relationships = await prisma.orgRelationship.findMany({
    where: { parentOrgId: args.agencyOrgId },
    select: {
      id: true,
      childOrgId: true,
      subOrgName: true,
      subOrgStatus: true,
    },
  });
  const clerkOrgIds = relationships.map((r) => r.childOrgId);

  if (clerkOrgIds.length === 0) {
    return {
      period: periodLabel,
      since,
      until,
      totals: {
        conversationCount: 0,
        llmCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costUsd: 0,
      },
      perSubOrg: [],
    };
  }

  const [usageRows, convCounts] = await Promise.all([
    // groupBy aggregates LlmUsage by org id in one round-trip, keeping
    // the table-of-sub-orgs page snappy even at hundreds of clients.
    prisma.llmUsage.groupBy({
      by: ["orgId"],
      where: {
        orgId: { in: clerkOrgIds },
        createdAt: { gte: since, lte: until },
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cachedInputTokens: true,
        costUsd: true,
      },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ["orgId"],
      where: {
        orgId: { in: clerkOrgIds },
        createdAt: { gte: since, lte: until },
      },
      _count: { _all: true },
    }),
  ]);

  const usageByOrg = new Map(usageRows.map((row) => [row.orgId, row]));
  const convByOrg = new Map(convCounts.map((row) => [row.orgId, row._count._all]));

  const perSubOrg: SubOrgUsageRow[] = relationships.map((rel) => {
    const usage = usageByOrg.get(rel.childOrgId);
    return {
      subOrgId: rel.id,
      clerkOrgId: rel.childOrgId,
      subOrgName: rel.subOrgName,
      subOrgStatus: rel.subOrgStatus,
      conversationCount: convByOrg.get(rel.childOrgId) ?? 0,
      llmCalls: usage?._count._all ?? 0,
      inputTokens: usage?._sum.inputTokens ?? 0,
      outputTokens: usage?._sum.outputTokens ?? 0,
      cachedInputTokens: usage?._sum.cachedInputTokens ?? 0,
      costUsd: Number(usage?._sum.costUsd ?? 0),
    };
  });

  const totals = perSubOrg.reduce(
    (acc, row) => {
      acc.conversationCount += row.conversationCount;
      acc.llmCalls += row.llmCalls;
      acc.inputTokens += row.inputTokens;
      acc.outputTokens += row.outputTokens;
      acc.cachedInputTokens += row.cachedInputTokens;
      acc.costUsd += row.costUsd;
      return acc;
    },
    {
      conversationCount: 0,
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costUsd: 0,
    },
  );

  return { period: periodLabel, since, until, totals, perSubOrg };
}

export function toCsv(usage: AgencyUsage): string {
  const lines: string[] = [];
  lines.push(
    [
      "Sub-Org",
      "Status",
      "Conversations",
      "LLM-Calls",
      "Input-Tokens",
      "Output-Tokens",
      "Cached-Tokens",
      "Kosten (USD)",
    ].join(","),
  );
  for (const row of usage.perSubOrg) {
    lines.push(
      [
        // CSV-escape names that contain commas / quotes.
        `"${row.subOrgName.replace(/"/g, '""')}"`,
        row.subOrgStatus,
        row.conversationCount,
        row.llmCalls,
        row.inputTokens,
        row.outputTokens,
        row.cachedInputTokens,
        row.costUsd.toFixed(6),
      ].join(","),
    );
  }
  return lines.join("\n");
}
