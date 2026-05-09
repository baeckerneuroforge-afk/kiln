import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { cancelDeletionRequest } from "@/lib/dsgvo/delete-service";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const result = await cancelDeletionRequest({
      deletionId: params.id,
      orgId: scope.orgId,
      actorUserId: scope.userId,
    });
    if (!result) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    if (error instanceof Error && error.message.includes("cancel window closed")) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("[dsgvo/delete/cancel] failed", error);
    return Response.json({ error: "Cancel failed" }, { status: 500 });
  }
}
