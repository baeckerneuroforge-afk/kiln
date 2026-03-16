import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// Key hashen für DB-Lookup
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// API Key generieren: sk-kiln-[32 random chars]
export function generateApiKey(): string {
  const random = crypto.randomBytes(24).toString("base64url"); // 32 Zeichen
  return `sk-kiln-${random}`;
}

// API Key aus Authorization Header validieren → userId zurückgeben
export async function authenticateApiKey(
  authHeader: string | null
): Promise<{ userId: string; keyId: string; touchLastUsed: Promise<void> } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const key = authHeader.slice(7).trim();
  if (!key.startsWith("sk-kiln-")) return null;

  const hashed = hashApiKey(key);

  const apiKey = await prisma.apiAccessKey.findUnique({
    where: { hashedKey: hashed },
  });

  if (!apiKey) return null;

  const touchLastUsed = prisma.apiAccessKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  }).then(() => undefined).catch((err) => {
    console.error("API key lastUsed update failed:", err);
  });

  return { userId: apiKey.userId, keyId: apiKey.id, touchLastUsed };
}
