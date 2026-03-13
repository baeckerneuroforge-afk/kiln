import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET: Load all integration connections for the user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connections = await prisma.integrationConnection.findMany({
      where: { userId },
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
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { provider, name, config, isCustom } = await request.json();
    if (!provider || !name) {
      return Response.json({ error: "Provider and name required" }, { status: 400 });
    }

    // Upsert: update if same provider exists
    const connection = await prisma.integrationConnection.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
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
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id, isActive } = await request.json();
    if (!id) return Response.json({ error: "Connection ID required" }, { status: 400 });

    const existing = await prisma.integrationConnection.findFirst({
      where: { id, userId },
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
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await request.json();
    if (!id) return Response.json({ error: "Connection ID required" }, { status: 400 });

    const existing = await prisma.integrationConnection.findFirst({
      where: { id, userId },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    await prisma.integrationConnection.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
