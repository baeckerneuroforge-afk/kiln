/**
 * Workflow Callback API
 * Public endpoint for external systems to resume paused workflow executions.
 * POST /api/workflows/callback/[executionId]/[nodeId]
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TeamExecutionStatus } from "@prisma/client";
import { resumeWorkflowFromNode } from "@/lib/services/workflow-resume";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string; nodeId: string }> }
) {
  const { executionId, nodeId } = await params;

  // Validate UUID format
  if (!/^[a-f0-9-]{20,}$/i.test(executionId)) {
    return NextResponse.json({ error: "Invalid execution ID" }, { status: 400 });
  }

  // Find execution
  const execution = await prisma.teamExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  if (execution.status !== TeamExecutionStatus.AWAITING_APPROVAL) {
    return NextResponse.json(
      { error: "Execution is not waiting for callback", currentStatus: execution.status },
      { status: 409 }
    );
  }

  // Parse payload
  let payload: Record<string, unknown> = {};
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else if (contentType.includes("form")) {
      const form = await request.formData();
      form.forEach((v, k) => { payload[k] = v; });
    } else {
      const text = await request.text();
      if (text) {
        try { payload = JSON.parse(text); } catch { payload = { data: text }; }
      }
    }
  } catch {
    // Empty payload is fine
  }

  // Build updated context
  const existingContext = execution.executionContext
    ? (JSON.parse(JSON.stringify(execution.executionContext)) as Record<string, unknown>)
    : {};

  const updatedContext = {
    ...existingContext,
    [`node_${nodeId}_callback`]: {
      payload,
      receivedAt: new Date().toISOString(),
    },
    _lastCallbackPayload: payload,
    webhook: payload,
  };

  // Log callback receipt
  await prisma.teamExecutionLog.create({
    data: {
      teamId: execution.teamId,
      executionId,
      taskIndex: 0,
      taskTitle: `Webhook callback received`,
      nodeId,
      nodeType: "wait_webhook",
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
      output: JSON.stringify(payload),
      structuredOutput: JSON.parse(JSON.stringify(payload)),
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
      received: true,
      resumed: true,
      executionId,
      nodeId,
      workflowStatus: result.status,
    });
  } catch (err) {
    console.error("Failed to resume workflow:", err);
    await prisma.teamExecution.update({
      where: { id: executionId },
      data: { status: TeamExecutionStatus.FAILED, completedAt: new Date() },
    });
    return NextResponse.json(
      { received: true, resumed: false, error: "Failed to resume workflow" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ executionId: string; nodeId: string }> }
) {
  const { executionId, nodeId } = await params;

  const execution = await prisma.teamExecution.findUnique({
    where: { id: executionId },
    select: { status: true, startedAt: true },
  });

  if (!execution) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  return NextResponse.json({
    executionId,
    nodeId,
    status: execution.status,
    waiting: execution.status === TeamExecutionStatus.AWAITING_APPROVAL,
    startedAt: execution.startedAt,
  });
}
