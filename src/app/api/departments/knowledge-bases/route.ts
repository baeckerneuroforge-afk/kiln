import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scope = await requireOrgId();
    const knowledgeBases = await prisma.knowledgeBase.findMany({
      where: {
        OR: [
          { orgId: scope.orgId },
          {
            orgId: null,
            agent: { userId: scope.userId, orgId: null },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sourceName: true,
        chunkCount: true,
        type: true,
        embeddingStatus: true,
      },
    });
    return Response.json(knowledgeBases);
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json(
      { error: "Failed to list knowledge bases" },
      { status: 500 }
    );
  }
}
