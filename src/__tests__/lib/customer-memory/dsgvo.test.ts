import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => {
  const tx = {
    customerProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    customerMemoryEntry: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    departmentChannelMessage: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    customerProfileAudit: {
      create: vi.fn(),
    },
  };
  return {
    ...tx,
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  anonymizeCustomerProfile,
  deleteCustomerProfile,
  exportCustomerProfile,
  recordConsent,
} from "@/lib/customer-memory/dsgvo";

const baseProfile = {
  id: "cp_1",
  orgId: "org_a",
  primaryEmail: "person@example.com",
  primaryPhone: "+493012345678",
  fullName: "Person",
  emailAliases: ["person@example.com"],
  phoneAliases: ["+493012345678"],
  preferences: {},
  metadata: null,
  totalConversations: 4,
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
  isAnonymized: false,
  anonymizedAt: null,
  consentGiven: false,
  consentGivenAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("customer-memory DSGVO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customerProfile.findUnique.mockResolvedValue(baseProfile);
    mockPrisma.customerMemoryEntry.findMany.mockResolvedValue([]);
    mockPrisma.departmentChannelMessage.findMany.mockResolvedValue([]);
    mockPrisma.customerProfile.update.mockResolvedValue(baseProfile);
  });

  it("anonymize removes PII and deactivates memory while keeping stats", async () => {
    await anonymizeCustomerProfile({ orgId: "org_a", customerProfileId: "cp_1" });
    expect(mockPrisma.customerMemoryEntry.updateMany).toHaveBeenCalledWith({
      where: { customerProfileId: "cp_1" },
      data: { isActive: false },
    });
    const updateCall = mockPrisma.customerProfile.update.mock.calls[0]?.[0];
    expect(updateCall?.data).toMatchObject({
      primaryEmail: null,
      primaryPhone: null,
      fullName: null,
      emailAliases: [],
      phoneAliases: [],
      isAnonymized: true,
    });
    expect(mockPrisma.customerProfileAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ANONYMIZE" }) }),
    );
  });

  it("anonymize rejects orgId mismatch", async () => {
    mockPrisma.customerProfile.findUnique.mockResolvedValueOnce({ ...baseProfile, orgId: "org_b" });
    await expect(
      anonymizeCustomerProfile({ orgId: "org_a", customerProfileId: "cp_1" }),
    ).rejects.toThrow();
  });

  it("delete cascadiert memory but keeps channel messages with null FK", async () => {
    await deleteCustomerProfile({ orgId: "org_a", customerProfileId: "cp_1" });
    expect(mockPrisma.departmentChannelMessage.updateMany).toHaveBeenCalledWith({
      where: { customerProfileId: "cp_1" },
      data: { customerProfileId: null },
    });
    expect(mockPrisma.customerProfile.delete).toHaveBeenCalledWith({ where: { id: "cp_1" } });
    expect(mockPrisma.customerProfileAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DELETE" }) }),
    );
  });

  it("export returns full payload with profile, memory and channel messages", async () => {
    mockPrisma.customerMemoryEntry.findMany.mockResolvedValueOnce([{ id: "entry_1", content: "hi" }]);
    mockPrisma.departmentChannelMessage.findMany.mockResolvedValueOnce([{ id: "msg_1", channel: "EMAIL" }]);
    const payload = await exportCustomerProfile({ orgId: "org_a", customerProfileId: "cp_1" });
    expect(payload.profile.id).toBe("cp_1");
    expect(payload.memoryEntries).toHaveLength(1);
    expect(payload.channelMessages).toHaveLength(1);
    expect(payload.exportedAt).toBeDefined();
    expect(mockPrisma.customerProfileAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "EXPORT" }) }),
    );
  });

  it("recordConsent stamps consentGivenAt and writes audit", async () => {
    await recordConsent({ orgId: "org_a", customerProfileId: "cp_1", consentGiven: true });
    const updateCall = mockPrisma.customerProfile.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.consentGiven).toBe(true);
    expect(updateCall?.data?.consentGivenAt).toBeInstanceOf(Date);
    expect(mockPrisma.customerProfileAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "CONSENT_GRANTED" }) }),
    );
  });

  it("recordConsent revoke clears consentGivenAt", async () => {
    await recordConsent({ orgId: "org_a", customerProfileId: "cp_1", consentGiven: false });
    const updateCall = mockPrisma.customerProfile.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.consentGiven).toBe(false);
    expect(updateCall?.data?.consentGivenAt).toBeNull();
    expect(mockPrisma.customerProfileAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "CONSENT_REVOKED" }) }),
    );
  });
});
