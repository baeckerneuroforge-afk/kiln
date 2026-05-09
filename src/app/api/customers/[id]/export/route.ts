import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { exportCustomerProfile } from "@/lib/customer-memory/dsgvo";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const profile = await prisma.customerProfile.findFirst({
      where: { id: params.id, orgId: scope.orgId },
      select: { id: true },
    });
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    const payload = await exportCustomerProfile({
      orgId: scope.orgId,
      customerProfileId: profile.id,
      actorUserId: scope.userId,
    });
    return Response.json(payload, {
      headers: {
        "content-disposition": `attachment; filename="customer-${profile.id}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers/export] failed", error);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}
