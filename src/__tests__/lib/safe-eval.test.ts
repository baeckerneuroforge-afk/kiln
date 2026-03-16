import { describe, expect, it, vi } from "vitest";

const mockCaptureException = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
}));

import { MAX_CODE_LENGTH, safeEval } from "@/lib/safe-eval";

describe("safeEval", () => {
  it("executes valid code and returns the result", async () => {
    const result = await safeEval<number>({
      args: ["input"],
      values: [2],
      code: "return input + 1;",
    });

    expect(result).toEqual({ success: true, result: 3 });
  });

  it("blocks access to process, require, and fetch", async () => {
    await expect(
      safeEval({
        args: [],
        values: [],
        code: "return process.env.PATH;",
      })
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("failed"),
    });

    await expect(
      safeEval({
        args: [],
        values: [],
        code: "return require('fs');",
      })
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("failed"),
    });

    await expect(
      safeEval({
        args: [],
        values: [],
        code: "return fetch('https://example.com');",
      })
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("failed"),
    });
  });

  it("times out after 5 seconds on infinite loops", async () => {
    const startedAt = Date.now();
    const result = await safeEval({
      args: [],
      values: [],
      code: "while (true) {}",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
    expect(Date.now() - startedAt).toBeLessThan(6_500);
  });

  it("rejects code over 10000 characters", async () => {
    const result = await safeEval({
      args: [],
      values: [],
      code: "a".repeat(MAX_CODE_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("maximum length");
  });
});
