import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey } from "@/lib/api-auth";
import { isAdmin } from "@/lib/admin";

// GET: Alle API Access Keys des Users laden (maskiert)
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await prisma.apiAccessKey.findMany({
      where: { userId },
      select: { id: true, name: true, keyPrefix: true, lastUsed: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(keys);
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

    const { name } = await request.json();
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

    await prisma.apiAccessKey.create({
      data: {
        userId,
        name: name.trim(),
        hashedKey,
        keyPrefix,
      },
    });

    // Key wird NUR EINMAL im Klartext zurückgegeben
    return Response.json({ key: plainKey, name: name.trim() }, { status: 201 });
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
