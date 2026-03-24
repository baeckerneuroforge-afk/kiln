import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PushService } from "@/lib/notifications/push-service";
import type {
  QuickUseIntervention,
  QuickUseResult,
  QuickUseCreditInfo,
  QuickUseTaskDetail,
  QuickUseTaskSummary,
} from "@/lib/quick-use/types";

/* ── In-Memory Task Registry ── */

interface LiveTask {
  taskId: string;
  userId: string;
  paused: boolean;
  interventions: QuickUseIntervention[];
  /** Listeners notified when a new intervention arrives */
  interventionListeners: Array<(intervention: QuickUseIntervention) => void>;
  /** Progress update callback — writes to SSE if client is still connected */
  progressCallback?: (message: string) => void;
}

const liveTasks = new Map<string, LiveTask>();

/* ── Intervention Rate Limiter ── */

const lastInterventionTime = new Map<string, number>();
const INTERVENTION_COOLDOWN_MS = 10_000; // 1 per 10 seconds

/* ── Public API ── */

export async function createBackgroundTask(
  userId: string,
  type: string,
  input: { message: string; files?: unknown[] },
  config: Record<string, unknown> | null,
  creditsEstimated: number
): Promise<string> {
  const task = await prisma.quickUseTask.create({
    data: {
      userId,
      type,
      status: "RUNNING",
      input: input as unknown as Prisma.InputJsonValue,
      config: config ? (config as unknown as Prisma.InputJsonValue) : undefined,
      creditsEstimated,
      progress: { currentStep: "Starting...", agentStatuses: {}, findings: [] } as unknown as Prisma.InputJsonValue,
    },
  });

  liveTasks.set(task.id, {
    taskId: task.id,
    userId,
    paused: false,
    interventions: [],
    interventionListeners: [],
  });

  return task.id;
}

export function registerProgressCallback(
  taskId: string,
  callback: (message: string) => void
): () => void {
  const live = liveTasks.get(taskId);
  if (live) {
    live.progressCallback = callback;
  }
  return () => {
    const t = liveTasks.get(taskId);
    if (t && t.progressCallback === callback) {
      t.progressCallback = undefined;
    }
  };
}

export async function updateTaskProgress(
  taskId: string,
  progress: {
    currentStep?: string;
    agentStatuses?: Record<string, unknown>;
    findings?: string[];
  }
): Promise<void> {
  const live = liveTasks.get(taskId);
  if (live?.progressCallback && progress.currentStep) {
    live.progressCallback(progress.currentStep);
  }

  // Batch DB updates — write at most every 3 seconds
  await prisma.quickUseTask.update({
    where: { id: taskId },
    data: { progress: progress as unknown as Prisma.InputJsonValue },
  });
}

export async function completeTask(
  taskId: string,
  result: QuickUseResult,
  credits: QuickUseCreditInfo
): Promise<void> {
  await prisma.quickUseTask.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      result: result as unknown as Prisma.InputJsonValue,
      creditsUsed: credits.creditsUsed ?? 0,
      completedAt: new Date(),
    },
  });

  const live = liveTasks.get(taskId);
  if (live) {
    await sendCompletionNotification(live.userId, taskId, result);
    liveTasks.delete(taskId);
  }

  lastInterventionTime.delete(taskId);
}

export async function failTask(
  taskId: string,
  error: string
): Promise<void> {
  await prisma.quickUseTask.update({
    where: { id: taskId },
    data: {
      status: "FAILED",
      error,
      completedAt: new Date(),
    },
  });

  liveTasks.delete(taskId);
  lastInterventionTime.delete(taskId);
}

export async function pauseTask(taskId: string): Promise<boolean> {
  const live = liveTasks.get(taskId);
  if (!live) return false;

  live.paused = true;
  await prisma.quickUseTask.update({
    where: { id: taskId },
    data: { status: "PAUSED" },
  });
  return true;
}

export async function resumeTask(taskId: string): Promise<boolean> {
  const live = liveTasks.get(taskId);
  if (!live) return false;

  live.paused = false;
  await prisma.quickUseTask.update({
    where: { id: taskId },
    data: { status: "RUNNING" },
  });
  return true;
}

export async function cancelTask(taskId: string): Promise<boolean> {
  const live = liveTasks.get(taskId);

  await prisma.quickUseTask.update({
    where: { id: taskId },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
    },
  });

  if (live) {
    liveTasks.delete(taskId);
  }
  lastInterventionTime.delete(taskId);
  return true;
}

export function isTaskPaused(taskId: string): boolean {
  return liveTasks.get(taskId)?.paused ?? false;
}

export function isTaskCancelled(taskId: string): boolean {
  return !liveTasks.has(taskId);
}

/* ── Interventions ── */

