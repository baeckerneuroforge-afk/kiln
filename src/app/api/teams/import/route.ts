import { auth } from "@clerk/nextjs/server";
import { importTeamFromYaml, previewTeamYaml } from "@/lib/team-yaml";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { yaml: yamlContent, preview } = body as {
      yaml: string;
      preview?: boolean;
    };

    if (!yamlContent || typeof yamlContent !== "string") {
      return Response.json(
        { error: "YAML content is required" },
        { status: 400 }
      );
    }

    // Preview mode — parse and return summary without creating
    if (preview) {
      const summary = previewTeamYaml(yamlContent);
      return Response.json(summary);
    }

    // Import mode — create the full team
    const result = await importTeamFromYaml(userId, yamlContent);
    return Response.json(result, { status: 201 });
  } catch (err) {
    console.error("Team import error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
