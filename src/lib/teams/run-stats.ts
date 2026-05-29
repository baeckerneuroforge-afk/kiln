import { prisma } from "@/lib/prisma";

/**
 * Per-team run statistics surfaced on the workflow list cards.
 *
 * Computed from TeamExecution records: totals, success/failure counts,
 * average duration of completed runs, and the most recent run's
 * timestamp + status. `null` durations / lastRun mean the workflow
 * has never run.
 */
export interface RunStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number | null;
  avgDurationMs: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

/**
 * Aggregates run stats for many teams without pulling every execution row
 * into memory.
 *
 * - Counts (total / completed / failed) are computed DB-side via groupBy.
 * - avgDurationMs needs per-row (completedAt - startedAt), so we fetch ONLY
 *   the COMPLETED rows that have a completedAt and average them in JS
 *   (identical rounding/filtering to the previous implementation).
 * - The latest run per team is a single `distinct` query ordered by startedAt.
 *
 * All three queries run concurrently. Output shape is byte-for-byte
 * compatible with the previous single-findMany + in-memory-filter version.
 */
export async function fetchRunStatsByTeamId(
  teamIds: string[],
): Promise<Map<string, RunStats>> {
  const result = new Map<string, RunStats>();
  if (teamIds.length === 0) return result;

  const [statusCounts, completedRuns, latestRuns] = await Promise.all([
    prisma.teamExecution.groupBy({
      by: ["teamId", "status"],
      where: { teamId: { in: teamIds } },
      _count: { _all: true },
    }),
    prisma.teamExecution.findMany({
      where: {
        teamId: { in: teamIds },
        status: "COMPLETED",
        completedAt: { not: null },
      },
      select: { teamId: true, startedAt: true, completedAt: true },
    }),
    prisma.teamExecution.findMany({
      where: { teamId: { in: teamIds } },
      distinct: ["teamId"],
      orderBy: { startedAt: "desc" },
      select: { teamId: true, status: true, startedAt: true },
    }),
  ]);

  const totalByTeam = new Map<string, number>();
  const completedByTeam = new Map<string, number>();
  const failedByTeam = new Map<string, number>();
  for (const row of statusCounts) {
    const count = row._count._all;
    totalByTeam.set(row.teamId, (totalByTeam.get(row.teamId) ?? 0) + count);
    if (row.status === "COMPLETED") completedByTeam.set(row.teamId, count);
    else if (row.status === "FAILED") failedByTeam.set(row.teamId, count);
  }

  // Sum + count of valid completed-run durations per team.
  const durationSumByTeam = new Map<string, number>();
  const durationCountByTeam = new Map<string, number>();
  for (const run of completedRuns) {
    if (!run.completedAt) continue;
    const ms = run.completedAt.getTime() - run.startedAt.getTime();
    if (!Number.isFinite(ms) || ms < 0) continue;
    durationSumByTeam.set(run.teamId, (durationSumByTeam.get(run.teamId) ?? 0) + ms);
    durationCountByTeam.set(run.teamId, (durationCountByTeam.get(run.teamId) ?? 0) + 1);
  }

  const latestByTeam = new Map(latestRuns.map((run) => [run.teamId, run]));

  for (const teamId of teamIds) {
    const total = totalByTeam.get(teamId) ?? 0;
    const completed = completedByTeam.get(teamId) ?? 0;
    const failed = failedByTeam.get(teamId) ?? 0;
    const durationCount = durationCountByTeam.get(teamId) ?? 0;
    const avgDurationMs =
      durationCount > 0
        ? Math.round((durationSumByTeam.get(teamId) ?? 0) / durationCount)
        : null;
    const lastRun = latestByTeam.get(teamId);

    result.set(teamId, {
      totalRuns: total,
      completedRuns: completed,
      failedRuns: failed,
      successRate: total > 0 ? completed / total : null,
      avgDurationMs,
      lastRunAt: lastRun?.startedAt?.toISOString() ?? null,
      lastRunStatus: lastRun?.status ?? null,
    });
  }

  return result;
}
