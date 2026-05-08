import Anthropic from "@anthropic-ai/sdk";
import { MODEL_PROVIDER_MAP, getClaudeClient, getClaudeClientWithKey } from "@/lib/ai";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

export async function getAnthropicClientForUser(
  userId: string,
  model: string
): Promise<Anthropic> {
  const provider = MODEL_PROVIDER_MAP[model] || "ANTHROPIC";
  if (provider !== "ANTHROPIC") {
    return getClaudeClient();
  }

  try {
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { userId_provider: { userId, provider: "anthropic" } },
    });
    if (apiKeyRecord) {
      return getClaudeClientWithKey(decrypt(apiKeyRecord.encryptedKey));
    }
  } catch {
    // Fall back to platform key where available.
  }

  return getClaudeClient();
}
