import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { recordInteraction } from "@/lib/customer-memory/writer";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function loadProfileInOrg(profileId: string, orgId: string) {
  return prisma.customerProfile.findFirst({ where: { id: profileId, orgId }, select: { id: true } });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const profile = await loadProfileInOrg(params.id, scope.orgId);
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    const entries = await prisma.customerMemoryEntry.findMany({
      where: { customerProfileId: profile.id },
      orderBy: [{ isActive: "desc" }, { importance: "desc" }, { createdAt: "desc" }],
    });
    return Response.json({ entries });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers/memory] list failed", error);
    return Response.json({ error: "Failed to load memory" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const profile = await loadProfileInOrg(params.id, scope.orgId);
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const summary = typeof body.content === "string" ? body.content : "";
    if (!summary.trim()) return Response.json({ error: "content required" }, { status: 400 });
    const entry = await recordInteraction({
      customerProfileId: profile.id,
      summary,
      type: typeof body.type === "string" ? body.type : "FACT",
      source: "MANUAL",
      importance: typeof body.importance === "number" ? body.importance : 5,
      expiresAt: typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null,
    });
    await prisma.customerProfileAudit.create({
      data: {
        customerProfileId: profile.id,
        orgId: scope.orgId,
        actorUserId: scope.userId,
        action: "MEMORY_ADD",
        details: { entryId: entry.id, type: entry.type },
      },
    });
    return Response.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers/memory] create failed", error);
    return Response.json({ error: "Failed to add memory" }, { status: 500 });
  }
}
