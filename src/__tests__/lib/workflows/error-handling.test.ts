import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  workflowDeadLetter: { create: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  classifyWorkflowError,
  recordDeadLetter,
  runWithRetry,
  transitionDeadLetterStatus,
} from "@/lib/workflows/error-handling";

describe("workflows error-handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workflowDeadLetter.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "dl_1", ...data }));
    mockPrisma.workflowDeadLetter.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({ id: where.id, ...data }));
  });

  it("classifies 401 as AUTH non-retryable", () => {
    const result = classifyWorkflowError({ status: 401, message: "Unauthorized" });
    expect(result.type).toBe("AUTH");
    expect(result.retryable).toBe(false);
  });

  it("classifies 429 as RATE_LIMIT retryable", () => {
    const result = classifyWorkflowError({ status: 429, message: "Too many" });
    expect(result.type).toBe("RATE_LIMIT");
    expect(result.retryable).toBe(true);
  });

  it("classifies 500 as SERVER_ERROR retryable", () => {
    const result = classifyWorkflowError({ status: 503, message: "Bad gateway" });
    expect(result.type).toBe("SERVER_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("classifies 422 as VALIDATION non-retryable", () => {
    const result = classifyWorkflowError({ status: 422, message: "Invalid payload" });
    expect(result.type).toBe("VALIDATION");
    expect(result.retryable).toBe(false);
  });

  it("classifies network keywords without status code", () => {
    const result = classifyWorkflowError({ message: "fetch failed: ECONNRESET" });
    expect(result.type).toBe("NETWORK");
    expect(result.retryable).toBe(true);
  });

  it("falls back to UNKNOWN for plain Error", () => {
    const result = classifyWorkflowError(new Error("something went wrong"));
    expect(result.type).toBe("UNKNOWN");
    expect(result.retryable).toBe(false);
  });

  it("runWithRetry returns ok on first success", async () => {
    const result = await runWithRetry(async () => 42, { retryCount: 3 });
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
    expect(result.attempts).toHaveLength(0);
  });

  it("runWithRetry retries on retryable errors with exponential backoff", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    const result = await runWithRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error("fetch failed"), { status: 500 });
        return "ok";
      },
      { retryCount: 3, retryDelayMs: 100, backoff: "EXPONENTIAL", sleep },
    );
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("runWithRetry uses fixed backoff when configured", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    await runWithRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error("server"), { status: 500 });
        return null;
      },
      { retryCount: 3, retryDelayMs: 50, backoff: "FIXED", sleep },
    );
    expect(sleep).toHaveBeenNthCalledWith(1, 50);
    expect(sleep).toHaveBeenNthCalledWith(2, 50);
  });

  it("runWithRetry stops on non-retryable errors", async () => {
    let calls = 0;
    const result = await runWithRetry(
      async () => {
        calls += 1;
        throw Object.assign(new Error("auth bad"), { status: 401 });
      },
      { retryCount: 5, retryDelayMs: 0 },
    );
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("AUTH");
  });

  it("runWithRetry honours retryOn whitelist", async () => {
    let calls = 0;
    const result = await runWithRetry(
      async () => {
        calls += 1;
        throw Object.assign(new Error("server"), { status: 500 });
      },
      { retryCount: 3, retryDelayMs: 0, retryOn: ["RATE_LIMIT"] },
    );
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
  });

  it("runWithRetry caps retryCount at 5", async () => {
    let calls = 0;
    await runWithRetry(
      async () => {
        calls += 1;
        throw Object.assign(new Error("server"), { status: 500 });
      },
      { retryCount: 99, retryDelayMs: 0 },
    );
    expect(calls).toBe(6); // 1 initial + 5 retries
  });

  it("recordDeadLetter creates a row with capped error message", async () => {
    await recordDeadLetter({
      agentTeamId: "team_1",
      teamExecutionId: "exec_1",
      nodeId: "node_a",
      nodeType: "HTTP_ADVANCED",
      payload: { url: "https://x" },
      error: "boom",
      attempts: 2,
    });
    const data = mockPrisma.workflowDeadLetter.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data?.agentTeamId).toBe("team_1");
    expect(data?.attempts).toBe(2);
    expect(data?.error).toBe("boom");
  });

  it("transitionDeadLetterStatus sets retriedAt when status=RETRIED", async () => {
    await transitionDeadLetterStatus({ id: "dl_1", status: "RETRIED" });
    const data = mockPrisma.workflowDeadLetter.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data?.status).toBe("RETRIED");
    expect(data?.retriedAt).toBeInstanceOf(Date);
  });

  it("transitionDeadLetterStatus sets discardedAt when status=DISCARDED", async () => {
    await transitionDeadLetterStatus({ id: "dl_1", status: "DISCARDED" });
    const data = mockPrisma.workflowDeadLetter.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data?.status).toBe("DISCARDED");
    expect(data?.discardedAt).toBeInstanceOf(Date);
  });
});
