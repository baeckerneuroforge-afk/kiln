import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBusinessIntelligence } from "@/lib/enterprise-memory";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const days = Math.min(Number(searchParams.get("days")) || 30, 90);

    const from = new Date(Date.now() - days * 86400000);
    const to = new Date();

    const data = await getBusinessIntelligence(userId, { from, to });
    return Response.json(data);
  } catch (err) {
    console.error("Intelligence API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
