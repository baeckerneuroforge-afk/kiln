import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; msgId: string } }
) {
  try {
    const scope = await requireOrgId();
    const message = await prisma.departmentChannelMessage.findFirst({
      where: {
        id: params.msgId,
        departmentId: params.id,
        department: orgScopeFilter(scope),
      },
      include: { backlogItem: true },
    });

    if (!message) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(message);
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed to load channel message" }, { status: 500 });
  }
}
