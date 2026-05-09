import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  customerProfile: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  customerMemoryEntry: {
    updateMany: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  departmentChannelMessage: {
    updateMany: vi.fn(),
  },
  customerProfileAudit: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  findCustomerProfile,
  identifyCustomer,
  mergeCustomerProfiles,
  normalizeEmail,
  normalizePhone,
} from "@/lib/customer-memory/identifier";

describe("customer-memory identifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customerProfile.findFirst.mockResolvedValue(null);
    mockPrisma.customerProfile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "cp_new",
      orgId: data.orgId,
      primaryEmail: data.primaryEmail ?? null,
      primaryPhone: data.primaryPhone ?? null,
      fullName: data.fullName ?? null,
      emailAliases: data.emailAliases ?? [],
      phoneAliases: data.phoneAliases ?? [],
      preferences: null,
      metadata: null,
      totalConversations: 0,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      isAnonymized: false,
      anonymizedAt: null,
      consentGiven: false,
      consentGivenAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockPrisma.customerProfile.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({
      id: where.id,
      ...data,
    }));
  });

  it("normalizes emails to lowercase, strips brackets, validates structure", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
    expect(normalizeEmail("Andre <user@example.com>")).toBe("user@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("normalizes phone numbers to E.164 with German default", () => {
    expect(normalizePhone("+49 30 1234 5678")).toBe("+493012345678");
    expect(normalizePhone("0030 1234567")).toBe("+301234567");
    expect(normalizePhone("030 1234567")).toBe("+49301234567");
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("identify-by-email returns existing profile and updates lastSeenAt", async () => {
    const existing = {
      id: "cp_existing",
      orgId: "org_a",
      primaryEmail: "person@example.com",
      primaryPhone: null,
      fullName: "Old Name",
      emailAliases: ["person@example.com"],
      phoneAliases: [],
    };
    mockPrisma.customerProfile.findFirst.mockResolvedValueOnce(existing);
    const profile = await identifyCustomer({ orgId: "org_a", email: "Person@Example.com" });
    expect(profile?.id).toBe("cp_existing");
    expect(mockPrisma.customerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cp_existing" },
        data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
      }),
    );
  });

  it("identify-by-email is case-insensitive in lookup", async () => {
    await findCustomerProfile({ orgId: "org_a", email: "Person@Example.COM" });
    const call = mockPrisma.customerProfile.findFirst.mock.calls[0]?.[0];
    expect(call?.where?.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ primaryEmail: "person@example.com" }),
      ]),
    );
  });

  it("identify-by-phone normalizes to E.164 in lookup", async () => {
    await findCustomerProfile({ orgId: "org_a", phone: "0151 1234567" });
    const call = mockPrisma.customerProfile.findFirst.mock.calls[0]?.[0];
    expect(call?.where?.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ primaryPhone: "+491511234567" }),
      ]),
    );
  });

  it("creates a new profile when no match is found", async () => {
    const profile = await identifyCustomer({ orgId: "org_a", email: "fresh@example.com", name: "Fresh" });
    expect(profile?.id).toBe("cp_new");
    expect(mockPrisma.customerProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org_a",
          primaryEmail: "fresh@example.com",
          fullName: "Fresh",
          emailAliases: ["fresh@example.com"],
        }),
      }),
    );
  });

  it("adds new email as alias when matched profile has different primary", async () => {
    const existing = {
      id: "cp_existing",
      orgId: "org_a",
      primaryEmail: "old@example.com",
      primaryPhone: null,
      fullName: null,
      emailAliases: ["old@example.com"],
      phoneAliases: [],
    };
    mockPrisma.customerProfile.findFirst.mockResolvedValueOnce(existing);
    await identifyCustomer({ orgId: "org_a", email: "old@example.com", phone: "030 1234567" });
    expect(mockPrisma.customerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phoneAliases: ["+49301234567"],
          primaryPhone: "+49301234567",
        }),
      }),
    );
  });

  it("returns null when neither email nor phone is provided", async () => {
    const profile = await identifyCustomer({ orgId: "org_a" });
    expect(profile).toBeNull();
  });

  it("scopes lookups to the active org (sub-org isolation)", async () => {
    await findCustomerProfile({ orgId: "org_a", email: "person@example.com" });
    const call = mockPrisma.customerProfile.findFirst.mock.calls[0]?.[0];
    expect(call?.where?.orgId).toBe("org_a");
  });

  it("merges duplicate profiles into the primary and deletes duplicate", async () => {
    const primary = {
      id: "cp_primary",
      orgId: "org_a",
      primaryEmail: "primary@example.com",
      primaryPhone: null,
      emailAliases: ["primary@example.com"],
      phoneAliases: [],
      fullName: "Primary",
      totalConversations: 3,
      firstSeenAt: new Date("2026-01-01"),
      lastSeenAt: new Date("2026-04-01"),
    };
    const duplicate = {
      id: "cp_duplicate",
      orgId: "org_a",
      primaryEmail: "dup@example.com",
      primaryPhone: "+493012345678",
      emailAliases: ["dup@example.com"],
      phoneAliases: ["+493012345678"],
      fullName: "Duplicate",
      totalConversations: 2,
      firstSeenAt: new Date("2025-12-01"),
      lastSeenAt: new Date("2026-03-01"),
    };
    mockPrisma.customerProfile.findUnique.mockResolvedValueOnce(primary);
    mockPrisma.customerProfile.findUnique.mockResolvedValueOnce(duplicate);
    mockPrisma.customerProfile.update.mockResolvedValueOnce({ ...primary, totalConversations: 5 });
    mockPrisma.customerProfile.delete.mockResolvedValueOnce(duplicate);

    await mergeCustomerProfiles({ orgId: "org_a", primaryId: "cp_primary", duplicateId: "cp_duplicate" });

    expect(mockPrisma.customerMemoryEntry.updateMany).toHaveBeenCalledWith({
      where: { customerProfileId: "cp_duplicate" },
      data: { customerProfileId: "cp_primary" },
    });
    expect(mockPrisma.departmentChannelMessage.updateMany).toHaveBeenCalledWith({
      where: { customerProfileId: "cp_duplicate" },
      data: { customerProfileId: "cp_primary" },
    });
    expect(mockPrisma.customerProfile.delete).toHaveBeenCalledWith({ where: { id: "cp_duplicate" } });
    expect(mockPrisma.customerProfileAudit.create).toHaveBeenCalled();
  });

  it("rejects merging a profile with itself", async () => {
    await expect(
      mergeCustomerProfiles({ orgId: "org_a", primaryId: "same", duplicateId: "same" }),
    ).rejects.toThrow();
  });

  it("rejects merge if profile orgIds do not match", async () => {
    mockPrisma.customerProfile.findUnique.mockResolvedValueOnce({ id: "cp_primary", orgId: "org_a" });
    mockPrisma.customerProfile.findUnique.mockResolvedValueOnce({ id: "cp_duplicate", orgId: "org_b" });
    await expect(
      mergeCustomerProfiles({ orgId: "org_a", primaryId: "cp_primary", duplicateId: "cp_duplicate" }),
    ).rejects.toThrow();
  });
});
