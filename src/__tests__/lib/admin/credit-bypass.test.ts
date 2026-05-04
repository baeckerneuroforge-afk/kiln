/**
 * Credit-bypass behaviour tests.
 *
 * These exercise the LIBRARY-INTERNAL bypass: every credit helper short-
 * circuits for users in ADMIN_USER_IDS without touching Prisma or
 * deducting anything. Routes don't need to add their own check — that's
 * the whole point of the canonical pattern documented in lib/admin.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env.ADMIN_USER_IDS;
const ADMIN_USER = "user_admin_credit_test";
const NORMAL_USER = "user_normal_credit_test";

beforeAll(() => {
  process.env.ADMIN_USER_IDS = ADMIN_USER;
});
afterAll(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ADMIN_USER_IDS;
  } else {
    process.env.ADMIN_USER_IDS = ORIGINAL_ENV;
  }
});

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  aiCreditUsage: {
    create: vi.fn(),
  },
  autoTopUpConfig: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("credit helpers bypass admins", () => {
  describe("checkCredits", () => {
    it("returns allowed=true with cost=0 for an admin without hitting Prisma", async () => {
      mockPrisma.user.findUnique.mockReset();
      const { checkCredits } = await import("@/lib/credits");
      const result = await checkCredits(ADMIN_USER, "claude-sonnet-4-6", false);
      expect(result).toEqual({
        allowed: true,
        balance: 999999,
        cost: 0,
        byokActive: false,
      });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("queries Prisma for a normal user and respects their balance", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: NORMAL_USER,
        plan: "PRO",
        creditTier: 0,
        aiCreditsBalance: 100,
        aiCreditsMonthly: 2000,
        aiCreditsResetDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
      });
      const { checkCredits } = await import("@/lib/credits");
      const result = await checkCredits(NORMAL_USER, "claude-sonnet-4-6", false);
      expect(result.allowed).toBe(true);
      expect(result.cost).toBeGreaterThan(0);
      expect(mockPrisma.user.findUnique).toHaveBeenCalled();
    });
  });

  describe("checkAndDeductCredits", () => {
    it("admin: success=true, remaining=999999, no DB updates", async () => {
      mockPrisma.user.updateMany.mockReset();
      mockPrisma.aiCreditUsage.create.mockReset();
      const { checkAndDeductCredits } = await import("@/lib/credits");
      const result = await checkAndDeductCredits(ADMIN_USER, "claude-sonnet-4-6");
      expect(result).toEqual({ success: true, remaining: 999999 });
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.aiCreditUsage.create).not.toHaveBeenCalled();
    });
  });

  describe("deductCredits", () => {
    it("admin: returns 999999 balance without DB writes", async () => {
      mockPrisma.user.updateMany.mockReset();
      mockPrisma.user.update.mockReset();
      mockPrisma.user.findUnique.mockReset();
      mockPrisma.aiCreditUsage.create.mockReset();
      const { deductCredits } = await import("@/lib/credits");
      const result = await deductCredits(ADMIN_USER, "claude-sonnet-4-6", "CHAT");
      expect(result).toEqual({
        newBalance: 999999,
        creditsLow: false,
        totalCredits: 999999,
      });
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.aiCreditUsage.create).not.toHaveBeenCalled();
    });
  });

  describe("deductEmbeddingCredits", () => {
    it("admin: returns 999999 without DB writes", async () => {
      mockPrisma.user.updateMany.mockReset();
      mockPrisma.aiCreditUsage.create.mockReset();
      const { deductEmbeddingCredits } = await import("@/lib/credits");
      const result = await deductEmbeddingCredits(ADMIN_USER, 50);
      expect(result).toEqual({ newBalance: 999999 });
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.aiCreditUsage.create).not.toHaveBeenCalled();
    });
  });

  describe("deductCreditsByAmount", () => {
    it("admin: success=true, remaining=999999, no DB writes", async () => {
      mockPrisma.user.updateMany.mockReset();
      mockPrisma.aiCreditUsage.create.mockReset();
      const { deductCreditsByAmount } = await import("@/lib/credits");
      const result = await deductCreditsByAmount(ADMIN_USER, 42, "TASK_RUN");
      expect(result).toEqual({ success: true, newBalance: 999999 });
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.aiCreditUsage.create).not.toHaveBeenCalled();
    });
  });

  describe("checkTeamExecutionCredits", () => {
    it("admin: allowed=true with estimated=0, no Prisma access", async () => {
      mockPrisma.user.findUnique.mockReset();
      const { checkTeamExecutionCredits } = await import("@/lib/credits");
      const result = await checkTeamExecutionCredits(ADMIN_USER, [
        { role: "EXECUTOR", agent: { llmModel: "claude-sonnet-4-6" } },
        { role: "REPORTER", agent: { llmModel: "claude-haiku-4-5-20251001" } },
      ]);
      expect(result).toEqual({ allowed: true, estimated: 0, balance: 999999 });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
