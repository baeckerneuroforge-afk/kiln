/**
 * Sprint 19.7.4 — per-sub-org API key CRUD (list + create).
 *
 *   GET  /api/sub-orgs/[id]/api-keys   →  list (caller needs integrations.read)
 *   POST /api/sub-orgs/[id]/api-keys   →  create (caller needs integrations.manage)
 *
 * Plaintext keys flow through POST but never come back out — the GET
 * response carries a redacted preview only.
 *
 * `[id]` is the OrgRelationship.id (CUID), the same shape the sub-org
 * routing uses everywhere.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import {
  getUserSubOrgMembership,
  permissionsFor,
} from "@/lib/permissions/sub-org-permissions";
import type { ApiKeyProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_PROVIDERS: ReadonlySet<ApiKeyProvider> = new Set<ApiKeyProvider>([
  "ANTHROPIC",
  "OPENAI",
  "GOOGLE",
  "AZURE_OPENAI",
  "OTHER",
]);

async function requirePermission(
  userId: string | null,
  subOrgId: string,
  permission: "integrations.read" | "integrations.manage",
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!userId) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const membership = await getUserSubOrgMembership(userId, subOrgId);
  if (!membership) {
    // existence-hiding
    return { ok: false, response: Response.json({ error: "Sub-org not found" }, { status: 404 }) };
  }
  if (!permissionsFor(membership.permissionSet).has(permission)) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden", permission }, { status: 403 }),
    };
  }
  return { ok: true };
}

function redactKey(encryptedKey: string): string {
  // Show "•••• last-4-of-ciphertext" — without decrypting. The ciphertext
  // has no relation to the original key, so this leaks no information.
  return "••••" + encryptedKey.slice(-4);
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  const gate = await requirePermission(userId, params.id, "integrations.read");
  if (!gate.ok) return gate.response;

  const keys = await prisma.subOrgApiKey.findMany({
    where: { subOrgId: params.id },
    orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      provider: true,
      label: true,
      encryptedKey: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return Response.json({
    keys: keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      label: k.label,
      preview: redactKey(k.encryptedKey),
      createdBy: k.createdBy,
      createdAt: k.createdAt.toISOString(),
      updatedAt: k.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  const gate = await requirePermission(userId, params.id, "integrations.manage");
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => ({}))) as {
    provider?: unknown;
    label?: unknown;
    key?: unknown;
  };

  const provider = body.provider as ApiKeyProvider;
  if (typeof provider !== "string" || !VALID_PROVIDERS.has(provider)) {
    return Response.json({ error: "Invalid provider" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return Response.json({ error: "label is required" }, { status: 400 });
  }
  if (label.length > 80) {
    return Response.json({ error: "label must be 80 characters or fewer" }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) {
    return Response.json({ error: "key is required" }, { status: 400 });
  }

  let encryptedKey: string;
  try {
    encryptedKey = encrypt(key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Encryption failed";
    return Response.json({ error: message }, { status: 500 });
  }

  try {
    const created = await prisma.subOrgApiKey.create({
      data: {
        subOrgId: params.id,
        provider,
        label,
        encryptedKey,
        createdBy: userId!,
      },
      select: {
        id: true,
        provider: true,
        label: true,
        encryptedKey: true,
        createdAt: true,
      },
    });
    return Response.json(
      {
        id: created.id,
        provider: created.provider,
        label: created.label,
        preview: redactKey(created.encryptedKey),
        createdAt: created.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    // Prisma unique-violation maps to a friendlier 409.
    if (/unique/i.test(message)) {
      return Response.json(
        { error: "A key with that label already exists for this provider." },
        { status: 409 },
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
