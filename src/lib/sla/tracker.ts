import type { SlaPolicy, SlaTracking } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findApplicablePolicy, type PolicyMatchInput } from "./policy-matcher";

export type SlaStatus = "OPEN" | "WARNING" | "BREACHED" | "MET" | "CANCELLED";

export interface StartTrackingArgs {
  conversationId?: string | null;
  channelMessageId?: string | null;
  customerProfileId?: string | null;
  orgId: string;
  departmentId: string;
  matchInput?: Pick<PolicyMatchInput, "channel" | "priority" | "tags">;
  startedAt?: Date;
}

export interface StartTrackingResult {
  tracking: SlaTracking;
  policy: SlaPolicy;
}

export async function startTracking(args: StartTrackingArgs): Promise<StartTrackingResult | null> {
  const policy = await findApplicablePolicy({
    departmentId: args.departmentId,
    channel: args.matchInput?.channel ?? null,
    priority: args.matchInput?.priority ?? null,
    tags: args.matchInput?.tags ?? null,
  });
  if (!policy) return null;

  if (args.conversationId) {
    const existing = await prisma.slaTracking.findFirst({
      where: {
        orgId: args.orgId,
        departmentId: args.departmentId,
        conversationId: args.conversationId,
        status: { in: ["OPEN", "WARNING"] },
      },
    });
    if (existing) {
      const refreshed = await prisma.slaTracking.findUnique({ where: { id: existing.id } });
      return refreshed ? { tracking: refreshed, policy } : null;
    }
  }

  const startedAt = args.startedAt ?? new Date();
  const tracking = await prisma.slaTracking.create({
    data: {
      conversationId: args.conversationId ?? null,
      channelMessageId: args.channelMessageId ?? null,
      customerProfileId: args.customerProfileId ?? null,
      slaPolicyId: policy.id,
      orgId: args.orgId,
      departmentId: args.departmentId,
      startedAt,
      status: "OPEN",
    },
  });

  await prisma.slaEvent.create({
    data: {
      slaTrackingId: tracking.id,
      type: "STARTED",
      message: `SLA-Tracking gestartet (Policy: ${policy.name})`,
      metadata: {
        policyId: policy.id,
        firstResponseTargetMinutes: policy.firstResponseTargetMinutes,
      } satisfies Prisma.InputJsonValue,
    },
  });

  return { tracking, policy };
}

function diffMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

export async function recordFirstResponse(trackingId: string, responseAt: Date = new Date()): Promise<SlaTracking | null> {
  const tracking = await prisma.slaTracking.findUnique({
    where: { id: trackingId },
    include: { slaPolicy: true },
  });
  if (!tracking) return null;
  if (tracking.firstResponseAt) return tracking;
  if (tracking.status === "CANCELLED" || tracking.status === "MET") return tracking;

  const minutes = diffMinutes(tracking.startedAt, responseAt);
  const target = tracking.slaPolicy.firstResponseTargetMinutes;
  const withinTarget = minutes <= target;
  const status: SlaStatus = withinTarget ? "MET" : "BREACHED";

  const updated = await prisma.slaTracking.update({
    where: { id: tracking.id },
    data: {
      firstResponseAt: responseAt,
      firstResponseMinutes: minutes,
      status,
    },
  });
  await prisma.slaEvent.create({
    data: {
      slaTrackingId: tracking.id,
      type: "RESPONDED",
      message: `Erste Antwort nach ${minutes} Minuten (Ziel: ${target})`,
      metadata: {
        firstResponseMinutes: minutes,
        targetMinutes: target,
        withinTarget,
      } satisfies Prisma.InputJsonValue,
    },
  });
  return updated;
}

export async function markResolved(trackingId: string, resolvedAt: Date = new Date()): Promise<SlaTracking | null> {
  const tracking = await prisma.slaTracking.findUnique({
    where: { id: trackingId },
    include: { slaPolicy: true },
  });
  if (!tracking) return null;
  if (tracking.resolvedAt) return tracking;

  const minutes = diffMinutes(tracking.startedAt, resolvedAt);
  const resolutionTarget = tracking.slaPolicy.resolutionTargetMinutes ?? null;
  let status: SlaStatus = (tracking.status as SlaStatus) ?? "OPEN";
  if (status === "OPEN" || status === "WARNING") status = "MET";
  if (resolutionTarget !== null && minutes > resolutionTarget) status = "BREACHED";

  const updated = await prisma.slaTracking.update({
    where: { id: tracking.id },
    data: {
      resolvedAt,
      resolutionMinutes: minutes,
      status,
    },
  });
  await prisma.slaEvent.create({
    data: {
      slaTrackingId: tracking.id,
      type: "RESOLVED",
      message: `Vorgang resolved nach ${minutes} Minuten`,
      metadata: { resolutionMinutes: minutes, resolutionTargetMinutes: resolutionTarget } satisfies Prisma.InputJsonValue,
    },
  });
  return updated;
}

export async function cancelTracking(trackingId: string, reason?: string): Promise<SlaTracking | null> {
  const existing = await prisma.slaTracking.findUnique({ where: { id: trackingId } });
  if (!existing) return null;
  if (existing.status === "CANCELLED" || existing.status === "MET") return existing;
  const updated = await prisma.slaTracking.update({
    where: { id: trackingId },
    data: { status: "CANCELLED" },
  });
  await prisma.slaEvent.create({
    data: {
      slaTrackingId: trackingId,
      type: "CANCELLED",
      message: reason ? `Cancelled: ${reason}` : "Cancelled",
    },
  });
  return updated;
}

