import type { CustomerProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CustomerIdentifierInput {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

export interface IdentifyCustomerArgs extends CustomerIdentifierInput {
  orgId: string;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return null;
  // strip name part of "Name <user@example.com>" form
  const match = trimmed.match(/<([^>]+)>/);
  const candidate = match ? match[1] : trimmed;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // Keep leading +, strip everything else but digits
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  // Common DE shortcuts: leading 00 → +
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (hasPlus) return `+${digits}`;
  // Local German number with leading 0 → +49
  if (digits.startsWith("0")) return `+49${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * Look up an existing CustomerProfile in this Sub-Org by email/phone (incl.
 * aliases). Returns null if no match found.
 */
export async function findCustomerProfile(args: IdentifyCustomerArgs): Promise<CustomerProfile | null> {
  const email = normalizeEmail(args.email ?? null);
  const phone = normalizePhone(args.phone ?? null);
  if (!email && !phone) return null;

  const orConditions: Array<Record<string, unknown>> = [];
  if (email) {
    orConditions.push({ primaryEmail: email });
    orConditions.push({ emailAliases: { has: email } });
  }
  if (phone) {
    orConditions.push({ primaryPhone: phone });
    orConditions.push({ phoneAliases: { has: phone } });
  }

  return prisma.customerProfile.findFirst({
    where: {
      orgId: args.orgId,
      OR: orConditions,
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

/**
 * Identify-or-create a CustomerProfile for the given identifiers in the given
 * Sub-Org. New email/phone values seen on a known profile are stored as
 * aliases. Updates lastSeenAt on every call.
 */
export async function identifyCustomer(args: IdentifyCustomerArgs): Promise<CustomerProfile | null> {
  const email = normalizeEmail(args.email ?? null);
  const phone = normalizePhone(args.phone ?? null);
  const name = args.name?.trim() ? args.name.trim() : null;
  if (!email && !phone) return null;

  const existing = await findCustomerProfile({ orgId: args.orgId, email, phone });
  if (existing) {
    const aliasesPatch = collectAliasUpdates(existing, email, phone);
    return prisma.customerProfile.update({
      where: { id: existing.id },
      data: {
        ...aliasesPatch,
        fullName: existing.fullName ?? name,
        lastSeenAt: new Date(),
      },
    });
  }

  return prisma.customerProfile.create({
    data: {
      orgId: args.orgId,
      primaryEmail: email,
      primaryPhone: phone,
      fullName: name,
      emailAliases: email ? [email] : [],
      phoneAliases: phone ? [phone] : [],
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}

function collectAliasUpdates(
  profile: CustomerProfile,
  email: string | null,
  phone: string | null,
): Partial<Pick<CustomerProfile, "primaryEmail" | "primaryPhone" | "emailAliases" | "phoneAliases">> {
  const update: Partial<Pick<CustomerProfile, "primaryEmail" | "primaryPhone" | "emailAliases" | "phoneAliases">> = {};
  if (email) {
    if (!profile.primaryEmail) update.primaryEmail = email;
    if (!profile.emailAliases.includes(email)) {
      update.emailAliases = [...profile.emailAliases, email];
    }
  }
  if (phone) {
    if (!profile.primaryPhone) update.primaryPhone = phone;
    if (!profile.phoneAliases.includes(phone)) {
      update.phoneAliases = [...profile.phoneAliases, phone];
    }
  }
  return update;
}

export interface MergeCustomerProfilesArgs {
  orgId: string;
  primaryId: string;
  duplicateId: string;
  actorUserId?: string;
}

/**
 * Merge two profiles in the same Sub-Org. Aliases, memory entries, and
 * channel messages move to the primary; the duplicate profile is removed.
 */
export async function mergeCustomerProfiles(args: MergeCustomerProfilesArgs): Promise<CustomerProfile> {
  if (args.primaryId === args.duplicateId) {
    throw new Error("Cannot merge a profile into itself");
  }

  return prisma.$transaction(async (tx) => {
    const primary = await tx.customerProfile.findUnique({ where: { id: args.primaryId } });
    const duplicate = await tx.customerProfile.findUnique({ where: { id: args.duplicateId } });
    if (!primary || !duplicate) throw new Error("Profile not found");
    if (primary.orgId !== args.orgId || duplicate.orgId !== args.orgId) {
      throw new Error("Profile orgId mismatch");
    }

    const mergedEmailAliases = Array.from(
      new Set(
        [primary.primaryEmail, duplicate.primaryEmail, ...primary.emailAliases, ...duplicate.emailAliases]
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const mergedPhoneAliases = Array.from(
      new Set(
        [primary.primaryPhone, duplicate.primaryPhone, ...primary.phoneAliases, ...duplicate.phoneAliases]
          .filter((v): v is string => Boolean(v)),
      ),
    );

    await tx.customerMemoryEntry.updateMany({
      where: { customerProfileId: duplicate.id },
      data: { customerProfileId: primary.id },
    });
    await tx.departmentChannelMessage.updateMany({
      where: { customerProfileId: duplicate.id },
      data: { customerProfileId: primary.id },
    });

    const updated = await tx.customerProfile.update({
      where: { id: primary.id },
      data: {
        emailAliases: mergedEmailAliases,
        phoneAliases: mergedPhoneAliases,
        primaryEmail: primary.primaryEmail ?? duplicate.primaryEmail,
        primaryPhone: primary.primaryPhone ?? duplicate.primaryPhone,
        fullName: primary.fullName ?? duplicate.fullName,
        totalConversations: primary.totalConversations + duplicate.totalConversations,
        firstSeenAt: primary.firstSeenAt < duplicate.firstSeenAt ? primary.firstSeenAt : duplicate.firstSeenAt,
        lastSeenAt: primary.lastSeenAt > duplicate.lastSeenAt ? primary.lastSeenAt : duplicate.lastSeenAt,
      },
    });

    await tx.customerProfile.delete({ where: { id: duplicate.id } });

    await tx.customerProfileAudit.create({
      data: {
        customerProfileId: primary.id,
        orgId: args.orgId,
        actorUserId: args.actorUserId,
        action: "MERGE",
        details: {
          primaryId: primary.id,
          duplicateId: duplicate.id,
          mergedEmailAliases,
          mergedPhoneAliases,
        },
      },
    });

    return updated;
  });
}
