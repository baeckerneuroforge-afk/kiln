import { prisma } from "@/lib/prisma";
import {
  claimNextPending,
  enqueueTask,
  markDone,
  markFailed,
  markNeedsApproval,
  markRunning,
} from "./backlog";
import type { OrgScope } from "@/lib/auth/org-scope";
import { approveItem, rejectItem } from "./approval-gate";
import { decideNextAction } from "./manager-loop";
import { patchMemory, readMemory } from "./operating-memory";
import { invokeSwarm, invokeWorkflow, invokeWorker } from "./invocation";
import { asJsonRecord, toPrismaJson, truncateError } from "./json";
import {
  notifyApprovalNeeded,
  type NotifyChannelKind,
} from "./notifications/notification-router";
import { buildMemorySummary } from "@/lib/customer-memory/retriever";
import type {
  CustomerMemoryContext,
  DepartmentContext,
  InvocationResult,
  ManagerDecision,
  TriggerEvent,
} from "./types";

const MAX_DECISIONS_PER_ITEM = 8;

export async function triggerDepartment(
  departmentId: string,
  trigger: TriggerEvent
): Promise<void> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { status: true },
  });

  if (!department || department.status === "ARCHIVED" || department.status === "PAUSED") {
    return;
  }

  await enqueueTask({
    departmentId,
    triggerType: trigger.triggerType,
    triggerPayload: trigger.payload,
  });

  if (!(await hasActiveRun(departmentId))) {
    await runManagerLoop(departmentId);
  }
}

export async function runManagerLoop(departmentId: string): Promise<void> {
  while (true) {
    const active = await hasActiveRun(departmentId);
    if (active) return;

    const item = await claimNextPending(departmentId);
    if (!item) return;

    await markRunning(item.id);
    await runBacklogItem(departmentId, item.id);
  }
}

export async function approveBacklogItem(
  itemId: string,
  userId: string,
  scope?: OrgScope
): Promise<void> {
  await approveItem(itemId, userId, scope);
  const item = await prisma.departmentBacklogItem.findUnique({
    where: { id: itemId },
    select: { departmentId: true },
  });
  if (item) await runManagerLoop(item.departmentId);
}

export async function rejectBacklogItem(
  itemId: string,
  userId: string,
  reason: string,
  scope?: OrgScope
): Promise<void> {
  await rejectItem(itemId, userId, reason, scope);
  const item = await prisma.departmentBacklogItem.findUnique({
    where: { id: itemId },
    select: { departmentId: true },
  });
  if (item) await runManagerLoop(item.departmentId);
}

async function runBacklogItem(departmentId: string, itemId: string): Promise<void> {
  let currentResult: Record<string, unknown> = {};

  try {
    for (let step = 0; step < MAX_DECISIONS_PER_ITEM; step++) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        include: {
          workerAgents: { orderBy: [{ priority: "desc" }, { role: "asc" }] },
          runLogs: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });
      if (!department || department.status === "ARCHIVED") {
        await markFailed(itemId, "Department was deleted or archived during execution");
        return;
      }

      const backlogItem = await prisma.departmentBacklogItem.findUnique({
        where: { id: itemId },
      });
      if (!backlogItem || backlogItem.status !== "RUNNING") return;

      const memory = await readMemory(departmentId);
      const customerMemory = await loadCustomerMemoryForBacklogItem(
        backlogItem.triggerPayload,
        departmentId,
      );
      const startedAt = Date.now();
      const decisionResult = await decideNextAction({
        department,
        backlogItem,
        operatingMemory: {
          ...memory,
          currentRun: currentResult,
        },
        availableWorkers: department.workerAgents,
        recentRunLogs: department.runLogs,
        customerMemory,
      });
      const durationMs = Date.now() - startedAt;

      const invocation = await handleDecision(
        decisionResult.decision,
        {
          departmentId,
          orgId: department.orgId || "",
          userId: department.userId,
          backlogItemId: itemId,
        },
        department.approvalMode
      );

      await prisma.departmentRunLog.create({
        data: {
          departmentId,
          backlogItemId: itemId,
          managerDecision: toPrismaJson(decisionResult.raw),
          workerInvoked: workerInvoked(decisionResult.decision),
          invocationType: invocation?.invocationType || decisionResult.decision.type,
          durationMs: Math.max(durationMs, invocation?.durationMs || 0),
          tokensUsed: decisionResult.tokensUsed,
        },
      });

      currentResult = {
        ...currentResult,
        lastDecision: decisionResult.decision,
        lastInvocation: invocation,
      };

      const done = await finalizeDecision(
        itemId,
        decisionResult.decision,
        invocation,
        currentResult
      );
      if (done) return;
    }

    await markFailed(itemId, "Manager loop exceeded maximum decision steps");
  } catch (error) {
    await markFailed(itemId, truncateError(error));
  }
}

