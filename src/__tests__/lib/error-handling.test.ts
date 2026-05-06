import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeWithErrorHandling,
  normalizeErrorHandlingConfig,
} from "@/lib/workflow-node-policies";

describe("node error handling policy", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to stopping the workflow", () => {
    expect(normalizeErrorHandlingConfig({})).toEqual({
      onError: "stop",
      retryCount: 1,
      retryDelayMs: 1000,
    });
  });

  it("clamps retry attempts and delay", () => {
    expect(normalizeErrorHandlingConfig({
      errorHandling: {
        onError: "retry",
        retryCount: 99,
        retryDelayMs: 120_000,
      },
    })).toEqual({
      onError: "retry",
      retryCount: 5,
      retryDelayMs: 60_000,
    });
  });

  it("keeps supported fallback mode", () => {
    expect(normalizeErrorHandlingConfig({
      errorHandling: { onError: "fallback", retryCount: 2, retryDelaySeconds: 3 },
    })).toEqual({
      onError: "fallback",
      retryCount: 2,
      retryDelayMs: 3000,
    });
  });

  it("returns the successful value without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(executeWithErrorHandling(fn, {})).resolves.toEqual({
      ok: true,
      value: "ok",
      attempts: 1,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries failed execution until it succeeds", async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue("recovered");

    const result = executeWithErrorHandling(fn, {
      errorHandling: { onError: "retry", retryCount: 1, retryDelayMs: 1000 },
    });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({
      ok: true,
      value: "recovered",
      attempts: 2,
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("returns the final error after retry exhaustion", async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("last"));

    const result = executeWithErrorHandling(fn, {
      errorHandling: { onError: "retry", retryCount: 1, retryDelayMs: 1000 },
    });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({
      ok: false,
      error: "last",
      attempts: 2,
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
