import { describe, expect, it } from "vitest";
import {
  getNextOnlineTime,
  isAgentOnline,
  normalizeAgentSchedule,
} from "@/lib/agent-scheduling";

describe("agent scheduling", () => {
  const schedule = normalizeAgentSchedule({
    enabled: true,
    timezone: "UTC",
    hours: {
      monday: { start: "09:00", end: "18:00", enabled: true },
      tuesday: { start: "09:00", end: "18:00", enabled: true },
      wednesday: { start: "09:00", end: "18:00", enabled: true },
      thursday: { start: "09:00", end: "18:00", enabled: true },
      friday: { start: "09:00", end: "18:00", enabled: true },
      saturday: { start: null, end: null, enabled: false },
      sunday: { start: null, end: null, enabled: false },
    },
    offlineAction: "collect_email",
    offlineMessage: "Offline right now.",
  });

  it("treats disabled schedules as always online", () => {
    expect(isAgentOnline(normalizeAgentSchedule(null), new Date("2026-03-14T22:00:00Z"))).toBe(true);
  });

  it("returns online during configured business hours", () => {
    expect(isAgentOnline(schedule, new Date("2026-03-16T10:30:00Z"))).toBe(true);
  });

  it("returns offline outside configured business hours", () => {
    expect(isAgentOnline(schedule, new Date("2026-03-16T20:00:00Z"))).toBe(false);
    expect(isAgentOnline(schedule, new Date("2026-03-15T10:00:00Z"))).toBe(false);
  });

  it("returns a human-readable next online hint", () => {
    expect(getNextOnlineTime(schedule, new Date("2026-03-16T06:00:00Z"))).toMatch(/Opens in|Opens again/);
    expect(getNextOnlineTime(schedule, new Date("2026-03-15T10:00:00Z"))).toMatch(/Opens in|Opens again Monday at 9:00 AM/);
  });
});
