import { prisma } from "@/lib/prisma";
import { createAgencyOpsSnapshot } from "@/lib/operations/aggregation";

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agencies = await prisma.orgRelationship.findMany({
    where: { subOrgStatus: { not: "ARCHIVED" } },
    distinct: ["parentOrgId"],
    select: { parentOrgId: true },
  });

  const results: { agencyOrgId: string; ok: boolean; error?: string }[] = [];
  for (const agency of agencies) {
    try {
      await createAgencyOpsSnapshot(agency.parentOrgId);
      results.push({ agencyOrgId: agency.parentOrgId, ok: true });
    } catch (err) {
      results.push({
        agencyOrgId: agency.parentOrgId,
        ok: false,
        error: err instanceof Error ? err.message : "Snapshot refresh failed",
      });
    }
  }

  return Response.json({ refreshed: results.filter((result) => result.ok).length, results });
}
