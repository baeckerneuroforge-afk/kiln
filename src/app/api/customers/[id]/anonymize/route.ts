import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { anonymizeCustomerProfile } from "@/lib/customer-memory/dsgvo";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const profile = await prisma.customerProfile.findFirst({
      where: { id: params.id, orgId: scope.orgId },
    });
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    const updated = await anonymizeCustomerProfile({
      orgId: scope.orgId,
      customerProfileId: profile.id,
      actorUserId: scope.userId,
    });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers/anonymize] failed", error);
    return Response.json({ error: "Anonymize failed" }, { status: 500 });
  }
}
