import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deployWorkflow, getWorkflowTemplate } from "@/lib/workflow-templates";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { templateId } = await request.json();
    if (!templateId) {
      return Response.json({ error: "Template ID required" }, { status: 400 });
    }

    const template = getWorkflowTemplate(templateId);
    if (!template) {
      return Response.json({ error: "Workflow template not found" }, { status: 404 });
    }

    const result = await deployWorkflow(userId, template.id);
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
