import { beforeEach, describe, expect, it } from "vitest";
import {
  TokenBucket,
  checkNodeRateLimit,
  evaluateNodeSchedule,
  normalizeRateLimitConfig,
  normalizeScheduleConfig,
  resetWorkflowRateLimitBuckets,
} from "@/lib/workflow-node-policies";

describe("node rate limiting and scheduling", () => {
  beforeEach(() => {
    resetWorkflowRateLimitBuckets();
  });

  it("normalizes disabled rate limits", () => {
    expect(normalizeRateLimitConfig({})).toEqual({
      enabled: false,
      maxRequests: 60,
      windowMs: 60_000,
      burstSize: 60,
      behavior: "queue",
    });
  });

  it("normalizes preset windows and reject behavior", () => {
    expect(normalizeRateLimitConfig({
      rateLimit: {
        enabled: true,
        maxRequests: 10,
        window: "10s",
        burstSize: 3,
        behavior: "reject",
      },
    })).toEqual({
      enabled: true,
      maxRequests: 10,
      windowMs: 10_000,
      burstSize: 3,
      behavior: "reject",
    });
  });

  it("allows burst requests before throttling", () => {
    const bucket = new TokenBucket(2, 2, 1000, 0);

    expect(bucket.take(0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(bucket.take(0)).toMatchObject({ allowed: true, remaining: 0 });
    expect(bucket.take(0)).toMatchObject({ allowed: false, retryAfterMs: 500 });
  });

  it("refills tokens over time", () => {
    const bucket = new TokenBucket(1, 1, 1000, 0);

    expect(bucket.take(0).allowed).toBe(true);
    expect(bucket.take(0).allowed).toBe(false);
    expect(bucket.take(1000)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("checks per-node rate limits with stable bucket keys", () => {
    const config = {
      rateLimit: {
        enabled: true,
        maxRequests: 1,
        windowMs: 1000,
        burstSize: 1,
        behavior: "reject",
      },
    };

    expect(checkNodeRateLimit("node-a", config, 0)).toMatchObject({ allowed: true, behavior: "reject" });
    expect(checkNodeRateLimit("node-a", config, 0)).toMatchObject({ allowed: false, behavior: "reject" });
    expect(checkNodeRateLimit("node-b", config, 0)).toMatchObject({ allowed: true, behavior: "reject" });
  });

  it("normalizes schedule defaults", () => {
    expect(normalizeScheduleConfig({})).toMatchObject({
      enabled: false,
      activeDays: [1, 2, 3, 4, 5, 6, 0],
      timezone: "UTC",
    });
  });

  it("skips execution outside active days", () => {
    expect(evaluateNodeSchedule({
      schedule: {
        enabled: true,
        activeDays: [1],
        timezone: "UTC",
      },
    }, new Date("2026-05-06T10:00:00Z"))).toEqual({
      shouldRun: false,
      reason: "outside_active_days",
    });
  });

  it("runs inside active hour windows", () => {
    expect(evaluateNodeSchedule({
      schedule: {
        enabled: true,
        activeDays: [3],
        startTime: "09:00",
        endTime: "17:00",
        timezone: "UTC",
      },
    }, new Date("2026-05-06T10:00:00Z"))).toEqual({ shouldRun: true });
  });

  it("supports overnight active hour windows", () => {
    expect(evaluateNodeSchedule({
      schedule: {
        enabled: true,
        activeDays: [3],
        startTime: "22:00",
        endTime: "06:00",
        timezone: "UTC",
      },
    }, new Date("2026-05-06T23:30:00Z"))).toEqual({ shouldRun: true });
  });

  it("runs when cron matches the current schedule window", () => {
    expect(evaluateNodeSchedule({
      schedule: {
        enabled: true,
        activeDays: [3],
        cron: "0 10 * * 3",
        timezone: "UTC",
      },
    }, new Date("2026-05-06T10:00:30Z"))).toEqual({ shouldRun: true });
  });

  it("skips when cron does not match the current schedule window", () => {
    expect(evaluateNodeSchedule({
      schedule: {
        enabled: true,
        activeDays: [3],
        cron: "0 11 * * 3",
        timezone: "UTC",
      },
    }, new Date("2026-05-06T10:00:30Z"))).toEqual({
      shouldRun: false,
      reason: "outside_cron_window",
    });
  });

  it("skips invalid cron expressions", () => {
    expect(evaluateNodeSchedule({
      schedule: {
        enabled: true,
        cron: "not cron",
        timezone: "UTC",
      },
    }, new Date("2026-05-06T10:00:30Z"))).toEqual({
      shouldRun: false,
      reason: "invalid_cron",
    });
  });
});
