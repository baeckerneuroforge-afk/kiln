/**
 * Sprint 19.7.8 — EmailLog persistence helper.
 *
 * Persistence failures must NEVER bubble up — a lost log row beats a
 * lost transactional email.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  emailLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { logEmailSend } from "@/lib/email/email-log";

beforeEach(() => {
  mockPrisma.emailLog.create.mockReset();
});

describe("logEmailSend", () => {
  it("persists a SENT row with externalId", async () => {
    mockPrisma.emailLog.create.mockResolvedValueOnce({});
    await logEmailSend({
      userId: "u_1",
      orgId: "org_1",
      subOrgId: "sub_1",
      template: "sub-org-member-invited-existing",
      recipientEmail: "a@b.de",
      status: "SENT",
      externalId: "re_xyz",
    });
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u_1",
        orgId: "org_1",
        subOrgId: "sub_1",
        template: "sub-org-member-invited-existing",
        recipientEmail: "a@b.de",
        status: "SENT",
        externalId: "re_xyz",
        errorMessage: null,
      }),
    });
  });

  it("persists a FAILED row with errorMessage", async () => {
    mockPrisma.emailLog.create.mockResolvedValueOnce({});
    await logEmailSend({
      template: "agency-member-invited",
      recipientEmail: "x@y.de",
      status: "FAILED",
      errorMessage: "Resend timeout",
    });
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: "Resend timeout",
        externalId: null,
        userId: null,
        orgId: null,
        subOrgId: null,
      }),
    });
  });

  it("persists a SKIPPED row when preferences or kill-switch refuse", async () => {
    mockPrisma.emailLog.create.mockResolvedValueOnce({});
    await logEmailSend({
      template: "sub-org-onboarding-completed",
      recipientEmail: "lena@x.de",
      status: "SKIPPED",
      errorMessage: "event_disabled",
    });
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SKIPPED",
        errorMessage: "event_disabled",
      }),
    });
  });

  it("swallows persistence errors so the email path stays unblocked", async () => {
    mockPrisma.emailLog.create.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );
    // Must not throw.
    await expect(
      logEmailSend({
        template: "welcome",
        recipientEmail: "a@b.de",
        status: "SENT",
      }),
    ).resolves.toBeUndefined();
  });
});
