/**
 * Sprint 19.7.7 — Just-In-Time SubOrgMembership materialisation.
 *
 * Defense-in-depth for the Clerk-webhook path. When a sub-org-invited
 * user lands on /dashboard/sub-org/[id] but no SubOrgMembership row
 * exists, this resolver checks whether the user IS a Clerk org-member
 * for the sub-org's underlying Clerk org. If so, it materialises the
 * KILN row using:
 *   1. The matching Clerk-Invitation's `publicMetadata.kilnRole +
 *      permissionSet` if found
 *   2. Sensible defaults (MEMBER + USE_AGENTS) otherwise
 *
 * Why "MEMBER + USE_AGENTS" as the default (rather than the webhook's
 * READ_ONLY): if we're hitting this path, the user actually accepted
 * an invitation and the webhook lost the metadata. The agency's
 * intent in the typical invite is "let them work" — USE_AGENTS is the
 * weakest tier that achieves that. READ_ONLY would silently demote
 * users below what the agency picked. The matching-invitation lookup
 * still wins when available — defaults only kick in when invitations
 * have already been GC'd by Clerk (older than 30 days).
 *
 * Idempotent: a race between webhook and JIT-resolver is safe because
 * the create call uses the (subOrgId, userId) unique constraint — the
 * second writer falls into the catch branch and re-reads the row.
 *
 * The resolver does NOT call Clerk for users it can short-circuit:
 * we always read SubOrgMembership first, and only contact Clerk when
 * the row is missing. That keeps the happy-path layout render
 * Clerk-free (network-free).
 */
