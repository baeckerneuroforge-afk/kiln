import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/prisma";
import { getModelById } from "@/lib/llm";

export const dynamic = "force-dynamic";

const MODEL_TIERS = ["FAST", "BALANCED", "SMART"] as const;
const PROVIDERS = ["anthropic", "openai", "google", "mistral", "groq"] as const;

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; workerId: string } },
) {
  try {
    const scope = await requireOrgId();
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    const record = body as Record<string, unknown>;

    const existing = await prisma.departmentWorker.findFirst({
      where: {
        id: params.workerId,
        departmentId: params.id,
        department: orgScopeFilter(scope),
      },
      select: { id: true },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const preferredModelTier = nullableEnum(record.preferredModelTier, MODEL_TIERS);
    const preferredProvider = nullableEnum(record.preferredProvider, PROVIDERS);
    const customModelId = nullableString(record.customModelId);
    if (customModelId && !getModelById(customModelId)) {
      return Response.json({ error: "Unknown model" }, { status: 400 });
    }

    const worker = await prisma.departmentWorker.update({
      where: { id: params.workerId },
      data: {
        ...(preferredModelTier !== undefined ? { preferredModelTier } : {}),
        ...(preferredProvider !== undefined ? { preferredProvider } : {}),
        ...(customModelId !== undefined ? { customModelId } : {}),
        ...(typeof record.enableCitationCheck === "boolean"
          ? { enableCitationCheck: record.enableCitationCheck }
          : {}),
      },
      include: { agent: true },
    });

    return Response.json(worker);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to update worker settings" }, { status: 500 });
  }
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value.trim() ? value.trim() : null;
  return undefined;
}

function nullableEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null | undefined {
  if (value === null || value === "AUTO" || value === "") return null;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T[number];
  return undefined;
}
