import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await requireOrgId();
    const department = await prisma.department.findFirst({
      where: { id: params.id, ...orgScopeFilter(scope) },
      select: { id: true },
    });
    if (!department) return Response.json({ error: "Not found" }, { status: 404 });

    const channel = request.nextUrl.searchParams.get("channel");
    const direction = request.nextUrl.searchParams.get("direction");
    const messages = await prisma.departmentChannelMessage.findMany({
      where: {
        departmentId: params.id,
        ...(channel === "EMAIL" || channel === "WHATSAPP" ? { channel } : {}),
        ...(direction === "INBOUND" || direction === "OUTBOUND" ? { direction } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return Response.json(messages);
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed to load channel messages" }, { status: 500 });
  }
}
