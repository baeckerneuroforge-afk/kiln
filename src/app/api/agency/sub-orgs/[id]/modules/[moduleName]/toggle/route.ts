import { NextRequest } from "next/server";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";
import { toggleModuleActive } from "@/lib/modules/store";
import { isModuleName } from "@/lib/modules/types";
import { logAudit } from "@/lib/audit/logger";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; moduleName: string } },
) {
  const auth = await requireSubOrgAccess(params.id);
  if (!auth.ok) return auth.response;

  if (!isModuleName(params.moduleName)) {
    return Response.json({ error: `Unknown module: ${params.moduleName}` }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body.isActive !== "boolean") {
    return Response.json({ error: "isActive boolean required" }, { status: 400 });
  }

  const row = await toggleModuleActive({
    subAccountId: auth.relationship.childOrgId,
    moduleName: params.moduleName,
    isActive: body.isActive,
  });

  await logAudit({
    orgId: auth.agencyOrgId,
    actorUserId: auth.userId,
    actorOrgId: auth.agencyOrgId,
    action: body.isActive ? "MODULE_ACTIVATED" : "MODULE_DEACTIVATED",
    resourceType: "SUB_ACCOUNT_MODULE_CONFIG",
    resourceId: row.id,
    description: `Module ${params.moduleName} for sub-account ${auth.relationship.childOrgId} ${body.isActive ? "activated" : "deactivated"}`,
    severity: "INFO",
    metadata: {
      subAccountId: auth.relationship.childOrgId,
      moduleName: params.moduleName,
      mode: row.mode,
      isActive: row.isActive,
    },
  });

  return Response.json({
    id: row.id,
    moduleName: row.moduleName,
    mode: row.mode,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
  });
}
