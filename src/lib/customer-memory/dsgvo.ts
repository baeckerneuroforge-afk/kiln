import type { CustomerMemoryEntry, CustomerProfile, DepartmentChannelMessage } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface AnonymizeArgs {
  orgId: string;
  customerProfileId: string;
  actorUserId?: string;
}

/**
 * GDPR-style anonymization: removes PII (email, phone, name) while keeping
 * statistics so the agency dashboard's revenue/conversation aggregates stay
 * intact. Memory entries with content are deactivated.
 */
export async function anonymizeCustomerProfile(args: AnonymizeArgs): Promise<CustomerProfile> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.customerProfile.findUnique({ where: { id: args.customerProfileId } });
    if (!profile) throw new Error("Profile not found");
    if (profile.orgId !== args.orgId) throw new Error("Profile orgId mismatch");

    await tx.customerMemoryEntry.updateMany({
      where: { customerProfileId: profile.id },
      data: { isActive: false },
    });

    const anonymized = await tx.customerProfile.update({
      where: { id: profile.id },
      data: {
        primaryEmail: null,
        primaryPhone: null,
        fullName: null,
        emailAliases: [],
        phoneAliases: [],
        preferences: Prisma.JsonNull,
        metadata: Prisma.JsonNull,
        isAnonymized: true,
        anonymizedAt: new Date(),
      },
    });

    await tx.customerProfileAudit.create({
      data: {
        customerProfileId: profile.id,
        orgId: profile.orgId,
        actorUserId: args.actorUserId ?? null,
        action: "ANONYMIZE",
        details: { previousEmail: profile.primaryEmail, previousPhone: profile.primaryPhone },
      },
    });

    return anonymized;
  });
}

export interface DeleteCustomerArgs {
  orgId: string;
  customerProfileId: string;
  actorUserId?: string;
}

/**
 * Hard delete: removes the profile + cascade-deletes memory entries.
 * Channel messages keep their `customerProfileId` foreign key as null
 * because they remain part of the operational record.
 */
export async function deleteCustomerProfile(args: DeleteCustomerArgs): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const profile = await tx.customerProfile.findUnique({ where: { id: args.customerProfileId } });
    if (!profile) throw new Error("Profile not found");
    if (profile.orgId !== args.orgId) throw new Error("Profile orgId mismatch");

    await tx.departmentChannelMessage.updateMany({
      where: { customerProfileId: profile.id },
      data: { customerProfileId: null },
    });
    await tx.customerProfile.delete({ where: { id: profile.id } });

    await tx.customerProfileAudit.create({
      data: {
        customerProfileId: null,
        orgId: profile.orgId,
        actorUserId: args.actorUserId ?? null,
        action: "DELETE",
        details: { deletedProfileId: profile.id, deletedEmail: profile.primaryEmail },
      },
    });
  });
}

export interface CustomerExportPayload {
  profile: CustomerProfile;
  memoryEntries: CustomerMemoryEntry[];
  channelMessages: DepartmentChannelMessage[];
  exportedAt: string;
}

/**
 * Produce a complete DSGVO export of a profile with all related memory and
 * channel messages.
 */
export async function exportCustomerProfile(args: {
  orgId: string;
  customerProfileId: string;
  actorUserId?: string;
}): Promise<CustomerExportPayload> {
  const profile = await prisma.customerProfile.findUnique({ where: { id: args.customerProfileId } });
  if (!profile) throw new Error("Profile not found");
  if (profile.orgId !== args.orgId) throw new Error("Profile orgId mismatch");

  const memoryEntries = await prisma.customerMemoryEntry.findMany({
    where: { customerProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  const channelMessages = await prisma.departmentChannelMessage.findMany({
    where: { customerProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });

  await prisma.customerProfileAudit.create({
    data: {
      customerProfileId: profile.id,
      orgId: profile.orgId,
      actorUserId: args.actorUserId ?? null,
      action: "EXPORT",
      details: {
        memoryCount: memoryEntries.length,
        channelMessageCount: channelMessages.length,
      },
    },
  });

  return {
    profile,
    memoryEntries,
    channelMessages,
    exportedAt: new Date().toISOString(),
  };
}

export interface RecordConsentArgs {
  orgId: string;
  customerProfileId: string;
  consentGiven: boolean;
  actorUserId?: string;
}

export async function recordConsent(args: RecordConsentArgs): Promise<CustomerProfile> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.customerProfile.findUnique({ where: { id: args.customerProfileId } });
    if (!profile) throw new Error("Profile not found");
    if (profile.orgId !== args.orgId) throw new Error("Profile orgId mismatch");

    const updated = await tx.customerProfile.update({
      where: { id: profile.id },
      data: {
        consentGiven: args.consentGiven,
        consentGivenAt: args.consentGiven ? new Date() : null,
      },
    });

    await tx.customerProfileAudit.create({
      data: {
        customerProfileId: profile.id,
        orgId: profile.orgId,
        actorUserId: args.actorUserId ?? null,
        action: args.consentGiven ? "CONSENT_GRANTED" : "CONSENT_REVOKED",
      },
    });

    return updated;
  });
}
