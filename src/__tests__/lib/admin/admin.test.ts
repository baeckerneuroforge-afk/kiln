import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORIGINAL_ENV = process.env.ADMIN_USER_IDS;

describe("isAdmin", () => {
  beforeAll(() => {
    process.env.ADMIN_USER_IDS = "user_admin_1, user_admin_2 ,user_admin_3";
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ADMIN_USER_IDS;
    } else {
      process.env.ADMIN_USER_IDS = ORIGINAL_ENV;
    }
  });

  it("returns true for a userId in ADMIN_USER_IDS", async () => {
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin("user_admin_1")).toBe(true);
  });

  it("returns true even when ADMIN_USER_IDS has whitespace around commas", async () => {
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin("user_admin_2")).toBe(true);
    expect(isAdmin("user_admin_3")).toBe(true);
  });

  it("returns false for unknown userIds", async () => {
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin("user_random")).toBe(false);
  });

  it("returns false for null/undefined/empty without throwing", async () => {
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin("")).toBe(false);
  });
});
