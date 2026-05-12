import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deployTeamTemplate, getTeamTemplate } from "@/lib/team-templates";
import { resolveCreateTargetOrgId } from "@/lib/sub-org/resolve-create-target";

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, customization, subOrgId } = body;

    if (!templateId) {
      return Response.json({ error: "Template ID required" }, { status: 400 });
    }

    const template = getTeamTemplate(templateId);
    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    // Sprint 19.7.5 — resolve the Clerk org id we should stamp on the
    // AgentTeam + every Agent created during the long transaction.
    // Sub-org callers must hold workflows.write inside the sub-org.
    const resolved = await resolveCreateTargetOrgId({
      userId,
      defaultOrgId: orgId,
      subOrgId,
      requiredPermission: "workflows.write",
    });
    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    const result = await deployTeamTemplate(
      userId,
      template.id,
      customization,
      resolved.orgId,
    );
    return Response.json(
      { ...result, subOrgId: resolved.usedSubOrg?.subOrgId ?? null },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
