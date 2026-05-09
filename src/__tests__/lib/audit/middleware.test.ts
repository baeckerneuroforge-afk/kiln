import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { withAudit } from "@/lib/audit/middleware";

describe("audit middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.auditLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "log_1", ...data }));
  });

  it("logs INFO entry on successful handler call", async () => {
    const handler = vi.fn(async (arg: { id: string }) => ({ ok: true, value: 42, used: arg.id }));
    const wrapped = withAudit(
      handler,
      { action: "DOIT", resourceType: "TEST" },
      (args) => ({ orgId: "org_a", actorUserId: "user_a", description: `id=${args[0].id}` }),
    );
    const result = await wrapped({ id: "abc" });
    expect(result.value).toBe(42);
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.action).toBe("DOIT");
    expect(data?.severity).toBe("INFO");
    expect(data?.description).toBe("id=abc");
  });

  it("logs WARN entry on handler error and re-throws", async () => {
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });
    const wrapped = withAudit(
      handler,
      { action: "DOIT", resourceType: "TEST" },
      () => ({ orgId: "org_a", actorUserId: "user_a" }),
    );
    await expect(wrapped()).rejects.toThrow("boom");
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.severity).toBe("WARN");
    expect(data?.metadata).toMatchObject({ ok: false, error: "boom" });
  });

  it("respects explicit severity for non-error path", async () => {
    const handler = vi.fn(async () => ({}));
    const wrapped = withAudit(
      handler,
      { action: "DOIT", resourceType: "TEST", severity: "CRITICAL" },
      () => ({ orgId: "org_a" }),
    );
    await wrapped();
    expect(mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data?.severity).toBe("CRITICAL");
  });

  it("does nothing if resolveContext returns null", async () => {
    const handler = vi.fn(async () => ({}));
    const wrapped = withAudit(
      handler,
      { action: "DOIT", resourceType: "TEST" },
      () => null,
    );
    await wrapped();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("uses resolveResourceId to set resourceId", async () => {
    const handler = vi.fn(async (_request: unknown, ctx: { params: { id: string } }) => ({ ok: true, id: ctx.params.id }));
    const wrapped = withAudit(
      handler,
      {
        action: "UPDATE",
        resourceType: "AGENT",
        resolveResourceId: (...args) => (args[1] as { params: { id: string } })?.params?.id ?? null,
      },
      (args) => ({ orgId: "org_a", description: `id=${(args[1] as { params: { id: string } })?.params?.id}` }),
    );
    await wrapped(null, { params: { id: "agent_1" } });
    expect(mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data?.resourceId).toBe("agent_1");
  });
});
