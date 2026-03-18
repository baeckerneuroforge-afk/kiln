/**
 * Workflow Form API
 * Public endpoint for form submissions that resume paused workflow executions.
 * GET: Returns form config (fields, title, etc.)
 * POST: Receives form submission and resumes workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TeamExecutionStatus } from "@prisma/client";
import { resumeWorkflowFromNode } from "@/lib/services/workflow-resume";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ executionId: string; nodeId: string }> }
) {
  const { executionId, nodeId } = await params;

  const execution = await prisma.teamExecution.findUnique({
    where: { id: executionId },
    include: { team: { select: { config: true, name: true } } },
  });

  if (!execution) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  if (execution.status !== TeamExecutionStatus.AWAITING_APPROVAL) {
    return NextResponse.json({
      error: "This form is no longer accepting responses",
      status: execution.status,
      completed: execution.status === "COMPLETED",
    }, { status: 410 });
  }

  // Extract form node config
  const config = execution.team.config as Record<string, unknown> | null;
  const workflow = config?.workflow as Record<string, unknown> | undefined;
  const nodes = (workflow?.nodes as Array<{ id: string; type: string; label: string; config: Record<string, unknown> }>) || [];
  const formNode = nodes.find((n) => n.id === nodeId && n.type === "wait_form");

  if (!formNode) {
    return NextResponse.json({ error: "Form node not found in workflow" }, { status: 404 });
  }

  const formConfig = formNode.config || {};

  return NextResponse.json({
    executionId,
    nodeId,
    title: (formConfig.formTitle as string) || formNode.label || "Form",
    description: (formConfig.formDescription as string) || "",
    fields: (formConfig.fields as unknown[]) || [],
    teamName: execution.team.name,
    branding: { name: "KILN", color: "#F97316" },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string; nodeId: string }> }
) {
  const { executionId, nodeId } = await params;

  const execution = await prisma.teamExecution.findUnique({
    where: { id: executionId },
    include: { team: { select: { config: true } } },
  });

  if (!execution) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  if (execution.status !== TeamExecutionStatus.AWAITING_APPROVAL) {
    return NextResponse.json({
      error: "This form is no longer accepting responses",
    }, { status: 410 });
  }

  // Parse submission
  let formData: Record<string, unknown> = {};
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("json")) {
      formData = await request.json();
    } else {
      const form = await request.formData();
      form.forEach((v, k) => { formData[k] = v; });
    }
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  // Validate required fields
  const config = execution.team.config as Record<string, unknown> | null;
  const workflow = config?.workflow as Record<string, unknown> | undefined;
  const nodes = (workflow?.nodes as Array<{ id: string; type: string; config: Record<string, unknown> }>) || [];
  const formNode = nodes.find((n) => n.id === nodeId && n.type === "wait_form");

  if (formNode) {
    const fields = (formNode.config.fields as Array<{ name: string; required: boolean }>) || [];
    const missing = fields.filter((f) => f.required && !formData[f.name]);
    if (missing.length > 0) {
      return NextResponse.json({
        error: "Missing required fields",
        fields: missing.map((f) => f.name),
      }, { status: 422 });
    }
  }

  // Build context
  const existingContext = execution.executionContext
    ? (JSON.parse(JSON.stringify(execution.executionContext)) as Record<string, unknown>)
    : {};

  const updatedContext = {
    ...existingContext,
    [`node_${nodeId}_form`]: {
      data: formData,
      submittedAt: new Date().toISOString(),
    },
    _lastFormData: formData,
    form: formData,
  };

  // Log submission
  await prisma.teamExecutionLog.create({
    data: {
      teamId: execution.teamId,
      executionId,
      taskIndex: 0,
      taskTitle: "Form submitted",
      nodeId,
      nodeType: "wait_form",
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
      output: JSON.stringify(formData),
      structuredOutput: JSON.parse(JSON.stringify(formData)),
    },
  });

  // Resume workflow
  try {
    const result = await resumeWorkflowFromNode(
      executionId,
      execution.teamId,
      nodeId,
      updatedContext
    );

    return NextResponse.json({
      success: true,
      message: "Thank you! Your response has been recorded.",
      workflowStatus: result.status,
    });
  } catch (err) {
    console.error("Failed to resume workflow after form submission:", err);
    return NextResponse.json(
      { success: true, message: "Response recorded, but workflow continuation failed." },
      { status: 207 }
    );
  }
}
