import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey } from "@/lib/api-auth";
import { isAdmin } from "@/lib/admin";
import {
  normalizeApiAccessScopes,
  resolveApiAccessExpiry,
} from "@/lib/api-access-keys";

// GET: Alle API Access Keys des Users laden (maskiert)
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await prisma.apiAccessKey.findMany({
      where: { userId },
      select: { id: true, name: true, keyPrefix: true, scopes: true, expiresAt: true, lastUsed: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const keyIds = keys.map((key) => key.id);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [usage7d, usage30d, endpointUsage] = await Promise.all([
      keyIds.length > 0
        ? prisma.apiAccessKeyUsage.groupBy({
            by: ["keyId"],
            where: {
              keyId: { in: keyIds },
              createdAt: { gte: sevenDaysAgo },
            },
            _count: { _all: true },
          })
        : [],
      keyIds.length > 0
        ? prisma.apiAccessKeyUsage.groupBy({
            by: ["keyId"],
            where: {
              keyId: { in: keyIds },
              createdAt: { gte: thirtyDaysAgo },
            },
            _count: { _all: true },
          })
        : [],
      keyIds.length > 0
        ? prisma.apiAccessKeyUsage.groupBy({
            by: ["keyId", "endpoint"],
            where: {
              keyId: { in: keyIds },
              createdAt: { gte: thirtyDaysAgo },
            },
            _count: { _all: true },
          })
        : [],
    ]);

    const usage7dMap = new Map(usage7d.map((item) => [item.keyId, item._count._all]));
    const usage30dMap = new Map(usage30d.map((item) => [item.keyId, item._count._all]));
    const endpointsByKey = new Map<string, { endpoint: string; count: number }[]>();

    for (const item of endpointUsage) {
      const list = endpointsByKey.get(item.keyId) || [];
      list.push({ endpoint: item.endpoint, count: item._count._all });
      endpointsByKey.set(item.keyId, list);
    }

    return Response.json(
      keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: normalizeApiAccessScopes(key.scopes),
        expiresAt: key.expiresAt,
        lastUsed: key.lastUsed,
        createdAt: key.createdAt,
        usage: {
          requests7d: usage7dMap.get(key.id) || 0,
          requests30d: usage30dMap.get(key.id) || 0,
          mostUsedEndpoints: (endpointsByKey.get(key.id) || [])
            .sort((a, b) => b.count - a.count)
            .slice(0, 3),
        },
      }))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Neuen API Access Key generieren
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Nur Agency/Admin dürfen API Keys erstellen
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    if (user.plan !== "AGENCY" && !isAdmin(userId)) {
      return Response.json({ error: "API Access is available for Agency and Admin plans" }, { status: 403 });
    }

    const { name, scopes, expiry } = await request.json();
    if (!name || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "Key name is required" }, { status: 400 });
    }

    // Max 5 Keys pro User
    const keyCount = await prisma.apiAccessKey.count({ where: { userId } });
    if (keyCount >= 5) {
      return Response.json({ error: "Maximum 5 API keys allowed" }, { status: 400 });
    }

    const plainKey = generateApiKey();
    const hashedKey = hashApiKey(plainKey);
    const keyPrefix = `sk-kiln-••••${plainKey.slice(-4)}`;
    const normalizedScopes = normalizeApiAccessScopes(scopes);
    let expiresAt: Date | null;

    try {
      expiresAt = resolveApiAccessExpiry(expiry);
    } catch {
      return Response.json({ error: "Invalid expiry option" }, { status: 400 });
    }

    await prisma.apiAccessKey.create({
      data: {
        userId,
        name: name.trim(),
        hashedKey,
        keyPrefix,
        scopes: normalizedScopes,
        expiresAt,
      },
    });

    // Key wird NUR EINMAL im Klartext zurückgegeben
    return Response.json({
      key: plainKey,
      name: name.trim(),
      scopes: normalizedScopes,
      expiresAt,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: API Access Key löschen
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { keyId } = await request.json();
    if (!keyId) {
      return Response.json({ error: "keyId is required" }, { status: 400 });
    }

    // Nur eigene Keys löschen
    const key = await prisma.apiAccessKey.findFirst({
      where: { id: keyId, userId },
    });
    if (!key) {
      return Response.json({ error: "Key not found" }, { status: 404 });
    }

    await prisma.apiAccessKey.delete({ where: { id: keyId } });
    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
