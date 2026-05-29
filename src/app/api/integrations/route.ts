import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { encryptConfigJson } from "@/lib/integrations/config-storage";
import { logAudit } from "@/lib/audit/logger";
import { revokeIntegrationToken } from "@/lib/integrations/revoke";
import { validateBody } from "@/lib/api/validate-body";
import { integrationCreateSchema } from "@/lib/api/request-schemas";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// GET: Load all integration connections in the active org (with legacy fallback)
export async function GET() {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }

    const connections = await prisma.integrationConnection.findMany({
      where: orgScopeFilter(scope),
      include: {
        agentIntegrations: {
          select: { id: true, agentId: true, enabled: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ connections });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Create or update an integration connection
export async function POST(request: Request) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }
    const { userId, orgId } = scope;

    const validation = validateBody(integrationCreateSchema, await request.json());
    if (!validation.ok) return validation.response;
    const { provider, name, config, isCustom } = validation.data;

    // Always encrypt before persistence (Sprint 18 security fix). Legacy
    // plaintext rows are still readable via readConfigJson on the read path.
    const encryptedConfig = encryptConfigJson(config || {});

    // Sprint 19.7.5 — uniqueness is now per (userId, orgId, provider).
    // Find the matching row scoped to the active org first, then update it
    // in place; otherwise create one.
    const existing = await prisma.integrationConnection.findFirst({
      where: { userId, orgId, provider },
      select: { id: true, name: true, isActive: true, isCustom: true },
    });

    const connection = existing
      ? await prisma.integrationConnection.update({
          where: { id: existing.id },
          data: {
            name,
            config: encryptedConfig,
            isActive: true,
            isCustom: isCustom || false,
            orgId,
          },
        })
      : await prisma.integrationConnection.create({
          data: {
            userId,
            orgId,
            provider,
            name,
            config: encryptedConfig,
            isCustom: isCustom || false,
            isActive: true,
          },
        });

    await logAudit({
      orgId,
      actorUserId: userId,
      actorOrgId: orgId,
      action: existing ? "INTEGRATION_CONFIG_UPDATED" : "INTEGRATION_CONNECTED",
      resourceType: "INTEGRATION_CONNECTION",
      resourceId: connection.id,
      description: `${existing ? "Updated" : "Connected"} integration ${provider} (${name})`,
      severity: "INFO",
      metadata: { provider, isCustom: !!isCustom },
    });

    return Response.json(connection);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH: Toggle active status
export async function PATCH(request: Request) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }

    const { id, isActive } = await request.json();
    if (!id) return Response.json({ error: "Connection ID required" }, { status: 400 });

    const existing = await prisma.integrationConnection.findFirst({
      where: { id, ...orgScopeFilter(scope) },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.integrationConnection.update({
      where: { id },
      data: { isActive: isActive !== undefined ? isActive : !existing.isActive },
    });

    await logAudit({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      actorOrgId: scope.orgId,
      action: "INTEGRATION_CONFIG_UPDATED",
      resourceType: "INTEGRATION_CONNECTION",
      resourceId: id,
      description: `Toggled integration ${existing.provider} active=${updated.isActive}`,
      severity: "INFO",
      metadata: { provider: existing.provider, isActive: updated.isActive },
    });

    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove an integration connection
export async function DELETE(request: Request) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }

    const { id } = await request.json();
    if (!id) return Response.json({ error: "Connection ID required" }, { status: 400 });

    const existing = await prisma.integrationConnection.findFirst({
      where: { id, ...orgScopeFilter(scope) },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    // Best-effort: tell the provider to revoke the token. Failure does not
    // block deletion — the user requested disconnect.
    let revoked: { ok: boolean; error?: string };
    try {
      revoked = await revokeIntegrationToken({
        provider: existing.provider,
        config: existing.config,
      });
    } catch (err) {
      revoked = { ok: false, error: err instanceof Error ? err.message : "unknown" };
    }

    await prisma.integrationConnection.delete({ where: { id } });

    await logAudit({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      actorOrgId: scope.orgId,
      action: "INTEGRATION_DISCONNECTED",
      resourceType: "INTEGRATION_CONNECTION",
      resourceId: id,
      description: `Disconnected integration ${existing.provider}`,
      severity: "INFO",
      metadata: {
        provider: existing.provider,
        tokenRevoked: revoked.ok,
        revokeError: revoked.error ?? null,
      },
    });

    return Response.json({ deleted: true, tokenRevoked: revoked.ok });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
