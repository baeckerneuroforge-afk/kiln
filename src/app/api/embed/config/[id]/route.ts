import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Lightweight config endpoint for the universal widget script
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = await prisma.agent.findUnique({
    where: { id: params.id },
    select: {
      slug: true,
      name: true,
      status: true,
      whiteLabel: true,
    },
  });

  if (!agent || agent.status !== "LIVE") {
    return Response.json({ error: "Agent not found or not live" }, {
      status: 404,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  const wl = (agent.whiteLabel || {}) as Record<string, string>;

  return Response.json({
    slug: agent.slug,
    name: agent.name,
    color: wl.primaryColor || "#F97316",
    logo: wl.logo || null,
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
    },
  });
}
