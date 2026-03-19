import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await prisma.orchestrationLog.count({
      where: { teamId: params.id },
    });

    return Response.json({ count });
  } catch {
    return Response.json({ count: 0 });
  }
}
