import {
  buildOperationsOverview,
  getFreshSnapshot,
  requireOperationsAccess,
  resolveTimeRange,
} from "@/lib/operations/aggregation";

export async function GET(req: Request) {
  try {
    const access = await requireOperationsAccess();
    const url = new URL(req.url);
    const range = resolveTimeRange(url.searchParams);

    if (!access.eligible) {
      return Response.json({
        eligible: false,
        reason: access.reason,
        agencyOrgId: access.agencyOrgId,
        agencyName: access.agencyName,
        timeRange: {
          key: range.key,
          start: range.start.toISOString(),
          end: range.end.toISOString(),
        },
        snapshot: { used: false, stale: false, computedAt: null },
        stats: {
          totalCustomers: access.customers.length,
          activeDepartments: 0,
          pendingApprovals: 0,
          failedRuns24h: 0,
          tokensUsed: 0,
          tokenCostEur: 0,
          revenueEur: 0,
        },
        customers: [],
        redirectTarget: access.redirectTarget,
      });
    }

    const snapshot = range.key === "today" ? await getFreshSnapshot(access.agencyOrgId) : null;
    if (snapshot?.used && snapshot.topStats && snapshot.customerHealth) {
      return Response.json({
        eligible: true,
        reason: "ok",
        agencyOrgId: access.agencyOrgId,
        agencyName: access.agencyName,
        timeRange: {
          key: range.key,
          start: range.start.toISOString(),
          end: range.end.toISOString(),
        },
        snapshot: {
          used: true,
          stale: false,
          computedAt: snapshot.computedAt,
        },
        stats: snapshot.topStats,
        customers: snapshot.customerHealth,
        redirectTarget: null,
      });
    }

    const overview = await buildOperationsOverview({
      agencyOrgId: access.agencyOrgId,
      agencyName: access.agencyName,
      customers: access.customers,
      range,
      eligible: true,
      reason: "ok",
      redirectTarget: null,
      snapshot: {
        used: false,
        stale: snapshot?.stale ?? false,
        computedAt: snapshot?.computedAt ?? null,
      },
    });
    return Response.json(overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthenticated" ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
