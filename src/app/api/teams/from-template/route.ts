import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deployTeamTemplate, getTeamTemplate } from "@/lib/team-templates";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, customization } = body;

    if (!templateId) {
      return Response.json({ error: "Template ID required" }, { status: 400 });
    }

    const template = getTeamTemplate(templateId);
    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    const result = await deployTeamTemplate(userId, template.id, customization);
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