async function handleDecision(
  decision: ManagerDecision,
  context: DepartmentContext,
  approvalMode: string
): Promise<InvocationResult | null> {
  switch (decision.type) {
    case "INVOKE_WORKER":
      return invokeWorker(decision.workerId, decision.input, context);
    case "INVOKE_WORKFLOW":
      return invokeWorkflow(decision.workflowId, decision.input, context);
    case "INVOKE_SWARM":
      return invokeSwarm(decision.swarmConfig, decision.input, context);
    case "UPDATE_MEMORY":
      await patchMemory(context.departmentId, decision.patch);
      return null;
    case "FOLLOWUP_LATER":
      await enqueueTask({
        departmentId: context.departmentId,
        triggerType: "FOLLOWUP",
        triggerPayload: {
          scheduledFor: decision.scheduledFor,
          payload: decision.payload,
        },
      });
      return null;
    case "REQUEST_APPROVAL":
      if (approvalMode === "OFF") {
        return {
          ok: true,
          invocationType: "DRAFT",
          output: { approvalBypassed: true, draftedAction: decision.draftedAction },
          durationMs: 0,
        };
      }
      return null;
    case "MARK_DONE":
      return null;
  }
}

async function finalizeDecision(
  itemId: string,
  decision: ManagerDecision,
  invocation: InvocationResult | null,
  currentResult: Record<string, unknown>
): Promise<boolean> {
  if (invocation && !invocation.ok) {
    await markFailed(itemId, invocation.error || "Invocation failed");
    return true;
  }

  switch (decision.type) {
    case "REQUEST_APPROVAL": {
      const enrichedDraft = enrichDraftWithKnowledgeSources(
        decision.draftedAction,
        currentResult
      );
      if (invocation) {
        await markDone(itemId, asJsonRecord(invocation.output));
        return true;
      }
      await markNeedsApproval(itemId, enrichedDraft);
      await dispatchApprovalNotification(itemId, enrichedDraft);
      return true;
    }
    case "MARK_DONE":
      await markDone(itemId, decision.result);
      return true;
    case "FOLLOWUP_LATER":
      await markDone(itemId, {
        followupScheduled: decision.scheduledFor,
        payload: decision.payload,
      });
      return true;
    case "UPDATE_MEMORY":
      return false;
    case "INVOKE_WORKER":
    case "INVOKE_WORKFLOW":
    case "INVOKE_SWARM":
      await prisma.departmentBacklogItem.update({
        where: { id: itemId },
        data: { result: toPrismaJson(asJsonRecord(currentResult)) },
      });
      return false;
  }
}

async function hasActiveRun(departmentId: string): Promise<boolean> {
  const active = await prisma.departmentBacklogItem.count({
    where: {
      departmentId,
      status: { in: ["CLAIMED", "RUNNING"] },
    },
  });
  return active > 0;
}

function workerInvoked(decision: ManagerDecision): string | null {
  if (decision.type === "INVOKE_WORKER") return decision.workerId;
  if (decision.type === "INVOKE_WORKFLOW") return decision.workflowId;
  return null;
}

function enrichDraftWithKnowledgeSources(
  draft: Record<string, unknown>,
  currentResult: Record<string, unknown>
): Record<string, unknown> {
  const lastInvocation = asJsonRecord(currentResult.lastInvocation);
  const output = asJsonRecord(lastInvocation.output);
  const sources = output.knowledgeSourcesUsed;
  if (Array.isArray(sources) && sources.length > 0) {
    return { ...draft, knowledgeSourcesUsed: sources };
  }
  return draft;
}

async function loadCustomerMemoryForBacklogItem(
  triggerPayload: unknown,
  departmentId: string,
): Promise<CustomerMemoryContext | null> {
  try {
    const payload = asJsonRecord(triggerPayload);
    const channelMessageId =
      typeof payload.channelMessageId === "string" ? payload.channelMessageId : null;
    if (!channelMessageId) return null;
    const message = await prisma.departmentChannelMessage.findUnique({
      where: { id: channelMessageId },
      select: { customerProfileId: true },
    });
    if (!message?.customerProfileId) return null;
    const summary = await buildMemorySummary(message.customerProfileId, { departmentId });
    return summary;
  } catch (err) {
    console.warn("[department] customer-memory lookup failed", err);
    return null;
  }
}

async function dispatchApprovalNotification(
  itemId: string,
  draftedAction: Record<string, unknown>
): Promise<void> {
  try {
    const item = await prisma.departmentBacklogItem.findUnique({
      where: { id: itemId },
      select: { departmentId: true, triggerPayload: true },
    });
    if (!item) return;

    const trigger = (item.triggerPayload || {}) as Record<string, unknown>;
    const channelHint =
      typeof trigger.channel === "string" ? trigger.channel.toUpperCase() : "INTERNAL";
    const channel: NotifyChannelKind =
      channelHint === "EMAIL" || channelHint === "WHATSAPP" ? channelHint : "INTERNAL";

    await notifyApprovalNeeded({
      departmentId: item.departmentId,
      backlogItemId: itemId,
      draftedAction,
      channel,
    });
  } catch (err) {
    // Notification failures must not abort the manager loop.
    console.error("[department] approval notification failed", err);
  }
}
