import { NextRequest } from "next/server";
// Sprint 20.1 — configuring a module writes credentials + mode; OWNER/ADMIN only.
import { requireAgencyMutation } from "@/lib/agency/require-agency-mutation";
import { findModuleConfig, upsertModuleConfig } from "@/lib/modules/store";
import {
  isModuleMode,
  isModuleName,
  type ModuleCredentials,
} from "@/lib/modules/types";
import { logAudit } from "@/lib/audit/logger";
import {
  addModuleSubscriptionItem,
  removeModuleSubscriptionItem,
} from "@/lib/billing/module-billing";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; moduleName: string } },
) {
  const auth = await requireAgencyMutation(params.id);
  if (!auth.ok) return auth.response;

  if (!isModuleName(params.moduleName)) {
    return Response.json({ error: `Unknown module: ${params.moduleName}` }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  if (!isModuleMode(body.mode)) {
    return Response.json({ error: "mode must be pool | byok_agency | byok_customer" }, { status: 400 });
  }

  // Credentials are required for both BYOK modes; rejected outright for pool.
  let credentials: ModuleCredentials | null = null;
  if (body.mode !== "pool") {
    if (!body.credentials || typeof body.credentials !== "object") {
      return Response.json({ error: "credentials object is required for BYOK modes" }, { status: 400 });
    }
    credentials = body.credentials as ModuleCredentials;
    const shapeError = validateCredentialsShape(params.moduleName, credentials as unknown as Record<string, unknown>);
    if (shapeError) {
      return Response.json({ error: shapeError }, { status: 400 });
    }
  } else if (body.credentials) {
    return Response.json({ error: "credentials must not be provided in pool mode" }, { status: 400 });
  }

  const credentialsOwner = typeof body.credentialsOwner === "string" ? body.credentialsOwner.trim() : null;
  if (body.mode !== "pool" && !credentialsOwner) {
    return Response.json({ error: "credentialsOwner is required for BYOK modes" }, { status: 400 });
  }

  const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

  // Snapshot the previous row so we can decide whether billing state
  // needs to flip pool→BYOK (remove item) or BYOK→pool (add item).
  const previousRow = await findModuleConfig({
    subAccountId: auth.relationship.childOrgId,
    moduleName: params.moduleName,
  });

  const row = await upsertModuleConfig({
    subAccountId: auth.relationship.childOrgId,
    moduleName: params.moduleName,
    mode: body.mode,
    credentials,
    credentialsOwner,
    isActive,
  });

  // Stripe sync — best-effort, never blocks the API response. The DB row
  // is the source of truth; failures are audited (MODULE_BILLING_SYNC_FAILED)
  // or skipped (MODULE_BILLING_SKIPPED) inside module-billing.ts.
  try {
    const wasPoolActive = previousRow?.mode === "pool" && previousRow?.isActive === true;
    const isNowPoolActive = row.mode === "pool" && row.isActive === true;

    if (!wasPoolActive && isNowPoolActive) {
      await addModuleSubscriptionItem({
        agencyOrgId: auth.agencyOrgId,
        subAccountId: auth.relationship.childOrgId,
        moduleName: params.moduleName,
      });
    } else if (wasPoolActive && !isNowPoolActive) {
      await removeModuleSubscriptionItem({
        agencyOrgId: auth.agencyOrgId,
        subAccountId: auth.relationship.childOrgId,
        moduleName: params.moduleName,
      });
    }
  } catch (err) {
    console.error("[modules/configure] billing sync threw unexpectedly", err);
  }

  await logAudit({
    orgId: auth.agencyOrgId,
    actorUserId: auth.userId,
    actorOrgId: auth.agencyOrgId,
    action: "MODULE_CONFIG_UPDATED",
    resourceType: "SUB_ACCOUNT_MODULE_CONFIG",
    resourceId: row.id,
    description: `Module ${params.moduleName} for sub-account ${auth.relationship.childOrgId} set to ${body.mode}`,
    severity: body.mode === "pool" ? "INFO" : "WARN",
    metadata: {
      subAccountId: auth.relationship.childOrgId,
      moduleName: params.moduleName,
      mode: body.mode,
      isActive: row.isActive,
      credentialsOwner: credentialsOwner ?? null,
    },
  });

  return Response.json({
    id: row.id,
    moduleName: row.moduleName,
    mode: row.mode,
    isActive: row.isActive,
    hasCredentials: !!row.encryptedCredentials,
    credentialsOwner: row.credentialsOwner,
    updatedAt: row.updatedAt,
  });
}

function validateCredentialsShape(moduleName: string, creds: Record<string, unknown>): string | null {
  if (moduleName === "ai") {
    const anthropic = typeof creds.anthropicKey === "string" ? creds.anthropicKey : "";
    const openai = typeof creds.openaiKey === "string" ? creds.openaiKey : "";
    if (!anthropic && !openai) {
      return "ai module requires at least anthropicKey or openaiKey";
    }
    if (anthropic && !/^sk-ant-/.test(anthropic)) {
      return "anthropicKey must start with sk-ant-";
    }
    if (openai && !/^sk-/.test(openai)) {
      return "openaiKey must start with sk-";
    }
    return null;
  }
  // sms / voice / whatsapp share the Twilio shape
  const sid = typeof creds.accountSid === "string" ? creds.accountSid : "";
  const token = typeof creds.authToken === "string" ? creds.authToken : "";
  if (!sid || !token) {
    return `${moduleName} module requires accountSid and authToken`;
  }
  if (!/^AC[a-f0-9]+$/i.test(sid)) {
    return "accountSid must start with AC followed by hex";
  }
  return null;
}
