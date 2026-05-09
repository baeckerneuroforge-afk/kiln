import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  slaPolicy: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { findApplicablePolicy } from "@/lib/sla/policy-matcher";

const policy = (overrides: Partial<{ id: string; appliesTo: string; conditionValue: string | null; priority: number; isActive: boolean }>) => ({
  id: overrides.id ?? "p_a",
  departmentId: "dept_a",
  name: overrides.id ?? "Policy",
  description: null,
  appliesTo: overrides.appliesTo ?? "ALL",
  conditionValue: overrides.conditionValue ?? null,
  firstResponseTargetMinutes: 60,
  resolutionTargetMinutes: null,
  warningThresholdPercent: 75,
  escalationChannel: null,
  escalationTargetUserId: null,
  isActive: overrides.isActive ?? true,
  priority: overrides.priority ?? 50,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("sla policy-matcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches ALL applies-to when no conditions are set", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([policy({ id: "p_all" })]);
    const result = await findApplicablePolicy({ departmentId: "dept_a" });
    expect(result?.id).toBe("p_all");
  });

  it("matches BY_PRIORITY when condition value matches the input", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([
      policy({ id: "p_pri", appliesTo: "BY_PRIORITY", conditionValue: "URGENT", priority: 80 }),
      policy({ id: "p_default", priority: 10 }),
    ]);
    const result = await findApplicablePolicy({ departmentId: "dept_a", priority: "urgent" });
    expect(result?.id).toBe("p_pri");
  });

  it("matches BY_CHANNEL with case-insensitive comparison", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([
      policy({ id: "p_chan", appliesTo: "BY_CHANNEL", conditionValue: "EMAIL", priority: 70 }),
    ]);
    const result = await findApplicablePolicy({ departmentId: "dept_a", channel: "email" });
    expect(result?.id).toBe("p_chan");
  });

  it("higher priority wins when multiple policies match", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([
      policy({ id: "p_low", priority: 10 }),
      policy({ id: "p_high", priority: 90 }),
    ]);
    const result = await findApplicablePolicy({ departmentId: "dept_a" });
    expect(result?.id).toBe("p_high");
  });

  it("inactive policies are ignored at the query level", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([]);
    const result = await findApplicablePolicy({ departmentId: "dept_a" });
    expect(result).toBeNull();
    const call = mockPrisma.slaPolicy.findMany.mock.calls[0]?.[0];
    expect(call?.where?.isActive).toBe(true);
  });
});
