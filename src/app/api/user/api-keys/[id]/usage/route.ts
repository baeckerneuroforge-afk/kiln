import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const key = await prisma.apiAccessKey.findFirst({
      where: { id: params.id, userId },
      select: { id: true, lastUsed: true },
    });

    if (!key) {
      return Response.json({ error: "Key not found" }, { status: 404 });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [requests7d, requests30d, endpointUsage] = await Promise.all([
      prisma.apiAccessKeyUsage.count({
        where: { keyId: key.id, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.apiAccessKeyUsage.count({
        where: { keyId: key.id, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.apiAccessKeyUsage.groupBy({
        by: ["endpoint", "method"],
        where: { keyId: key.id, createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
    ]);

    return Response.json({
      keyId: key.id,
      lastUsed: key.lastUsed,
      requests7d,
      requests30d,
      mostUsedEndpoints: endpointUsage
        .map((item) => ({
          endpoint: item.endpoint,
          method: item.method,
          count: item._count._all,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
