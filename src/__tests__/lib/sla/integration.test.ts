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
  customerProfile: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { findActiveTracking, recordFirstResponse, startTracking } from "@/lib/sla/tracker";

const policyRow = (priority: number, appliesTo = "ALL", conditionValue: string | null = null) => ({
  id: `policy_${priority}`,
  departmentId: "dept_a",
  name: `Policy ${priority}`,
  description: null,
  appliesTo,
  conditionValue,
  firstResponseTargetMinutes: 60,
  resolutionTargetMinutes: null,
  warningThresholdPercent: 75,
  escalationChannel: "BOTH",
  escalationTargetUserId: null,
  priority,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("sla engine integration scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.slaTracking.findFirst.mockResolvedValue(null);
    mockPrisma.slaTracking.findUnique.mockResolvedValue(null);
    mockPrisma.slaTracking.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "tracking_new", ...data }));
    mockPrisma.slaTracking.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({ id: where.id, ...data }));
    mockPrisma.slaEvent.create.mockResolvedValue({});
  });

  it("inbound webhook scenario: BY_CHANNEL policy beats ALL when channel matches", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([
      policyRow(50, "ALL"),
      policyRow(50, "BY_CHANNEL", "EMAIL"),
    ]);
    const result = await startTracking({
      orgId: "org_a",
      departmentId: "dept_a",
      matchInput: { channel: "EMAIL" },
    });
    expect(result?.policy.id).toBe("policy_50"); // priority same, BY_CHANNEL ranks higher
    expect(result?.policy.appliesTo).toBe("BY_CHANNEL");
  });

  it("inbound webhook scenario: tracking starts even without customerProfile", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([policyRow(50)]);
    const result = await startTracking({
      orgId: "org_a",
      departmentId: "dept_a",
      channelMessageId: "msg_1",
      matchInput: { channel: "EMAIL" },
    });
    expect(result?.tracking).toBeTruthy();
    const createCall = mockPrisma.slaTracking.create.mock.calls[0]?.[0];
    expect(createCall?.data?.customerProfileId).toBeNull();
  });

  it("approval-resolved scenario: findActiveTracking by conversationId", async () => {
    mockPrisma.slaTracking.findFirst.mockResolvedValueOnce({
      id: "tracking_existing",
      status: "OPEN",
      conversationId: "backlog_1",
    });
    const tracking = await findActiveTracking({
      departmentId: "dept_a",
      conversationId: "backlog_1",
    });
    expect(tracking?.id).toBe("tracking_existing");
    const call = mockPrisma.slaTracking.findFirst.mock.calls[0]?.[0];
    expect(call?.where?.status?.in).toEqual(["OPEN", "WARNING"]);
  });

  it("outbound-message scenario: recordFirstResponse RESPONDED event includes target", async () => {
    mockPrisma.slaTracking.findUnique.mockResolvedValueOnce({
      id: "tracking_1",
      orgId: "org_a",
      departmentId: "dept_a",
      slaPolicyId: "policy_50",
      startedAt: new Date("2026-05-09T10:00:00.000Z"),
      firstResponseAt: null,
      resolvedAt: null,
      status: "OPEN",
      firstResponseMinutes: null,
      resolutionMinutes: null,
      warningEscalatedAt: null,
      breachEscalatedAt: null,
      conversationId: null,
      channelMessageId: null,
      customerProfileId: null,
      slaPolicy: policyRow(50),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await recordFirstResponse("tracking_1", new Date("2026-05-09T10:30:00.000Z"));
    expect(mockPrisma.slaEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RESPONDED",
          metadata: expect.objectContaining({ targetMinutes: 60, withinTarget: true }),
        }),
      }),
    );
  });

  it("findActiveTracking returns null when no identifiers given", async () => {
    const tracking = await findActiveTracking({ departmentId: "dept_a" });
    expect(tracking).toBeNull();
  });
});
