import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAgentCreditUsage } from "@/lib/credits";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const usage = await getAgentCreditUsage(params.id);
    return Response.json(usage);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
