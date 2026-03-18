import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

function normalizeProactiveRules(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const match = typeof record.match === "string" ? record.match.trim() : "";
      const message = typeof record.message === "string" ? record.message.trim() : "";
      if (!match || !message) return null;
      return { match, message };
    })
    .filter((entry): entry is { match: string; message: string } => Boolean(entry));
}

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
      welcomeMessage: true,
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

  const wl = (agent.whiteLabel || {}) as Record<string, unknown>;
  const proactive =
    wl.proactive && typeof wl.proactive === "object"
      ? (wl.proactive as Record<string, unknown>)
      : null;

  return Response.json({
    slug: agent.slug,
    name: agent.name,
    greeting: agent.welcomeMessage || "",
    color: typeof wl.primaryColor === "string" ? wl.primaryColor : "#F97316",
    logo: typeof wl.logo === "string" ? wl.logo : null,
    avatarUrl: typeof wl.avatarUrl === "string" ? wl.avatarUrl : null,
    autoTheme:
      typeof wl.autoTheme === "boolean"
        ? wl.autoTheme
        : true,
    soundEnabled:
      typeof wl.soundEnabled === "boolean"
        ? wl.soundEnabled
        : false,
    position: typeof wl.position === "string" ? wl.position : "bottom-right",
    proactive: {
      enabled: proactive?.enabled !== false,
      delay:
        typeof proactive?.delay === "number" && Number.isFinite(proactive.delay)
          ? Math.max(0, Math.round(proactive.delay))
          : 15,
      rules: normalizeProactiveRules(proactive?.rules),
    },
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
    },
  });
}
