import { describe, expect, it } from "vitest";
import { getNextMonthlyResetDate } from "@/lib/credits";

describe("credit reset monthly anniversary", () => {
  it("moves a past reset date to the next monthly anniversary", () => {
    const nextReset = getNextMonthlyResetDate(
      new Date(2026, 3, 16, 0, 0, 0, 0),
      new Date(2026, 4, 7, 12, 0, 0, 0),
    );

    expect(nextReset).toEqual(new Date(2026, 4, 16, 0, 0, 0, 0));
  });

  it("clamps month-end anchors safely", () => {
    const nextReset = getNextMonthlyResetDate(
      new Date(2026, 0, 31, 0, 0, 0, 0),
      new Date(2026, 1, 1, 12, 0, 0, 0),
    );

    expect(nextReset).toEqual(new Date(2026, 1, 28, 0, 0, 0, 0));
  });
});