export interface FindActiveTrackingArgs {
  departmentId: string;
  conversationId?: string | null;
  channelMessageId?: string | null;
  customerProfileId?: string | null;
}

export async function findActiveTracking(args: FindActiveTrackingArgs): Promise<SlaTracking | null> {
  const orConditions: Record<string, unknown>[] = [];
  if (args.conversationId) orConditions.push({ conversationId: args.conversationId });
  if (args.channelMessageId) orConditions.push({ channelMessageId: args.channelMessageId });
  if (args.customerProfileId) orConditions.push({ customerProfileId: args.customerProfileId });
  if (orConditions.length === 0) return null;
  return prisma.slaTracking.findFirst({
    where: {
      departmentId: args.departmentId,
      status: { in: ["OPEN", "WARNING"] },
      OR: orConditions,
    },
    orderBy: { startedAt: "desc" },
  });
}

export interface CheckOpenTrackingsResult {
  inspected: number;
  warnings: number;
  breaches: number;
}

export interface CheckOpenTrackingsOptions {
  now?: Date;
  notify?: (event: SlaEscalationEvent) => Promise<unknown>;
  /** When set, only inspect trackings with startedAt > now - sinceHours. */
  sinceHours?: number;
  /** Only inspect trackings for these orgs (sub-org isolation in tests). */
  orgIds?: string[];
}

export interface SlaEscalationEvent {
  trackingId: string;
  policyId: string;
  departmentId: string;
  orgId: string;
  type: "WARNING" | "BREACHED";
  elapsedMinutes: number;
  targetMinutes: number;
  thresholdMinutes: number;
  escalationChannel: string | null;
  escalationTargetUserId: string | null;
}

export async function checkOpenTrackings(options: CheckOpenTrackingsOptions = {}): Promise<CheckOpenTrackingsResult> {
  const now = options.now ?? new Date();
  const where: Record<string, unknown> = {
    status: { in: ["OPEN", "WARNING"] },
  };
  if (options.sinceHours && options.sinceHours > 0) {
    where.startedAt = { gte: new Date(now.getTime() - options.sinceHours * 3_600_000) };
  }
  if (options.orgIds && options.orgIds.length > 0) {
    where.orgId = { in: options.orgIds };
  }

  const trackings = await prisma.slaTracking.findMany({
    where,
    include: { slaPolicy: true },
    take: 500,
  });

  let warnings = 0;
  let breaches = 0;
  for (const tracking of trackings) {
    const elapsed = diffMinutes(tracking.startedAt, now);
    const target = tracking.slaPolicy.firstResponseTargetMinutes;
    const thresholdMinutes = Math.floor((target * tracking.slaPolicy.warningThresholdPercent) / 100);

    const shouldBreach = elapsed > target && tracking.status !== "BREACHED";
    const shouldWarn = !shouldBreach && elapsed >= thresholdMinutes && tracking.status === "OPEN";

    if (shouldBreach) {
      if (!tracking.firstResponseAt) {
        await prisma.slaTracking.update({
          where: { id: tracking.id },
          data: { status: "BREACHED", breachEscalatedAt: tracking.breachEscalatedAt ?? now },
        });
        await prisma.slaEvent.create({
          data: {
            slaTrackingId: tracking.id,
            type: "BREACHED",
            message: `SLA-Bruch (${elapsed} Min, Ziel ${target} Min)`,
            metadata: { elapsedMinutes: elapsed, targetMinutes: target } satisfies Prisma.InputJsonValue,
          },
        });
        if (!tracking.breachEscalatedAt && options.notify) {
          await options.notify({
            trackingId: tracking.id,
            policyId: tracking.slaPolicyId,
            departmentId: tracking.departmentId,
            orgId: tracking.orgId,
            type: "BREACHED",
            elapsedMinutes: elapsed,
            targetMinutes: target,
            thresholdMinutes,
            escalationChannel: tracking.slaPolicy.escalationChannel,
            escalationTargetUserId: tracking.slaPolicy.escalationTargetUserId,
          });
        }
        breaches += 1;
      }
      continue;
    }

    if (shouldWarn) {
      await prisma.slaTracking.update({
        where: { id: tracking.id },
        data: { status: "WARNING", warningEscalatedAt: tracking.warningEscalatedAt ?? now },
      });
      await prisma.slaEvent.create({
        data: {
          slaTrackingId: tracking.id,
          type: "WARNING",
          message: `SLA-Warnung (${elapsed}/${target} Min, Schwelle ${tracking.slaPolicy.warningThresholdPercent}%)`,
          metadata: {
            elapsedMinutes: elapsed,
            targetMinutes: target,
            thresholdMinutes,
          } satisfies Prisma.InputJsonValue,
        },
      });
      if (!tracking.warningEscalatedAt && options.notify) {
        await options.notify({
          trackingId: tracking.id,
          policyId: tracking.slaPolicyId,
          departmentId: tracking.departmentId,
          orgId: tracking.orgId,
          type: "WARNING",
          elapsedMinutes: elapsed,
          targetMinutes: target,
          thresholdMinutes,
          escalationChannel: tracking.slaPolicy.escalationChannel,
          escalationTargetUserId: tracking.slaPolicy.escalationTargetUserId,
        });
      }
      warnings += 1;
    }
  }

  return { inspected: trackings.length, warnings, breaches };
}
