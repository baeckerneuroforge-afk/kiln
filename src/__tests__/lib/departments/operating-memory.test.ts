import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  department: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { patchMemory, readMemory, setMemoryKey } from "@/lib/departments/operating-memory";

describe("department operating memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads memory from a department", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({ operatingMemory: { a: 1 } });
    await expect(readMemory("dept_1")).resolves.toEqual({ a: 1 });
  });

  it("returns empty memory when missing", async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);
    await expect(readMemory("dept_1")).resolves.toEqual({});
  });

  it("patches memory with deep merge", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({ operatingMemory: { a: { b: 1 } } });
    mockPrisma.department.update.mockResolvedValue({});
    await patchMemory("dept_1", { a: { c: 2 } });
    expect(mockPrisma.department.update).toHaveBeenCalledWith({
      where: { id: "dept_1" },
      data: { operatingMemory: { a: { b: 1, c: 2 } } },
    });
  });

  it("sets a top-level memory key", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({ operatingMemory: {} });
    mockPrisma.department.update.mockResolvedValue({});
    await setMemoryKey("dept_1", "lastTicket", { id: "ticket_1" });
    expect(mockPrisma.department.update).toHaveBeenCalledWith({
      where: { id: "dept_1" },
      data: { operatingMemory: { lastTicket: { id: "ticket_1" } } },
    });
  });

  it("warns but still updates oversized memory", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPrisma.department.findUnique.mockResolvedValue({ operatingMemory: {} });
    mockPrisma.department.update.mockResolvedValue({});
    await patchMemory("dept_1", { blob: "x".repeat(1024 * 1024 + 1) });
    expect(warn).toHaveBeenCalled();
  });
});
