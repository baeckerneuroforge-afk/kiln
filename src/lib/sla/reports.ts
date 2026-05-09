import { prisma } from "@/lib/prisma";

export interface ComplianceReport {
  windowDays: number;
  total: number;
  met: number;
  breached: number;
  open: number;
  warning: number;
  cancelled: number;
  compliancePercent: number;
  avgFirstResponseMinutes: number | null;
}

/**
 * Computes SLA compliance over the past `windowDays` days for a single org.
 * Compliance percent = (MET) / (MET + BREACHED), excluding still-open or
 * cancelled rows.
 */
export async function computeCompliance(args: {
  orgId: string;
  departmentId?: string;
  windowDays: number;
  now?: Date;
}): Promise<ComplianceReport> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - args.windowDays * 24 * 3_600_000);

  const where: Record<string, unknown> = {
    orgId: args.orgId,
    startedAt: { gte: since },
  };
  if (args.departmentId) where.departmentId = args.departmentId;

  const trackings = await prisma.slaTracking.findMany({
    where,
    select: {
      status: true,
      firstResponseMinutes: true,
    },
    take: 5_000,
  });

  let met = 0;
  let breached = 0;
  let open = 0;
  let warning = 0;
  let cancelled = 0;
  let firstResponseSum = 0;
  let firstResponseCount = 0;

  for (const tracking of trackings) {
    switch (tracking.status) {
      case "MET":
        met += 1;
        break;
      case "BREACHED":
        breached += 1;
        break;
      case "OPEN":
        open += 1;
        break;
      case "WARNING":
        warning += 1;
        break;
      case "CANCELLED":
        cancelled += 1;
        break;
      default:
        break;
    }
    if (typeof tracking.firstResponseMinutes === "number") {
      firstResponseSum += tracking.firstResponseMinutes;
      firstResponseCount += 1;
    }
  }

  const totalSettled = met + breached;
  const compliancePercent = totalSettled === 0 ? 100 : Math.round((met / totalSettled) * 100);
  const avgFirstResponseMinutes = firstResponseCount === 0 ? null : Math.round(firstResponseSum / firstResponseCount);

  return {
    windowDays: args.windowDays,
    total: trackings.length,
    met,
    breached,
    open,
    warning,
    cancelled,
    compliancePercent,
    avgFirstResponseMinutes,
  };
}

export interface RecentBreach {
  id: string;
  departmentId: string;
  startedAt: Date;
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  policyName: string;
  customerProfileId: string | null;
}

export async function listRecentBreaches(args: {
  orgId: string;
  limit?: number;
}): Promise<RecentBreach[]> {
  const rows = await prisma.slaTracking.findMany({
    where: { orgId: args.orgId, status: "BREACHED" },
    orderBy: { updatedAt: "desc" },
    take: Math.min(args.limit ?? 20, 100),
    include: { slaPolicy: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    startedAt: row.startedAt,
    firstResponseMinutes: row.firstResponseMinutes,
    resolutionMinutes: row.resolutionMinutes,
    policyName: row.slaPolicy.name,
    customerProfileId: row.customerProfileId,
  }));
}
