/**
 * Sprint 19.7.7 — JIT SubOrgMembership materialisation.
 *
 * Heals the failed-Clerk-webhook path (and any future delivery gap).
 * Tests cover: existing row short-circuit, found-invitation path,
 * defaults-when-no-invitation, no-Clerk-membership refusal, missing
 * relationship, idempotency under race.
 */
import { describe, expect, it, vi } from "vitest";
import type {
  PermissionSet,
  SubOrgMembership,
  SubOrgRole,
} from "@prisma/client";
import {
  resolveAndCreateMembershipIfMissing,
  type ClerkClientForJit,
  type PrismaForJit,
} from "@/lib/sub-org/jit-membership-resolver";

const USER = "user_3DiB";
const SUB_ORG = "rel_mueller";
const CLERK_ORG = "org_mueller";
const USER_EMAIL = "andre.baecker1234@gmail.com";

function makeMembership(overrides: Partial<SubOrgMembership> = {}): SubOrgMembership {
  return {
    id: "mem_1",
    subOrgId: SUB_ORG,
    userId: USER,
    role: "MEMBER",
    permissionSet: "USE_AGENTS",
    invitedById: null,
    invitedAt: null,
    acceptedAt: new Date(),
    onboardingStepCompleted: null,
    onboardingCompletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma(opts: {
  existingMembership?: SubOrgMembership | null;
  relationship?: { id: string; childOrgId: string; subOrgStatus: string } | null;
  user?: { email: string | null } | null;
  createImpl?: (data: unknown) => Promise<SubOrgMembership>;
  postCreateMembership?: SubOrgMembership | null;
}): PrismaForJit {
  let currentExisting = opts.existingMembership ?? null;
  return {
    subOrgMembership: {
      findUnique: vi.fn().mockImplementation(async () => {
        // After a create-then-race, findUnique should reflect what's in
        // the DB. We return `postCreateMembership` for the second call
        // when the test sets it; otherwise the original.
        const out = currentExisting;
        if (opts.postCreateMembership !== undefined && out === null) {
          currentExisting = opts.postCreateMembership;
          return opts.postCreateMembership;
        }
        return out;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
        if (opts.createImpl) return opts.createImpl(data);
        const row = makeMembership({
          ...(data as Partial<SubOrgMembership>),
        });
        currentExisting = row;
        return row;
      }),
    },
    orgRelationship: {
      findUnique: vi.fn().mockResolvedValue(opts.relationship ?? null),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(opts.user ?? null),
    },
    // Unused — typed for satisfaction.
  } as unknown as PrismaForJit;
}

function makeClerkFactory(opts: {
  memberships: string[];
  invitations?: Array<{
    emailAddress: string;
    publicMetadata?: Record<string, unknown>;
  }>;
  throwOnMemberships?: boolean;
  throwOnInvitations?: boolean;
}): () => Promise<ClerkClientForJit> {
  const client: ClerkClientForJit = {
    users: {
      getOrganizationMembershipList: vi.fn().mockImplementation(async () => {
        if (opts.throwOnMemberships) throw new Error("Clerk down");
        return { data: opts.memberships.map((id) => ({ organization: { id } })) };
      }),
    },
    organizations: {
      getOrganizationInvitationList: vi.fn().mockImplementation(async () => {
        if (opts.throwOnInvitations) throw new Error("Invitations API down");
        return { data: opts.invitations ?? [] };
      }),
    },
  };
  return async () => client;
}

describe("resolveAndCreateMembershipIfMissing", () => {
  it("short-circuits when the membership row already exists", async () => {
    const existing = makeMembership();
    const prisma = makePrisma({ existingMembership: existing });
    const factory = makeClerkFactory({ memberships: [] });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    expect(result.reason).toBe("existing-row");
    expect(result.membership).toBe(existing);
    expect(prisma.subOrgMembership.create).not.toHaveBeenCalled();
    // Happy path must not contact Clerk at all.
    expect(prisma.orgRelationship.findUnique).not.toHaveBeenCalled();
  });

  it("creates the row with invitation metadata when available", async () => {
    const prisma = makePrisma({
      existingMembership: null,
      relationship: { id: SUB_ORG, childOrgId: CLERK_ORG, subOrgStatus: "ACTIVE" },
      user: { email: USER_EMAIL },
    });
    const factory = makeClerkFactory({
      memberships: [CLERK_ORG],
      invitations: [
        {
          emailAddress: USER_EMAIL,
          publicMetadata: { kilnRole: "ADMIN", permissionSet: "FULL_ACCESS" },
        },
      ],
    });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    expect(result.reason).toBe("created-from-invitation");
    expect(result.membership).toMatchObject({
      role: "ADMIN" as SubOrgRole,
      permissionSet: "FULL_ACCESS" as PermissionSet,
      subOrgId: SUB_ORG,
      userId: USER,
    });
    expect(prisma.subOrgMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: "ADMIN",
        permissionSet: "FULL_ACCESS",
        acceptedAt: expect.any(Date),
      }),
    });
  });

  it("creates with MEMBER + USE_AGENTS defaults when no matching invitation exists", async () => {
    // Invitation was already GC'd by Clerk (older than 30 days) — JIT
    // can't recover the original role; falls back to a useful default.
    const prisma = makePrisma({
      existingMembership: null,
      relationship: { id: SUB_ORG, childOrgId: CLERK_ORG, subOrgStatus: "ACTIVE" },
      user: { email: USER_EMAIL },
    });
    const factory = makeClerkFactory({
      memberships: [CLERK_ORG],
      invitations: [], // no historical invitation
    });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    expect(result.reason).toBe("created-from-defaults");
    expect(result.membership).toMatchObject({
      role: "MEMBER",
      permissionSet: "USE_AGENTS",
    });
  });

  it("rejects unknown role/permissionSet values from invitation metadata", async () => {
    // Defense against a typo or future schema drift in publicMetadata.
    // Invalid values must not propagate to the DB row.
    const prisma = makePrisma({
      existingMembership: null,
      relationship: { id: SUB_ORG, childOrgId: CLERK_ORG, subOrgStatus: "ACTIVE" },
      user: { email: USER_EMAIL },
    });
    const factory = makeClerkFactory({
      memberships: [CLERK_ORG],
      invitations: [
        {
          emailAddress: USER_EMAIL,
          publicMetadata: { kilnRole: "SUPER_GOD", permissionSet: "EVERYTHING" },
        },
      ],
    });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    // We saw an invitation with strings present, so reason is from-invitation,
    // but the strings were invalid so defaults still apply.
    expect(result.reason).toBe("created-from-invitation");
    expect(result.membership).toMatchObject({
      role: "MEMBER",
      permissionSet: "USE_AGENTS",
    });
  });

  it("matches invitation email case-insensitively", async () => {
    const prisma = makePrisma({
      existingMembership: null,
      relationship: { id: SUB_ORG, childOrgId: CLERK_ORG, subOrgStatus: "ACTIVE" },
      user: { email: "Andre.Baecker1234@Gmail.com" },
    });
    const factory = makeClerkFactory({
      memberships: [CLERK_ORG],
      invitations: [
        {
          emailAddress: "andre.baecker1234@gmail.com",
          publicMetadata: { kilnRole: "VIEWER", permissionSet: "READ_ONLY" },
        },
      ],
    });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    expect(result.reason).toBe("created-from-invitation");
    expect(result.membership).toMatchObject({
      role: "VIEWER",
      permissionSet: "READ_ONLY",
    });
  });

  it("returns no-clerk-membership when user is not in the underlying Clerk org", async () => {
    // Stops URL-typing attacks: a user can't grant themselves access by
    // guessing a sub-org id.
    const prisma = makePrisma({
      existingMembership: null,
      relationship: { id: SUB_ORG, childOrgId: CLERK_ORG, subOrgStatus: "ACTIVE" },
      user: { email: USER_EMAIL },
    });
    const factory = makeClerkFactory({ memberships: [] });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    expect(result.reason).toBe("no-clerk-membership");
    expect(result.membership).toBeNull();
    expect(prisma.subOrgMembership.create).not.toHaveBeenCalled();
  });

  it("returns missing-relationship when the sub-org id has no OrgRelationship", async () => {
    const prisma = makePrisma({
      existingMembership: null,
      relationship: null,
    });
    const factory = makeClerkFactory({ memberships: [] });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: "rel_bogus" },
      { prisma, clerkFactory: factory },
    );

    expect(result.reason).toBe("missing-relationship");
    expect(result.membership).toBeNull();
  });

  it("treats Clerk lookup errors as no-membership (fail-closed)", async () => {
    // If Clerk's API is down we'd rather 404 than risk minting an
    // unauthorised row.
    const prisma = makePrisma({
      existingMembership: null,
      relationship: { id: SUB_ORG, childOrgId: CLERK_ORG, subOrgStatus: "ACTIVE" },
      user: { email: USER_EMAIL },
    });
    const factory = makeClerkFactory({
      memberships: [],
      throwOnMemberships: true,
    });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    expect(result.reason).toBe("no-clerk-membership");
    expect(result.membership).toBeNull();
  });

  it("falls back to defaults when invitation lookup throws", async () => {
    const prisma = makePrisma({
      existingMembership: null,
      relationship: { id: SUB_ORG, childOrgId: CLERK_ORG, subOrgStatus: "ACTIVE" },
      user: { email: USER_EMAIL },
    });
    const factory = makeClerkFactory({
      memberships: [CLERK_ORG],
      throwOnInvitations: true,
    });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    expect(result.reason).toBe("created-from-defaults");
    expect(result.membership).toMatchObject({
      role: "MEMBER",
      permissionSet: "USE_AGENTS",
    });
  });

  it("is idempotent against a concurrent create (P2002 race) by re-reading the row", async () => {
    // Simulates a webhook firing in parallel with the JIT path.
    const racedRow = makeMembership({ role: "ADMIN", permissionSet: "FULL_ACCESS" });
    const prismaState: {
      existing: SubOrgMembership | null;
      createCalls: number;
    } = { existing: null, createCalls: 0 };

    const prisma = {
      subOrgMembership: {
        findUnique: vi.fn().mockImplementation(async () => prismaState.existing),
        create: vi.fn().mockImplementation(async () => {
          prismaState.createCalls += 1;
          // First create call: webhook "won" the race — throw P2002 +
          // populate the row in the table.
          prismaState.existing = racedRow;
          const err: Error & { code?: string } = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }),
      },
      orgRelationship: {
        findUnique: vi.fn().mockResolvedValue({
          id: SUB_ORG,
          childOrgId: CLERK_ORG,
          subOrgStatus: "ACTIVE",
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: USER_EMAIL }),
      },
    } as unknown as PrismaForJit;

    const factory = makeClerkFactory({
      memberships: [CLERK_ORG],
      invitations: [],
    });

    const result = await resolveAndCreateMembershipIfMissing(
      { userId: USER, subOrgId: SUB_ORG },
      { prisma, clerkFactory: factory },
    );

    // Catch branch maps P2002 to "existing-row" and returns what the
    // winning writer persisted.
    expect(result.reason).toBe("existing-row");
    expect(result.membership).toEqual(racedRow);
  });
});
