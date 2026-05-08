import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  department: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const triggerDepartment = vi.hoisted(() => vi.fn());
const patchMemory = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/departments/department-engine", () => ({ triggerDepartment }));
vi.mock("@/lib/departments/operating-memory", () => ({ patchMemory }));

import { departmentScheduleTick, handleWebhookTrigger } from "@/lib/departments/trigger-system";

describe("department trigger system", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("triggers due scheduled departments", async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      { id: "dept_1", scheduleCron: "* * * * *", operatingMemory: {} },
    ]);
    const result = await departmentScheduleTick(new Date("2026-05-08T10:00:30.000Z"));
    expect(result.triggered).toEqual(["dept_1"]);
    expect(triggerDepartment).toHaveBeenCalledWith("dept_1", expect.objectContaining({ triggerType: "SCHEDULE" }));
  });

  it("skips schedules already marked as run", async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      {
        id: "dept_1",
        scheduleCron: "* * * * *",
        operatingMemory: { schedule: { lastRunAt: "2026-05-08T10:00:00.000Z" } },
      },
    ]);
    const result = await departmentScheduleTick(new Date("2026-05-08T10:00:30.000Z"));
    expect(result.triggered).toEqual([]);
  });

  it("accepts webhook triggers with the department secret", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      webhookEnabled: true,
      webhookSecret: "secret",
      status: "ACTIVE",
    });
    await expect(
      handleWebhookTrigger({ departmentId: "dept_1", secret: "secret", payload: { ticket: 1 } })
    ).resolves.toMatchObject({ queued: true, status: 200 });
  });

  it("rejects webhook triggers with the wrong secret", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      webhookEnabled: true,
      webhookSecret: "secret",
      status: "ACTIVE",
    });
    await expect(
      handleWebhookTrigger({ departmentId: "dept_1", secret: "bad", payload: {} })
    ).resolves.toMatchObject({ queued: false, status: 401 });
  });
});
