/**
 * Sprint 20.2 — fetchRunStatsByTeamId (DB-aggregierte Run-Stats).
 *
 * Verifiziert, dass die groupBy-basierte Aggregation exakt die gleiche
 * RunStats-Struktur liefert wie die vorherige In-Memory-Variante.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const groupBy = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { teamExecution: { groupBy, findMany } },
}));

import { fetchRunStatsByTeamId } from "@/lib/teams/run-stats";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const sec = (s: number) => new Date(T0.getTime() + s * 1000);

beforeEach(() => {
  groupBy.mockReset();
  findMany.mockReset();
});

describe("fetchRunStatsByTeamId", () => {
  it("gibt eine leere Map für leere teamIds zurück (ohne DB-Calls)", async () => {
    const map = await fetchRunStatsByTeamId([]);
    expect(map.size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("aggregiert Counts, Durchschnittsdauer und letzten Run korrekt", async () => {
    groupBy.mockResolvedValue([
      { teamId: "t1", status: "COMPLETED", _count: { _all: 3 } },
      { teamId: "t1", status: "FAILED", _count: { _all: 1 } },
      { teamId: "t2", status: "COMPLETED", _count: { _all: 1 } },
      { teamId: "t2", status: "QUEUED", _count: { _all: 2 } },
    ]);

    findMany.mockImplementation((args: { distinct?: unknown }) => {
      if (args.distinct) {
        // latest run per team (orderBy startedAt desc, distinct teamId)
        return Promise.resolve([
          { teamId: "t1", status: "FAILED", startedAt: sec(100) },
          { teamId: "t2", status: "COMPLETED", startedAt: sec(50) },
        ]);
      }
      // completed runs with completedAt for avg duration
      return Promise.resolve([
        { teamId: "t1", startedAt: sec(0), completedAt: sec(1) }, // 1000ms
        { teamId: "t1", startedAt: sec(0), completedAt: sec(2) }, // 2000ms
        { teamId: "t1", startedAt: sec(0), completedAt: sec(3) }, // 3000ms
        // negative duration → muss ausgefiltert werden (kein Einfluss auf avg)
        { teamId: "t1", startedAt: sec(10), completedAt: sec(9) },
        { teamId: "t2", startedAt: sec(0), completedAt: new Date(T0.getTime() + 500) }, // 500ms
      ]);
    });

    const map = await fetchRunStatsByTeamId(["t1", "t2", "t3"]);

    expect(map.get("t1")).toEqual({
      totalRuns: 4,
      completedRuns: 3,
      failedRuns: 1,
      successRate: 0.75,
      avgDurationMs: 2000,
      lastRunAt: sec(100).toISOString(),
      lastRunStatus: "FAILED",
    });

    expect(map.get("t2")).toEqual({
      totalRuns: 3,
      completedRuns: 1,
      failedRuns: 0,
      successRate: 1 / 3,
      avgDurationMs: 500,
      lastRunAt: sec(50).toISOString(),
      lastRunStatus: "COMPLETED",
    });

    // t3: in der Liste, aber ohne Executions → Null-Stats
    expect(map.get("t3")).toEqual({
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      successRate: null,
      avgDurationMs: null,
      lastRunAt: null,
      lastRunStatus: null,
    });
  });

  it("scoped die Aggregations-Queries auf die übergebenen teamIds", async () => {
    groupBy.mockResolvedValue([]);
    findMany.mockResolvedValue([]);

    await fetchRunStatsByTeamId(["a", "b"]);

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: { in: ["a", "b"] } } }),
    );
    // eine der findMany-Queries filtert auf COMPLETED + completedAt not null
    const completedCall = findMany.mock.calls.find(
      ([args]) => (args as { where?: { status?: string } }).where?.status === "COMPLETED",
    );
    expect(completedCall).toBeTruthy();
  });
});
