import { NextRequest } from "next/server";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";
import { ensureDefaultModuleConfigs, listModuleConfigs } from "@/lib/modules/store";
import { MODULE_NAMES } from "@/lib/modules/types";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSubOrgAccess(params.id);
  if (!auth.ok) return auth.response;

  // Backfill default rows on first read so the UI sees all 4 module slots.
  await ensureDefaultModuleConfigs(auth.relationship.childOrgId);

  const configs = await listModuleConfigs(auth.relationship.childOrgId);
  return Response.json({
    subAccountId: auth.relationship.childOrgId,
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
