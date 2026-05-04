import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { exportTeamAsYaml } from "@/lib/team-yaml";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify team belongs to user
    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
      select: { id: true, name: true },
    });

    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const format = request.nextUrl.searchParams.get("format") || "yaml";

    if (format === "yaml") {
      const yamlContent = await exportTeamAsYaml(team.id);
      const filename = `${team.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.yaml`;

      return new Response(yamlContent, {
        headers: {
          "Content-Type": "application/x-yaml",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return Response.json({ error: "Unsupported format" }, { status: 400 });
  } catch (err) {
    console.error("Team export error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