export async function addIntervention(
  taskId: string,
  userId: string,
  intervention: QuickUseIntervention
): Promise<{ success: boolean; error?: string }> {
  // Rate limiting
  const lastTime = lastInterventionTime.get(taskId);
  if (lastTime && Date.now() - lastTime < INTERVENTION_COOLDOWN_MS) {
    const waitSecs = Math.ceil((INTERVENTION_COOLDOWN_MS - (Date.now() - lastTime)) / 1000);
    return { success: false, error: `Please wait ${waitSecs} seconds before sending another message.` };
  }

  const live = liveTasks.get(taskId);
  if (!live) {
    return { success: false, error: "Task is not currently running." };
  }

  if (live.userId !== userId) {
    return { success: false, error: "Not authorized." };
  }

  // Handle control interventions
  if (intervention.type === "pause") {
    await pauseTask(taskId);
  } else if (intervention.type === "resume") {
    await resumeTask(taskId);
  } else if (intervention.type === "cancel") {
    await cancelTask(taskId);
  }

  live.interventions.push(intervention);
  lastInterventionTime.set(taskId, Date.now());

  // Persist interventions to DB
  await prisma.quickUseTask.update({
    where: { id: taskId },
    data: {
      interventions: live.interventions as unknown as Prisma.InputJsonValue,
    },
  });

  // Notify listeners (sub-agents)
  for (const listener of live.interventionListeners) {
    try { listener(intervention); } catch { /* ignore listener error */ }
  }

  return { success: true };
}

export function onIntervention(
  taskId: string,
  listener: (intervention: QuickUseIntervention) => void
): () => void {
  const live = liveTasks.get(taskId);
  if (!live) return () => {};

  live.interventionListeners.push(listener);
  return () => {
    const idx = live.interventionListeners.indexOf(listener);
    if (idx >= 0) live.interventionListeners.splice(idx, 1);
  };
}

export function getPendingInterventions(taskId: string): QuickUseIntervention[] {
  return liveTasks.get(taskId)?.interventions ?? [];
}

/* ── Task Queries ── */

export async function listUserTasks(
  userId: string,
  limit = 20
): Promise<QuickUseTaskSummary[]> {
  const tasks = await prisma.quickUseTask.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      input: true,
      creditsUsed: true,
      createdAt: true,
      completedAt: true,
      result: true,
    },
  });

  return tasks.map((t) => {
    const input = t.input as { message?: string } | null;
    return {
      id: t.id,
      type: t.type as QuickUseTaskSummary["type"],
      status: t.status as QuickUseTaskSummary["status"],
      inputPreview: (input?.message || "").slice(0, 120),
      creditsUsed: t.creditsUsed,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      hasResult: t.result !== null,
    };
  });
}

export async function getTaskDetail(
  taskId: string,
  userId: string
): Promise<QuickUseTaskDetail | null> {
  const t = await prisma.quickUseTask.findFirst({
    where: { id: taskId, userId },
  });

  if (!t) return null;

  const input = t.input as { message?: string; files?: unknown[] } | null;
  const progress = t.progress as QuickUseTaskDetail["progress"];
  const result = t.result as QuickUseResult | null;
  const interventions = (t.interventions as QuickUseIntervention[] | null) ?? [];

  return {
    id: t.id,
    type: t.type as QuickUseTaskDetail["type"],
    status: t.status as QuickUseTaskDetail["status"],
    inputPreview: (input?.message || "").slice(0, 120),
    creditsUsed: t.creditsUsed,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
    hasResult: result !== null,
    input: {
      message: input?.message || "",
      files: input?.files as QuickUseTaskDetail["input"]["files"],
    },
    config: t.config as Record<string, unknown> | null,
    progress,
    result,
    credits: result
      ? { estimatedCredits: t.creditsEstimated, creditsUsed: t.creditsUsed }
      : null,
    interventions,
    error: t.error,
  };
}

/* ── Notification ── */

async function sendCompletionNotification(
  userId: string,
  taskId: string,
  result: QuickUseResult
): Promise<void> {
  const title = result.title || "Quick Use Task";
  const summary = result.summary?.slice(0, 160) || "Your task has completed.";

  // Push notification
  try {
    await PushService.sendToUser(userId, {
      title: `${title} — Ready`,
      body: summary,
      url: `/dashboard?quickUseTask=${taskId}`,
    });
  } catch {
    // Push may not be configured
  }

  // Email notification
  try {
    await sendTaskCompletionEmail(userId, taskId, title, summary);
  } catch {
    // Email may not be configured
  }

  await prisma.quickUseTask.update({
    where: { id: taskId },
    data: { notified: true },
  });
}

async function sendTaskCompletionEmail(
  userId: string,
  taskId: string,
  title: string,
  summary: string
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailNotifications: true },
  });

  if (!user || !user.emailNotifications || user.email.endsWith("@clerk.temp")) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.kilnbase.com";
  const viewUrl = `${appUrl}/dashboard?quickUseTask=${taskId}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;color:#1a1a1a">
      <p style="font-size:18px;font-weight:600">Your task is ready</p>
      <p style="font-size:14px;color:#444">${escapeHtml(title)}</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#333">
        ${escapeHtml(summary)}
      </div>
      <a href="${viewUrl}" style="display:inline-block;background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
        View Results
      </a>
      <p style="margin-top:24px;font-size:12px;color:#999">KILN AI Creation Platform</p>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "KILN <noreply@kilnbase.com>",
      to: [user.email],
      subject: `Task Ready: ${title}`,
      html,
    }),
  });
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ── Cleanup (30 day TTL) ── */

export async function cleanupOldTasks(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.quickUseTask.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
