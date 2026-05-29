import { prisma } from "@/lib/prisma";
import { createAgencyOpsSnapshot } from "@/lib/operations/aggregation";
import { verifyCronSecret } from "@/lib/api-auth";

export async function POST(req: Request) {
  if (!verifyCronSecret(req)) {
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
