import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAgencyMode } from "@/lib/org-mode";

export type TemplateRouteContext = {
  userId: string;
  orgId: string;
};

export async function requireTemplateRouteContext(): Promise<TemplateRouteContext> {
  const { userId, orgId } = await requireAgencyMode();
  return { userId, orgId };
}

export function templateRouteError(error: unknown) {
  if (error instanceof Error && error.message === "Unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "Template not found") {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  console.error("[templates] Route failed", error);
  return NextResponse.json({ error: "Template request failed" }, { status: 500 });
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function asJsonObject(value: unknown): Prisma.InputJsonValue | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Prisma.InputJsonValue;
  }
  return null;
}
