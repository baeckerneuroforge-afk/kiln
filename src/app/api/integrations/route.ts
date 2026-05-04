import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";

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

    const { provider, name, config, isCustom } = await request.json();
    if (!provider || !name) {
      return Response.json({ error: "Provider and name required" }, { status: 400 });
    }

    // Upsert: update if same provider exists
    const connection = await prisma.integrationConnection.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        orgId,
        provider,
        name,
        config: JSON.stringify(config || {}),
        isCustom: isCustom || false,
        isActive: true,
      },
      update: {
        name,
        config: JSON.stringify(config || {}),
        isActive: true,
        isCustom: isCustom || false,
        // Stamp orgId on legacy rows that didn't have one yet.
        orgId,
      },
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

    await prisma.integrationConnection.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
