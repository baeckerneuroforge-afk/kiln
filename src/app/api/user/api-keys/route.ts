import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { formatMaskedApiKey } from "@/lib/api-key-testing";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// GET: Load saved API keys, masked.
export async function GET() {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }

    const keys = await prisma.apiKey.findMany({
      where: orgScopeFilter(scope),
    });

    // Return provider-aware masks with only the last 4 characters visible.
    const masked = keys.map((k) => {
      let keyHint = "********";
      try {
        const decrypted = decrypt(k.encryptedKey);
        keyHint = formatMaskedApiKey(k.provider, decrypted);
      } catch {
        keyHint = formatMaskedApiKey(k.provider, "****");
      }
      return {
        id: k.id,
        provider: k.provider,
        keyHint,
        updatedAt: k.updatedAt,
      };
    });

    return Response.json(masked);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Save or update an API key.
export async function POST(request: NextRequest) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }
    const { userId, orgId } = scope;

    // BYOK is available on paid plans.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.plan === "FREE")) {
      return Response.json({ error: "BYOK is available for Pro, Agency, and Admin plans" }, { status: 403 });
    }

    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return Response.json({ error: "Provider and API key are required" }, { status: 400 });
    }

    const validProviders = ["anthropic", "openai", "perplexity", "google", "mistral", "groq"];
    if (!validProviders.includes(provider)) {
      return Response.json({ error: `Invalid provider. Use one of: ${validProviders.join(", ")}` }, { status: 400 });
    }

    // Basic key format validation.
    const prefixMap: Record<string, { prefix: string; label: string }> = {
      anthropic: { prefix: "sk-ant-", label: "Anthropic" },
      openai: { prefix: "sk-", label: "OpenAI" },
      perplexity: { prefix: "pplx-", label: "Perplexity" },
      google: { prefix: "AI", label: "Google AI" },
      mistral: { prefix: "", label: "Mistral" },
      groq: { prefix: "gsk_", label: "Groq" },
    };
    const expected = prefixMap[provider];
    if (expected && !apiKey.startsWith(expected.prefix)) {
      return Response.json({ error: `Invalid ${expected.label} API key format (should start with ${expected.prefix})` }, { status: 400 });
    }

    const encryptedKey = encrypt(apiKey);

    await prisma.apiKey.upsert({
      where: { userId_provider: { userId, provider } },
      update: { encryptedKey, orgId },
      create: { userId, provider, encryptedKey, orgId },
    });

    return Response.json({ success: true, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Delete an API key.
export async function DELETE(request: NextRequest) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }

    const { provider } = await request.json();

    if (!provider) {
      return Response.json({ error: "Provider is required" }, { status: 400 });
    }

    // Delete only keys reachable from the active org (or legacy orgId=null
    // owned by the user). A user in a different org probing the same
    // provider gets a no-op rather than wiping someone else's key.
    await prisma.apiKey.deleteMany({
      where: { provider, ...orgScopeFilter(scope) },
    });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
