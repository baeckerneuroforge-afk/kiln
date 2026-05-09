import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  slaPolicy: { findMany: vi.fn() },
  slaTracking: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  slaEvent: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  cancelTracking,
  checkOpenTrackings,
  markResolved,
  recordFirstResponse,
  startTracking,
} from "@/lib/sla/tracker";

const policyRow = (overrides: Partial<{ firstResponseTargetMinutes: number; resolutionTargetMinutes: number | null; warningThresholdPercent: number; escalationChannel: string | null; escalationTargetUserId: string | null; priority: number }> = {}) => ({
  id: "policy_a",
  departmentId: "dept_a",
  name: "Standard",
  description: null,
  appliesTo: "ALL",
  conditionValue: null,
  firstResponseTargetMinutes: overrides.firstResponseTargetMinutes ?? 60,
  resolutionTargetMinutes: overrides.resolutionTargetMinutes ?? null,
  warningThresholdPercent: overrides.warningThresholdPercent ?? 75,
  escalationChannel: overrides.escalationChannel ?? null,
  escalationTargetUserId: overrides.escalationTargetUserId ?? null,
  priority: overrides.priority ?? 50,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const trackingRow = (overrides: Partial<{ id: string; status: string; firstResponseAt: Date | null; resolvedAt: Date | null; warningEscalatedAt: Date | null; breachEscalatedAt: Date | null; startedAt: Date }> = {}) => ({
  id: overrides.id ?? "tracking_1",
  conversationId: null,
  channelMessageId: null,
  customerProfileId: null,
  slaPolicyId: "policy_a",
  orgId: "org_a",
  departmentId: "dept_a",
  startedAt: overrides.startedAt ?? new Date("2026-05-09T10:00:00.000Z"),
  firstResponseAt: overrides.firstResponseAt ?? null,
  resolvedAt: overrides.resolvedAt ?? null,
  status: overrides.status ?? "OPEN",
  firstResponseMinutes: null,
  resolutionMinutes: null,
  warningEscalatedAt: overrides.warningEscalatedAt ?? null,
  breachEscalatedAt: overrides.breachEscalatedAt ?? null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("sla tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.slaTracking.findFirst.mockResolvedValue(null);
    mockPrisma.slaTracking.findUnique.mockResolvedValue(null);
    mockPrisma.slaTracking.findMany.mockResolvedValue([]);
    mockPrisma.slaTracking.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "tracking_new", ...data }));
    mockPrisma.slaTracking.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({ id: where.id, ...data }));
    mockPrisma.slaEvent.create.mockResolvedValue({});
  });

  it("startTracking returns null when no policy applies", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([]);
    const result = await startTracking({ orgId: "org_a", departmentId: "dept_a" });
    expect(result).toBeNull();
    expect(mockPrisma.slaTracking.create).not.toHaveBeenCalled();
  });

  it("startTracking creates record + STARTED event when policy matches", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([policyRow()]);
    const result = await startTracking({ orgId: "org_a", departmentId: "dept_a" });
    expect(result?.tracking.id).toBe("tracking_new");
    expect(mockPrisma.slaTracking.create).toHaveBeenCalled();
    expect(mockPrisma.slaEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "STARTED" }) }),
    );
  });

  it("startTracking returns existing OPEN tracking for same conversation", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([policyRow()]);
    mockPrisma.slaTracking.findFirst.mockResolvedValueOnce(trackingRow({ id: "tracking_existing" }));
    mockPrisma.slaTracking.findUnique.mockResolvedValueOnce(trackingRow({ id: "tracking_existing" }));
    const result = await startTracking({
      orgId: "org_a",
      departmentId: "dept_a",
      conversationId: "conv_1",
    });
    expect(result?.tracking.id).toBe("tracking_existing");
    expect(mockPrisma.slaTracking.create).not.toHaveBeenCalled();
  });

  it("recordFirstResponse computes firstResponseMinutes and marks MET when within target", async () => {
    mockPrisma.slaTracking.findUnique.mockResolvedValueOnce({
      ...trackingRow({ startedAt: new Date("2026-05-09T10:00:00.000Z") }),
      slaPolicy: policyRow({ firstResponseTargetMinutes: 60 }),
    });
    await recordFirstResponse("tracking_1", new Date("2026-05-09T10:30:00.000Z"));
    const update = mockPrisma.slaTracking.update.mock.calls[0]?.[0];
    expect(update?.data?.firstResponseMinutes).toBe(30);
    expect(update?.data?.status).toBe("MET");
  });

  it("recordFirstResponse marks BREACHED when over target", async () => {
    mockPrisma.slaTracking.findUnique.mockResolvedValueOnce({
      ...trackingRow({ startedAt: new Date("2026-05-09T10:00:00.000Z") }),
      slaPolicy: policyRow({ firstResponseTargetMinutes: 30 }),
    });
    await recordFirstResponse("tracking_1", new Date("2026-05-09T11:30:00.000Z"));
    const update = mockPrisma.slaTracking.update.mock.calls[0]?.[0];
    expect(update?.data?.firstResponseMinutes).toBe(90);
    expect(update?.data?.status).toBe("BREACHED");
  });

  it("recordFirstResponse is no-op when firstResponseAt already set", async () => {
    mockPrisma.slaTracking.findUnique.mockResolvedValueOnce({
      ...trackingRow({ firstResponseAt: new Date() }),
      slaPolicy: policyRow(),
    });
    await recordFirstResponse("tracking_1", new Date());
    expect(mockPrisma.slaTracking.update).not.toHaveBeenCalled();
  });

  it("markResolved updates resolutionMinutes and ends in MET when within target", async () => {
    mockPrisma.slaTracking.findUnique.mockResolvedValueOnce({
      ...trackingRow({ startedAt: new Date("2026-05-09T10:00:00.000Z"), status: "OPEN" }),
      slaPolicy: policyRow({ resolutionTargetMinutes: 240 }),
    });
    await markResolved("tracking_1", new Date("2026-05-09T13:00:00.000Z"));
    const update = mockPrisma.slaTracking.update.mock.calls[0]?.[0];
    expect(update?.data?.resolutionMinutes).toBe(180);
    expect(update?.data?.status).toBe("MET");
  });

  it("markResolved marks BREACHED if resolution exceeds resolutionTarget", async () => {
    mockPrisma.slaTracking.findUnique.mockResolvedValueOnce({
      ...trackingRow({ startedAt: new Date("2026-05-09T10:00:00.000Z"), status: "OPEN" }),
      slaPolicy: policyRow({ resolutionTargetMinutes: 60 }),
    });
    await markResolved("tracking_1", new Date("2026-05-09T13:00:00.000Z"));
    const update = mockPrisma.slaTracking.update.mock.calls[0]?.[0];
    expect(update?.data?.status).toBe("BREACHED");
  });

  it("checkOpenTrackings flags WARNING when threshold reached", async () => {
    const startedAt = new Date("2026-05-09T10:00:00.000Z");
    const now = new Date("2026-05-09T10:50:00.000Z"); // 50 min, threshold 75% of 60 = 45
    mockPrisma.slaTracking.findMany.mockResolvedValueOnce([
      { ...trackingRow({ startedAt }), slaPolicy: policyRow({ firstResponseTargetMinutes: 60, warningThresholdPercent: 75 }) },
    ]);
    const notify = vi.fn();
    const result = await checkOpenTrackings({ now, notify });
    expect(result.warnings).toBe(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "WARNING" }));
  });

  it("checkOpenTrackings flags BREACHED when over target and notifies", async () => {
    const startedAt = new Date("2026-05-09T10:00:00.000Z");
    const now = new Date("2026-05-09T11:30:00.000Z"); // 90 min, target 60
    mockPrisma.slaTracking.findMany.mockResolvedValueOnce([
      { ...trackingRow({ startedAt }), slaPolicy: policyRow({ firstResponseTargetMinutes: 60 }) },
    ]);
    const notify = vi.fn();
    const result = await checkOpenTrackings({ now, notify });
    expect(result.breaches).toBe(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "BREACHED" }));
  });

  it("checkOpenTrackings is idempotent across runs (no double-notify)", async () => {
    const startedAt = new Date("2026-05-09T10:00:00.000Z");
    const now = new Date("2026-05-09T11:30:00.000Z");
    mockPrisma.slaTracking.findMany.mockResolvedValueOnce([
      {
        ...trackingRow({ startedAt, status: "BREACHED", breachEscalatedAt: new Date("2026-05-09T11:25:00.000Z") }),
        slaPolicy: policyRow({ firstResponseTargetMinutes: 60 }),
      },
    ]);
    const notify = vi.fn();
    const result = await checkOpenTrackings({ now, notify });
    expect(result.breaches).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("cancelTracking transitions status to CANCELLED and writes event", async () => {
    mockPrisma.slaTracking.findUnique.mockResolvedValueOnce(trackingRow());
    await cancelTracking("tracking_1", "customer self-resolved");
    const update = mockPrisma.slaTracking.update.mock.calls[0]?.[0];
    expect(update?.data?.status).toBe("CANCELLED");
    expect(mockPrisma.slaEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "CANCELLED" }) }),
    );
  });
});
