import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { deleteCustomerProfile } from "@/lib/customer-memory/dsgvo";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function loadOrgScopedProfile(id: string, orgId: string) {
  return prisma.customerProfile.findFirst({ where: { id, orgId } });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const profile = await loadOrgScopedProfile(params.id, scope.orgId);
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    const memoryEntries = await prisma.customerMemoryEntry.findMany({
      where: { customerProfileId: profile.id },
      orderBy: [{ isActive: "desc" }, { importance: "desc" }, { createdAt: "desc" }],
    });
    const channelMessages = await prisma.departmentChannelMessage.findMany({
      where: { customerProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return Response.json({ profile, memoryEntries, channelMessages });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers] get failed", error);
    return Response.json({ error: "Failed to load customer" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const profile = await loadOrgScopedProfile(params.id, scope.orgId);
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const data: Prisma.CustomerProfileUpdateInput = {};
    if (typeof body.fullName === "string" || body.fullName === null) data.fullName = body.fullName;
    if (typeof body.preferences === "object" && body.preferences !== null) data.preferences = body.preferences as Prisma.InputJsonValue;
    if (typeof body.metadata === "object" && body.metadata !== null) data.metadata = body.metadata as Prisma.InputJsonValue;
    if (typeof body.consentGiven === "boolean") {
      data.consentGiven = body.consentGiven;
      data.consentGivenAt = body.consentGiven ? new Date() : null;
    }

    const updated = await prisma.customerProfile.update({
      where: { id: profile.id },
      data,
    });
    await prisma.customerProfileAudit.create({
      data: {
        customerProfileId: updated.id,
        orgId: scope.orgId,
        actorUserId: scope.userId,
        action: "UPDATE",
        details: Object.keys(data) as unknown as Prisma.InputJsonValue,
      },
    });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers] patch failed", error);
    return Response.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const profile = await loadOrgScopedProfile(params.id, scope.orgId);
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    await deleteCustomerProfile({
      orgId: scope.orgId,
      customerProfileId: profile.id,
      actorUserId: scope.userId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers] delete failed", error);
    return Response.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
