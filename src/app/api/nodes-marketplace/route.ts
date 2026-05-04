import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPublishedNodes } from "@/lib/nodes-sdk/node-publisher";

export const dynamic = "force-dynamic";

/**
 * GET /api/nodes-marketplace
 * Browse veroeffentlichte Custom Nodes mit optionalem Filter.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const category = searchParams.get("category") || undefined;
    const search = searchParams.get("search") || undefined;

    const nodes = await getPublishedNodes({ category, search });

    return Response.json({ nodes });
  } catch (err) {
    console.error("GET /api/nodes-marketplace error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