import type {
  PermissionSet,
  Prisma,
  PrismaClient,
  SubOrgMembership,
  SubOrgRole,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

const VALID_SUB_ORG_ROLES: ReadonlySet<SubOrgRole> = new Set([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);

const VALID_PERMISSION_SETS: ReadonlySet<PermissionSet> = new Set([
  "READ_ONLY",
  "USE_AGENTS",
  "USE_AGENTS_PLUS_KNOWLEDGE",
  "FULL_ACCESS",
]);

/** Minimal Clerk-client surface we use, so tests can stub it. */
export interface ClerkClientForJit {
  users: {
    getOrganizationMembershipList: (args: {
      userId: string;
    }) => Promise<{ data: Array<{ organization: { id: string } }> }>;
  };
  organizations: {
    getOrganizationInvitationList: (args: {
      organizationId: string;
      status?: Array<"accepted" | "pending" | "revoked" | "expired">;
    }) => Promise<{
      data: Array<{
        emailAddress?: string | null;
        publicMetadata?: unknown;
      }>;
    }>;
  };
}

/** Minimal Prisma surface so the resolver is unit-testable. */
export type PrismaForJit = Pick<PrismaClient, "subOrgMembership" | "orgRelationship" | "user">;

export interface JitResolverDeps {
  prisma?: PrismaForJit;
  clerkFactory?: () => Promise<ClerkClientForJit>;
}

export interface JitResolveResult {
  /** Why the resolver returned this outcome. */
  reason:
    | "existing-row"
    | "created-from-invitation"
    | "created-from-defaults"
    | "no-clerk-membership"
    | "missing-relationship"
    | "missing-user";
  membership: SubOrgMembership | null;
}

/**
 * Resolve the (subOrgId, userId) membership, lazily materialising it
 * if the Clerk org-membership exists but our row doesn't. Returns the
 * existing or newly-created row, or null if the user genuinely has no
 * access (no Clerk membership either).
 */
export async function resolveAndCreateMembershipIfMissing(
  args: { userId: string; subOrgId: string },
  deps: JitResolverDeps = {},
): Promise<JitResolveResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const { userId, subOrgId } = args;

  // 1) Fast path — row already exists. No Clerk call.
  const existing = await prisma.subOrgMembership.findUnique({
    where: { subOrgId_userId: { subOrgId, userId } },
  });
  if (existing) {
    return { reason: "existing-row", membership: existing };
  }

  // 2) Need the OrgRelationship to know the Clerk org-id this sub-org maps to.
  const relationship = await prisma.orgRelationship.findUnique({
    where: { id: subOrgId },
    select: { id: true, childOrgId: true, subOrgStatus: true },
  });
  if (!relationship) {
    return { reason: "missing-relationship", membership: null };
  }

  // 3) Verify the user is actually in this sub-org's Clerk org. Without
  //    this check anyone could mint themselves a membership by typing the
  //    sub-org id into the URL.
  const clerkFactory = deps.clerkFactory ?? (async () => {
    const { clerkClient } = await import("@clerk/nextjs/server");
    return (await clerkClient()) as unknown as ClerkClientForJit;
  });

  let isClerkMember = false;
  let userEmail: string | null = null;
  try {
    const client = await clerkFactory();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    isClerkMember = memberships.data.some(
      (m) => m.organization.id === relationship.childOrgId,
    );
    if (isClerkMember) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      userEmail = user?.email ?? null;
    }
  } catch (err) {
    // Clerk read failure → behave like "no membership". Better to 404
    // than risk creating an unauthorised row.
    console.warn(
      `[jit-membership] Clerk lookup failed for user=${userId}, subOrg=${subOrgId}:`,
      err,
    );
    return { reason: "no-clerk-membership", membership: null };
  }

  if (!isClerkMember) {
    return { reason: "no-clerk-membership", membership: null };
  }

  // 4) Best-effort lookup for invitation publicMetadata so JIT respects
  //    the agency's original role + permission-set choice.
  let role: SubOrgRole = "MEMBER";
  let permissionSet: PermissionSet = "USE_AGENTS";
  let reason: JitResolveResult["reason"] = "created-from-defaults";

  if (userEmail) {
    try {
      const client = await clerkFactory();
      const invList = await client.organizations.getOrganizationInvitationList({
        organizationId: relationship.childOrgId,
        status: ["accepted"],
      });
      const matching = invList.data.find(
        (inv) =>
          inv.emailAddress &&
          inv.emailAddress.toLowerCase() === userEmail!.toLowerCase(),
      );
      if (matching && matching.publicMetadata && typeof matching.publicMetadata === "object") {
        const meta = matching.publicMetadata as {
          kilnRole?: unknown;
          permissionSet?: unknown;
        };
        if (
          typeof meta.kilnRole === "string" &&
          VALID_SUB_ORG_ROLES.has(meta.kilnRole as SubOrgRole)
        ) {
          role = meta.kilnRole as SubOrgRole;
        }
        if (
          typeof meta.permissionSet === "string" &&
          VALID_PERMISSION_SETS.has(meta.permissionSet as PermissionSet)
        ) {
          permissionSet = meta.permissionSet as PermissionSet;
        }
        if (
          typeof meta.kilnRole === "string" ||
          typeof meta.permissionSet === "string"
        ) {
          reason = "created-from-invitation";
        }
      }
    } catch (err) {
      // Invitation lookup is best-effort. Fall through with defaults.
      console.warn(
        `[jit-membership] invitation lookup failed for user=${userId}:`,
        err,
      );
    }
  }

  // 5) Create the row. Race-safe: a parallel webhook firing at the same
  //    time would hit the unique-constraint — catch and re-read.
  try {
    const created = await prisma.subOrgMembership.create({
      data: {
        subOrgId,
        userId,
        role,
        permissionSet,
        acceptedAt: new Date(),
      },
    });
    console.info(
      `[jit-membership] materialised SubOrgMembership user=${userId} subOrg=${subOrgId} reason=${reason} role=${role} permissionSet=${permissionSet}`,
    );
    return { reason, membership: created };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Another writer (webhook) won the race — read what they wrote.
      const fresh = await prisma.subOrgMembership.findUnique({
        where: { subOrgId_userId: { subOrgId, userId } },
      });
      return { reason: "existing-row", membership: fresh };
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  // Prisma's `PrismaClientKnownRequestError` for unique constraint
  // violation has code P2002. Test by duck-typing so we don't need
  // a runtime import of the error class.
  const code = (err as { code?: unknown }).code;
  return code === "P2002";
}

export const __test__ = { isUniqueViolation };
export type { Prisma };
