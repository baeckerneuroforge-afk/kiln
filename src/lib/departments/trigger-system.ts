import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/prisma";
import { patchMemory } from "./operating-memory";
import { triggerDepartment } from "./department-engine";
import { asJsonRecord } from "./json";

export async function departmentScheduleTick(now = new Date()): Promise<{
  checked: number;
  triggered: string[];
}> {
  const departments = await prisma.department.findMany({
    where: {
      status: "ACTIVE",
      scheduleEnabled: true,
      scheduleCron: { not: null },
    },
    select: {
      id: true,
      scheduleCron: true,
      operatingMemory: true,
    },
  });

  const triggered: string[] = [];

  for (const department of departments) {
    if (!department.scheduleCron) continue;
    const nextRun = getDueScheduleRun(
      department.scheduleCron,
      department.operatingMemory,
      now
    );
    if (!nextRun) continue;

    await patchMemory(department.id, {
      schedule: { lastRunAt: nextRun.toISOString() },
    });
    await triggerDepartment(department.id, {
      triggerType: "SCHEDULE",
      payload: { tickAt: now.toISOString(), scheduledFor: nextRun.toISOString() },
    });
    triggered.push(department.id);
  }

  return { checked: departments.length, triggered };
}

export async function handleWebhookTrigger(args: {
  departmentId: string;
  secret: string | null;
  payload: Record<string, unknown>;
}): Promise<{ queued: boolean; status: number; error?: string }> {
  const department = await prisma.department.findUnique({
    where: { id: args.departmentId },
    select: {
      id: true,
      webhookEnabled: true,
      webhookSecret: true,
      status: true,
    },
  });

  if (!department) return { queued: false, status: 404, error: "Not found" };
  if (!department.webhookEnabled) {
    return { queued: false, status: 403, error: "Webhook disabled" };
  }
  if (args.secret !== department.webhookSecret) {
    return { queued: false, status: 401, error: "Unauthorized" };
  }
  if (department.status === "ARCHIVED" || department.status === "PAUSED") {
    return { queued: false, status: 409, error: `Department is ${department.status}` };
  }

  await triggerDepartment(department.id, {
    triggerType: "WEBHOOK",
    payload: args.payload,
  });

  return { queued: true, status: 200 };
}

function getDueScheduleRun(
  cron: string,
  memoryValue: unknown,
  now: Date
): Date | null {
  try {
    const memory = asJsonRecord(memoryValue);
    const schedule = asJsonRecord(memory.schedule);
    const lastRunAt =
      typeof schedule.lastRunAt === "string" ? new Date(schedule.lastRunAt) : null;
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
    const interval = CronExpressionParser.parse(cron, {
      currentDate: windowStart,
      tz: "Europe/Berlin",
    });
    const nextRun = interval.next().toDate();

    if (nextRun.getTime() > now.getTime()) return null;
    if (lastRunAt && lastRunAt.getTime() >= nextRun.getTime()) return null;

    return nextRun;
  } catch {
    return null;
  }
}
