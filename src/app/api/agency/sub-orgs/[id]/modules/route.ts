import { NextRequest } from "next/server";
import { requireSubOrgAccess } from "@/lib/permissions/require-sub-org-access";
import { ensureDefaultModuleConfigs, listModuleConfigs } from "@/lib/modules/store";
import { MODULE_NAMES } from "@/lib/modules/types";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireSubOrgAccess(params.id, {
    requiredAgencyRole: ["OWNER", "ADMIN", "CONSULTANT"],
  });
  if (!access.ok) return access.response;

  // Backfill default rows on first read so the UI sees all 4 module slots.
  await ensureDefaultModuleConfigs(access.relationship.childOrgId);

  const configs = await listModuleConfigs(access.relationship.childOrgId);
  return Response.json({
    subAccountId: access.relationship.childOrgId,
    configs: configs.map((row) => ({
      id: row.id,
      moduleName: row.moduleName,
      mode: row.mode,
      isActive: row.isActive,
      hasCredentials: !!row.encryptedCredentials,
      credentialsOwner: row.credentialsOwner,
      lastValidatedAt: row.lastValidatedAt,
      validationError: row.validationError,
      updatedAt: row.updatedAt,
    })),
    moduleNames: MODULE_NAMES,
  });
}
