import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/departments/json";

export async function logDepartmentChannelEvent(args: {
  departmentId: string;
  backlogItemId?: string | null;
  event: string;
  channel?: string;
  sender?: string | null;
  recipient?: string | null;
  approverUserId?: string | null;
  blocked?: boolean;
  status?: string;
  error?: string | null;
  payload?: Record<string, unknown>;
}) {
  await prisma.departmentRunLog.create({
    data: {
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId || null,
      managerDecision: toPrismaJson({
        event: args.event,
        channel: args.channel,
        sender: args.sender,
        recipient: args.recipient,
        approverUserId: args.approverUserId,
        blocked: args.blocked,
        status: args.status,
        error: args.error,
        timestamp: new Date().toISOString(),
        ...(args.payload || {}),
      }),
      workerInvoked: null,
      invocationType: "CHANNEL",
      durationMs: 0,
      tokensUsed: 0,
    },
  });
}
