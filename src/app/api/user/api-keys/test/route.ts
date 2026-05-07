import { NextRequest } from "next/server";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { isApiKeyProvider, testProviderApiKey } from "@/lib/api-key-testing";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }

    const { provider, key, apiKey } = await request.json();
    if (!provider || typeof provider !== "string" || !isApiKeyProvider(provider)) {
      return Response.json({ error: "Invalid provider." }, { status: 400 });
    }

    let keyToTest = typeof key === "string" ? key : typeof apiKey === "string" ? apiKey : "";

    if (!keyToTest.trim()) {
      const savedKey = await prisma.apiKey.findFirst({
        where: { provider, ...orgScopeFilter(scope) },
      });
      if (!savedKey) {
        return Response.json({ error: "No saved key found for this provider." }, { status: 404 });
      }
      keyToTest = decrypt(savedKey.encryptedKey);
    }

    const result = await testProviderApiKey(provider, keyToTest.trim());
    const status = result.success ? 200 : 502;
    return Response.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
