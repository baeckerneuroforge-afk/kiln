import { getMCPDirectory, getMCPCategories, type MCPCategory } from "@/lib/mcp/mcp-directory";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mcp/directory — Kuratierte MCP Server Liste
 */
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") as MCPCategory | null;
  const query = request.nextUrl.searchParams.get("q");

  let entries = getMCPDirectory(category || undefined);

  if (query) {
    const q = query.toLowerCase();
    entries = entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
    );
  }

  return Response.json({
    entries,
    categories: getMCPCategories(),
  });
}
