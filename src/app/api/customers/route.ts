import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgOnlyFilter } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const url = new URL(request.url);
    const search = (url.searchParams.get("q") || "").trim();
    const channel = (url.searchParams.get("channel") || "").toUpperCase();
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "25", 10) || 25));

    const filters: Record<string, unknown>[] = [orgOnlyFilter(scope)];
    if (search) {
      filters.push({
        OR: [
          { primaryEmail: { contains: search, mode: "insensitive" } },
          { primaryPhone: { contains: search } },
          { fullName: { contains: search, mode: "insensitive" } },
          { emailAliases: { has: search.toLowerCase() } },
        ],
      });
    }
    if (channel === "EMAIL") {
      filters.push({ primaryEmail: { not: null } });
    } else if (channel === "WHATSAPP") {
      filters.push({ primaryPhone: { not: null } });
    }

    const [profiles, total] = await Promise.all([
      prisma.customerProfile.findMany({
        where: { AND: filters },
        orderBy: { lastSeenAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customerProfile.count({ where: { AND: filters } }),
    ]);

    return Response.json({ profiles, total, page, limit });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers] list failed", error);
    return Response.json({ error: "Failed to list customers" }, { status: 500 });
  }
}
