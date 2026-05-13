/**
 * Sprint 19.7.8 — recipient preference gate.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { parsePreferences, shouldSendEmail } from "@/lib/email/preferences";

beforeEach(() => {
  mockPrisma.user.findUnique.mockReset();
});

describe("parsePreferences", () => {
  it("returns empty object for null / non-object inputs", () => {
    expect(parsePreferences(null)).toEqual({});
    expect(parsePreferences(undefined)).toEqual({});
    expect(parsePreferences("string")).toEqual({});
    expect(parsePreferences([1, 2, 3])).toEqual({});
  });

  it("strips non-boolean fields", () => {
    const parsed = parsePreferences({
      sub_org_invited: true,
      agency_invited: false,
      bogus: "not a boolean",
      number_field: 42,
    });
    expect(parsed).toEqual({ sub_org_invited: true, agency_invited: false });
  });

  it("preserves both true and false values", () => {
    const parsed = parsePreferences({ a: true, b: false });
    expect(parsed).toEqual({ a: true, b: false });
  });
});

describe("shouldSendEmail", () => {
  it("allows the send when the user has no row (invite path)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const r = await shouldSendEmail({
      eventType: "sub_org_invited",
      userId: "user_missing",
    });
    expect(r.allow).toBe(true);
    expect(r.reason).toBe("no_user_row");
  });

  it("denies all transactional emails when emailNotifications=false (master kill-switch)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      emailNotifications: false,
      notificationPreferences: { sub_org_invited: true },
    });
    const r = await shouldSendEmail({
      eventType: "sub_org_invited",
      userId: "user_1",
    });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe("master_kill_switch");
  });

  it("denies a single event when explicitly opted out via preferences", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      emailNotifications: true,
      notificationPreferences: { onboarding_completed: false },
    });
    const r = await shouldSendEmail({
      eventType: "onboarding_completed",
      userId: "user_1",
    });
    expect(r.allow).toBe(false);
    expect(r.reason).toBe("event_disabled");
  });

  it("allows when the event key is missing (default opt-in)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      emailNotifications: true,
      notificationPreferences: {},
    });
    const r = await shouldSendEmail({
      eventType: "sub_org_invited",
      userId: "user_1",
    });
    expect(r.allow).toBe(true);
  });

  it("falls back to email lookup when no userId is supplied", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      emailNotifications: true,
      notificationPreferences: { agency_invited: false },
    });
    const r = await shouldSendEmail({
      eventType: "agency_invited",
      recipientEmail: "found@example.com",
    });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "found@example.com" },
      }),
    );
    expect(r.allow).toBe(false);
    expect(r.reason).toBe("event_disabled");
  });
});
