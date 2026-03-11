import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

// GET: Gespeicherte API Keys laden (maskiert)
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await prisma.apiKey.findMany({
      where: { userId },
    });

    // Keys maskiert zurückgeben — nur letzte 4 Zeichen sichtbar
    const masked = keys.map((k) => {
      let lastFour = "";
      try {
        const decrypted = decrypt(k.encryptedKey);
        lastFour = decrypted.slice(-4);
      } catch {
        lastFour = "****";
      }
      return {
        id: k.id,
        provider: k.provider,
        keyHint: `••••••••${lastFour}`,
        updatedAt: k.updatedAt,
      };
    });

    return Response.json(masked);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: API Key speichern oder aktualisieren
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Nur Pro/Agency/Admin dürfen Keys speichern
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.plan === "FREE")) {
      return Response.json({ error: "BYOK is available for Pro, Agency, and Admin plans" }, { status: 403 });
    }

    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return Response.json({ error: "Provider and API key are required" }, { status: 400 });
    }

    if (!["anthropic", "openai"].includes(provider)) {
      return Response.json({ error: "Invalid provider. Use 'anthropic' or 'openai'" }, { status: 400 });
    }

    // Basis-Validierung der Key-Formate
    if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
      return Response.json({ error: "Invalid Anthropic API key format (should start with sk-ant-)" }, { status: 400 });
    }
    if (provider === "openai" && !apiKey.startsWith("sk-")) {
      return Response.json({ error: "Invalid OpenAI API key format (should start with sk-)" }, { status: 400 });
    }

    const encryptedKey = encrypt(apiKey);

    await prisma.apiKey.upsert({
      where: { userId_provider: { userId, provider } },
      update: { encryptedKey },
      create: { userId, provider, encryptedKey },
    });

    return Response.json({ success: true, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: API Key löschen
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await request.json();

    if (!provider) {
      return Response.json({ error: "Provider is required" }, { status: 400 });
    }

    await prisma.apiKey.deleteMany({
      where: { userId, provider },
    });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
